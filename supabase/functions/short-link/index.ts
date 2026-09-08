import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = Deno.env.get("PUBLIC_APP_URL") || "https://slipstream-app-sigma.vercel.app";
const buckets = new Map<string, { count: number; reset: number }>();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const security = {
  ...cors,
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function limited(k: string) {
  const now = Date.now(), c = buckets.get(k);
  if (!c || c.reset <= now) { buckets.set(k, { count: 1, reset: now + 60000 }); return 0; }
  c.count++;
  return c.count > 60 ? Math.max(1, Math.ceil((c.reset - now) / 1000)) : 0;
}
function ip(r: Request) {
  return r.headers.get("cf-connecting-ip") || r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function notFound() { return new Response("Not found", { status: 404, headers: security }); }

let base: URL;
try { base = new URL(BASE_URL); } catch { throw new Error("Invalid PUBLIC_APP_URL"); }
if (base.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: security });
  if (req.method !== "GET") return notFound();

  const retry = limited(ip(req));
  if (retry) return new Response("Too many requests", { status: 429, headers: { ...security, "Retry-After": String(retry) } });

  const code = (new URL(req.url).searchParams.get("code") || "").trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) return notFound();

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("resolve_short_link", { p_code: code });
  const target = data?.[0]?.target_path;
  if (error || !target) return notFound();

  const path = String(target);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return notFound();

  let destination: URL;
  try { destination = new URL(path, base); } catch { return notFound(); }
  if (destination.origin !== base.origin) return notFound();

  return new Response(null, {
    status: 302,
    headers: { ...security, Location: destination.toString() },
  });
});
