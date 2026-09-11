(() => {
  'use strict';
  const canonicalise = () => {
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('verify.html?hash=') || href.startsWith('/receipt-detail.html')) {
        a.setAttribute('href', 'receipts.html');
        a.textContent = 'Open Receipt Vault →';
      } else if (href.startsWith('/invoice-detail.html')) {
        a.setAttribute('href', 'invoice-centre.html');
        a.textContent = 'Open Invoice Centre →';
      }
    });
  };
  canonicalise();
  new MutationObserver(canonicalise).observe(document.body, { childList: true, subtree: true });
})();
