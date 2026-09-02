create or replace function public.verify_receipt(p_receipt_id uuid)
returns table(
  business_name text,
  receipt_no text,
  customer_name text,
  amount numeric,
  payment_method text,
  description text,
  created_at timestamptz,
  verification_hash text,
  status text
)
language sql
security definer
set search_path = ''
as $$
  select m.business_name, r.receipt_no, r.customer_name, r.amount,
         r.payment_method, r.description, r.created_at,
         r.verification_hash, r.status
  from public.receipts r
  join public.merchants m on m.id = r.merchant_id
  where r.id = p_receipt_id
    and r.status in ('issued','cancelled','refunded');
$$;

create or replace function public.get_public_transaction_events(p_receipt_id uuid)
returns table(event_type text, actor_type text, actor_name text, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select e.event_type, e.actor_type,
    case when e.actor_type = 'customer'
      then nullif(left(coalesce(e.actor_name, ''), 1) || '***', '***')
      else left(coalesce(e.actor_name, ''), 120) end,
    e.created_at
  from public.transaction_events e
  join public.receipts r on r.id = e.receipt_id
  where e.receipt_id = p_receipt_id
    and r.status in ('issued','cancelled','refunded')
  order by e.created_at asc;
$$;

create unique index if not exists transaction_events_one_customer_ack_per_receipt
  on public.transaction_events(receipt_id)
  where event_type = 'CUSTOMER_ACKNOWLEDGED';

drop function if exists public.record_customer_acknowledgement(uuid,text);

create function public.record_customer_acknowledgement(p_receipt_id uuid, p_customer_name text default null)
returns table(event_type text, actor_type text, actor_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receipts;
  e public.transaction_events;
  clean_name text;
begin
  if p_customer_name is not null and length(p_customer_name) > 120 then
    raise exception 'customer_name_too_long';
  end if;
  clean_name := nullif(trim(p_customer_name), '');
  select * into r from public.receipts where id = p_receipt_id for share;
  if not found then raise exception 'receipt_not_found'; end if;
  if r.status in ('cancelled','refunded') then raise exception 'receipt_not_active'; end if;

  select * into e from public.transaction_events
  where receipt_id = p_receipt_id and event_type = 'CUSTOMER_ACKNOWLEDGED'
  order by created_at asc limit 1;

  if not found then
    begin
      insert into public.transaction_events(receipt_id, merchant_id, event_type, actor_type, actor_name, metadata)
      values (r.id, r.merchant_id, 'CUSTOMER_ACKNOWLEDGED', 'customer', clean_name,
              jsonb_build_object('source','public_passport'))
      returning * into e;
    exception when unique_violation then
      select * into e from public.transaction_events
      where receipt_id = p_receipt_id and event_type = 'CUSTOMER_ACKNOWLEDGED'
      order by created_at asc limit 1;
    end;
  end if;

  return query select e.event_type, e.actor_type,
    case when e.actor_type = 'customer'
      then nullif(left(coalesce(e.actor_name, ''), 1) || '***', '***')
      else left(coalesce(e.actor_name, ''), 120) end,
    e.created_at;
end;
$$;

revoke all on function public.verify_receipt(uuid) from public, anon, authenticated;
revoke all on function public.get_public_transaction_events(uuid) from public, anon, authenticated;
revoke all on function public.record_customer_acknowledgement(uuid,text) from public, anon, authenticated;
grant execute on function public.verify_receipt(uuid) to anon, authenticated;
grant execute on function public.get_public_transaction_events(uuid) to anon, authenticated;
grant execute on function public.record_customer_acknowledgement(uuid,text) to anon, authenticated;