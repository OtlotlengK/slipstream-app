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
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "server_configuration_error" }, 500);
  }

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
  const verificationHash = typeof payload.verification_hash === "string" ? payload.verification_hash.trim() : "";

  if (!receiptId && !verificationHash) {
    return json({ error: "missing_identifier", message: "Provide receipt_id or verification_hash." }, 400);
  }

  let query = db
    .from("receipts")
    .select("id, merchant_id, customer_name, amount, payment_method, description, verification_hash, status, pop_status, created_at")
    .eq("merchant_id", key.merchant_id);

  query = receiptId ? query.eq("id", receiptId) : query.eq("verification_hash", verificationHash);

  const { data: receipt, error: receiptError } = await query.maybeSingle();
  if (receiptError) return json({ error: "verification_error" }, 500);

  const verificationId = `ver_${crypto.randomUUID().replaceAll("-", "")}`;
  const verified = !!receipt && receipt.status !== "cancelled";
  const result = !receipt ? "not_found_or_invalid" : verified ? "verified" : "cancelled";

  const { error: eventError } = await db.from("verification_events").insert({
    verification_id: verificationId,
    merchant_id: key.merchant_id,
    receipt_id: receipt?.id ?? null,
    api_key_id: key.id,
    result,
  });

  if (eventError) {
    return json({
      error: "audit_log_error",
      message: "Verification could not be completed because the audit event could not be recorded.",
      verification_id: verificationId,
    }, 500);
  }

  if (!receipt) {
    return json({
      verified: false,
      status: "not_found",
      verification_id: verificationId,
      protocol_version: "1.0",
    }, 404);
  }

  return json({
    verified,
    status: verified ? "authentic" : receipt.status,
    verification_id: verificationId,
    protocol_version: "1.0",
    receipt: {
      id: receipt.id,
      amount: Number(receipt.amount),
      currency: "ZAR",
      payment_method: receipt.payment_method,
      description: receipt.description,
      status: receipt.status,
      pop_status: receipt.pop_status,
      verification_hash: receipt.verification_hash,
      issued_at: receipt.created_at,
    },
    verification: {
      receipt_exists: true,
      merchant_exists: true,
      hash_present: !!receipt.verification_hash,
      status_valid: receipt.status !== "cancelled",
      verified_at: new Date().toISOString(),
    },
  });
});
