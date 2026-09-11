(() => {
  'use strict';
  const SUPABASE_URL='https://pddjualtnhgmplampucn.supabase.co';
  const SUPABASE_KEY='sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';
  let db, ready=false, invoiceMap=new Map(), receiptMap=new Map();
  function init(){if(ready)return true;if(!window.supabase?.createClient)return false;db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});ready=true;return true}
  async function load(){
    if(!init())return;
    const {data:s}=await db.auth.getSession(); const uid=s?.session?.user?.id; if(!uid)return;
    const [inv,rec]=await Promise.all([
      db.from('invoices').select('id,invoice_no').eq('merchant_id',uid),
      db.from('receipts').select('id,receipt_no').eq('merchant_id',uid)
    ]);
    if(!inv.error)invoiceMap=new Map((inv.data||[]).filter(x=>x.id&&x.invoice_no).map(x=>[String(x.invoice_no).trim(),x.id]));
    if(!rec.error)receiptMap=new Map((rec.data||[]).filter(x=>x.id&&x.receipt_no).map(x=>[String(x.receipt_no).trim(),x.id]));
    rewrite();
  }
  function rewrite(){
    document.querySelectorAll('a').forEach(a=>{
      const href=a.getAttribute('href')||'';
      if(href==='invoices.html'){
        const row=a.closest('tr'),card=a.closest('.box');
        const ref=row?.querySelectorAll('td')[1]?.querySelector('div')?.textContent?.trim()||card?.querySelector('b')?.textContent?.trim()||'';
        const id=invoiceMap.get(ref);
        if(id){a.href=`/invoice-detail.html?id=${encodeURIComponent(id)}`;a.textContent='View invoice →';}
      }
      if(href.startsWith('verify.html?hash=')){
        const row=a.closest('tr'),card=a.closest('.box');
        const ref=row?.querySelectorAll('td')[1]?.querySelector('div')?.textContent?.trim()||card?.querySelector('b')?.textContent?.trim()||'';
        const id=receiptMap.get(ref);
        if(id){a.href=`/receipt-detail.html?id=${encodeURIComponent(id)}`;a.textContent='View receipt →';}
      }
    });
  }
  new MutationObserver(rewrite).observe(document.body,{childList:true,subtree:true});
  load();
})();
