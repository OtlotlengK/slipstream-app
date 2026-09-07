(() => {
  const SUPABASE_URL = 'https://pddjualtnhgmplampucn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
  const $ = id => document.getElementById(id);
  const showError = message => { $('error').textContent = message; $('error').classList.remove('hidden'); };
  const hideError = () => $('error').classList.add('hidden');
  let db = null;
  let publicUrl = '';

  async function init() {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') throw new Error('Supabase client library failed to load.');
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError) throw userError;
      if (!user?.id) { window.location.replace('login.html'); return; }
      const { data: r, error } = await db.rpc('get_business_passport', { p_merchant_id: user.id });
      if (error) throw error;
      if (!r || typeof r !== 'object') throw new Error('Business Passport returned no profile data.');
      hideError();
      $('app').classList.remove('hidden');
      $('business').textContent = r.business_name || 'Verified Business';
      $('profile-name').textContent = r.business_name || '—';
      $('phone').textContent = r.business_phone || 'Not provided';
      $('email').textContent = r.business_email || 'Not provided';
      $('receipts').textContent = Number(r.receipt_count || 0).toLocaleString('en-ZA');
      $('issued').textContent = Number(r.issued_receipts || 0).toLocaleString('en-ZA');
      $('paid').textContent = Number(r.paid_invoice_count || 0).toLocaleString('en-ZA');
      $('webhooks').textContent = Number(r.webhook_endpoint_count || 0).toLocaleString('en-ZA');
      $('keys').textContent = Number(r.api_key_count || 0).toLocaleString('en-ZA');
      $('since').textContent = r.active_since ? new Date(r.active_since).toLocaleDateString('en-ZA') : 'Active merchant profile';
    } catch (err) {
      console.error('Business Passport init failed:', err);
      showError('Business Passport could not load. Technical error: ' + (err?.message || err?.code || 'Unknown error'));
    }
  }

  async function sharePassport() {
    if (!db) return showError('Passport is still initializing. Please try again in a moment.');
    const b = $('share-btn');
    b.disabled = true;
    b.textContent = 'Generating…';
    try {
      const { data: r, error } = await db.rpc('rotate_business_passport_token');
      if (error) throw error;
      if (!r?.public_token) throw new Error('No secure Passport token was returned.');
      const targetPath = '/business-passport-public.html?token=' + encodeURIComponent(r.public_token);
      const { data: short, error: shortError } = await db.rpc('create_short_link', { p_target_path: targetPath, p_kind: 'passport' });
      if (shortError) throw shortError;
      const code = short?.[0]?.code;
      if (!code) throw new Error('No short link code was returned.');
      publicUrl = new URL('/s/' + code, location.origin).href;
      $('qr').src = 'https://quickchart.io/qr?size=240&margin=1&text=' + encodeURIComponent(publicUrl);
      $('qr-wrap').classList.remove('hidden');
      $('share-status').textContent = 'Clean secure Passport link generated. The previous public Passport link is now invalid.';
      $('share-status').classList.remove('hidden');
      const data = { title: 'ValoraTap Business Passport', text: 'View the verified business identity for ' + (r.business_name || 'this business') + '.', url: publicUrl };
      if (navigator.share) { try { await navigator.share(data); } catch (_) {} }
      else { try { await navigator.clipboard.writeText(publicUrl); $('share-status').textContent = 'Clean secure Passport link generated and copied to clipboard.'; } catch (_) { prompt('Copy this secure Passport link:', publicUrl); } }
    } catch (err) {
      console.error('Passport link generation failed:', err);
      $('share-status').textContent = 'Could not generate a secure Passport link: ' + (err?.message || 'unknown error');
      $('share-status').classList.remove('hidden');
    } finally {
      b.disabled = false;
      b.textContent = 'Generate New Secure Link';
    }
  }

  async function logout() {
    const b = $('logout-btn');
    b.disabled = true;
    b.textContent = 'Signing out…';
    try {
      if (!db) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { error } = await db.auth.signOut({ scope: 'local' });
      if (error) throw error;
      window.location.replace('login.html');
    } catch (err) {
      console.error('Sign out failed:', err);
      showError('Sign out failed: ' + (err?.message || 'unknown error'));
      b.disabled = false;
      b.textContent = 'Sign out';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('logout-btn').addEventListener('click', logout);
    $('share-btn').addEventListener('click', sharePassport);
    $('print-btn').addEventListener('click', () => window.print());
    init();
  });
})();