-- Isolated sandbox data model. Live receipts are never written by sandbox keys.
alter table public.webhook_endpoints add column if not exists environment text not null default 'production';
alter table public.webhook_deliveries add column if not exists environment text not null default 'production';
alter table public.webhook_endpoints add constraint webhook_endpoints_environment_check check (environment in ('production','sandbox'));
alter table public.webhook_deliveries add constraint webhook_deliveries_environment_check check (environment in ('production','sandbox'));

create table if not exists public.sandbox_transactions (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references auth.users(id) on delete cascade,
 api_key_id uuid not null references public.api_keys(id) on delete cascade,
 idempotency_key text not null,
 request_hash text not null,
 customer_name text not null,
 customer_email text,
 customer_phone text,
 description text not null,
 amount numeric not null,
 currency_code text not null default 'ZAR',
 payment_method text not null,
 external_reference text,
 status text not null default 'simulated',
 verification_hash text not null,
 created_at timestamptz not null default now(),
 constraint sandbox_transactions_status_check check (status='simulated'),
 constraint sandbox_transactions_amount_check check (amount > 0 and amount <= 999999999.99)
);
create unique index if not exists sandbox_transactions_key_idx on public.sandbox_transactions(api_key_id,idempotency_key);
create index if not exists sandbox_transactions_merchant_created_idx on public.sandbox_transactions(merchant_id,created_at desc);
alter table public.sandbox_transactions enable row level security;
create policy sandbox_transactions_merchant_select on public.sandbox_transactions for select to authenticated using (merchant_id=auth.uid());

create table if not exists public.sandbox_integration_logs (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references auth.users(id) on delete cascade,
 api_key_id uuid references public.api_keys(id) on delete set null,
 direction text not null default 'inbound',
 endpoint text not null,
 method text not null default 'POST',
 event_type text,
 idempotency_key text,
 request_hash text,
 sandbox_transaction_id uuid references public.sandbox_transactions(id) on delete set null,
 status_code integer not null,
 duration_ms integer,
 error_code text,
 created_at timestamptz not null default now()
);
create index if not exists sandbox_integration_logs_merchant_created_idx on public.sandbox_integration_logs(merchant_id,created_at desc);
alter table public.sandbox_integration_logs enable row level security;
create policy sandbox_integration_logs_merchant_select on public.sandbox_integration_logs for select to authenticated using (merchant_id=auth.uid());