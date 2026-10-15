/* ValoraTap appearance: system, light, or dark. */
(() => {
  const KEY = 'vt_theme_preference_v1';
  const valid = ['system','light','dark'];
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const read = () => { try { const v=localStorage.getItem(KEY); return valid.includes(v)?v:null; } catch (_) { return null; } };
  const resolved = p => p==='dark'||(p==='system'&&media&&media.matches)?'dark':'light';
  const style = document.createElement('style');
  style.id='vt-theme-styles';
  style.textContent = `
    :root{color-scheme:light}html[data-vt-theme="dark"]{color-scheme:dark}
    html[data-vt-theme="dark"]{--bg:#0B1220;--paper:#0B1220;--card:#151F30;--text:#E5E7EB;--ink:#E5E7EB;--muted:#A8B4C7;--line:#334155;--brand:#0F766E}
    html[data-vt-theme="light"]{--bg:#F8FAFC;--paper:#F8FAFC;--card:#FFFFFF;--text:#0F172A;--ink:#0F172A;--muted:#64748B;--line:#E2E8F0}
    html[data-vt-theme="light"] body[class*="bg-[#0F172A]"] h1.text-white{color:#0F172A!important}
    html[data-vt-theme="light"] [class~="bg-slate-800"][class~="text-white"]{color:#0F172A!important}
    html[data-vt-theme="light"] [class~="text-slate-300"],html[data-vt-theme="light"] [class~="text-gray-300"]{color:#475569!important}
    html[data-vt-theme="dark"] body{background:#0B1220!important;color:#E5E7EB!important}
/* Dashboard-v2 uses custom classes and hard-coded light surfaces rather than utility classes. */
    html[data-vt-theme="dark"] body,
    html[data-vt-theme="dark"] body .wrap,
    html[data-vt-theme="dark"] body main,
    html[data-vt-theme="dark"] body .page-shell{background:#0B1220!important;color:#E5E7EB!important}
    html[data-vt-theme="dark"] body .card,
    html[data-vt-theme="dark"] body .ops-item,
    html[data-vt-theme="dark"] body .ops-stat,
    html[data-vt-theme="dark"] body .ops-empty,
    html[data-vt-theme="dark"] body .metric{background:#151F30!important;color:#E5E7EB!important;border-color:#334155!important;box-shadow:none}
    html[data-vt-theme="dark"] body .label,
    html[data-vt-theme="dark"] body .metric .label,
    html[data-vt-theme="dark"] body .text-slate-500{color:#A8B4C7!important}
    html[data-vt-theme="dark"] body .ops-item:hover,
    html[data-vt-theme="dark"] body .ops-stat:hover{background:#1E293B!important}
    html[data-vt-theme="dark"] body .attention{background:#3B2A0B!important;color:#FDE68A!important}
    html[data-vt-theme="dark"] body .paid{background:#052E2B!important;color:#A7F3D0!important}
    html[data-vt-theme="dark"] body .overdue{background:#3F151B!important;color:#FECACA!important}
    html[data-vt-theme="dark"] body .input{background:#0F172A!important;color:#F8FAFC!important;border-color:#475569!important}
    html[data-vt-theme="dark"] body .input::placeholder{color:#94A3B8!important}
    html[data-vt-theme="dark"] body .hero,
    html[data-vt-theme="dark"] body .passport{color:#F8FAFC!important}
    html[data-vt-theme="light"] body .wrap{background:#F8FAFC!important;color:#0F172A!important}
    html[data-vt-theme="dark"] .card,html[data-vt-theme="dark"] .settings-card,html[data-vt-theme="dark"] .doc,html[data-vt-theme="dark"] .panel,html[data-vt-theme="dark"] .notification-panel,html[data-vt-theme="dark"] [class~="bg-white"],html[data-vt-theme="dark"] [class~="bg-slate-50"],html[data-vt-theme="dark"] [class~="bg-gray-50"],html[data-vt-theme="dark"] [class*="bg-[#F"],html[data-vt-theme="dark"] [class*="bg-[#f"]{background:#151F30!important;color:#E5E7EB!important;border-color:#334155!important}
    html[data-vt-theme="dark"] [class~="text-slate-900"],html[data-vt-theme="dark"] [class~="text-slate-800"],html[data-vt-theme="dark"] [class~="text-slate-700"],html[data-vt-theme="dark"] [class~="text-gray-900"],html[data-vt-theme="dark"] [class~="text-gray-800"],html[data-vt-theme="dark"] [class~="text-gray-700"],html[data-vt-theme="dark"] [class~="text-zinc-900"]{color:#E5E7EB!important}
    html[data-vt-theme="dark"] [class~="text-slate-600"],html[data-vt-theme="dark"] [class~="text-slate-500"],html[data-vt-theme="dark"] [class~="text-gray-600"],html[data-vt-theme="dark"] [class~="text-gray-500"]{color:#A8B4C7!important}
    html[data-vt-theme="dark"] [class~="border-slate-100"],html[data-vt-theme="dark"] [class~="border-slate-200"],html[data-vt-theme="dark"] [class~="border-gray-100"],html[data-vt-theme="dark"] [class~="border-gray-200"]{border-color:#334155!important}
    html[data-vt-theme="dark"] input:not([type="checkbox"]):not([type="radio"]),html[data-vt-theme="dark"] select,html[data-vt-theme="dark"] textarea,html[data-vt-theme="dark"] .input,html[data-vt-theme="dark"] .search{background:#0F172A!important;color:#F8FAFC!important;border-color:#475569!important}
    html[data-vt-theme="dark"] input::placeholder,html[data-vt-theme="dark"] textarea::placeholder{color:#94A3B8!important}
    html[data-vt-theme="dark"] .row:hover,html[data-vt-theme="dark"] tr:hover{background:#1E293B!important}
    html[data-vt-theme="dark"] .kv{border-color:#334155!important}html[data-vt-theme="dark"] .meta{background:#0F172A!important;color:#CBD5E1!important;border-color:#334155!important}
    html[data-vt-theme="dark"] .check.ok{background:#052E2B!important;border-color:#065F46!important}html[data-vt-theme="dark"] .check.warn{background:#3B2A0B!important;border-color:#92400E!important}html[data-vt-theme="dark"] .check.bad{background:#3F151B!important;border-color:#991B1B!important}
    html[data-vt-theme="dark"] .success{background:#052E2B!important;color:#A7F3D0!important;border-color:#065F46!important}html[data-vt-theme="dark"] .warnbox{background:#3B2A0B!important;color:#FDE68A!important;border-color:#92400E!important}html[data-vt-theme="dark"] .error{background:#3F151B!important;color:#FECACA!important;border-color:#991B1B!important}
    html[data-vt-theme="dark"] .top{background:#080F1B!important}html[data-vt-theme="dark"] [class*="bg-[#17201F]"],html[data-vt-theme="dark"] [class*="bg-[#0F172A]"]{background:#080F1B!important}html[data-vt-theme="dark"] [class~="text-slate-100"]{color:#E5E7EB!important}html[data-vt-theme="dark"] [class~="border-slate-800"]{border-color:#334155!important}
    html[data-vt-theme="light"] body{background:#F8FAFC!important;color:#0F172A!important}
    html[data-vt-theme="light"] [class*="bg-[#17201F]"],html[data-vt-theme="light"] [class*="bg-[#0F172A]"],html[data-vt-theme="light"] [class~="bg-slate-900"],html[data-vt-theme="light"] [class~="bg-gray-900"]{background:#FFFFFF!important;color:#0F172A!important}
    html[data-vt-theme="light"] [class~="text-slate-100"],html[data-vt-theme="light"] [class~="text-slate-200"],html[data-vt-theme="light"] [class~="text-gray-100"],html[data-vt-theme="light"] [class~="text-gray-200"]{color:#0F172A!important}
    html[data-vt-theme="light"] .card,html[data-vt-theme="light"] .settings-card,html[data-vt-theme="light"] .doc{background:#FFFFFF!important;color:#0F172A!important;border-color:#E2E8F0!important}
    html[data-vt-theme="light"] [class~="border-slate-800"]{border-color:#E2E8F0!important}html[data-vt-theme="light"] [class~="bg-slate-800"]{background:#F1F5F9!important;color:#0F172A!important}
    html[data-vt-theme="light"] [class~="text-slate-400"],html[data-vt-theme="light"] [class~="text-slate-500"]{color:#64748B!important}
    #vt-theme-onboarding[hidden]{display:none!important}#vt-theme-onboarding{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.72);backdrop-filter:blur(10px)}
    .vt-theme-dialog{width:min(440px,100%);border:1px solid #DDE7E5;border-radius:24px;padding:24px;background:#fff;color:#0F172A;box-shadow:0 30px 100px rgba(0,0,0,.3);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    .vt-theme-dialog h2{margin:0;font-size:24px;line-height:1.15;font-weight:900;letter-spacing:-.03em}.vt-theme-dialog p{margin:9px 0 0;color:#64748B;font-size:13px;line-height:1.5}.vt-theme-choices{display:grid;gap:9px;margin-top:20px}
    .vt-theme-choice{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid #DDE7E5;border-radius:14px;background:#fff;color:#0F172A;padding:13px;cursor:pointer}
    .vt-theme-choice:hover,.vt-theme-choice:focus-visible{border-color:#6C4CF1;outline:2px solid rgba(108,76,241,.15)}.vt-theme-choice strong{display:block;font-size:13px}.vt-theme-choice small{display:block;color:#64748B;margin-top:3px;font-size:11px;line-height:1.4}
    .vt-theme-icon{width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:11px;background:#F1EDFF;color:#6C4CF1;font-size:18px}.vt-theme-dismiss{margin-top:13px;width:100%;border:0;background:transparent;color:#64748B;padding:10px;font-size:12px;font-weight:700;cursor:pointer}
    .vt-appearance-card{border:1px solid #DDE7E5;border-radius:16px;padding:18px;background:#fff;color:#0F172A;margin:0 0 20px}.vt-appearance-card h2{font-size:17px;font-weight:900;margin:0}.vt-appearance-card p{color:#64748B;font-size:12px;line-height:1.5;margin:6px 0 13px}.vt-appearance-card label{display:block;font-size:11px;font-weight:800;color:#475569;margin-bottom:6px}.vt-appearance-card select{width:100%;border:1px solid #CBD5E1;border-radius:10px;padding:11px 12px;background:#fff;color:#0F172A}
    html[data-vt-theme="dark"] .vt-appearance-card{background:#151F30;color:#E5E7EB;border-color:#334155}html[data-vt-theme="dark"] .vt-appearance-card p,html[data-vt-theme="dark"] .vt-appearance-card label{color:#A8B4C7}html[data-vt-theme="dark"] .vt-appearance-card select{background:#0F172A;color:#F8FAFC;border-color:#475569}
  `;
  document.head.appendChild(style);
  function apply(p) {
    p=valid.includes(p)?p:'system';
    document.documentElement.dataset.vtTheme=resolved(p);
    document.documentElement.dataset.vtThemePreference=p;
    try{localStorage.setItem(KEY,p)}catch(_){}
    document.querySelectorAll('[data-vt-theme-select]').forEach(el=>el.value=p);
  }
  function choice(value,icon,title,desc) {
    const b=document.createElement('button');b.type='button';b.className='vt-theme-choice';
    const i=document.createElement('span');i.className='vt-theme-icon';i.setAttribute('aria-hidden','true');i.textContent=icon;
    const wrap=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
    strong.textContent=title;small.textContent=desc;wrap.append(strong,small);b.append(i,wrap);
    b.addEventListener('click',()=>{apply(value);try{localStorage.setItem('vt_theme_onboarding_seen_v1','1')}catch(_){};document.getElementById('vt-theme-onboarding')?.remove()});
    return b;
  }
  function onboarding() {
    try{if(localStorage.getItem('vt_theme_onboarding_seen_v1')==='1')return}catch(_){return}
    const overlay=document.createElement('div');overlay.id='vt-theme-onboarding';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','vt-theme-title');
    const box=document.createElement('div');box.className='vt-theme-dialog';
    const h=document.createElement('h2');h.id='vt-theme-title';h.textContent='Match your device?';
    const p=document.createElement('p');p.textContent='Choose how ValoraTap should look. You can change this any time in Business Settings.';
    const choices=document.createElement('div');choices.className='vt-theme-choices';
    choices.append(choice('system','◐','Follow device settings','VT changes when your phone changes. Recommended.'),choice('light','☀','Always light','Keep VT light even when your phone is dark.'),choice('dark','☾','Always dark','Keep VT dark even when your phone is light.'));
    const skip=document.createElement('button');skip.type='button';skip.className='vt-theme-dismiss';skip.textContent='Use my device setting for now';skip.addEventListener('click',()=>{apply('system');try{localStorage.setItem('vt_theme_onboarding_seen_v1','1')}catch(_){};overlay.remove()});
    box.append(h,p,choices,skip);overlay.appendChild(box);document.body.appendChild(overlay);
  }
  function settingsControl() {
    if(document.getElementById('vt-appearance-card'))return;
    const main=document.querySelector('main,[role="main"],[data-settings-page],.settings-page');
    if(!main)return;
    const text=(main.textContent||'').toLowerCase();
    const looksLikeSettings=/business settings|business profile|account settings|notification settings|security settings/.test(text);
    if(!looksLikeSettings && !main.querySelector('[data-settings-section],.settings-card'))return;
    const sections=Array.from(main.querySelectorAll('section,[data-settings-section],.settings-card'));
    const identity=sections.find(s=>/business identity|business profile/.test((s.textContent||'').toLowerCase()));
    const payment=sections.find(s=>/payments/.test((s.textContent||'').slice(0,100)));
    const card=document.createElement('section');card.id='vt-appearance-card';card.className='vt-appearance-card';
    const h=document.createElement('h2');h.textContent='Appearance';const p=document.createElement('p');p.textContent='Choose whether ValoraTap follows your phone or uses a fixed theme on this device.';
    const label=document.createElement('label');label.htmlFor='vt-theme-select';label.textContent='Theme preference';
    const select=document.createElement('select');select.id='vt-theme-select';select.setAttribute('data-vt-theme-select','');
    [['system','Follow device settings'],['light','Always light'],['dark','Always dark']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o)});
    select.addEventListener('change',()=>apply(select.value));card.append(h,p,label,select);
    if(identity&&identity.parentNode)identity.after(card);else if(payment&&payment.parentNode)main.insertBefore(card,payment);else main.prepend(card);
  }
  function init(){const p=read();apply(p||'system');settingsControl();const observer=new MutationObserver(()=>settingsControl());observer.observe(document.body,{childList:true,subtree:true});if(!/\/invoice\.html$/i.test(location.pathname))onboarding();if(media?.addEventListener)media.addEventListener('change',()=>{if(read()==='system')apply('system')});else if(media?.addListener)media.addListener(()=>{if(read()==='system')apply('system')})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();