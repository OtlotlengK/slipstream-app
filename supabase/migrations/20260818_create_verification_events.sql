-- Slipstream Verification Protocol: immutable verification audit trail
-- Apply this migration in the Supabase SQL editor before relying on API audit events.

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_id text not null unique,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  receipt_id uuid references public.receipts(id) on delete set null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  result text not null check (result in ('verified', 'not_found_or_invalid', 'cancelled', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists verification_events_merchant_id_idx
  on public.verification_events (merchant_id, created_at desc);

create index if not exists verification_events_receipt_id_idx
  on public.verification_events (receipt_id, created_at desc);

create index if not exists verification_events_api_key_id_idx
  on public.verification_events (api_key_id, created_at desc);

alter table public.verification_events enable row level security;

-- No public/anon policies: verification events are server-side audit data.
-- The Edge Function uses the Supabase service-role key and therefore bypasses RLS.
