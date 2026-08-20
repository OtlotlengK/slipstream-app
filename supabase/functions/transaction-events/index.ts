import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "missing_api_key", message: "Use Authorization: Bearer sk_live_..." }, 401);

  const apiKey = match[1].trim();
  if (!apiKey.startsWith("sk_live_") || apiKey.length < 20) {
    return json({ error: "invalid_api_key" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey);
  const keyHash = await sha256Hex(apiKey);

  const { data: key, error: keyError } = await db
    .from("api_keys")
    .select("id, merchant_id, label, created_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError) return json({ error: "authentication_error" }, 500);
  if (!key) return json({ error: "invalid_api_key" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const receiptId = typeof payload.receipt_id === "string" ? payload.receipt_id.trim() : "";
  const eventType = typeof payload.event_type === "string" ? payload.event_type.trim().toUpperCase() : "";
  const actorType = typeof payload.actor_type === "string" ? payload.actor_type.trim() : "system";
  const actorName = typeof payload.actor_name === "string" ? payload.actor_name.trim() : null;
  const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
    ? payload.metadata
    : {};

  if (!receiptId) return json({ error: "missing_receipt_id" }, 400);
  if (!eventType) return json({ error: "missing_event_type" }, 400);

  const allowed = new Set([
    "CUSTOMER_ACKNOWLEDGED",
    "PAYMENT_CONFIRMED",
    "DELIVERY_CONFIRMED",
    "WARRANTY_ACTIVATED",
    "RETURN_REQUESTED",
    "REFUND_COMPLETED",
  ]);
  if (!allowed.has(eventType)) return json({ error: "invalid_event_type" }, 400);

  const { data: event, error: eventError } = await db.rpc("record_api_transaction_event", {
    p_merchant_id: key.merchant_id,
    p_receipt_id: receiptId,
    p_event_type: eventType,
    p_actor_type: actorType,
    p_actor_name: actorName,
    p_metadata: metadata,
  });

  if (eventError) {
    const message = eventError.message || "";
    if (message.includes("receipt_not_found")) return json({ error: "receipt_not_found" }, 404);
    if (message.includes("receipt_not_active")) return json({ error: "receipt_not_active" }, 409);
    if (message.includes("invalid_event_type")) return json({ error: "invalid_event_type" }, 400);
    return json({ error: "event_recording_error" }, 500);
  }

  return json({
    success: true,
    event: {
      id: event.id,
      receipt_id: event.receipt_id,
      event_type: event.event_type,
      actor_type: event.actor_type,
      actor_name: event.actor_name,
      metadata: event.metadata,
      created_at: event.created_at,
    },
    protocol_version: "1.1",
  }, 201);
});
