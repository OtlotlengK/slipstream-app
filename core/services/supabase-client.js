/* ValoraTap shared Supabase client factory.
   Requires /vt-env.js and the Supabase JS v2 CDN to load first.
   Never embed project URLs or keys in individual pages. */
(() => {
  const clients = new Map();
  function createSupabaseClient(options = {}) {
    if (!window.VT_ENV || !window.VT_ENV.supabaseUrl || !window.VT_ENV.supabaseKey) {
      throw new Error('ValoraTap environment configuration is unavailable.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase client library is unavailable.');
    }
    const key = JSON.stringify(options);
    if (!clients.has(key)) {
      clients.set(key, window.supabase.createClient(
        window.VT_ENV.supabaseUrl,
        window.VT_ENV.supabaseKey,
        options
      ));
    }
    return clients.get(key);
  }
  window.VT = window.VT || {};
  window.VT.createSupabaseClient = createSupabaseClient;
})();