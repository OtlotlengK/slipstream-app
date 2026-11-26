/* VynoTap contextual onboarding. Acknowledgements are stored in the signed-in user's
   Supabase user metadata (UI preference only; never used for authorisation). */
(() => {
  if (window.__VT_GUIDANCE_STARTED__) return;
  window.__VT_GUIDANCE_STARTED__ = true;
  const pages = {
    '/dashboard-v2.html': ['dashboard','Your business at a glance','Use this dashboard to monitor your financial snapshot, access invoice actions and review important business activity. Figures reflect records available in your VynoTap account.'],
    '/apps/invoices/invoice-centre.html': ['invoice_centre','Welcome to your Invoice Centre','Review invoices, monitor payment status, search records and open an invoice to inspect or manage its details.'],
    '/apps/invoices/invoice-create.html': ['create_invoice','Creating an invoice','Enter customer details, add products or services, confirm dates and review totals before creating the invoice. Saved catalogue items help you avoid repeatedly entering the same items.'],
    '/apps/receipts/receipts.html': ['receipt_vault','Your Receipt Vault','Your issued receipts are kept here. Open a receipt to review its details and verification information. A receipt should not be treated as proof of cleared funds unless its status confirms payment.'],
    '/apps/business/business-passport.html': ['business_passport','Your Business Passport','Your Business Passport presents your business profile and selected VynoTap activity in a shareable format. Review the information before sharing its public link.'],
    '/apps/catalogue/product-catalogue.html': ['product_catalogue','Build your product catalogue','Save the products and services you sell, including descriptions and prices. Select saved items when preparing invoices instead of typing them repeatedly.'],
    '/centres/action-centre.html': ['action_centre','Your Action Centre','This area brings important items requiring attention into one place. Review each item and use its available action to resolve or investigate it.']
  };
  const path = location.pathname.replace(/\/$/, '') || '/';
  const guide = pages[path];
  if (!guide) return;
  const META_KEY = 'vynotap_guidance_acknowledged';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function addStyles() {
    if (document.getElementById('vt-guidance-styles')) return;
    const s = document.createElement('style');
    s.id = 'vt-guidance-styles';
    s.textContent = '#vt-guidance{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.64);backdrop-filter:blur(7px)}#vt-guidance[hidden]{display:none!important}#vt-guidance .vtg-card{width:min(430px,100%);padding:25px;border:1px solid var(--dash-line,#DDE7E5);border-radius:22px;background:var(--dash-surface,#fff);color:var(--dash-text,#0F172A);box-shadow:0 24px 80px rgba(0,0,0,.28);font-family:Inter,ui-sans-serif,system-ui,sans-serif}#vt-guidance .vtg-kicker{font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#0F766E}html[data-vt-theme="dark"] #vt-guidance .vtg-kicker{color:#5EEAD4}#vt-guidance h2{margin:9px 0 0;font-size:22px;line-height:1.18;font-weight:900;letter-spacing:-.035em;color:inherit}#vt-guidance p{margin:11px 0 0;color:var(--dash-muted,#64748B);font-size:13px;line-height:1.65}#vt-guidance .vtg-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px}#vt-guidance .vtg-note{font-size:10px;color:var(--dash-muted,#64748B);line-height:1.4}#vt-guidance button{flex:none;border:0;border-radius:12px;background:#0F766E;color:#fff;padding:12px 19px;font-size:12px;font-weight:900;cursor:pointer}#vt-guidance button:hover{background:#115E59}#vt-guidance button:focus-visible{outline:3px solid #5EEAD4;outline-offset:3px}#vt-guidance button:disabled{opacity:.65;cursor:wait}@media(max-width:420px){#vt-guidance .vtg-card{padding:21px;border-radius:19px}#vt-guidance .vtg-foot{align-items:flex-start;flex-direction:column}#vt-guidance button{width:100%}}';
    document.head.appendChild(s);
  }
  async function init() {
    try {
      if (!window.VT?.createSupabaseClient) return;
      const db = window.VT.createSupabaseClient();
      const {data,error} = await db.auth.getUser();
      if (error || !data?.user) return;
      const acknowledged = data.user.user_metadata?.[META_KEY] || {};
      if (acknowledged[guide[0]] === true) return;
      addStyles();
      const wrap = document.createElement('div');
      wrap.id = 'vt-guidance';
      wrap.setAttribute('role','dialog');
      wrap.setAttribute('aria-modal','true');
      wrap.setAttribute('aria-labelledby','vtg-title');
      wrap.setAttribute('aria-describedby','vtg-body');
      wrap.innerHTML = '<section class="vtg-card"><div class="vtg-kicker">A quick introduction</div><h2 id="vtg-title">'+esc(guide[1])+'</h2><p id="vtg-body">'+esc(guide[2])+'</p><div class="vtg-foot"><span class="vtg-note">This explanation appears only once for your account.</span><button type="button" id="vtg-confirm">Got it</button></div></section>';
      document.body.appendChild(wrap);
      const button = wrap.querySelector('#vtg-confirm');
      button.addEventListener('click', async () => {
        button.disabled = true; button.textContent = 'Saving…';
        const next = {...acknowledged,[guide[0]]:true};
        const {error:saveError} = await db.auth.updateUser({data:{[META_KEY]:next}});
        if (saveError) {
          button.disabled = false; button.textContent = 'Got it';
          wrap.querySelector('.vtg-note').textContent = 'Could not save your acknowledgement. Please try again.';
          return;
        }
        wrap.remove();
      });
      button.focus();
    } catch (error) { console.warn('Contextual guidance could not be loaded.',error); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();