import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES=32*1024,MAX_TEXT=2000,MAX_NAME=160,MAX_IDEMPOTENCY=128;
const ALLOWED_METHODS=new Set(["cash","eft","card","online"]);
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type, idempotency-key","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(b:unknown,s=200,e:Record<string,string>={})=>new Response(JSON.stringify(b),{status:s,headers:{...corsHeaders,...e}});
async function sha256Hex(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function isEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function isPhone(v:string){return /^[+0-9()\-\s]{7,30}$/.test(v)}
function hasPermission(p:unknown,r:string,a:string){if(!p||typeof p!=="object"||Array.isArray(p))return false;const x=(p as Record<string,unknown>)[r];return Array.isArray(x)&&x.includes(a)}

serve(async(req)=>{
 const started=Date.now();
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405,{Allow:"POST, OPTIONS"});
 const cl=Number(req.headers.get("content-length")||"0");if(cl>MAX_BODY_BYTES)return json({error:"request_too_large"},413);
 const m=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i);if(!m)return json({error:"missing_api_key",message:"Use Authorization: Bearer vt_live_..."},401);
 const apiKey=m[1].trim();if(!/^(vt_live_|vt_test_)[A-Za-z0-9_-]{12,}$/.test(apiKey)||apiKey.length>256)return json({error:"invalid_api_key"},401);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return json({error:"server_configuration_error"},500);
 const db=createClient(url,service),hash=await sha256Hex(apiKey);
 const{data:key,error:ke}=await db.from("api_keys").select("id,merchant_id,environment,revoked_at,permissions").eq("key_hash",hash).maybeSingle();
 if(ke)return json({error:"authentication_error"},500);
 if(!key||key.revoked_at)return json({error:"invalid_api_key"},401);
 
 if(key.environment==="production"&&!hasPermission(key.permissions,"receipts","create"))return json({error:"insufficient_permissions"},403);
 const{data:lr,error:le}=await db.rpc("check_api_key_rate_limit",{p_api_key_id:key.id,p_limit:60,p_window_seconds:60});
 const limit=Array.isArray(lr)?lr[0]:lr;if(le||!limit)return json({error:"rate_limit_check_error"},500);
 if(!limit.allowed)return json({error:"rate_limit_exceeded"},429,{"Retry-After":String(Number(limit.retry_after_seconds)||60)});
 await db.from("api_keys").update({last_used_at:new Date().toISOString()}).eq("id",key.id);
 const idk=(req.headers.get("Idempotency-Key")||"").trim();if(!idk||idk.length>MAX_IDEMPOTENCY)return json({error:"missing_or_invalid_idempotency_key"},400);
 let raw:unknown;try{raw=await req.json()}catch{return json({error:"invalid_json"},400)}
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return json({error:"invalid_request_body"},400);
 const body=raw as Record<string,unknown>;
 const amount=typeof body.amount==="number"?body.amount:Number(body.amount);
 const currency=typeof body.currency==="string"?body.currency.trim().toUpperCase():"";
 const pm=typeof body.payment_method==="string"?body.payment_method.trim().toLowerCase():"";
 const description=typeof body.description==="string"?body.description.trim():"";
 const reference=typeof body.reference==="string"?body.reference.trim():"";
 const customer=body.customer&&typeof body.customer==="object"&&!Array.isArray(body.customer)?body.customer as Record<string,unknown>:{};
 const name=typeof customer.name==="string"?customer.name.trim():"";
 const email=typeof customer.email==="string"?customer.email.trim():"";
 const phone=typeof customer.phone==="string"?customer.phone.trim():"";
 if(!Number.isFinite(amount)||amount<=0||amount>999999999.99)return json({error:"invalid_amount"},400);
 if(!/^[A-Z]{3}$/.test(currency))return json({error:"invalid_currency"},400);
 if(!ALLOWED_METHODS.has(pm))return json({error:"invalid_payment_method"},400);
 if(!name||name.length>MAX_NAME)return json({error:"invalid_customer_name"},400);
 if(email&&(email.length>320||!isEmail(email)))return json({error:"invalid_customer_email"},400);
 if(phone&&(phone.length>30||!isPhone(phone)))return json({error:"invalid_customer_phone"},400);
 if(!description||description.length>MAX_TEXT)return json({error:"invalid_description"},400);
 if(reference.length>200)return json({error:"invalid_reference"},400);
 const normalized={amount:Math.round(amount*100)/100,currency,payment_method:pm,customer:{name,email:email||null,phone:phone||null},description,reference:reference||null};
 const requestHash=await sha256Hex(JSON.stringify(normalized));
 const rpcName=key.environment==="sandbox"?"create_sandbox_transaction":"create_api_transaction_v2"; const{data,error}=await db.rpc(rpcName,{p_api_key_id:key.id,p_merchant_id:key.merchant_id,p_idempotency_key:idk,p_request_hash:requestHash,p_customer_name:name,p_customer_email:email||null,p_customer_phone:phone||null,p_description:description,p_amount:normalized.amount,p_currency:currency,p_payment_method:pm,p_external_reference:reference||null});
 if(error){
  const msg=error.message||"";
  if(msg.includes("idempotency_key_reused"))return json({error:"idempotency_key_reused"},409);
  if(msg.includes("invalid_idempotency_key"))return json({error:"invalid_idempotency_key"},400);
  if(msg.includes("invalid_amount"))return json({error:"invalid_amount"},400);
  if(msg.includes("invalid_currency"))return json({error:"invalid_currency"},400);
  if(msg.includes("currency_mismatch"))return json({error:"currency_mismatch",message:"Currency must match the merchant's ValoraTap business currency."},409);
  if(msg.includes("invalid_payment_method"))return json({error:"invalid_payment_method"},400);
  if(msg.includes("invalid_customer_name"))return json({error:"invalid_customer_name"},400);
  return json({error:"transaction_creation_error"},500);
 }
 const result=Array.isArray(data)?data[0]:data;if(key.environment==="sandbox"){if(!result?.transaction_id)return json({error:"transaction_creation_error"},500);const status=Number(result.response_status)||(result.replayed?200:201);await db.from("sandbox_integration_logs").insert({merchant_id:key.merchant_id,api_key_id:key.id,direction:"inbound",endpoint:"/functions/v1/transactions",method:"POST",event_type:"transaction.created",idempotency_key:idk,request_hash:requestHash,sandbox_transaction_id:result.transaction_id,status_code:status,duration_ms:Date.now()-started});if(!result.replayed){const{data:tx}=await db.from("sandbox_transactions").select("id,customer_name,amount,currency_code,description,payment_method,verification_hash,external_reference,status,created_at").eq("id",result.transaction_id).eq("merchant_id",key.merchant_id).maybeSingle();fetch(`${url}/functions/v1/webhook-dispatch`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${service}`},body:JSON.stringify({merchant_id:key.merchant_id,environment:"sandbox",event_type:"transaction.created",event_id:result.transaction_id,data:{transaction:tx}})}).catch(()=>{});}return json({success:true,environment:"sandbox",replayed:Boolean(result.replayed),transaction:{id:result.transaction_id,reference:result.transaction_reference,verification_hash:result.verification_hash,status:"simulated",currency},protocol_version:"1.4"},status);}if(!result?.receipt_id)return json({error:"transaction_creation_error"},500);
 const status=Number(result.response_status)||(result.replayed?200:201);
 const verificationPath=`/verify.html?hash=${encodeURIComponent(result.verification_hash)}`;
 await db.from("integration_logs").insert({merchant_id:key.merchant_id,api_key_id:key.id,direction:"inbound",endpoint:"/functions/v1/transactions",method:"POST",event_type:"transaction.created",idempotency_key:idk,request_hash:requestHash,receipt_id:result.receipt_id,status_code:status,duration_ms:Date.now()-started});
 if(!result.replayed){
  const{data:receipt}=await db.from("receipts").select("id,receipt_no,amount,currency_code,description,payment_method,verification_hash,external_reference,source,status,created_at").eq("id",result.receipt_id).eq("merchant_id",key.merchant_id).maybeSingle();
  const payload={merchant_id:key.merchant_id,event_type:"transaction.created",event_id:result.receipt_id,data:{receipt}};
  fetch(`${url}/functions/v1/webhook-dispatch`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${service}`},body:JSON.stringify(payload)}).catch(()=>{});
 }
 return json({success:true,environment:"production",replayed:Boolean(result.replayed),receipt:{id:result.receipt_id,receipt_no:result.receipt_no,verification_hash:result.verification_hash,verification_path:verificationPath,currency},protocol_version:"1.3"},status);
});