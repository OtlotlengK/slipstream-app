const VERIFY_ENDPOINT='https://pddjualtnhgmplampucn.supabase.co/functions/v1/public-verify';
const verificationUrl=window.location.href;
const labels={physical_goods:'Physical goods',professional_service:'Professional service',digital_product:'Digital product',appointment:'Appointment / session',delivery:'Delivery',subscription:'Subscription',rental:'Rental',other:'Transaction'};
function setStatus(text,ok=true){const b=document.getElementById('status-badge');b.textContent=text;b.className=ok?'px-3 py-1.5 rounded-full bg-emerald-950 text-emerald-300 text-[9px] font-black uppercase tracking-widest':'px-3 py-1.5 rounded-full bg-red-950 text-red-300 text-[9px] font-black uppercase tracking-widest'}
function fail(message){document.getElementById('receipt-shell').classList.add('hidden');document.getElementById('failure').classList.remove('hidden');document.getElementById('failure-message').textContent=message||'The receipt could not be verified.'}
function renderQr(){try{if(window.QRCode){new QRCode(document.getElementById('qrcode'),{text:verificationUrl,width:180,height:180,colorDark:'#171717',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}else{document.getElementById('qrcode').textContent='QR unavailable';}}catch(e){document.getElementById('qrcode').textContent='QR unavailable';}}
async function load(){
 document.getElementById('verification-url').textContent=verificationUrl;
 renderQr();
 const params=new URLSearchParams(location.search);
 const hash=(params.get('hash')||'').trim();
 const id=(params.get('id')||'').trim();
 if(!hash&&!/^[0-9a-fA-F-]{36}$/.test(id)){setStatus('Unavailable',false);return fail('This verification reference is invalid. Please scan the original ValoraTap QR code again.')}
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  const payload=hash?{verification_hash:hash}:{id};
  const response=await fetch(VERIFY_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  clearTimeout(timer);
  const data=await response.json().catch(()=>null);
  if(response.status===429){setStatus('Rate limited',false);return fail('Too many verification attempts. Please wait briefly and try again.')}
  if(!response.ok||!data?.verified||!data?.receipt){setStatus('Not verified',false);return fail('This receipt could not be verified by the ValoraTap verification network.')}
  const r=data.receipt;
  document.getElementById('business').textContent=r.business_name||'Verified Merchant';
  document.getElementById('receipt-no').textContent=r.receipt_no||'—';
  const amount=Number(r.amount||0),currency=r.currency||'ZAR';
  document.getElementById('amount').textContent=`${currency} ${amount.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  document.getElementById('total').textContent=document.getElementById('amount').textContent;
  document.getElementById('method').textContent=r.payment_method||'—';
  document.getElementById('customer').textContent=r.customer_name||'Customer';
  document.getElementById('description').textContent=r.description||'—';
  document.getElementById('date').textContent=r.issued_at?new Date(r.issued_at).toLocaleString('en-ZA'):'—';
  document.getElementById('hash').textContent=r.verification_hash||'—';
  document.getElementById('category').textContent=labels[r.transaction_category]||labels.other;
  document.getElementById('business-address').textContent=[r.business_address,r.business_city,r.business_province,r.business_country].filter(Boolean).join(', ');
  document.getElementById('business-contact').textContent=[r.business_email,r.business_website].filter(Boolean).join(' · ');
  const logo=document.getElementById('logo'); if(r.business_logo_url){logo.innerHTML='<img src="'+r.business_logo_url+'" alt="Business logo">';}
  let items=r.line_items||[]; if(typeof items==='string')try{items=JSON.parse(items)}catch{items=[]}; if(!Array.isArray(items))items=[];
  document.getElementById('items').innerHTML=items.length?items.map(x=>{const q=Number(x.quantity??x.qty??1),u=Number(x.unit_price??x.price??0),a=Number(x.amount??x.total??u*q);return '<div class="item"><div class="font-semibold">'+String(x.description??x.name??x.item??'Item').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</div><div class="text-right">'+q+'</div><div class="right font-bold">'+currency+' '+a.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})+'</div></div>'}).join(''):'<div class="item"><div>'+String(r.description||'Transaction').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</div><div>1</div><div class="right font-bold">'+document.getElementById('amount').textContent+'</div></div>';
  setStatus(r.status==='issued'?'Verified':r.status,true);
 }catch(e){setStatus('Unavailable',false);fail(e?.name==='AbortError'?'Verification timed out. Please try again.':'The verification service is temporarily unavailable. Please try again shortly.')}
}
async function copyVerificationLink(){const f=document.getElementById('copy-feedback');try{await navigator.clipboard.writeText(verificationUrl);if(f){f.textContent='Verification link copied.';setTimeout(()=>{f.textContent=''},2500)}}catch(e){if(f){f.textContent='Copy is unavailable. Use your browser share option.'}}}
async function shareVerification(){if(navigator.share){try{await navigator.share({title:'ValoraTap Verified Receipt',text:'Verify this transaction independently:',url:verificationUrl})}catch(e){}}else window.open('https://wa.me/?text='+encodeURIComponent('Verify this ValoraTap receipt: '+verificationUrl),'_blank')}
document.getElementById('copy-link')?.addEventListener('click',copyVerificationLink);
document.getElementById('share-receipt')?.addEventListener('click',shareVerification);
load();