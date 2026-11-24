-- VynoTap Business Network: opt-in public discovery and private business connections.
-- Discovery exposes only approved public identity fields. Relationship mutations go through
-- authenticated SECURITY DEFINER RPCs; clients cannot directly create or alter connections.

create table if not exists public.business_connections (
  id uuid primary key default gen_random_uuid(),
  requester_merchant_id uuid not null references public.merchants(id) on delete cascade,
  recipient_merchant_id uuid not null references public.merchants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_connections_distinct_parties check (requester_merchant_id <> recipient_merchant_id)
);

create unique index if not exists business_connections_active_pair_uidx
  on public.business_connections (
    least(requester_merchant_id, recipient_merchant_id),
    greatest(requester_merchant_id, recipient_merchant_id)
  )
  where status in ('pending', 'accepted');

create index if not exists business_connections_requester_status_idx
  on public.business_connections (requester_merchant_id, status, created_at desc);
create index if not exists business_connections_recipient_status_idx
  on public.business_connections (recipient_merchant_id, status, created_at desc);

alter table public.business_connections enable row level security;
drop policy if exists "Business parties can view their connections" on public.business_connections;
create policy "Business parties can view their connections"
  on public.business_connections for select to authenticated
  using (
    (select auth.uid()) = requester_merchant_id
    or (select auth.uid()) = recipient_merchant_id
  );

revoke all on table public.business_connections from anon, authenticated;
grant select on table public.business_connections to authenticated;
grant all on table public.business_connections to service_role;

create or replace function public.search_business_directory(
  p_query text default null,
  p_limit integer default 20
)
returns table (
  merchant_id uuid,
  business_name text,
  trading_name text,
  industry text,
  description text,
  city text,
  province text,
  country text,
  logo_url text,
  connection_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_query text := left(btrim(coalesce(p_query, '')), 80);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  return query
  select
    m.id,
    coalesce(nullif(btrim(bp.trading_name), ''), nullif(btrim(m.business_name), ''), 'Business'),
    bp.trading_name,
    bp.industry,
    bp.description,
    bp.city,
    bp.province,
    bp.country,
    bp.logo_url,
    (
      select case
        when bc.status = 'accepted' then 'connected'
        when bc.status = 'pending' and bc.requester_merchant_id = v_uid then 'pending_sent'
        when bc.status = 'pending' then 'pending_received'
        else null
      end
      from public.business_connections bc
      where (
        (bc.requester_merchant_id = v_uid and bc.recipient_merchant_id = m.id)
        or (bc.recipient_merchant_id = v_uid and bc.requester_merchant_id = m.id)
      )
      and bc.status in ('pending', 'accepted')
      order by bc.created_at desc
      limit 1
    )
  from public.merchants m
  join public.business_profiles bp on bp.merchant_id = m.id
  where m.id <> v_uid
    and bp.profile_visibility = 'public'
    and (
      v_query = ''
      or coalesce(bp.trading_name, m.business_name, '') ilike '%' || v_query || '%'
      or coalesce(m.business_name, '') ilike '%' || v_query || '%'
      or coalesce(bp.industry, '') ilike '%' || v_query || '%'
      or coalesce(bp.city, '') ilike '%' || v_query || '%'
      or coalesce(bp.province, '') ilike '%' || v_query || '%'
    )
  order by coalesce(nullif(btrim(bp.trading_name), ''), nullif(btrim(m.business_name), ''), 'Business')
  limit v_limit;
end;
$function$;

create or replace function public.get_my_business_connections()
returns table (
  connection_id uuid,
  counterparty_merchant_id uuid,
  business_name text,
  trading_name text,
  industry text,
  city text,
  province text,
  status text,
  direction text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  return query
  select
    bc.id,
    m.id,
    coalesce(nullif(btrim(bp.trading_name), ''), nullif(btrim(m.business_name), ''), 'Business'),
    bp.trading_name,
    bp.industry,
    bp.city,
    bp.province,
    bc.status,
    case when bc.requester_merchant_id = v_uid then 'sent' else 'received' end,
    bc.created_at,
    bc.updated_at
  from public.business_connections bc
  join public.merchants m
    on m.id = case when bc.requester_merchant_id = v_uid
      then bc.recipient_merchant_id else bc.requester_merchant_id end
  left join public.business_profiles bp on bp.merchant_id = m.id
  where (bc.requester_merchant_id = v_uid or bc.recipient_merchant_id = v_uid)
    and bc.status in ('pending', 'accepted')
  order by
    case when bc.status = 'pending' and bc.recipient_merchant_id = v_uid then 0
         when bc.status = 'accepted' then 1 else 2 end,
    bc.created_at desc;
end;
$function$;

create or replace function public.request_business_connection(p_target_merchant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_connection_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;
  if p_target_merchant_id is null or p_target_merchant_id = v_uid then
    raise exception 'invalid_business';
  end if;
  if not exists (select 1 from public.merchants where id = v_uid) then
    raise exception 'merchant_profile_required';
  end if;
  if not exists (
    select 1
    from public.business_profiles bp
    join public.merchants m on m.id = bp.merchant_id
    where bp.merchant_id = p_target_merchant_id
      and bp.profile_visibility = 'public'
  ) then
    raise exception 'business_not_discoverable';
  end if;
  if exists (
    select 1 from public.business_connections bc
    where (
      (bc.requester_merchant_id = v_uid and bc.recipient_merchant_id = p_target_merchant_id)
      or (bc.recipient_merchant_id = v_uid and bc.requester_merchant_id = p_target_merchant_id)
    )
    and bc.status in ('pending', 'accepted')
  ) then
    raise exception 'connection_already_exists';
  end if;

  insert into public.business_connections (requester_merchant_id, recipient_merchant_id)
  values (v_uid, p_target_merchant_id)
  returning id into v_connection_id;

  return v_connection_id;
exception
  when unique_violation then
    raise exception 'connection_already_exists';
end;
$function$;

create or replace function public.respond_business_connection(
  p_connection_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;
  if p_action is null or p_action not in ('accept', 'decline') then
    raise exception 'invalid_action';
  end if;

  update public.business_connections
  set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      updated_at = now()
  where id = p_connection_id
    and recipient_merchant_id = v_uid
    and status = 'pending'
  returning status into v_status;

  if v_status is null then
    raise exception 'connection_request_not_found';
  end if;
end;
$function$;

create or replace function public.cancel_business_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_deleted integer;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  delete from public.business_connections
  where id = p_connection_id
    and requester_merchant_id = v_uid
    and status = 'pending';

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'pending_request_not_found';
  end if;
end;
$function$;

revoke all on function public.search_business_directory(text, integer) from public, anon;
revoke all on function public.get_my_business_connections() from public, anon;
revoke all on function public.request_business_connection(uuid) from public, anon;
revoke all on function public.respond_business_connection(uuid, text) from public, anon;
revoke all on function public.cancel_business_connection(uuid) from public, anon;

grant execute on function public.search_business_directory(text, integer) to authenticated;
grant execute on function public.get_my_business_connections() to authenticated;
grant execute on function public.request_business_connection(uuid) to authenticated;
grant execute on function public.respond_business_connection(uuid, text) to authenticated;
grant execute on function public.cancel_business_connection(uuid) to authenticated;
