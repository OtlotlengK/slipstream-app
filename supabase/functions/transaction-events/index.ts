import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const MAX_BODY_BYTES=32*1024;
const MAX_METADATA_BYTES=8*1024;
const ALLOWED_EVENTS=new Set(["CUSTOMER_ACKNOWLEDGED","PAYMENT_CONFIRMED","DELIVERY_CONFIRMED","WARRANTY_ACTIVATED","RETURN_REQUESTED","REFUND_COMPLETED"]);
const ALLOWED_ACTORS=new Set(["system","merchant","customer","api"]);
const json=(body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,...extra}});
async function sha256Hex(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function isUuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const contentLength=Number(req.headers.get("content-length")||"0");
 if(contentLength>MAX_BODY_BYTES)return json({error:"request_too_large"},413);
 const auth=req.headers.get("Authorization")||"";const match=auth.match(/^Bearer\s+(.+)$/i);if(!match)return json({error:"missing_api_key",message:"Use Authorization: Bearer sk_live_..."},401);
 const apiKey=match[1].trim();if(!/^sk_live_[A-Za-z0-9_-]{12,}$/.test(apiKey)||apiKey.length>256)return json({error:"invalid_api_key"},401);
 const supabaseUrl=Deno.env.get("SUPABASE_URL");const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!supabaseUrl||!serviceRoleKey)return json({error:"server_configuration_error"},500);
 const db=createClient(supabaseUrl,serviceRoleKey);const keyHash=await sha256Hex(apiKey);
 const {data:key,error:keyError}=await db.from("api_keys").select("id, merchant_id, label, created_at").eq("key_hash",keyHash).maybeSingle();
 if(keyError)return json({error:"authentication_error"},500);if(!key)return json({error:"invalid_api_key"},401);
 const {data:limitResult,error:limitError}=await db.rpc("check_api_key_rate_limit",{p_api_key_id:key.id,p_limit:60,p_window_seconds:60});
 if(limitError)return json({error:"rate_limit_check_error"},500);
 const limit=Array.isArray(limitResult)?limitResult[0]:limitResult;
 if(!limit?.allowed){const retry=Number(limit?.retry_after_seconds)||60;return json({error:"rate_limit_exceeded",message:"Too many requests. Please retry later."},429,{"Retry-After":String(retry)});}
 let payload:Record<string,unknown>;try{payload=await req.json();}catch{return json({error:"invalid_json"},400);}
 const receiptId=typeof payload.receipt_id==="string"?payload.receipt_id.trim():"";const eventType=typeof payload.event_type==="string"?payload.event_type.trim().toUpperCase():"";const actorType=typeof payload.actor_type==="string"?payload.actor_type.trim().toLowerCase():"system";const actorName=typeof payload.actor_name==="string"?payload.actor_name.trim():null;const metadata=payload.metadata&&typeof payload.metadata==="object"&&!Array.isArray(payload.metadata)?payload.metadata:{};
 if(!receiptId)return json({error:"missing_receipt_id"},400);if(!isUuid(receiptId))return json({error:"invalid_receipt_id"},400);if(!eventType)return json({error:"missing_event_type"},400);if(!ALLOWED_EVENTS.has(eventType))return json({error:"invalid_event_type"},400);if(!ALLOWED_ACTORS.has(actorType))return json({error:"invalid_actor_type"},400);if(actorName&&actorName.length>120)return json({error:"actor_name_too_long"},400);
 let metadataBytes=0;try{metadataBytes=new TextEncoder().encode(JSON.stringify(metadata)).byteLength;}catch{return json({error:"invalid_metadata"},400);}if(metadataBytes>MAX_METADATA_BYTES)return json({error:"metadata_too_large"},413);
 const {data:event,error:eventError}=await db.rpc("record_api_transaction_event",{p_merchant_id:key.merchant_id,p_receipt_id:receiptId,p_event_type:eventType,p_actor_type:actorType,p_actor_name:actorName,p_metadata:metadata});
 if(eventError){const message=eventError.message||"";if(message.includes("receipt_not_found"))return json({error:"receipt_not_found"},404);if(message.includes("receipt_not_active"))return json({error:"receipt_not_active"},409);if(message.includes("invalid_event_type")||message.includes("invalid_actor_type"))return json({error:"invalid_event"},400);return json({error:"event_recording_error"},500);}
 return json({success:true,event:{id:event.id,receipt_id:event.receipt_id,event_type:event.event_type,created_at:event.created_at},protocol_version:"1.3"},201);
});