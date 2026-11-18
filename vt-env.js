/* VynoTap environment routing.
   Production is selected only on explicitly allow-listed production hosts.
   Android build environment is injected into the packaged web bundle by
   scripts/build-android.mjs. Debug builds use staging; release builds use production. */
(() => {
  const host = window.location.hostname.toLowerCase();
  const isNativeAndroid = host === 'localhost' && ['staging', 'production'].includes(window.VT_ANDROID_BUILD_ENV);
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
  if (isNativeAndroid) {
    const nativeEnvironment = window.VT_ANDROID_BUILD_ENV;
    if (!['staging', 'production'].includes(nativeEnvironment)) {
      throw new Error('VynoTap Android build has no valid environment. Build with the Android build script.');
    }
    environment = nativeEnvironment;
  } else if (productionHosts.has(host)) {
    environment = 'production';
  } else if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
    environment = 'staging';
  } else {
    throw new Error('VynoTap blocked an unrecognised host. No Supabase connection was started.');
  }
  const selected = environment === 'production' ? production : staging;
  const appUrl = isNativeAndroid
    ? (environment === 'production' ? 'https://vynotap.com' : 'https://slipstream-app-jbxe-git-feat-vynotap-android-capacitor-clips4.vercel.app')
    : window.location.origin;
  window.VT_ENV = Object.freeze({
    name: environment,
    supabaseUrl: selected.url,
    supabaseKey: selected.key,
    functionsUrl: selected.url + '/functions/v1',
    appUrl
  });
  document.documentElement.dataset.vtEnvironment = environment;
})();
