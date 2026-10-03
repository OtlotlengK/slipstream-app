create table if not exists public.invoice_pop_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  merchant_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_sha256 text not null,
  file_size bigint not null,
  mime_type text not null,
  shield_status text not null default 'unconfirmed',
  checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoice_pop_submissions_sha256_chk check (file_sha256 ~ '^[a-f0-9]{64}$'),
  constraint invoice_pop_submissions_status_chk check (shield_status in ('unconfirmed','suspicious','duplicate','verified'))
);
create index if not exists invoice_pop_submissions_merchant_hash_idx on public.invoice_pop_submissions(merchant_id,file_sha256);
create index if not exists invoice_pop_submissions_invoice_idx on public.invoice_pop_submissions(invoice_id,created_at desc);
alter table public.invoice_pop_submissions enable row level security;

create or replace function public.get_invoice_pop_shield(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid(); v_i public.invoices%rowtype; v_p public.invoice_pop_submissions%rowtype;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select * into v_i from public.invoices where id=p_invoice_id and merchant_id=v_uid;
 if not found then raise exception 'invoice_not_found'; end if;
 select * into v_p from public.invoice_pop_submissions where invoice_id=p_invoice_id and merchant_id=v_uid order by created_at desc limit 1;
 if not found then return jsonb_build_object('status','unconfirmed','has_submission',false,'checks',jsonb_build_object('invoice_match',true,'duplicate',false,'settlement_confirmed',v_i.status='paid')); end if;
 return jsonb_build_object('status',v_p.shield_status,'has_submission',true,'submission_id',v_p.id,'file_size',v_p.file_size,'mime_type',v_p.mime_type,'file_sha256',v_p.file_sha256,'created_at',v_p.created_at,'checks',v_p.checks);
end; $$;
revoke all on function public.get_invoice_pop_shield(uuid) from public;
grant execute on function public.get_invoice_pop_shield(uuid) to authenticated;