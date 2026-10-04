create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('payment_received','pop_submitted','pop_rejected','payment_confirmed')),
  title text not null,
  message text not null,
  severity text not null default 'high' check (severity in ('high','medium','low')),
  entity_type text,
  entity_id uuid,
  action_url text,
  source_event_id uuid references public.invoice_events(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists notifications_source_event_uidx
  on public.notifications(source_event_id) where source_event_id is not null;
create index if not exists notifications_merchant_created_idx
  on public.notifications(merchant_id, created_at desc);
create index if not exists notifications_merchant_unread_idx
  on public.notifications(merchant_id, read_at, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (merchant_id = auth.uid());

create or replace function public.get_my_notifications(p_limit integer default 20)
returns table (id uuid,type text,title text,message text,severity text,entity_type text,entity_id uuid,action_url text,read_at timestamptz,created_at timestamptz)
language sql security invoker set search_path = public as $$
  select n.id,n.type,n.title,n.message,n.severity,n.entity_type,n.entity_id,n.action_url,n.read_at,n.created_at
  from public.notifications n where n.merchant_id = auth.uid()
  order by n.created_at desc limit greatest(1, least(coalesce(p_limit,20),50));
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.notifications set read_at = coalesce(read_at, timezone('utc', now()))
  where id = p_notification_id and merchant_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  update public.notifications set read_at = coalesce(read_at, timezone('utc', now()))
  where merchant_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_invoice_notification_from_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_customer text; v_invoice_no text; v_url text; v_type text; v_title text; v_message text;
begin
  if new.event_type not in ('PAYMENT_SUBMITTED','PAYMENT_CONFIRMED','PAYMENT_REJECTED') then return new; end if;

  select i.invoice_no, i.customer_name into v_invoice_no, v_customer
  from public.invoices i where i.id = new.invoice_id and i.merchant_id = new.merchant_id;

  if new.event_type = 'PAYMENT_SUBMITTED' then
    v_type := 'pop_submitted'; v_title := 'Payment proof submitted';
    v_message := coalesce(v_customer,'A customer') || ' submitted payment proof for invoice ' || coalesce(v_invoice_no,'invoice') || '. Review it before confirming settlement.';
    v_url := '/invoice-review.html?id=' || new.invoice_id::text;
  elsif new.event_type = 'PAYMENT_REJECTED' then
    v_type := 'pop_rejected'; v_title := 'Payment proof rejected';
    v_message := 'Payment proof for invoice ' || coalesce(v_invoice_no,'invoice') || ' was rejected. The customer may need to resubmit proof.';
    v_url := '/invoice-review.html?id=' || new.invoice_id::text;
  else
    v_type := 'payment_confirmed'; v_title := 'Payment received';
    v_message := 'Payment for invoice ' || coalesce(v_invoice_no,'invoice') || ' has been confirmed and the receipt workflow is complete.';
    v_url := '/invoice-centre.html';
  end if;

  insert into public.notifications (merchant_id,type,title,message,severity,entity_type,entity_id,action_url,source_event_id)
  values (new.merchant_id,v_type,v_title,v_message,'high','invoice',new.invoice_id,v_url,new.id)
  on conflict (source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists invoice_event_notification_trigger on public.invoice_events;
create trigger invoice_event_notification_trigger after insert on public.invoice_events
for each row execute function public.create_invoice_notification_from_event();

revoke all on table public.notifications from anon;
grant select on table public.notifications to authenticated;
grant execute on function public.get_my_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
