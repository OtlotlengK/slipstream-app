/* VynoTap production-only environment routing.
   Website and Android both use the same production Supabase Auth project.
   Unrecognised hosts fail closed; no staging project is selected. */
(() => {
  const host = window.location.hostname.toLowerCase();
  const isNativeAndroid = host === 'localhost' && window.VT_ANDROID_BUILD_ENV === 'production';
  const productionHosts = new Set([
    'vynotap.com',
    'www.vynotap.com',
    'slipstream-app-sigma.vercel.app',
    'slipstream-app-clips4.vercel.app',
    'slipstream-app-git-main-clips4.vercel.app'
  ]);
  if (!isNativeAndroid && !productionHosts.has(host)) {
    throw new Error('VynoTap is configured for production only. This host is not authorised.');
  }
  const production = {
    url: 'https://pddjualtnhgmplampucn.supabase.co',
    key: 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH'
  };
  window.VT_ENV = Object.freeze({
    name: 'production',
    supabaseUrl: production.url,
    supabaseKey: production.key,
    functionsUrl: production.url + '/functions/v1',
    appUrl: isNativeAndroid ? 'https://vynotap.com' : window.location.origin
  });
  document.documentElement.dataset.vtEnvironment = 'production';
})();
