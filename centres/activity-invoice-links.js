(() => {
  'use strict';
  const SUPABASE_URL = 'https://pddjualtnhgmplampucn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
  let db;
  let invoiceMap = new Map();
  let ready = false;

  function initDb() {
    if (ready) return true;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    ready = true;
    return true;
  }

  async function loadMap() {
    if (!initDb()) return;
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) return;
    const { data, error } = await db
      .from('invoices')
      .select('id,invoice_no')
      .eq('merchant_id', uid);
    if (error || !Array.isArray(data)) return;
    invoiceMap = new Map(data.filter(x => x.invoice_no && x.id).map(x => [String(x.invoice_no), x.id]));
    rewrite();
  }

  function rewrite() {
    document.querySelectorAll('a[href="invoices.html"]').forEach(a => {
      let invoiceNo = '';
      const row = a.closest('tr');
      if (row) {
        const cells = row.querySelectorAll('td');
        invoiceNo = cells[1]?.querySelector('div')?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
      } else {
        const card = a.closest('.box');
        invoiceNo = card?.querySelector('b')?.textContent?.trim() || '';
      }
      const id = invoiceMap.get(invoiceNo);
      if (!id) return;
      a.href = `invoice-view.html?id=${encodeURIComponent(id)}`;
      a.textContent = 'View invoice →';
    });
  }

  const observer = new MutationObserver(rewrite);
  observer.observe(document.body, { childList: true, subtree: true });
  loadMap();
})();
