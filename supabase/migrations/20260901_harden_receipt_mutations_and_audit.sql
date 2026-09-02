begin;

drop policy if exists "Merchants can create their own receipt events" on public.receipt_events;
revoke insert on table public.receipt_events from authenticated;
revoke insert on table public.receipt_events from anon;

revoke update on table public.receipts from authenticated;
grant update (pop_url, pop_status) on table public.receipts to authenticated;

create or replace function public.set_receipt_status(p_receipt_id uuid, p_status text)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts;
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('issued','cancelled','refunded') then raise exception 'Invalid receipt status'; end if;

  select * into v_receipt from public.receipts
  where id = p_receipt_id and merchant_id = auth.uid() for update;
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status = p_status then return v_receipt; end if;

  v_allowed := (v_receipt.status = 'issued' and p_status in ('cancelled','refunded'));
  if not v_allowed then
    raise exception 'Invalid receipt status transition: % -> %', v_receipt.status, p_status;
  end if;

  update public.receipts set status = p_status where id = p_receipt_id;

  insert into public.receipt_events (receipt_id, merchant_id, event_type, event_data)
  values (v_receipt.id, v_receipt.merchant_id, 'RECEIPT_STATUS_CHANGED',
          jsonb_build_object('from_status', v_receipt.status, 'to_status', p_status));

  select * into v_receipt from public.receipts where id = p_receipt_id;
  return v_receipt;
end;
$$;

create or replace function public.set_receipt_pop(
  p_receipt_id uuid,
  p_pop_path text,
  p_pop_status text
)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts;
  v_old_path text;
  v_old_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_pop_status not in ('pending','verified','rejected','not_required') then raise exception 'Invalid POP status'; end if;
  if p_pop_path is not null and length(p_pop_path) > 1000 then raise exception 'Invalid POP path'; end if;

  select * into v_receipt from public.receipts
  where id = p_receipt_id and merchant_id = auth.uid() for update;
  if not found then raise exception 'Receipt not found'; end if;

  v_old_path := v_receipt.pop_url;
  v_old_status := v_receipt.pop_status;

  if p_pop_path is null and p_pop_status in ('verified','rejected') then
    raise exception 'A POP cannot be verified or rejected without an attached file';
  end if;
  if p_pop_path is not null and p_pop_status = 'not_required' then
    raise exception 'Attached POP cannot be marked not_required';
  end if;

  update public.receipts set pop_url = p_pop_path, pop_status = p_pop_status where id = p_receipt_id;

  if v_old_path is distinct from p_pop_path or v_old_status is distinct from p_pop_status then
    insert into public.receipt_events (receipt_id, merchant_id, event_type, event_data)
    values (
      v_receipt.id, v_receipt.merchant_id, 'POP_STATUS_CHANGED',
      jsonb_build_object('from_status', v_old_status, 'to_status', p_pop_status,
                         'had_pop', v_old_path is not null, 'has_pop', p_pop_path is not null)
    );
  end if;

  select * into v_receipt from public.receipts where id = p_receipt_id;
  return v_receipt;
end;
$$;

revoke all on function public.set_receipt_status(uuid,text) from public;
revoke all on function public.set_receipt_pop(uuid,text,text) from public;
grant execute on function public.set_receipt_status(uuid,text) to authenticated;
grant execute on function public.set_receipt_pop(uuid,text,text) to authenticated;

revoke all on table public.receipt_events from anon;
revoke insert on table public.receipt_events from authenticated;
grant select on table public.receipt_events to authenticated;

commit;
