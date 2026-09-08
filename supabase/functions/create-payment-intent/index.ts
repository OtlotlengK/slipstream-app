import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, ...extra, 'Content-Type': 'application/json' },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const buckets = new Map<string, { count: number; reset: number }>();

function clientIp(req: Request) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function limited(key: string, max: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.reset <= now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return 0;
  }
  current.count += 1;
  if (current.count > max) return Math.max(1, Math.ceil((current.reset - now) / 1000));
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const ipRetry = limited(`ip:${clientIp(req)}`, 10);
  if (ipRetry) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(ipRetry) });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'invalid_token' }, 400);

    const tokenRetry = limited(`token:${token}`, 5);
    if (tokenRetry) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(tokenRetry) });

    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!url || !key) return json({ error: 'service_configuration_error' }, 500);
    if (!paystackKey) return json({ error: 'payment_provider_not_configured', message: 'ValoraTap Pay is not configured for live payments yet.' }, 503);

    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');

    const { data: invoice, error: invoiceError } = await db
      .from('invoices')
      .select('id,merchant_id,invoice_no,customer_name,customer_email,total,currency,status')
      .eq('public_token_hash', tokenHash)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return json({ error: 'invoice_not_found' }, 404);
    if (invoice.status !== 'issued') return json({ error: 'invoice_not_payable', status: invoice.status }, 409);
    if (!invoice.customer_email) return json({ error: 'customer_email_required', message: 'A customer email is required for online payment.' }, 400);

    const { data: reservation, error: reserveError } = await db.rpc('reserve_payment_intent', { p_invoice_id: invoice.id });
    if (reserveError) {
      console.error('payment intent reservation failed', reserveError);
      const message = reserveError.message || '';
      if (message.includes('invoice_not_payable')) return json({ error: 'invoice_not_payable' }, 409);
      if (message.includes('customer_email_required')) return json({ error: 'customer_email_required' }, 400);
      if (message.includes('invalid_invoice_amount')) return json({ error: 'invalid_invoice_amount' }, 400);
      return json({ error: 'payment_intent_reservation_failed' }, 500);
    }

    const intent = reservation as {
      created: boolean;
      payment_intent_id: string;
      status: string;
      provider_reference: string;
      authorization_url: string | null;
      access_code: string | null;
      amount: number;
      currency: string;
    };

    if (!intent.created) {
      if (intent.authorization_url && intent.access_code) {
        return json({ ok: true, provider: 'paystack', authorization_url: intent.authorization_url, access_code: intent.access_code, reference: intent.provider_reference, reused: true });
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(400);
        const { data: latest, error: latestError } = await db
          .from('payment_intents')
          .select('status,provider_reference,authorization_url,access_code')
          .eq('id', intent.payment_intent_id)
          .maybeSingle();
        if (latestError) throw latestError;
        if (latest?.authorization_url && latest?.access_code && latest.status !== 'failed') {
          return json({ ok: true, provider: 'paystack', authorization_url: latest.authorization_url, access_code: latest.access_code, reference: latest.provider_reference, reused: true });
        }
      }
      return json({ error: 'payment_initialization_in_progress' }, 409);
    }

    const amountSubunit = Math.round(Number(intent.amount) * 100);
    if (!Number.isFinite(amountSubunit) || amountSubunit <= 0) {
      await db.from('payment_intents').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { source: 'valoratap', failure_reason: 'invalid_invoice_amount' } }).eq('id', intent.payment_intent_id).eq('status', 'pending');
      return json({ error: 'invalid_invoice_amount' }, 400);
    }

    const appUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://slipstream-app-sigma.vercel.app').replace(/\/$/, '');
    const callbackUrl = `${appUrl}/invoice.html?token=${encodeURIComponent(token)}&payment=return`;

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: invoice.customer_email,
        amount: String(amountSubunit),
        currency: intent.currency || 'ZAR',
        reference: intent.provider_reference,
        callback_url: callbackUrl,
        channels: ['card', 'bank', 'eft', 'qr', 'capitec_pay', 'apple_pay'],
        metadata: { invoice_id: invoice.id, invoice_no: invoice.invoice_no, payment_intent_id: intent.payment_intent_id, source: 'valoratap' },
      }),
    });

    const result = await paystackResponse.json().catch(() => null);
    if (!paystackResponse.ok || !result?.status || !result?.data?.authorization_url || !result?.data?.reference) {
      console.error('Paystack initialization failed', result);
      await db.from('payment_intents').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { source: 'valoratap', failure_reason: 'paystack_initialization_failed' } }).eq('id', intent.payment_intent_id).eq('status', 'pending');
      return json({ error: 'payment_initialization_failed' }, 502);
    }

    if (result.data.reference !== intent.provider_reference) {
      console.error('Paystack reference mismatch', { expected: intent.provider_reference, received: result.data.reference });
      await db.from('payment_intents').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { source: 'valoratap', failure_reason: 'provider_reference_mismatch' } }).eq('id', intent.payment_intent_id).eq('status', 'pending');
      return json({ error: 'payment_initialization_failed' }, 502);
    }

    const { error: updateError } = await db.from('payment_intents').update({
      status: 'initialized',
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code || null,
      updated_at: new Date().toISOString(),
      metadata: { source: 'valoratap', paystack_access_code: result.data.access_code || null },
    }).eq('id', intent.payment_intent_id).eq('status', 'pending');

    if (updateError) {
      console.error('payment_intent finalization failed', updateError);
      return json({ error: 'payment_intent_storage_failed' }, 500);
    }

    return json({ ok: true, provider: 'paystack', authorization_url: result.data.authorization_url, access_code: result.data.access_code, reference: intent.provider_reference, reused: false });
  } catch (e) {
    console.error('create-payment-intent failed', e);
    return json({ error: 'internal_server_error' }, 500);
  }
});
