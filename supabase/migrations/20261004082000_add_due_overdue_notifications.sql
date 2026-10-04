alter table public.notifications
  add column if not exists dedupe_key text;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'payment_received'::text,
    'pop_submitted'::text,
    'pop_rejected'::text,
    'payment_confirmed'::text,
    'invoice_due_soon'::text,
    'invoice_overdue'::text
  ]));

create unique index if not exists notifications_dedupe_key_unique
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

create or replace function public.generate_invoice_due_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (
    merchant_id, type, title, message, severity,
    entity_type, entity_id, action_url, dedupe_key
  )
  select
    i.merchant_id,
    case when i.due_date = current_date + 3
      then 'invoice_due_soon' else 'invoice_overdue' end,
    case when i.due_date = current_date + 3
      then 'Invoice due soon' else 'Invoice overdue' end,
    case when i.due_date = current_date + 3
      then 'Invoice ' || i.invoice_no || ' is due in 3 days.'
      else 'Invoice ' || i.invoice_no || ' is overdue.' end,
    case when i.due_date = current_date + 3 then 'low' else 'medium' end,
    'invoice',
    i.id,
    '/invoice-centre.html',
    case when i.due_date = current_date + 3
      then 'invoice_due_soon:' || i.id::text || ':' || i.due_date::text
      else 'invoice_overdue:' || i.id::text || ':' || i.due_date::text end
  from public.invoices i
  where i.status = 'issued'
    and (i.due_date = current_date + 3 or i.due_date < current_date)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.generate_invoice_due_notifications() from public;
grant execute on function public.generate_invoice_due_notifications() to postgres;
