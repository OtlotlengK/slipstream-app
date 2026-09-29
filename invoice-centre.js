const SUPABASE_URL='https://pddjualtnhgmplampucn.supabase.co';
const KEY='sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
let db=null,rows=[],filter='all';

const $=s=>document.querySelector(s);
const showMessage=(message,type='error')=>{
  const el=$('#message'); if(!el)return;
  el.textContent=message;
  el.className='rounded-xl border px-4 py-3 text-xs font-bold '+(type==='success'
    ?'border-emerald-200 bg-emerald-50 text-emerald-800'
    :'border-red-200 bg-red-50 text-red-700');
  el.classList.remove('hidden');
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>el.classList.add('hidden'),5000);
};
const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(n)||0);
const overdue=r=>r.status==='issued'&&r.due_date&&new Date(r.due_date+'T23:59:59')<new Date();

function esc(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function setLoading(loading){
  const q=$('#queue');
  if(!q)return;
  if(loading) q.innerHTML='<div class="p-8 text-sm text-slate-500">Loading your invoices…</div>';
}

async function init(){
  try{
    if(!window.supabase?.createClient){
      throw new Error('ValoraTap could not load its secure connection library. Please refresh the page.');
    }
    db=window.supabase.createClient(SUPABASE_URL,KEY);
    setLoading(true);

    const {data:{session},error:sessionError}=await db.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session){location.href='login.html';return;}

    const {data,error}=await db.rpc('get_merchant_invoices');
    if(error) throw error;

    rows=Array.isArray(data)?data:[];
    render();
  }catch(error){
    console.error('Invoice Command Centre failed to load',error);
    const message=error?.message||'We could not load the Invoice Command Centre.';
    if($('#queue')) $('#queue').innerHTML='<div class="p-8 text-sm text-red-600">We couldn’t load your invoices.</div>';
    showMessage(message);
  }
}

function bindControls(){
  const search=$('#search');
  if(search&&!search.dataset.bound){
    search.addEventListener('input',render);
    search.dataset.bound='true';
  }
  document.querySelectorAll('[data-filter]').forEach(button=>{
    if(button.dataset.bound)return;
    button.addEventListener('click',()=>setFilter(button.dataset.filter));
    button.dataset.bound='true';
  });
  document.querySelectorAll('[data-share-id]').forEach(button=>{
    if(button.dataset.bound)return;
    button.addEventListener('click',()=>shareInvoice(button.dataset.shareId));
    button.dataset.bound='true';
  });
}

function setFilter(x){
  filter=x;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('filter-active',b.dataset.filter===x));
  render();
}

function render(){
  const counts={issued:0,payment_submitted:0,paid:0,overdue:0};
  rows.forEach(r=>{
    if(r.status==='issued')counts.issued++;
    if(r.status==='payment_submitted')counts.payment_submitted++;
    if(r.status==='paid')counts.paid++;
    if(overdue(r))counts.overdue++;
  });
  $('#issued').textContent=counts.issued;
  $('#submitted').textContent=counts.payment_submitted;
  $('#paid').textContent=counts.paid;
  $('#overdue').textContent=counts.overdue;
  $('#outstanding').textContent=money(rows.filter(r=>r.status!=='paid').reduce((s,r)=>s+Number(r.total||0),0));

  const q=($('#search').value||'').trim().toLowerCase();
  const visible=rows.filter(r=>{
    const matchesFilter=filter==='all'||(filter==='overdue'?overdue(r):r.status===filter);
    const hay=[r.invoice_no,r.customer_name,r.customer_email].map(x=>String(x||'').toLowerCase()).join(' ');
    return matchesFilter&&(!q||hay.includes(q));
  });

  $('#empty').classList.toggle('hidden',visible.length>0);
  $('#queue').innerHTML=visible.map(r=>{
    const od=overdue(r);
    let cls='bg-slate-100 text-slate-600',label=String(r.status||'').replace('_',' ');
    if(r.status==='payment_submitted'){cls='bg-amber-100 text-amber-800';label='payment under review';}
    if(r.status==='paid'){cls='bg-emerald-100 text-emerald-800';label='paid';}
    if(od){cls='bg-red-100 text-red-700';label='overdue';}
    const review=r.status==='payment_submitted'?'<a class="btn primary" href="invoice-review.html?id='+encodeURIComponent(r.id)+'">Review POP →</a>':'';
    const open='<a class="btn ghost" href="invoice-preview.html?id='+encodeURIComponent(r.id)+'">Open Invoice</a>';
    const timeline='<a class="btn ghost" href="invoice-timeline.html?id='+encodeURIComponent(r.id)+'">Timeline</a>';
    const share='<button type="button" class="btn ghost" data-share-id="'+esc(r.id)+'">Share</button>';
    return '<div class="row p-5 flex flex-col md:flex-row md:items-center gap-4"><div class="flex-1 min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-black">'+esc(r.invoice_no)+'</span><span class="pill '+cls+'">'+esc(label)+'</span></div><div class="text-sm font-bold mt-2">'+esc(r.customer_name)+'</div><div class="text-[10px] text-slate-400 mt-1">Due '+esc(r.due_date||'—')+' · '+esc(r.customer_email||'No email')+'</div></div><div class="text-lg font-black md:text-right">'+money(r.total)+'</div><div class="queue-actions flex flex-wrap gap-2 md:ml-3">'+review+open+timeline+share+'</div></div>';
  }).join('');

  bindControls();
}

async function shareInvoice(id){
  const r=rows.find(x=>x.id===id); if(!r||!db)return;
  try{
    const {data,error}=await db.rpc('rotate_invoice_public_token',{p_invoice_id:id});
    if(error||!data?.public_token){showMessage(error?.message||'Unable to create a secure invoice link.');return;}
    const targetPath='/invoice.html?token='+encodeURIComponent(data.public_token);
    const {data:short,error:shortError}=await db.rpc('create_short_link',{p_target_path:targetPath,p_kind:'invoice'});
    if(shortError||!short?.[0]?.code){showMessage(shortError?.message||'Unable to create a clean invoice link.');return;}
    const link=new URL('/s/'+short[0].code,location.origin).href;
    if(navigator.share) await navigator.share({title:'Invoice '+r.invoice_no,text:'Invoice '+r.invoice_no,url:link});
    else if(navigator.clipboard){
      await navigator.clipboard.writeText(link);
      showMessage('ValoraTap invoice link copied to your clipboard.','success');
    }else{
      window.prompt('Copy this invoice link:',link);
    }
  }catch(e){
    if(e?.name!=='AbortError')showMessage(e?.message||'Unable to share invoice link.');
  }
}

async function logout(){
  if(!db)return;
  const {error}=await db.auth.signOut();
  if(error){showMessage(error.message||'Unable to sign out.');return;}
  location.href='login.html';
}

document.addEventListener('DOMContentLoaded',()=>{
  bindControls();
  init();
});
