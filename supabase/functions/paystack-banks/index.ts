import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),paystackKey=Deno.env.get('PAYSTACK_SECRET_KEY');
  if(!url||!serviceKey||!paystackKey)return json({error:'service_configuration_error'},500);
  const accessToken=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!accessToken)return json({error:'not_authenticated'},401);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await db.auth.getUser(accessToken);
  if(userError||!userData.user)return json({error:'not_authenticated'},401);
  const {data:profile,error:profileError}=await db.from('business_profiles').select('country_code,currency_code').eq('merchant_id',userData.user.id).maybeSingle();
  if(profileError)throw profileError;
  if(String(profile?.country_code||'').toUpperCase()!=='ZA'||String(profile?.currency_code||'').toUpperCase()!=='ZAR')return json({error:'provider_country_not_supported',message:'Paystack bank setup is currently enabled for South Africa (ZAR) first.'},409);
  const response=await fetch('https://api.paystack.co/bank?currency=ZAR&perPage=100',{headers:{Authorization:`Bearer ${paystackKey}`}});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.status||!Array.isArray(result?.data))return json({error:'bank_list_unavailable'},502);
  const banks=result.data.filter((b:any)=>b?.code&&b?.name).map((b:any)=>({code:String(b.code),name:String(b.name),active:Boolean(b.active??true),enabled_for_verification:Boolean(b.enabled_for_verification??true)})).filter((b:any)=>b.active);
  return json({ok:true,banks});
 }catch(e){console.error('paystack-banks failed',e);return json({error:'internal_server_error'},500)}
});