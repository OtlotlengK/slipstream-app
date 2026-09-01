-- ValoraTap security hardening: least-privilege Data API grants and tightly scoped RPCs.

revoke all on table public.api_keys from anon;
revoke all on table public.merchants from anon;
revoke all on table public.receipt_events from anon;
revoke all on table public.receipts from anon;
revoke all on table public.transaction_events from anon;
revoke all on table public.verification_events from anon;

revoke all on table public.transaction_events from authenticated;
grant select on table public.transaction_events to authenticated;
revoke all on table public.verification_events from authenticated;

revoke all on function public.verify_receipt(uuid) from public;
revoke all on function public.get_public_transaction_events(uuid) from public;
revoke all on function public.record_customer_acknowledgement(uuid,text) from public;
revoke all on function public.record_transaction_event(uuid,text,text,text,jsonb) from public;
revoke all on function public.record_api_transaction_event(uuid,uuid,text,text,text,jsonb) from public;

grant execute on function public.verify_receipt(uuid) to anon, authenticated;
grant execute on function public.get_public_transaction_events(uuid) to anon, authenticated;
grant execute on function public.record_customer_acknowledgement(uuid,text) to anon, authenticated;
grant execute on function public.record_transaction_event(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.verify_receipt(p_receipt_id uuid)
returns table(business_name text, receipt_no text, customer_name text, amount numeric, payment_method text, description text, created_at timestamptz, verification_hash text, status text)
language sql security definer set search_path = ''
as $$
  select m.business_name, r.receipt_no, r.customer_name, r.amount, r.payment_method, r.description, r.created_at, r.verification_hash, r.status
  from public.receipts r
  join public.merchants m on m.id = r.merchant_id
  where r.id = p_receipt_id;
$$;

create or replace function public.get_public_transaction_events(p_receipt_id uuid)
returns table(event_type text, actor_type text, actor_name text, created_at timestamptz)
language sql security definer set search_path = ''
as $$
  select e.event_type, e.actor_type, e.actor_name, e.created_at
  from public.transaction_events e
  join public.receipts r on r.id = e.receipt_id
  where e.receipt_id = p_receipt_id
  order by e.created_at asc;
$$;

create or replace function public.record_customer_acknowledgement(p_receipt_id uuid, p_customer_name text default null)
returns public.transaction_events
language plpgsql security definer set search_path = ''
as $$
declare r public.receipts; e public.transaction_events;
begin
  select * into r from public.receipts where id = p_receipt_id;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.status in ('cancelled','refunded') then raise exception 'receipt_not_active'; end if;
  if length(coalesce(p_customer_name, '')) > 120 then raise exception 'customer_name_too_long'; end if;
  if exists (select 1 from public.transaction_events where receipt_id=p_receipt_id and event_type='CUSTOMER_ACKNOWLEDGED') then
    select * into e from public.transaction_events where receipt_id=p_receipt_id and event_type='CUSTOMER_ACKNOWLEDGED' order by created_at asc limit 1;
    return e;
  end if;
  insert into public.transaction_events(receipt_id,merchant_id,event_type,actor_type,actor_name,metadata)
  values(r.id,r.merchant_id,'CUSTOMER_ACKNOWLEDGED','customer',nullif(trim(p_customer_name),''),jsonb_build_object('source','public_passport'))
  returning * into e;
  return e;
end;
$$;

create or replace function public.record_transaction_event(p_receipt_id uuid, p_event_type text, p_actor_type text default 'merchant', p_actor_name text default null, p_metadata jsonb default '{}'::jsonb)
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
  if p_event_type not in ('PAYMENT_CONFIRMED','DELIVERY_CONFIRMED') then raise exception 'event_type_not_allowed'; end if;
  if length(coalesce(p_actor_name, '')) > 120 then raise exception 'actor_name_too_long'; end if;
  if exists(select 1 from public.transaction_events where receipt_id=p_receipt_id and event_type=p_event_type) then
    select * into e from public.transaction_events where receipt_id=p_receipt_id and event_type=p_event_type order by created_at asc limit 1;
    return e;
  end if;
  insert into public.transaction_events(receipt_id,merchant_id,event_type,actor_type,actor_name,metadata)
  values(r.id,r.merchant_id,p_event_type,'merchant',nullif(trim(p_actor_name),''),coalesce(p_metadata,'{}'::jsonb))
  returning * into e;
  return e;
end;
$$;

create or replace function public.record_api_transaction_event(p_merchant_id uuid, p_receipt_id uuid, p_event_type text, p_actor_type text default 'system', p_actor_name text default null, p_metadata jsonb default '{}'::jsonb)
returns public.transaction_events
language plpgsql security definer set search_path = ''
as $$
declare r public.receipts; existing_event public.transaction_events; new_event public.transaction_events;
allowed_types constant text[] := array['CUSTOMER_ACKNOWLEDGED','PAYMENT_CONFIRMED','DELIVERY_CONFIRMED','WARRANTY_ACTIVATED','RETURN_REQUESTED','REFUND_COMPLETED'];
begin
  if p_event_type is null or not (p_event_type = any(allowed_types)) then raise exception 'invalid_event_type'; end if;
  if length(coalesce(p_actor_name, '')) > 120 then raise exception 'actor_name_too_long'; end if;
  select * into r from public.receipts where id=p_receipt_id and merchant_id=p_merchant_id;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.status='cancelled' and p_event_type <> 'REFUND_COMPLETED' then raise exception 'receipt_not_active'; end if;
  select * into existing_event from public.transaction_events where receipt_id=p_receipt_id and event_type=p_event_type order by created_at asc limit 1;
  if found then return existing_event; end if;
  insert into public.transaction_events(receipt_id,merchant_id,event_type,actor_type,actor_name,metadata)
  values(p_receipt_id,p_merchant_id,p_event_type,coalesce(nullif(trim(p_actor_type),''),'system'),nullif(trim(p_actor_name),''),coalesce(p_metadata,'{}'::jsonb))
  returning * into new_event;
  return new_event;
end;
$$;

revoke all on function public.record_api_transaction_event(uuid,uuid,text,text,text,jsonb) from public;
