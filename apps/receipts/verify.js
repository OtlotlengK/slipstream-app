const VERIFY_ENDPOINT=window.VT_ENV.functionsUrl+'/public-verify';
const verificationUrl=window.location.href;
const currencyLocales={ZAR:'en-ZA',NGN:'en-NG',GHS:'en-GH',KES:'en-KE',USD:'en-US',GBP:'en-GB',EUR:'en-IE',BWP:'en-US',NAD:'en-NA',ZMW:'en-US',ZWG:'en-ZW',MZN:'pt-MZ',AUD:'en-AU',CAD:'en-CA',INR:'en-IN',AED:'en-AE',BRL:'pt-BR',MXN:'es-MX'};
const formatMoney=(n,currency)=>{const c=String(currency||'ZAR').toUpperCase();try{return new Intl.NumberFormat(currencyLocales[c]||'en-US',{style:'currency',currency:c,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)}catch{return c+' '+Number(n||0).toFixed(2)}};
const labels={physical_goods:'Physical goods',professional_service:'Professional service',digital_product:'Digital product',appointment:'Appointment / session',delivery:'Delivery',subscription:'Subscription',rental:'Rental',other:'Transaction'};
function setStatus(text,ok=true){const b=document.getElementById('status-badge');b.textContent=text;b.className=ok?'px-3 py-1.5 rounded-full bg-emerald-950 text-emerald-300 text-[9px] font-black uppercase tracking-widest':'px-3 py-1.5 rounded-full bg-red-950 text-red-300 text-[9px] font-black uppercase tracking-widest'}
function fail(message){document.getElementById('receipt-shell').classList.add('hidden');document.getElementById('failure').classList.remove('hidden');document.getElementById('failure-message').textContent=message||'The receipt could not be verified.'}
function renderQr(){try{if(window.QRCode){new QRCode(document.getElementById('qrcode'),{text:verificationUrl,width:180,height:180,colorDark:'#171717',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});const printNode=document.getElementById('print-qrcode');if(printNode)new QRCode(printNode,{text:verificationUrl,width:104,height:104,colorDark:'#171717',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}else{document.getElementById('qrcode').textContent='QR unavailable';}}catch(e){document.getElementById('qrcode').textContent='QR unavailable';}}
async function load(){
 document.getElementById('verification-url').textContent=verificationUrl;const printUrl=document.getElementById('print-verification-url');if(printUrl)printUrl.textContent=verificationUrl;
 renderQr();
 const params=new URLSearchParams(location.search);
 const hash=(params.get('hash')||'').trim();
 if(!/^(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(hash)){setStatus('Unavailable',false);return fail('This verification reference is invalid. Please scan the original ValoraTap QR code again.')}
 try{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  const payload={verification_hash:hash};
  const response=await fetch(VERIFY_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  clearTimeout(timer);
  const data=await response.json().catch(()=>null);
  if(response.status===429){setStatus('Rate limited',false);return fail('Too many verification attempts. Please wait briefly and try again.')}
  if(!response.ok||!data?.verified||!data?.receipt){setStatus('Not verified',false);return fail('This receipt could not be verified by the ValoraTap verification network.')}
  const r=data.receipt;
  document.getElementById('business').textContent=r.business_name||'Verified Merchant';
  document.getElementById('receipt-no').textContent=r.receipt_no||'—';
  const amount=Number(r.amount||0),currency=String(r.currency||'ZAR').toUpperCase();
  document.getElementById('amount').textContent=formatMoney(amount,currency);
  document.getElementById('total').textContent=document.getElementById('amount').textContent;
  document.getElementById('method').textContent=r.payment_method||'—';
  document.getElementById('customer').textContent=r.customer_name||'Customer';
  document.getElementById('description').textContent=r.description||'—';
  document.getElementById('date').textContent=r.issued_at?new Date(r.issued_at).toLocaleString('en-ZA'):'—';
  document.getElementById('hash').textContent=r.verification_hash||'—';
  document.getElementById('category').textContent=labels[r.transaction_category]||labels.other;
  document.getElementById('business-address').textContent=[r.business_address,r.business_city,r.business_province,r.business_country].filter(Boolean).join(', ');
  document.getElementById('business-contact').textContent=[r.business_email,r.business_website].filter(Boolean).join(' · ');
  const logo=document.getElementById('logo'); if(r.business_logo_url){try{const logoUrl=new URL(r.business_logo_url,location.origin);if(['https:','http:'].includes(logoUrl.protocol)){const img=document.createElement('img');img.src=logoUrl.href;img.alt='Business logo';img.referrerPolicy='no-referrer';img.loading='eager';logo.replaceChildren(img)}}catch(e){logo.textContent=(r.business_name||'YOUR BUSINESS').slice(0,24)}}
  let items=r.line_items||[]; if(typeof items==='string')try{items=JSON.parse(items)}catch{items=[]}; if(!Array.isArray(items))items=[];
  document.getElementById('items').innerHTML=items.length?items.map(x=>{const q=Number(x.quantity??x.qty??1),u=Number(x.unit_price??x.price??0),a=Number(x.amount??x.total??u*q);return '<div class="item"><div class="font-semibold">'+String(x.description??x.name??x.item??'Item').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</div><div class="text-right">'+q+'</div><div class="right font-bold">'+formatMoney(a,currency)+'</div></div>'}).join(''):'<div class="item"><div>'+String(r.description||'Transaction').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</div><div>1</div><div class="right font-bold">'+document.getElementById('amount').textContent+'</div></div>';
  setStatus(r.status==='issued'?'Verified':r.status,true);const pdfButton=document.getElementById('download-pdf');if(pdfButton){pdfButton.disabled=false;pdfButton.classList.remove('opacity-50','cursor-not-allowed')}
 }catch(e){setStatus('Unavailable',false);fail(e?.name==='AbortError'?'Verification timed out. Please try again.':'The verification service is temporarily unavailable. Please try again shortly.')}
}
async function copyVerificationLink(){const f=document.getElementById('copy-feedback');try{await navigator.clipboard.writeText(verificationUrl);if(f){f.textContent='Verification link copied.';setTimeout(()=>{f.textContent=''},2500)}}catch(e){if(f){f.textContent='Copy is unavailable. Use your browser share option.'}}}
async function shareVerification(){if(navigator.share){try{await navigator.share({title:'ValoraTap Verified Receipt',text:'Verify this transaction independently:',url:verificationUrl})}catch(e){}}else window.open('https://wa.me/?text='+encodeURIComponent('Verify this ValoraTap receipt: '+verificationUrl),'_blank')}
document.getElementById('copy-link')?.addEventListener('click',copyVerificationLink);
document.getElementById('share-receipt')?.addEventListener('click',shareVerification);
document.getElementById('download-pdf')?.addEventListener('click',async()=>{const button=document.getElementById('download-pdf');const receipt=document.getElementById('receipt-shell');if(!button||!receipt||receipt.classList.contains('hidden'))return; if(typeof window.html2pdf!=='function'){setStatus('PDF unavailable',false);button.textContent='PDF unavailable — retry';return;}const original=button.textContent;button.disabled=true;button.textContent='Preparing PDF…';try{await Promise.all(Array.from(receipt.querySelectorAll('img')).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,5000)})));const number=(document.getElementById('receipt-no')?.textContent||'Receipt').trim();const safeNumber=number.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'Receipt';const options={margin:[10,10,12,10],filename:'VynoTap-'+safeNumber+'.pdf',image:{type:'jpeg',quality:0.96},html2canvas:{scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['.receipt-total','.receipt-trust','.item']}};await window.html2pdf().set(options).from(receipt).save();button.textContent='PDF downloaded';setTimeout(()=>{button.textContent=original;button.disabled=false},2200);}catch(error){console.error('Receipt PDF generation failed',error);button.textContent='Try PDF again';button.disabled=false;}});
load();