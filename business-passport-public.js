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

  function addTextRow(container, name, value) {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'row';
    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    valueEl.textContent = value;
    row.append(nameEl, valueEl);
    container.appendChild(row);
  }

  function addPublicProfile(row) {
    const values = [
      ['Industry', row.industry],
      ['Location', [row.city, row.province, row.country].filter(Boolean).join(', ')],
      ['Operating address', row.operating_address],
      ['Website', row.website],
      ['Business email', row.business_email]
    ];

    const hasDetails = values.some(([, value]) => value) || row.description || row.trading_name;
    if (!hasDetails) return;

    const card = $('publicProfile');
    if (!card) return;

    card.classList.remove('hidden');

    const head = document.createElement('div');
    head.className = 'card-head';
    const left = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'label gold';
    label.textContent = 'Business details';
    const heading = document.createElement('h2');
    heading.textContent = 'Public profile';
    left.append(label, heading);
    const mark = document.createElement('div');
    mark.className = 'card-mark';
    mark.textContent = 'Public by choice';
    head.append(left, mark);
    card.appendChild(head);

    if (row.trading_name) addTextRow(card, 'Trading name', row.trading_name);
    if (row.description) {
      const description = document.createElement('p');
      description.className = 'description';
      description.textContent = row.description;
      card.appendChild(description);
    }

    values.forEach(([name, value]) => addTextRow(card, name, value));
  }

  function addHeroMeta(row) {
    const container = $('heroMeta');
    if (!container) return;

    const items = [];
    if (row.trading_name && row.trading_name !== row.business_name) items.push(row.trading_name);
    if (row.industry) items.push(row.industry);
    const location = [row.city, row.province, row.country].filter(Boolean).join(', ');
    if (location) items.push(location);

    items.slice(0, 3).forEach(value => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = value;
      container.appendChild(pill);
    });
  }

  function formatDate(value) {
    if (!value) return 'Active merchant profile';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Active merchant profile';
    return date.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
      $('since').textContent = formatDate(row.active_since);

      addHeroMeta(row);
      addPublicProfile(row);
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
