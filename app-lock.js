/* ValoraTap local app lock.
   This is a device-level privacy gate, not a replacement for Supabase Auth.
   The Supabase session remains intact while VT is locked. */
(() => {
  const KEY = 'vt_app_lock_v1';
  const HIDDEN_AT = 'vt_app_lock_hidden_at';
  const LOCK_AFTER_MS = 30000;
  const enc = new TextEncoder();

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = v => localStorage.setItem(KEY, JSON.stringify(v));
  const bytesToB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

  async function derivePin(pin, salt, iterations = 120000) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name:'PBKDF2', salt, iterations, hash:'SHA-256' }, base, 256
    ));
  }
  const same = (a,b) => a.length === b.length && a.every((v,i)=>v===b[i]);

  function setLockEnabled() {
    const s = read();
    s.enabled = Boolean(s.pin || s.biometric);
    write(s);
  }

  function showMessage(text, error=false) {
    const el = document.getElementById('vt-lock-message');
    if (!el) return;
    el.textContent = text;
    el.className = 'text-xs mt-3 ' + (error ? 'text-red-300' : 'text-slate-400');
  }

  function ensureOverlay() {
    if (document.getElementById('vt-lock-overlay')) return;
    const wrap = document.createElement('div');
    wrap.id = 'vt-lock-overlay';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="vt-lock-backdrop">
        <div class="vt-lock-card">
          <div class="vt-lock-mark">V</div>
          <div class="text-[10px] uppercase tracking-[.18em] text-teal-300 font-black">ValoraTap locked</div>
          <h1 class="text-2xl font-black text-white mt-2">Welcome back</h1>
          <p class="text-xs text-slate-400 mt-2">Unlock this device to continue. Your ValoraTap session is still signed in.</p>
          <div id="vt-lock-pin-wrap" class="mt-5">
            <label class="block text-[10px] uppercase tracking-wider text-slate-400 font-black mb-2">VT PIN</label>
            <input id="vt-lock-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" type="password"
              class="w-full px-4 py-3 bg-[#0b0d10] border border-slate-700 rounded-xl text-white text-center tracking-[.45em] text-lg focus:outline-none focus:border-teal-400"
              placeholder="••••••">
          </div>
          <button id="vt-lock-unlock" type="button" class="w-full mt-3 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-sm">Unlock</button>
          <button id="vt-lock-biometric" type="button" class="hidden w-full mt-3 py-3 rounded-xl border border-teal-400/30 bg-teal-400/10 text-teal-200 font-black text-sm">Use fingerprint / Face ID</button>
          <div id="vt-lock-message" class="text-xs mt-3 text-slate-400"></div>
          <button id="vt-lock-logout" type="button" class="mt-5 text-[10px] text-slate-500 hover:text-red-300">Log out completely</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #vt-lock-overlay{position:fixed;inset:0;z-index:2147483647}
      #vt-lock-overlay[hidden]{display:none!important}
      .vt-lock-backdrop{min-height:100%;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,10,.94);backdrop-filter:blur(18px)}
      .vt-lock-card{width:min(390px,100%);padding:28px;border:1px solid rgba(45,212,191,.22);border-radius:24px;background:linear-gradient(145deg,#17201F,#0d1514);box-shadow:0 30px 90px rgba(0,0,0,.5);text-align:center}
      .vt-lock-mark{width:48px;height:48px;margin:0 auto 14px;border-radius:15px;display:flex;align-items:center;justify-content:center;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.28);color:#5eead4;font-weight:1000;font-size:20px}
    `;
    document.head.appendChild(style);
    document.body.appendChild(wrap);
    document.getElementById('vt-lock-unlock').onclick = () => unlockWithPin();
    document.getElementById('vt-lock-pin').addEventListener('keydown', e => { if(e.key==='Enter') unlockWithPin(); });
    document.getElementById('vt-lock-biometric').onclick = () => unlockWithBiometric();
    document.getElementById('vt-lock-logout').onclick = async () => {
      try {
        if (window.supabase) {
          const db = window.supabase.createClient('https://pddjualtnhgmplampucn.supabase.co','sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH');
          await db.auth.signOut();
        }
      } finally { location.href='login.html'; }
    };
  }

  function lock() {
    const s = read();
    if (!s.enabled || document.visibilityState === 'visible' && !s.locked) return;
    ensureOverlay();
    s.locked = true;
    write(s);
    document.getElementById('vt-lock-overlay').hidden = false;
    const input = document.getElementById('vt-lock-pin');
    if (input) { input.value=''; setTimeout(()=>input.focus(),80); }
    const bio = document.getElementById('vt-lock-biometric');
    if (bio) bio.classList.toggle('hidden', !s.biometric);
  }

  function unlock() {
    const s = read();
    s.locked = false;
    write(s);
    document.getElementById('vt-lock-overlay').hidden = true;
    document.getElementById('vt-lock-pin').value = '';
    showMessage('');
  }

  async function unlockWithPin() {
    const s=read(), pin=document.getElementById('vt-lock-pin')?.value||'';
    if(!s.pin){ showMessage('No PIN is configured. Use your device biometric or set a PIN in Settings.',true); return; }
    if(!/^\\d{6,8}$/.test(pin)){ showMessage('Enter your 6–8 digit VT PIN.',true); return; }
    try{
      const salt=b64ToBytes(s.pin.salt);
      const hash=await derivePin(pin,salt,s.pin.iterations||120000);
      if(!same(hash,b64ToBytes(s.pin.hash))){ showMessage('Incorrect PIN.',true); return; }
      unlock();
    }catch(e){ console.error(e); showMessage('Could not verify the PIN. Please try again.',true); }
  }

  async function unlockWithBiometric() {
    const s=read();
    if(!s.biometric){ showMessage('Device biometric unlock is not configured.',true); return; }
    if(!window.PublicKeyCredential || !navigator.credentials){ showMessage('This browser does not support device biometric unlock.',true); return; }
    try{
      const challenge=randomBytes(32);
      const cred=await navigator.credentials.get({
        publicKey:{
          challenge,
          rpId:location.hostname,
          allowCredentials:[{type:'public-key',id:b64ToBytes(s.biometric.id)}],
          userVerification:'required',
          timeout:60000
        }
      });
      if(!cred){ throw new Error('No credential returned'); }
      const response=cred.response;
      const clientData=JSON.parse(new TextDecoder().decode(response.clientDataJSON));
      if(clientData.type!=='webauthn.get' || clientData.origin!==location.origin || clientData.challenge!==bytesToB64(challenge)){
        throw new Error('Invalid biometric assertion');
      }
      const data=response.authenticatorData;
      const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',response.clientDataJSON));
      const signed=new Uint8Array(data.byteLength+clientHash.byteLength);
      signed.set(new Uint8Array(data),0); signed.set(clientHash,data.byteLength);
      const der=new Uint8Array(response.signature);
      const raw=derToRawEcdsa(der);
      const key=await crypto.subtle.importKey('spki',b64ToBytes(s.biometric.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,raw,signed);
      if(!ok) throw new Error('Biometric signature verification failed');
      unlock();
    }catch(e){ console.warn('Biometric unlock failed',e); showMessage('Biometric unlock was cancelled or unavailable. Use your PIN instead.',true); }
  }

  function derToRawEcdsa(der) {
    let i=2;
    if(der[0]!==0x30) throw new Error('Bad signature');
    const readInt=()=>{ if(der[i++]!==0x02) throw new Error('Bad signature'); let len=der[i++]; if(len&0x80){const n=len&0x7f;len=0;for(let j=0;j<n;j++)len=(len<<8)|der[i++];}let v=der.slice(i,i+len);i+=len;while(v.length>32&&v[0]===0)v=v.slice(1);const out=new Uint8Array(32);out.set(v,32-v.length);return out; };
    const r=readInt(),s=readInt(); const out=new Uint8Array(64);out.set(r);out.set(s,32);return out;
  }

  async function setupPin(pin) {
    if(!/^\\d{6,8}$/.test(pin)) throw new Error('PIN must be 6–8 digits.');
    const salt=randomBytes(16), iterations=120000, hash=await derivePin(pin,salt,iterations);
    const s=read(); s.pin={salt:bytesToB64(salt),hash:bytesToB64(hash),iterations}; s.enabled=true; s.locked=false; write(s);
    return true;
  }

  async function setupBiometric() {
    if(!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) throw new Error('Device biometric unlock is not supported here.');
    if(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable){
      const available=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if(!available) throw new Error('This device does not have a supported fingerprint, Face ID or screen-lock authenticator available to ValoraTap.');
    }
    const challenge=randomBytes(32), userId=randomBytes(16);
    const cred=await navigator.credentials.create({
      publicKey:{
        challenge,
        rp:{id:location.hostname,name:'ValoraTap'},
        user:{id:userId,name:'ValoraTap device',displayName:'ValoraTap device'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
        timeout:60000
      }
    });
    if(!cred) throw new Error('No biometric credential was created.');
    const pub=cred.response.getPublicKey?.();
    if(!pub) throw new Error('This browser did not return the device public key.');
    const s=read();
    s.biometric={id:bytesToB64(cred.rawId),publicKey:bytesToB64(pub)};
    s.enabled=true; s.locked=false; write(s);
    return true;
  }

  function lockNow(){ ensureOverlay(); const s=read(); if(s.enabled){s.locked=true;write(s);document.getElementById('vt-lock-overlay').hidden=false;const b=document.getElementById('vt-lock-biometric');if(b)b.classList.toggle('hidden',!s.biometric);} }
  function status(){const s=read();return {enabled:Boolean(s.enabled),pin:Boolean(s.pin),biometric:Boolean(s.biometric),locked:Boolean(s.locked)};}
  function removePin(){const s=read();delete s.pin;setLockEnabled();}
  function removeBiometric(){const s=read();delete s.biometric;setLockEnabled();}

  window.ValoraAppLock={setupPin,setupBiometric,lockNow,status,removePin,removeBiometric,lock};
  document.addEventListener('DOMContentLoaded',()=>{
    ensureOverlay();
    const s=read();
    if(s.enabled && s.locked) lock();
    if(document.visibilityState==='hidden') localStorage.setItem(HIDDEN_AT,String(Date.now()));
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){localStorage.setItem(HIDDEN_AT,String(Date.now()));return;}
    const hiddenAt=Number(localStorage.getItem(HIDDEN_AT)||0);
    if(hiddenAt && Date.now()-hiddenAt>=LOCK_AFTER_MS) lock();
    localStorage.removeItem(HIDDEN_AT);
  });
})();