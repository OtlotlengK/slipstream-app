import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

async function hmacSha512(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let v = 0; for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i); return v === 0; }
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY'); const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !url || !serviceKey) return json({ error: 'service_configuration_error' }, 500);
    const raw = await req.text(); const supplied = req.headers.get('x-paystack-signature') || ''; const expected = await hmacSha512(secret, raw);
    if (!timingSafeEqual(supplied.toLowerCase(), expected.toLowerCase())) return json({ error: 'invalid_signature' }, 401);
    const event = JSON.parse(raw); if (event?.event !== 'charge.success') return json({ received: true });
    const data = event.data || {}; const reference = String(data.reference || '').trim(); const amount = Number(data.amount || 0); const currency = String(data.currency || '').trim().toUpperCase();
    if (!reference || !Number.isFinite(amount) || amount <= 0 || !currency) return json({ error: 'invalid_event' }, 400);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: intent, error: intentError } = await db.from('payment_intents').select('id,invoice_id,merchant_id,amount,currency,status,provider_reference').eq('provider', 'paystack').eq('provider_reference', reference).maybeSingle();
    if (intentError) throw intentError; if (!intent) return json({ received: true, ignored: true }); if (intent.status === 'paid') return json({ received: true, duplicate: true });
    const expectedSubunit = Math.round(Number(intent.amount) * 100);
    if (amount !== expectedSubunit || currency !== String(intent.currency || '').trim().toUpperCase()) {
      await db.from('payment_intents').update({ status: 'failed', metadata: { error: 'payment_mismatch', received_amount: amount, expected_amount: expectedSubunit, received_currency: currency, expected_currency: intent.currency }, updated_at: new Date().toISOString() }).eq('id', intent.id);
      return json({ error: 'payment_mismatch' }, 400);
    }
    const { data: settled, error: settleError } = await db.rpc('settle_invoice_payment', { p_invoice_id: intent.invoice_id, p_provider: 'paystack', p_external_reference: reference, p_provider_transaction_id: Number.isFinite(Number(data.id)) ? Number(data.id) : null, p_payment_method: String(data.channel || 'online') });
    if (settleError) throw settleError;
    await db.from('payment_intents').update({ status: 'paid', provider_transaction_id: Number.isFinite(Number(data.id)) ? Number(data.id) : null, paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { channel: data.channel || null, paid_at: data.paid_at || null } }).eq('id', intent.id);
    return json({ received: true, settled });
  } catch (e) { console.error('paystack-webhook failed', e); return json({ error: 'internal_server_error' }, 500); }
});