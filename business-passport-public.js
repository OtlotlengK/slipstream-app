(() => {
  const SUPABASE_URL = 'https://pddjualtnhgmplampucn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
  const $ = id => document.getElementById(id);

  function fail(message) {
    const error = $('error');
    if (error) {
      error.textContent = message;
      error.classList.remove('hidden');
    }
  }

  function addProfileCard(row) {
    const values = [
      ['Trading name', row.trading_name],
      ['Industry', row.industry],
      ['Description', row.description],
      ['Location', [row.city, row.province, row.country].filter(Boolean).join(', ')],
      ['Operating address', row.operating_address],
      ['Website', row.website],
      ['Business email', row.business_email]
    ].filter(([, value]) => value);

    if (!values.length) return;

    const card = document.createElement('section');
    card.className = 'card';
    const label = document.createElement('div');
    label.className = 'label gold';
    label.textContent = 'Business details';
    const heading = document.createElement('h2');
    heading.textContent = 'Public profile';
    card.append(label, heading);

    values.forEach(([name, value]) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      const nameEl = document.createElement('span');
      nameEl.textContent = name;
      const valueEl = document.createElement('span');
      valueEl.className = 'value';
      valueEl.textContent = value;
      rowEl.append(nameEl, valueEl);
      card.appendChild(rowEl);
    });

    $('app').appendChild(card);
  }

  async function init() {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase client library failed to load.');
      }

      const token = new URLSearchParams(window.location.search).get('token') || '';
      if (!/^[a-fA-F0-9]{64}$/.test(token)) {
        fail('This Business Passport link is invalid or incomplete.');
        return;
      }

      const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const { data, error } = await db.rpc('get_public_business_passport_by_token', {
        p_public_token: token
      });

      if (error) {
        console.error('Public Passport lookup failed:', error);
        fail('This Business Passport could not be verified. Please try the link again.');
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.business_name) {
        fail('This Business Passport could not be verified. The link may have expired or been rotated.');
        return;
      }

      $('app').classList.remove('hidden');
      $('business').textContent = row.business_name;
      $('profile').textContent = row.trading_name || row.business_name;
      $('phone').textContent = row.business_phone || 'Not provided';
      $('receipts').textContent = Number(row.receipt_count || 0).toLocaleString('en-ZA');
      $('issued').textContent = Number(row.issued_receipts || 0).toLocaleString('en-ZA');
      $('paid').textContent = Number(row.paid_invoice_count || 0).toLocaleString('en-ZA');
      $('since').textContent = row.active_since
        ? new Date(row.active_since).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'Active merchant profile';
      addProfileCard(row);
    } catch (err) {
      console.error('Public Business Passport failed:', err);
      fail('This Business Passport could not be loaded. Please try again.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
