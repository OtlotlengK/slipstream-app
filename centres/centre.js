(() => {
  'use strict';
  const URL = 'https://pddjualtnhgmplampucn.supabase.co';
  const KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
  const $ = id => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ''); };
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const norm = value => String(value ?? '').trim().toLowerCase();
  const money = value => `R ${Number(value || 0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const completed = status => ['paid','completed','confirmed','succeeded','success','issued'].includes(norm(status));
  const errorBox = message => { const el = $('error'); if (el) { el.hidden = false; el.textContent = message; } console.error(message); };
  const daysAgo = n => new Date(Date.now() - n * 86400000);
  const customerKey = x => { const e=norm(x.customer_email), p=String(x.customer_phone||'').replace(/\D/g,''), n=norm(x.customer_name); return e ? `e:${e}` : p ? `p:${p}` : n ? `n:${n}` : ''; };
  const invoiceStatus = x => { let s=norm(x.status); if (s==='issued' && x.due_date && new Date(`${x.due_date}T23:59:59`) < new Date()) s='overdue'; return s; };

  let db;
  function ready() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') throw new Error('ValoraTap database client did not load.');
    db = window.supabase.createClient(URL, KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  }
  async function auth() {
    const result = await db.auth.getSession();
    if (result.error) throw result.error;
    if (!result.data.session) { location.href='login.html'; return null; }
    return result.data.session.user;
  }
  async function core(uid) {
    if (typeof uid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(uid)) throw new Error('Invalid merchant session identity.');
    const [r,i,m] = await Promise.all([
      db.from('receipts').select('id,receipt_no,customer_name,customer_phone,customer_email,amount,payment_method,status,created_at,verification_hash,description').eq('merchant_id',uid).order('created_at',{ascending:false}),
      db.from('invoices').select('id,invoice_no,customer_name,customer_phone,customer_email,total,currency,status,due_date,created_at,receipt_id').eq('merchant_id',uid).order('created_at',{ascending:false}),
      db.from('merchants').select('business_name').eq('id',uid).maybeSingle()
    ]);
    if (r.error) throw r.error;
    if (i.error) throw i.error;
    if (m.error) throw m.error;
    return { receipts:r.data||[], invoices:i.data||[], business:m.data?.business_name||'Your business' };
  }
  const link = (href,label='Open') => `<a href="${esc(href)}" class="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white px-3 py-2 text-[10px] font-black whitespace-nowrap shrink-0 w-full sm:w-auto">${esc(label)} →</a>`;
  const customerMap = (receipts,invoices) => {
    const map = new Map();
    const add = (x,source) => { const k=customerKey(x); if(!k)return; let c=map.get(k); if(!c)c={name:x.customer_name||'Unnamed customer',phone:x.customer_phone||'',email:x.customer_email||'',transactions:0,value:0,last:x.created_at}; c.transactions++; c.value += Number(source==='receipt'?x.amount:x.total)||0; if(new Date(x.created_at)>new Date(c.last))c.last=x.created_at; map.set(k,c); };
    receipts.forEach(x=>add(x,'receipt')); invoices.forEach(x=>add(x,'invoice')); return [...map.values()].sort((a,b)=>b.value-a.value);
  };

  async function command(uid) {
    const d=await core(uid), r30=d.receipts.filter(x=>new Date(x.created_at)>=daysAgo(30)), paid=r30.filter(x=>completed(x.status)), customers=customerMap(d.receipts,d.invoices), repeat=customers.filter(x=>x.transactions>1), rate=customers.length?repeat.length/customers.length:0;
    const inv=d.invoices.map(x=>({...x,status:invoiceStatus(x)})), exceptions=inv.filter(x=>['cancelled','rejected','overdue'].includes(x.status)), open=inv.filter(x=>['issued','pending','sent','overdue','unpaid'].includes(x.status)), today=d.receipts.filter(x=>new Date(x.created_at)>=new Date(new Date().setHours(0,0,0,0)));
    let score=20; if(paid.length)score+=25; if(r30.length>=5)score+=15; if(r30.length>=20)score+=10; if(rate>=.4)score+=15; else if(rate>0)score+=8; if(!open.length&&inv.length)score+=10; if(!exceptions.length)score+=5; score=Math.min(100,score);
    text('businessName',d.business); text('updated','Updated '+new Date().toLocaleTimeString('en-ZA')); text('score',score); text('scoreTitle',score>=80?'Strong operating momentum':score>=60?'Healthy and building':'Early-stage operating signal'); text('scoreText',score>=60?'VT is seeing useful operating signals. Review the attention items below to strengthen the next cycle.':'More consistent transaction activity will make this operational signal more meaningful.');
    if($('scoreBar'))$('scoreBar').style.width=score+'%'; if($('scoreRing'))$('scoreRing').style.setProperty('--score',score*3.6+'deg');
    text('todayReceipts',today.length); text('todayRevenue',money(today.filter(x=>completed(x.status)).reduce((a,x)=>a+Number(x.amount||0),0))); text('monthReceipts',r30.length); text('monthRevenue',money(paid.reduce((a,x)=>a+Number(x.amount||0),0))); text('repeat',Math.round(rate*100)+'%'); text('customerCount',customers.length+' identified customers'); text('invoiceAttention',open.length+exceptions.length); text('invoiceSummary',money(open.reduce((a,x)=>a+Number(x.total||0),0))+' outstanding');
    const sig=[]; if(exceptions.length)sig.push(`<div class="box warn"><b>Invoice exceptions</b><span>${exceptions.length} invoice${exceptions.length===1?'':'s'} are overdue, rejected or cancelled.</span>${link('invoices.html','Review')}</div>`); if(open.length)sig.push(`<div class="box warn"><b>Invoice follow-up</b><span>${open.length} open invoice${open.length===1?'':'s'} represent ${money(open.reduce((a,x)=>a+Number(x.total||0),0))} outstanding.</span>${link('invoices.html','Open invoices')}</div>`); if(!r30.length)sig.push(`<div class="box warn"><b>Build momentum</b><span>No receipts recorded in the last 30 days.</span>${link('receipts.html','Issue receipt')}</div>`); if(rate>=.4)sig.push(`<div class="box good"><b>Customer retention signal</b><span>${Math.round(rate*100)}% of identified customers are repeat customers.</span>${link('customer-centre.html','Customers')}</div>`); if(!sig.length)sig.push('<div class="box good"><b>No immediate exceptions</b><span>VT found no major attention signal in the current records.</span></div>'); if($('signals'))$('signals').innerHTML=sig.slice(0,4).join('');
    if($('snapshot'))$('snapshot').innerHTML=[['Transaction momentum',r30.length+' receipts in 30 days'],['Completed value',money(paid.reduce((a,x)=>a+Number(x.amount||0),0))],['Customer relationship',Math.round(rate*100)+'% repeat'],['Invoice pressure',open.length+' open invoices']].map(x=>`<div class="box"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join('');
    const next=exceptions.length?['Review invoice exceptions','invoices.html','Review invoices']:open.length?['Follow up outstanding invoices','invoices.html','Open invoices']:!r30.length?['Create the next transaction','receipts.html','Issue receipt']:rate<.4?['Strengthen repeat business','customer-centre.html','Open customers']:['Inspect recent activity','activity.html','Open activity']; text('nextTitle',next[0]); text('nextText','VT selected this from the strongest current operating signal.'); const b=$('nextButton'); if(b){ b.href=next[1]; b.textContent=next[2]+' →'; b.onclick=null; }
  }

  async function activity(uid) {
    const d=await core(uid);
    const optional = async table => { try { const r=await db.from(table).select('*').eq('merchant_id',uid).order('created_at',{ascending:false}); return r.error?[]:(r.data||[]); } catch(_) { return []; } };
    const [payments,crypto]=await Promise.all([optional('payment_intents'),optional('crypto_transactions')]); const items=[];
    d.receipts.forEach(x=>items.push({type:'receipt',id:x.id,title:x.receipt_no||'Receipt',subtitle:x.customer_name||x.customer_phone||'Customer not provided',status:x.status||'issued',amount:x.amount,currency:'ZAR',date:x.created_at,href:x.verification_hash?`verify.html?hash=${encodeURIComponent(x.verification_hash)}`:'receipts.html',search:[x.receipt_no,x.customer_name,x.customer_phone,x.amount,x.status,x.payment_method,x.description].join(' ')}));
    d.invoices.forEach(x=>items.push({type:'invoice',id:x.id,title:x.invoice_no||'Invoice',subtitle:x.customer_name||x.customer_email||'Customer not provided',status:x.status,amount:x.total,currency:x.currency||'ZAR',date:x.created_at,href:'invoices.html',search:[x.invoice_no,x.customer_name,x.customer_email,x.total,x.status].join(' ')}));
    payments.forEach(x=>items.push({type:'payment',id:x.id,title:'Payment '+(x.provider_reference||String(x.id).slice(0,8)),subtitle:x.provider||'Payment provider',status:x.status,amount:x.amount,currency:x.currency||'ZAR',date:x.paid_at||x.created_at,href:'invoices.html',search:[x.provider,x.provider_reference,x.provider_transaction_id,x.amount,x.status].join(' ')}));
    crypto.forEach(x=>items.push({type:'crypto',id:x.id,title:(x.asset||'Crypto')+' transaction',subtitle:x.network||'Network',status:x.status,amount:x.amount,currency:x.asset||'',date:x.confirmed_at||x.detected_at||x.created_at,href:x.receipt_id?'receipts.html':'activity.html',search:[x.asset,x.network,x.tx_hash,x.status,x.amount].join(' ')}));
    items.sort((a,b)=>new Date(b.date)-new Date(a.date)); const render=()=>{const q=norm($('q')?.value),type=$('type')?.value,status=$('status')?.value; const list=items.filter(x=>(!q||norm(x.search).includes(q))&&(!type||x.type===type)&&(!status||((completed(x.status)?'completed':['pending','processing','awaiting_payment'].includes(norm(x.status))?'pending':'exception')===status))); if($('rows'))$('rows').innerHTML=list.map(x=>`<tr class="border-b"><td class="p-4 font-black">${esc(x.type)}</td><td class="p-4">${esc(x.title)}<div class="muted">${esc(x.subtitle)}</div></td><td class="p-4">${esc(x.status||'unknown')}</td><td class="p-4 font-black">${money(x.amount)}</td><td class="p-4">${esc(new Date(x.date).toLocaleString('en-ZA'))}</td><td class="p-4 text-right">${link(x.href)}</td></tr>`).join(''); if($('cards'))$('cards').innerHTML=list.map(x=>`<div class="box"><b>${esc(x.title)}</b><span>${esc(x.subtitle)} · ${money(x.amount)}</span><small>${esc(x.status||'unknown')} · ${esc(new Date(x.date).toLocaleDateString('en-ZA'))}</small>${link(x.href)}</div>`).join(''); if($('empty'))$('empty').hidden=list.length>0; text('receiptCount',items.filter(x=>x.type==='receipt').length); text('invoiceCount',items.filter(x=>x.type==='invoice').length); text('paymentCount',items.filter(x=>x.type==='payment').length); text('cryptoCount',items.filter(x=>x.type==='crypto').length); text('revenue',money(items.filter(x=>x.type==='receipt'&&completed(x.status)).reduce((a,x)=>a+Number(x.amount||0),0))); text('updated',items.length+' connected activity records'); };
    ['q','type','status'].forEach(id=>{const el=$(id); if(el)el.addEventListener(id==='q'?'input':'change',render);}); render();
  }

  async function financial(uid) {
    const d=await core(uid), r=d.receipts.filter(x=>new Date(x.created_at)>=daysAgo(30)&&completed(x.status)), inv=d.invoices.map(x=>({...x,status:invoiceStatus(x)})), rev=r.reduce((a,x)=>a+Number(x.amount||0),0), open=inv.filter(x=>['issued','overdue','pending','sent','unpaid'].includes(x.status)), paid=inv.filter(x=>x.status==='paid'), exceptions=inv.filter(x=>['overdue','rejected','cancelled'].includes(x.status)).length+d.receipts.filter(x=>['cancelled','failed','rejected'].includes(norm(x.status))).length;
    text('welcome',d.business+' · Practical financial signals from existing VT records.'); text('revenue30',money(rev)); text('receipt30',r.length+' receipts'); text('avg',money(r.length?rev/r.length:0)); text('paidInv',paid.length); text('openInv',money(open.reduce((a,x)=>a+Number(x.total||0),0))); text('openCount',open.length+' invoices'); text('exceptions',exceptions);
    if($('days')){const days=Array.from({length:7},(_,i)=>{const st=new Date();st.setHours(0,0,0,0);st.setDate(st.getDate()-(6-i));const en=new Date(st);en.setDate(en.getDate()+1);return {d:st,v:r.filter(x=>{const z=new Date(x.created_at);return z>=st&&z<en}).reduce((a,x)=>a+Number(x.amount||0),0)}}),mx=Math.max(...days.map(x=>x.v),1);$('days').innerHTML=days.map(x=>`<div><div class="flex justify-between text-xs"><b>${esc(x.d.toLocaleDateString('en-ZA',{weekday:'short'}))}</b><b>${money(x.v)}</b></div><div class="bar"><i style="width:${Math.min(100,x.v/mx*100)}%"></i></div></div>`).join('');}
    const mix={}; r.forEach(x=>{const k=x.payment_method||'Other';mix[k]=(mix[k]||0)+Number(x.amount||0)});const total=Object.values(mix).reduce((a,b)=>a+b,0)||1;if($('mix'))$('mix').innerHTML=Object.entries(mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div><div class="flex justify-between text-xs"><b>${esc(k)}</b><b>${Math.round(v/total*100)}%</b></div><div class="bar"><i style="width:${v/total*100}%"></i></div></div>`).join('')||'<div class="muted">No completed receipts in the last 30 days.</div>';
    if($('signals'))$('signals').innerHTML=[exceptions?`<div class="box warn"><b>Exceptions need review</b><span>${exceptions} exception${exceptions===1?'':'s'} detected.</span></div>`:'',open.length?`<div class="box warn"><b>Outstanding invoices</b><span>${open.length} open invoice${open.length===1?'':'s'} represent ${money(open.reduce((a,x)=>a+Number(x.total||0),0))}.</span></div>`:'',r.length?`<div class="box good"><b>Recent activity</b><span>${r.length} completed receipts generated ${money(rev)} in 30 days.</span></div>`:''].filter(Boolean).join('')||'<div class="box"><b>Build your first signal</b><span>VT will surface financial patterns as transactions accumulate.</span></div>';
    if($('summary'))$('summary').innerHTML=[['All receipts',d.receipts.length],['All invoices',d.invoices.length],['Paid invoices',paid.length],['Open invoices',open.length]].map(x=>`<div class="box"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join('');
  }

  async function customers(uid) {
    const d=await core(uid), list=customerMap(d.receipts,d.invoices), render=()=>{const q=norm($('q')?.value),seg=$('segment')?.value, rows=list.filter(c=>(!q||[c.name,c.phone,c.email].join(' ').toLowerCase().includes(q))&&(!seg||(seg==='repeat'?c.transactions>1:c.transactions===1))); if($('rows'))$('rows').innerHTML=rows.map(c=>`<tr class="border-b"><td class="p-4"><b>${esc(c.name)}</b><div class="muted">${esc(c.phone||c.email||'No contact detail')}</div></td><td class="p-4 font-black">${c.transactions}</td><td class="p-4 font-black">${money(c.value)}</td><td class="p-4">${esc(new Date(c.last).toLocaleString('en-ZA'))}</td><td class="p-4">${c.transactions>1?'Repeat':'One-time'}</td><td class="p-4 text-right">${link('activity.html')}</td></tr>`).join(''); if($('cards'))$('cards').innerHTML=rows.map(c=>`<div class="box"><b>${esc(c.name)}</b><span>${esc(c.phone||c.email||'No contact detail')}</span><small>${c.transactions} transactions · ${money(c.value)}</small>${link('activity.html','Open activity')}</div>`).join(''); if($('empty'))$('empty').hidden=rows.length>0;};
    const tx=list.reduce((a,c)=>a+c.transactions,0), value=list.reduce((a,c)=>a+c.value,0), repeat=list.filter(c=>c.transactions>1).length, rate=list.length?Math.round(repeat/list.length*100):0; text('customerCount',list.length); text('repeatCount',repeat); text('transactionCount',tx); text('revenue',money(value)); text('avgValue',money(list.length?value/list.length:0)); text('signal',list.length?(rate>=40?'Strong repeat-customer base':rate?'Repeat business is emerging':'Customer relationships are still developing'):'No customer activity yet'); text('signalDetail',list.length?`${rate}% of identified customers have more than one recorded transaction.`:'Once customers transact, VT will surface relationship patterns here.'); text('updated',list.length+' customer profiles inferred from existing activity'); ['q','segment'].forEach(id=>{const el=$(id);if(el)el.addEventListener(id==='q'?'input':'change',render)}); render();
  }

  async function action(uid) {
    const d=await core(uid), r30=d.receipts.filter(x=>new Date(x.created_at)>=daysAgo(30)), inv=d.invoices.map(x=>({...x,status:invoiceStatus(x)})), open=inv.filter(x=>['issued','pending','sent','overdue','unpaid'].includes(x.status)), exceptions=inv.filter(x=>['overdue','rejected','cancelled'].includes(x.status)), customers=customerMap(d.receipts,[]), repeat=customers.filter(c=>c.transactions>1), rate=customers.length?repeat.length/customers.length:0, risk=open.reduce((a,x)=>a+Number(x.total||0),0); const actions=[];
    if(exceptions.length)actions.push(['Priority 1 · Cash attention','Resolve invoice exceptions',`${exceptions.length} invoice${exceptions.length===1?'':'s'} need review.`,'invoices.html','Review invoices']); else if(open.length)actions.push(['Priority 1 · Cash collection','Follow up outstanding invoices',`${open.length} open invoices represent ${money(risk)}.`,'invoices.html','Open invoices']);
    if(!r30.length)actions.push(['Priority 2 · Momentum','Create your next transaction','No receipts recorded in 30 days.','receipts.html','Issue receipt']); else if(r30.length<5)actions.push(['Priority 2 · Momentum','Build transaction consistency',`${r30.length} receipts recorded in 30 days.`,'receipts.html','Issue receipt']);
    if(customers.length&&!repeat.length)actions.push(['Priority 3 · Retention','Create your first repeat relationship','Recorded customers have not yet returned.','customer-centre.html','Study customers']); else if(customers.length&&rate<.4)actions.push(['Priority 3 · Retention','Strengthen repeat business',`${Math.round(rate*100)}% of identified customers are repeat customers.`,'customer-centre.html','Open customers']); if(!actions.length)actions.push(['All clear','Keep the operating cycle moving','No immediate high-priority exception was detected.','activity.html','Open activity']);
    text('briefSub',d.business+' · Here’s what deserves your attention today.'); text('briefDate',new Date().toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'})); text('priorityCount',actions.length); text('cashRisk',money(risk)); text('receiptCount',r30.length); text('repeatRate',Math.round(rate*100)+'%'); text('dormantCount','0'); text('updated','Updated '+new Date().toLocaleTimeString('en-ZA')); const first=actions[0]; text('firstMove',first[1]); text('firstWhy',first[2]); const cta=$('firstCta'); if(cta){cta.href=first[3];cta.textContent=first[4]+' →';} if($('actions'))$('actions').innerHTML=actions.map(a=>`<div class="action priority bg-slate-50 border-slate-200 p-4"><div class="min-w-0"><div class="text-[9px] uppercase tracking-widest font-black gold">${esc(a[0])}</div><div class="font-black text-base mt-1">${esc(a[1])}</div><p class="text-xs text-slate-500 mt-1">${esc(a[2])}</p></div>${link(a[3],a[4])}</div>`).join(''); if($('cashWatch'))$('cashWatch').innerHTML=open.length?open.slice(0,4).map(x=>`<div class="box"><b>${esc(x.invoice_no||'Invoice')}</b><span>${money(x.total)} · ${esc(x.status)}</span></div>`).join(''):'<div class="muted text-xs">No open invoices.</div>'; if($('customerWatch'))$('customerWatch').innerHTML=customers.slice(0,4).map(c=>`<div class="box"><b>${esc(c.name)}</b><span>${c.transactions} transactions · ${money(c.value)}</span></div>`).join('')||'<div class="muted text-xs">No customer activity yet.</div>'; if($('momentumWatch'))$('momentumWatch').innerHTML=`<div class="box"><b>${r30.length} receipts</b><span>Recorded in the last 30 days.</span></div>`;
  }

  async function main() {
    try {
      ready();
      const user = await auth();
      if(!user) return;
      const uid = user.id;
      if(!uid) throw new Error('Your authenticated merchant identity is missing.');
      const kind=document.body.dataset.centre;
      if(kind==='command')await command(uid);
      else if(kind==='activity')await activity(uid);
      else if(kind==='financial')await financial(uid);
      else if(kind==='customers')await customers(uid);
      else if(kind==='action')await action(uid);
      else throw new Error('Unknown ValoraTap centre.');
    } catch (e) { errorBox(e?.message || 'ValoraTap could not load this centre.'); }
  }
  window.addEventListener('error',e=>{ if(e?.message) errorBox('ValoraTap page error: '+e.message); });
  window.addEventListener('unhandledrejection',e=>{ if(e?.reason) errorBox('ValoraTap data error: '+(e.reason.message||String(e.reason))); });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',main); else main();
})();