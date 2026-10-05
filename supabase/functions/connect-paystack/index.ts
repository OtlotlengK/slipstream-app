import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'not_authenticated' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!url || !serviceKey || !paystackKey) return json({ error: 'service_configuration_error' }, 500);

    const userClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: 'not_authenticated' }, 401);
    const merchantId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const bankCode = typeof body.bank_code === 'string' ? body.bank_code.trim() : '';
    const accountNumber = typeof body.account_number === 'string' ? body.account_number.replace(/\s+/g, '') : '';
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(bankCode)) return json({ error: 'invalid_bank_code' }, 400);
    if (!/^\d{6,20}$/.test(accountNumber)) return json({ error: 'invalid_account_number' }, 400);

    const { data: merchant, error: merchantError } = await userClient
      .from('merchants')
      .select('id,business_name,owner_name,phone')
      .eq('id', merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) return json({ error: 'merchant_profile_required' }, 409);

    const { data: profile, error: profileError } = await userClient
      .from('business_profiles')
      .select('country_code,currency_code,business_email,trading_name')
      .eq('merchant_id', merchantId)
      .maybeSingle();
    if (profileError) throw profileError;
    const country = String(profile?.country_code || '').toUpperCase();
    const currency = String(profile?.currency_code || '').toUpperCase();
    if (!country || !currency) return json({ error: 'business_region_required', message: 'Set the business country and currency before connecting VT Pay.' }, 409);
    if (country !== 'ZA' || currency !== 'ZAR') return json({ error: 'provider_country_not_supported', message: 'Paystack settlement setup is currently being enabled for South Africa (ZAR) first.' }, 409);

    const { data: existing, error: existingError } = await userClient
      .from('payment_accounts')
      .select('id,provider_account_id,settlement_currency,status')
      .eq('merchant_id', merchantId)
      .eq('provider', 'paystack')
      .eq('settlement_currency', currency)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'active') return json({ ok: true, status: 'active', provider: 'paystack', settlement_currency: currency });

    const platformPercentage = 0;
    const businessName = String(profile?.trading_name || merchant.business_name || '').trim().slice(0, 100);
    const contactName = String(merchant.owner_name || authData.user.user_metadata?.full_name || '').trim().slice(0, 100) || undefined;
    const contactEmail = String(profile?.business_email || authData.user.email || '').trim().slice(0, 160) || undefined;
    const contactPhone = String(merchant.phone || '').trim().slice(0, 40) || undefined;

    const createResponse = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: businessName,
        bank_code: bankCode,
        account_number: accountNumber,
        percentage_charge: platformPercentage,
        primary_contact_name: contactName,
        primary_contact_email: contactEmail,
        primary_contact_phone: contactPhone,
        description: 'ValoraTap Pay merchant settlement account',
      }),
    });
    const created = await createResponse.json().catch(() => null);
    if (!createResponse.ok || !created?.status || !created?.data?.subaccount_code) {
      console.error('Paystack subaccount creation failed', { status: createResponse.status, message: created?.message || null });
      return json({ error: 'payment_account_creation_failed' }, 502);
    }

    const providerCurrency = String(created.data.currency || currency).toUpperCase();
    if (providerCurrency !== currency) {
      try {
        await fetch(`https://api.paystack.co/subaccount/${encodeURIComponent(created.data.subaccount_code)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        });
      } catch (_) {}
      return json({ error: 'provider_currency_mismatch' }, 502);
    }

    const record = {
      merchant_id: merchantId,
      provider: 'paystack',
      provider_account_id: created.data.subaccount_code,
      settlement_currency: providerCurrency,
      status: created.data.active ? 'active' : 'pending',
      metadata: { account_name: String(created.data.account_name || '').slice(0, 160), settlement_bank: String(created.data.settlement_bank || '').slice(0, 120), provider_domain: String(created.data.domain || '').slice(0, 20), payout_setup: 'merchant_subaccount' },
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await userClient
      .from('payment_accounts')
      .upsert(record, { onConflict: 'merchant_id,provider,settlement_currency' })
      .select('id,provider,settlement_currency,status')
      .single();
    if (saveError) throw saveError;

    return json({ ok: true, provider: 'paystack', status: saved.status, settlement_currency: saved.settlement_currency, account_name: String(created.data.account_name || '').slice(0, 160) });
  } catch (error) {
    console.error('connect-paystack failed', error);
    return json({ error: 'internal_server_error' }, 500);
  }
});