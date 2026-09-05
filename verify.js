const VERIFY_ENDPOINT='https://pddjualtnhgmplampucn.supabase.co/functions/v1/public-verify';
const verificationUrl=window.location.href;
const labels={physical_goods:'Physical goods',professional_service:'Professional service',digital_product:'Digital product',appointment:'Appointment / session',delivery:'Delivery',subscription:'Subscription',rental:'Rental',other:'Transaction'};
function setStatus(text,ok=true){const b=document.getElementById('status-badge');b.textContent=text;b.className=ok?'px-3 py-1.5 rounded-full bg-emerald-950 text-emerald-300 text-[9px] font-black uppercase tracking-widest':'px-3 py-1.5 rounded-full bg-red-950 text-red-300 text-[9px] font-black uppercase tracking-widest'}
function fail(message){document.getElementById('receipt-shell').classList.add('hidden');document.getElementById('failure').classList.remove('hidden');document.getElementById('failure-message').textContent=message||'The receipt could not be verified.'}
function renderQr(){try{if(window.QRCode){new QRCode(document.getElementById('qrcode'),{text:verificationUrl,width:180,height:180,colorDark:'#171717',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}else{document.getElementById('qrcode').textContent='QR unavailable';}}catch(e){document.getElementById('qrcode').textContent='QR unavailable';}}
async function load(){
 document.getElementById('verification-url').textContent=verificationUrl;
 renderQr();
 const hash=(new URLSearchParams(location.search).get('hash')||'').trim();
 if(!/^[a-fA-F0-9]{16,128}$/.test(hash)){setStatus('Unavailable',false);return fail('This verification reference is invalid. Please scan the original ValoraTap QR code again.')}
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  const response=await fetch(VERIFY_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hash}),cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  clearTimeout(timer);
  const data=await response.json().catch(()=>null);
  if(response.status===429){setStatus('Rate limited',false);return fail('Too many verification attempts. Please wait briefly and try again.')}
  if(!response.ok||!data?.verified||!data?.receipt){setStatus('Not verified',false);return fail('This receipt could not be verified by the ValoraTap verification network.')}
  const r=data.receipt;
  document.getElementById('business').textContent=r.business_name||'Verified Merchant';
  document.getElementById('receipt-no').textContent=r.receipt_no||'—';
  document.getElementById('amount').textContent=`${r.currency||'ZAR'} ${Number(r.amount||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  document.getElementById('method').textContent=r.payment_method||'—';
  document.getElementById('description').textContent=r.description||'—';
  document.getElementById('date').textContent=r.issued_at?new Date(r.issued_at).toLocaleString('en-ZA'):'—';
  document.getElementById('hash').textContent=r.verification_hash||'—';
  document.getElementById('category').textContent=labels[r.transaction_category]||labels.other;
  setStatus(r.status==='issued'?'Verified':r.status,true);
 }catch(e){setStatus('Unavailable',false);fail(e?.name==='AbortError'?'Verification timed out. Please try again.':'The verification service is temporarily unavailable. Please try again shortly.')}
}
async function copyVerificationLink(){try{await navigator.clipboard.writeText(verificationUrl);alert('Verification link copied.')}catch(e){window.prompt('Copy this verification link:',verificationUrl)}}
async function shareVerification(){if(navigator.share){try{await navigator.share({title:'ValoraTap Verified Receipt',text:'Verify this transaction independently:',url:verificationUrl})}catch(e){}}else window.open('https://wa.me/?text='+encodeURIComponent('Verify this ValoraTap receipt: '+verificationUrl),'_blank')}
document.getElementById('copy-link')?.addEventListener('click',copyVerificationLink);
document.getElementById('share-receipt')?.addEventListener('click',shareVerification);
load();