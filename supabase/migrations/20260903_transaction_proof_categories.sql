alter table public.receipts add column if not exists transaction_category text not null default 'other';
alter table public.receipts drop constraint if exists receipts_transaction_category_check;
alter table public.receipts add constraint receipts_transaction_category_check check (transaction_category in ('physical_goods','professional_service','digital_product','appointment','delivery','subscription','rental','other'));
create index if not exists receipts_merchant_category_created_idx on public.receipts (merchant_id, transaction_category, created_at desc);

drop function if exists public.verify_receipt(uuid);
create function public.verify_receipt(p_receipt_id uuid)
returns table(business_name text,receipt_no text,customer_name text,amount numeric,payment_method text,description text,created_at timestamptz,verification_hash text,status text,transaction_category text)
language sql security definer set search_path = ''
as $$
  select m.business_name,r.receipt_no,r.customer_name,r.amount,r.payment_method,r.description,r.created_at,r.verification_hash,r.status,r.transaction_category
  from public.receipts r join public.merchants m on m.id=r.merchant_id
  where r.id=p_receipt_id and r.status in ('issued','cancelled','refunded');
$$;

create or replace function public.record_customer_acknowledgement(p_receipt_id uuid,p_customer_name text default null)
returns table(event_type text,actor_type text,actor_name text,created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare r public.receipts; e public.transaction_events; clean_name text;
begin
  if p_receipt_id is null then raise exception 'receipt_id_required'; end if;
  if p_customer_name is not null and char_length(p_customer_name)>120 then raise exception 'customer_name_too_long'; end if;
  clean_name:=nullif(trim(p_customer_name),'');
  select * into r from public.receipts where id=p_receipt_id for share;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.status in ('cancelled','refunded') then raise exception 'receipt_not_active'; end if;
  select te.* into e from public.transaction_events te where te.receipt_id=p_receipt_id and te.event_type='CUSTOMER_ACKNOWLEDGED' order by te.created_at asc limit 1;
  if not found then
    insert into public.transaction_events(receipt_id,merchant_id,event_type,actor_type,actor_name,metadata)
    values(r.id,r.merchant_id,'CUSTOMER_ACKNOWLEDGED','customer',clean_name,jsonb_build_object('source','public_passport'))
    returning * into e;
  end if;
  return query select e.event_type,e.actor_type,case when e.actor_type='customer' then nullif(left(coalesce(e.actor_name,''),1)||'***','***') else left(coalesce(e.actor_name,''),120) end,e.created_at;
end;
$$;

create or replace function public.record_transaction_event(p_receipt_id uuid,p_event_type text,p_actor_type text default 'merchant',p_actor_name text default null,p_metadata jsonb default '{}'::jsonb)
returns public.transaction_events
language plpgsql security definer set search_path = ''
as $$
declare r public.receipts; e public.transaction_events;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  select * into r from public.receipts where id=p_receipt_id;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.merchant_id <> (select auth.uid()) then raise exception 'not_authorized'; end if;
  if r.status in ('cancelled','refunded') then raise exception 'receipt_not_active'; end if;
  if p_event_type not in ('PAYMENT_CONFIRMED','FULFILMENT_CONFIRMED') then raise exception 'event_type_not_allowed'; end if;
  if length(coalesce(p_actor_name,''))>120 then raise exception 'actor_name_too_long'; end if;
  if exists(select 1 from public.transaction_events where receipt_id=p_receipt_id and event_type=p_event_type) then
    select * into e from public.transaction_events where receipt_id=p_receipt_id and event_type=p_event_type order by created_at asc limit 1;
    return e;
  end if;
  insert into public.transaction_events(receipt_id,merchant_id,event_type,actor_type,actor_name,metadata)
  values(r.id,r.merchant_id,p_event_type,'merchant',nullif(trim(p_actor_name),''),coalesce(p_metadata,'{}'::jsonb)) returning * into e;
  return e;
end;
$$;

create or replace function public.set_transaction_category(p_receipt_id uuid,p_transaction_category text)
returns public.receipts
language plpgsql security definer set search_path = ''
as $$
declare r public.receipts;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  if p_transaction_category not in ('physical_goods','professional_service','digital_product','appointment','delivery','subscription','rental','other') then raise exception 'invalid_transaction_category'; end if;
  select * into r from public.receipts where id=p_receipt_id;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.merchant_id <> (select auth.uid()) then raise exception 'not_authorized'; end if;
  if r.status in ('cancelled','refunded') then raise exception 'receipt_not_active'; end if;
  update public.receipts set transaction_category=p_transaction_category where id=p_receipt_id returning * into r;
  return r;
end;
$$;

revoke execute on function public.verify_receipt(uuid) from public;
grant execute on function public.verify_receipt(uuid) to anon,authenticated;
revoke execute on function public.record_customer_acknowledgement(uuid,text) from public;
grant execute on function public.record_customer_acknowledgement(uuid,text) to anon,authenticated;
revoke execute on function public.record_transaction_event(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.record_transaction_event(uuid,text,text,text,jsonb) to authenticated;
revoke execute on function public.set_transaction_category(uuid,text) from public,anon;
grant execute on function public.set_transaction_category(uuid,text) to authenticated;
