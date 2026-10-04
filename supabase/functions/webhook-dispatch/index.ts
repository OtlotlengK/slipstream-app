import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_URL_LENGTH = 2048;
const ALLOWED_EVENTS = new Set(["transaction.created", "transaction.updated", "transaction.refunded", "transaction.cancelled", "transaction.event"]);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
function timingSafeEqual(a: string,b: string){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
async function hmacHex(secret:string,value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function isPrivateIp(raw:string){const h=raw.replace(/^\[|\]$/g,"").toLowerCase();if(h==="localhost"||h==="::"||h==="0.0.0.0"||h==="::1")return true;if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;if(/^(fc|fd)[0-9a-f]{2}:/i.test(h)||/^fe8[0-9a-f]:/i.test(h)||/^fe9[0-9a-f]:/i.test(h)||/^fea[0-9a-f]:/i.test(h)||/^feb[0-9a-f]:/i.test(h)||/^::ffff:/i.test(h))return true;return false;}
async function resolvePublic(host:string){const ips=await Promise.all([Deno.resolveDns(host,"A").catch(()=>[] as string[]),Deno.resolveDns(host,"AAAA").catch(()=>[] as string[])]);const resolved=ips.flat().map(x=>x.toLowerCase()).sort();if(!resolved.length||resolved.some(isPrivateIp))return null;return resolved;}
async function isSafeWebhookUrl(raw:string){if(!raw||raw.length>MAX_URL_LENGTH)return false;let u:URL;try{u=new URL(raw);}catch{return false;}if(u.protocol!=="https:"||u.username||u.password||u.hash)return false;const host=u.hostname.replace(/^\[|\]$/g,"").toLowerCase().replace(/\.$/,"");if(!host||host.endsWith(".localhost")||host==="localhost"||host==="metadata.google.internal"||host.endsWith(".internal"))return false;if(isPrivateIp(host)||host.includes("%"))return false;
  const first=await resolvePublic(host); if(!first)return false;
  // Resolve twice and require a stable public answer immediately before connection.
  // This is defense-in-depth against DNS rebinding/TOCTOU; redirects are disabled below.
  await new Promise(r=>setTimeout(r,50));
  const second=await resolvePublic(host); if(!second||first.length!==second.length||first.some((v,i)=>v!==second[i]))return false;
  return true;
}
serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  if(!serviceRoleKey||!supabaseUrl)return json({error:"server_configuration_error"},500);
  const auth=req.headers.get("Authorization")||"";const token=auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||"";if(!token||!timingSafeEqual(token,serviceRoleKey))return json({error:"unauthorized"},401);
  const contentLength=Number(req.headers.get("content-length")||"0");if(contentLength>MAX_BODY_BYTES)return json({error:"request_too_large"},413);
  let body:Record<string,unknown>;try{body=await req.json();}catch{return json({error:"invalid_json"},400);}
  const merchantId=typeof body.merchant_id==="string"?body.merchant_id.trim():"";const environment=typeof body.environment==="string"?body.environment.trim().toLowerCase():"production";const eventType=typeof body.event_type==="string"?body.event_type.trim():"";const eventId=typeof body.event_id==="string"?body.event_id.trim():null;const data=body.data&&typeof body.data==="object"&&!Array.isArray(body.data)?body.data:{};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(merchantId)||!ALLOWED_EVENTS.has(eventType)||!["production","sandbox"].includes(environment))return json({error:"invalid_dispatch_request"},400);
  if(eventId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId))return json({error:"invalid_event_id"},400);
  const db=createClient(supabaseUrl,serviceRoleKey);const payload=JSON.stringify({id:eventId,type:eventType,created_at:new Date().toISOString(),data});
  const {data:destinations,error:destinationError}=await db.rpc("get_webhook_destinations",{p_merchant_id:merchantId,p_event_type:eventType,p_environment:environment});if(destinationError)return json({error:"destination_lookup_error"},500);
  const results=await Promise.all((destinations||[]).map(async(destination:{endpoint_id:string;url:string;secret:string})=>{
    const deliveryId=crypto.randomUUID();const timestamp=Math.floor(Date.now()/1000).toString();const signature=await hmacHex(destination.secret,`${timestamp}.${payload}`);const started=Date.now();let statusCode:number|null=null;let lastError:string|null=null;let deliveredAt:string|null=null;
    if(!await isSafeWebhookUrl(destination.url))lastError="unsafe_webhook_url";else try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);const response=await fetch(destination.url,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","User-Agent":"ValoraTap-Webhooks/1.0","X-ValoraTap-Event":eventType,"X-ValoraTap-Delivery":deliveryId,"X-ValoraTap-Signature":`t=${timestamp},v1=${signature}`},body:payload,signal:controller.signal});clearTimeout(timer);statusCode=response.status;if(response.ok)deliveredAt=new Date().toISOString();else lastError=`HTTP ${response.status}`;}catch(error){lastError=error instanceof Error?error.message.slice(0,500):"delivery_failed";}
    const attemptStatus=deliveredAt?"delivered":"pending";const nextRetry=deliveredAt?null:new Date(Date.now()+30000).toISOString();const {error:insertError}=await db.from("webhook_deliveries").insert({id:deliveryId,merchant_id:merchantId,environment,endpoint_id:destination.endpoint_id,event_type:eventType,event_id:eventId,payload:JSON.parse(payload),request_id:deliveryId,signature:`t=${timestamp},v1=${signature}`,http_method:"POST",status:attemptStatus,status_code:statusCode,response_ms:Date.now()-started,attempt_count:1,delivered_at:deliveredAt,next_retry_at:nextRetry,last_error:lastError});if(insertError)return{endpoint_id:destination.endpoint_id,delivery_id:deliveryId,ok:false,status_code:statusCode,error:"delivery_record_error"};return{endpoint_id:destination.endpoint_id,delivery_id:deliveryId,ok:Boolean(deliveredAt),status_code:statusCode};
  }));return json({success:true,deliveries:results});
});
