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
  const bytesToB64Url = bytes => bytesToB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
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
          <div class="vt-lock-eyebrow">ValoraTap locked</div>
          <h1 class="vt-lock-title">Welcome back</h1>
          <p class="vt-lock-subtitle">Unlock this device to continue. Your ValoraTap session is still signed in.</p>
          <div id="vt-lock-pin-wrap" class="vt-lock-pin-wrap">
            <label class="vt-lock-label" for="vt-lock-pin">VT PIN</label>
            <input id="vt-lock-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" type="password" class="vt-lock-input" placeholder="Enter your PIN">
          </div>
          <button id="vt-lock-unlock" type="button" class="vt-lock-button vt-lock-primary">Unlock</button>
          <button id="vt-lock-biometric" type="button" class="vt-lock-button vt-lock-biometric vt-lock-hidden">Use fingerprint / Face ID</button>
          <div id="vt-lock-message" class="vt-lock-message"></div>
          <button id="vt-lock-logout" type="button" class="vt-lock-logout">Log out completely</button>
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #vt-lock-overlay{position:fixed;inset:0;z-index:2147483647}
      #vt-lock-overlay[hidden]{display:none!important}
      .vt-lock-backdrop{min-height:100%;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,10,.94);backdrop-filter:blur(18px)}
      .vt-lock-card{width:min(390px,100%);padding:28px;border:1px solid rgba(45,212,191,.22);border-radius:24px;background:linear-gradient(145deg,#17201F,#0d1514);box-shadow:0 30px 90px rgba(0,0,0,.5);text-align:center}
      .vt-lock-mark{width:64px;height:64px;margin:0 auto 22px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.28);color:#5eead4;font-weight:1000;font-size:28px}
      #vt-lock-overlay,#vt-lock-overlay *{box-sizing:border-box}
      #vt-lock-overlay{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc}
      .vt-lock-hidden{display:none!important}
      .vt-lock-eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:900;color:#5eead4}
      .vt-lock-title{margin:10px 0 0;color:#f8fafc;font-size:clamp(25px,6vw,32px);line-height:1.15;font-weight:850;letter-spacing:-.035em}
      .vt-lock-subtitle{margin:12px 0 0;color:#a1a1aa;font-size:14px;line-height:1.6}
      .vt-lock-pin-wrap{margin-top:24px;text-align:left}
      .vt-lock-label{display:block;margin-bottom:9px;color:#a1a1aa;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
      .vt-lock-input{display:block;width:100%;min-height:52px;padding:13px 16px;border:1px solid #374151;border-radius:13px;background:#0b0d10;color:#fff;text-align:center;letter-spacing:.35em;font-size:18px;outline:none;appearance:none;-webkit-appearance:none}
      .vt-lock-input:focus{border-color:#2dd4bf;box-shadow:0 0 0 3px rgba(45,212,191,.12)}
      .vt-lock-button{display:block;width:100%;min-height:48px;margin-top:12px;padding:13px 16px;border-radius:13px;font-family:inherit;font-size:14px;font-weight:800;line-height:1.3;cursor:pointer;transition:background .15s,border-color .15s}
      .vt-lock-primary{border:1px solid #0d9488;background:#0d9488;color:#fff}
      .vt-lock-primary:hover{background:#0f766e}
      .vt-lock-biometric{border:1px solid rgba(45,212,191,.35);background:rgba(45,212,191,.1);color:#99f6e4}
      .vt-lock-biometric:hover{background:rgba(45,212,191,.17)}
      .vt-lock-message{min-height:18px;margin-top:12px;color:#a1a1aa;font-size:12px;line-height:1.5}
      .vt-lock-logout{margin-top:22px;padding:8px;border:0;background:transparent;color:#71717a;font-size:12px;font-weight:700;cursor:pointer}
      .vt-lock-logout:hover{color:#fca5a5}
      @media(max-width:420px){.vt-lock-backdrop{padding:16px}.vt-lock-card{padding:24px 20px}.vt-lock-mark{width:58px;height:58px;margin-bottom:18px}}
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
    if (!s.enabled) return;
    ensureOverlay();
    s.locked = true;
    write(s);
    document.getElementById('vt-lock-overlay').hidden = false;
    const input = document.getElementById('vt-lock-pin');
    if (input) { input.value=''; setTimeout(()=>input.focus(),80); }
    const bio = document.getElementById('vt-lock-biometric');
    if (bio) bio.classList.toggle('vt-lock-hidden', !s.biometric);
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
    if(!/^\d{6,8}$/.test(pin)){ showMessage('Enter your 6–8 digit VT PIN.',true); return; }
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
      if(clientData.type!=='webauthn.get' || clientData.origin!==location.origin || clientData.challenge!==bytesToB64Url(challenge)){
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
    if(!/^\d{6,8}$/.test(pin)) throw new Error('PIN must be 6–8 digits.');
    const salt=randomBytes(16), iterations=120000, hash=await derivePin(pin,salt,iterations);
    const s=read(); s.pin={salt:bytesToB64(salt),hash:bytesToB64(hash),iterations}; s.enabled=true; s.locked=false; write(s);
    return true;
  }

  async function setupBiometric() {
    const current = read();
    if (!current.pin) throw new Error('Set and confirm a VT PIN first. Your PIN is the fallback if fingerprint / Face ID is unavailable.');
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

  function lockNow(){ ensureOverlay(); const s=read(); if(s.enabled){s.locked=true;write(s);document.getElementById('vt-lock-overlay').hidden=false;const b=document.getElementById('vt-lock-biometric');if(b)b.classList.toggle('vt-lock-hidden',!s.biometric);} }
  function status(){const s=read();return {enabled:Boolean(s.enabled),pin:Boolean(s.pin),biometric:Boolean(s.biometric),locked:Boolean(s.locked)};}
  function removePin(){const s=read();delete s.pin;setLockEnabled();}
  function removeBiometric(){const s=read();delete s.biometric;setLockEnabled();}
  function disable(){localStorage.removeItem(KEY);localStorage.removeItem(HIDDEN_AT);const o=document.getElementById('vt-lock-overlay');if(o)o.hidden=true;}

  window.ValoraAppLock={setupPin,setupBiometric,lockNow,status,removePin,removeBiometric,disable,lock};
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