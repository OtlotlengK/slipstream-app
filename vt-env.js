/* VynoTap environment routing.
   Production is selected only on explicitly allow-listed production hosts.
   Every Vercel preview and localhost uses staging. Unknown hosts fail closed. */
(() => {
  const host = window.location.hostname.toLowerCase();
  const productionHosts = new Set([
    'vynotap.com',
    'www.vynotap.com',
    'slipstream-app-sigma.vercel.app',
    'slipstream-app-clips4.vercel.app',
    'slipstream-app-git-main-clips4.vercel.app'
  ]);
  const production = {
    url: 'https://pddjualtnhgmplampucn.supabase.co',
    key: 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH'
  };
  const staging = {
    url: 'https://uvnlihejfwotynxhlvpq.supabase.co',
    key: 'sb_publishable_erwz2gEbNN3sOx7h29B8ew_ObOMUwe2'
  };
  let environment;
  if (productionHosts.has(host)) {
    environment = 'production';
  } else if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
    environment = 'staging';
  } else {
    throw new Error('VynoTap blocked an unrecognised host. No Supabase connection was started.');
  }
  const selected = environment === 'production' ? production : staging;
  window.VT_ENV = Object.freeze({
    name: environment,
    supabaseUrl: selected.url,
    supabaseKey: selected.key,
    functionsUrl: selected.url + '/functions/v1'
  });
  document.documentElement.dataset.vtEnvironment = environment;
})();
