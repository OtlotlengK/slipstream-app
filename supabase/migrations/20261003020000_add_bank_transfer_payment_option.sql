-- Add merchant-configured bank transfer details and expose them only through the
-- controlled public invoice lookup when bank_transfer_enabled is true.

alter table public.business_profiles
  add column if not exists bank_transfer_enabled boolean not null default false,
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_branch_code text,
  add column if not exists bank_transfer_reference text;

alter table public.business_profiles drop constraint if exists business_profiles_bank_account_number_length;
alter table public.business_profiles
  add constraint business_profiles_bank_account_number_length
  check (bank_account_number is null or length(trim(bank_account_number)) between 4 and 34);

alter table public.business_profiles drop constraint if exists business_profiles_bank_transfer_reference_length;
alter table public.business_profiles
  add constraint business_profiles_bank_transfer_reference_length
  check (bank_transfer_reference is null or length(trim(bank_transfer_reference)) between 1 and 100);

create or replace function public.get_invoice_by_token(p_public_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text := lower(trim(coalesce(p_public_token,'')));
  v_hash text;
  v jsonb;
  v_id uuid;
begin
  if length(v_token)<>64 or v_token !~ '^[a-f0-9]{64}$' then return null; end if;
  v_hash := encode(extensions.digest(convert_to(v_token,'utf8'),'sha256'),'hex');

  select i.id,jsonb_build_object(
    'id',i.id,'invoice_no',i.invoice_no,'business_name',m.business_name,'business_phone',m.phone,
    'business_website',bp.website,'business_email',bp.business_email,'business_address',bp.operating_address,
    'business_city',bp.city,'business_province',bp.province,'business_country',bp.country,'business_logo_url',bp.logo_url,
    'bank_transfer_enabled',coalesce(bp.bank_transfer_enabled,false),
    'bank_name',case when coalesce(bp.bank_transfer_enabled,false) then bp.bank_name end,
    'bank_account_name',case when coalesce(bp.bank_transfer_enabled,false) then bp.bank_account_name end,
    'bank_account_number',case when coalesce(bp.bank_transfer_enabled,false) then bp.bank_account_number end,
    'bank_branch_code',case when coalesce(bp.bank_transfer_enabled,false) then bp.bank_branch_code end,
    'bank_transfer_reference',case when coalesce(bp.bank_transfer_enabled,false) then bp.bank_transfer_reference end,
    'customer_name',i.customer_name,'issue_date',i.issue_date,'due_date',i.due_date,'currency',i.currency,
    'line_items',i.line_items,'subtotal',i.subtotal,'tax_rate',i.tax_rate,'tax_amount',i.tax_amount,
    'discount_amount',i.discount_amount,'total',i.total,'notes',i.notes,'status',i.status,
    'payment_submitted_at',i.payment_submitted_at,'payment_confirmed_at',i.payment_confirmed_at,
    'receipt_id',i.receipt_id,'receipt_verification_hash',i.receipt_verification_hash)
  into v_id,v
  from public.invoices i
  join public.merchants m on m.id=i.merchant_id
  left join public.business_profiles bp on bp.merchant_id=i.merchant_id
  where i.public_token_hash=v_hash;

  if v_id is not null then
    perform public.record_invoice_event(v_id,'INVOICE_VIEWED','customer','{}'::jsonb);
  end if;
  return v;
end;
$function$;
