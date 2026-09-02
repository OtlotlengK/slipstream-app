-- ValoraTap: harden direct client mutation of receipts and audit tables
-- Keep the browser dashboard functional while preventing post-issuance tampering.

revoke delete, truncate on table public.receipts from authenticated;
revoke update on table public.receipts from authenticated;
grant update (pop_url, pop_status, status) on table public.receipts to authenticated;

revoke update, truncate on table public.api_keys from authenticated;
revoke update, delete, truncate on table public.receipt_events from authenticated;
revoke delete, truncate on table public.merchants from authenticated;

create or replace function public.enforce_receipt_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'issued' and new.status in ('cancelled', 'refunded') then
      null;
    elsif old.status = new.status then
      null;
    else
      raise exception 'Invalid receipt status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_receipt_status_transition() from public, anon, authenticated;

drop trigger if exists enforce_receipt_status_transition on public.receipts;
create trigger enforce_receipt_status_transition
before update of status on public.receipts
for each row
execute function public.enforce_receipt_status_transition();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipts_status_valid_chk') then
    alter table public.receipts add constraint receipts_status_valid_chk
      check (status in ('issued','cancelled','refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receipts_pop_status_valid_chk') then
    alter table public.receipts add constraint receipts_pop_status_valid_chk
      check (pop_status is null or pop_status in ('not_required','pending','verified','rejected'));
  end if;
end $$;
