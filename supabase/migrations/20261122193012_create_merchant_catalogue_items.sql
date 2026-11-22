-- Merchant-owned product and service catalogue. Stock tracking is intentionally deferred.
create table if not exists public.merchant_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  item_type text not null check (item_type in ('product','service')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  sku text check (sku is null or char_length(sku) <= 80),
  category text check (category is null or char_length(category) <= 80),
  unit_price numeric(14,2) not null check (unit_price > 0 and unit_price <= 999999999.99),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists merchant_catalogue_items_merchant_active_idx
  on public.merchant_catalogue_items (merchant_id, is_active, item_type, name);
create unique index if not exists merchant_catalogue_items_merchant_sku_uidx
  on public.merchant_catalogue_items (merchant_id, lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';
alter table public.merchant_catalogue_items enable row level security;
drop policy if exists "Merchants can view their catalogue items" on public.merchant_catalogue_items;
create policy "Merchants can view their catalogue items" on public.merchant_catalogue_items for select to authenticated using ((select auth.uid()) = merchant_id);
drop policy if exists "Merchants can create their catalogue items" on public.merchant_catalogue_items;
create policy "Merchants can create their catalogue items" on public.merchant_catalogue_items for insert to authenticated with check ((select auth.uid()) = merchant_id);
drop policy if exists "Merchants can update their catalogue items" on public.merchant_catalogue_items;
create policy "Merchants can update their catalogue items" on public.merchant_catalogue_items for update to authenticated using ((select auth.uid()) = merchant_id) with check ((select auth.uid()) = merchant_id);
drop policy if exists "Merchants can delete their catalogue items" on public.merchant_catalogue_items;
create policy "Merchants can delete their catalogue items" on public.merchant_catalogue_items for delete to authenticated using ((select auth.uid()) = merchant_id);
revoke all on table public.merchant_catalogue_items from anon;
grant select, insert, update, delete on table public.merchant_catalogue_items to authenticated;
grant all on table public.merchant_catalogue_items to service_role;
