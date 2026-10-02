-- Reproduce the production hardening applied on 2026-10-02.
-- Server-authoritatively validates invoice line items, subtotal, and merchant currency.

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_customer_name text,
  p_customer_email text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL::date,
  p_line_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT NULL::numeric,
  p_tax_rate numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text,
  p_public_token text DEFAULT NULL::text,
  p_currency text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_no text;
  v_token_hash text;
  v_subtotal numeric(14,2);
  v_line_subtotal numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_discount numeric(14,2) := round(coalesce(p_discount_amount,0),2);
  v_currency text;
  v_item jsonb;
  v_qty numeric;
  v_unit numeric;
  v_desc text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists(select 1 from public.merchants where id=v_uid) then raise exception 'merchant_profile_required'; end if;
  if coalesce(length(trim(p_customer_name)),0)<1 or length(trim(p_customer_name))>160 then raise exception 'invalid_customer_name'; end if;
  if p_public_token is null or length(p_public_token)<>64 or p_public_token !~ '^[a-fA-F0-9]{64}$' then raise exception 'public_token_required'; end if;
  if p_due_date is not null and coalesce(p_issue_date,current_date)>p_due_date then raise exception 'invalid_invoice_dates'; end if;
  if jsonb_typeof(coalesce(p_line_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_line_items,'[]'::jsonb))=0 then raise exception 'invalid_line_items'; end if;

  v_line_subtotal := 0;
  for v_item in select value from jsonb_array_elements(p_line_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'invalid_line_item'; end if;
    v_desc := trim(coalesce(v_item->>'description',''));
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_unit := nullif(v_item->>'unit_price','')::numeric;
    if coalesce(length(v_desc),0)<1 or length(v_desc)>500 then raise exception 'invalid_line_item'; end if;
    if v_qty is null or v_qty<=0 or v_qty>1000000 then raise exception 'invalid_line_item'; end if;
    if v_unit is null or v_unit<=0 or v_unit>999999999.99 then raise exception 'invalid_line_item'; end if;
    v_line_subtotal := v_line_subtotal + round(v_qty*v_unit,2);
  end loop;

  v_line_subtotal := round(v_line_subtotal,2);
  if p_subtotal is null or p_subtotal<=0 or p_subtotal>999999999.99 then raise exception 'invalid_subtotal'; end if;
  v_subtotal := round(p_subtotal,2);
  if v_line_subtotal <> v_subtotal then raise exception 'subtotal_does_not_match_line_items'; end if;
  if coalesce(p_tax_rate,0)<0 or coalesce(p_tax_rate,0)>100 then raise exception 'invalid_tax_rate'; end if;
  if v_discount<0 or v_discount>v_subtotal then raise exception 'invalid_discount'; end if;

  select upper(nullif(trim(bp.currency_code),'')) into v_currency
    from public.business_profiles bp
   where bp.merchant_id=v_uid
   limit 1;
  v_currency := coalesce(v_currency,'ZAR');

  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if p_currency is not null and upper(trim(p_currency)) <> v_currency then
    raise exception 'currency_does_not_match_business_currency';
  end if;

  v_tax := round(greatest(v_subtotal-v_discount,0)*coalesce(p_tax_rate,0)/100,2);
  v_total := round(v_subtotal-v_discount+v_tax,2);
  if v_total<=0 then raise exception 'invalid_total'; end if;

  v_invoice_no := 'INV-'||upper(substr(replace(v_invoice_id::text,'-',''),1,10));
  v_token_hash := encode(extensions.digest(convert_to(lower(p_public_token),'utf8'),'sha256'),'hex');

  insert into public.invoices(
    id,merchant_id,invoice_no,customer_name,customer_email,customer_phone,
    issue_date,due_date,currency,line_items,subtotal,tax_rate,tax_amount,
    discount_amount,total,notes,status,public_token_hash
  ) values(
    v_invoice_id,v_uid,v_invoice_no,trim(p_customer_name),
    nullif(trim(p_customer_email),''),nullif(trim(p_customer_phone),''),
    coalesce(p_issue_date,current_date),p_due_date,v_currency,p_line_items,
    v_subtotal,coalesce(p_tax_rate,0),v_tax,v_discount,v_total,
    left(p_notes,2000),'issued',v_token_hash
  );

  return jsonb_build_object(
    'id',v_invoice_id,'invoice_no',v_invoice_no,
    'public_token',lower(p_public_token),'total',v_total,'currency',v_currency
  );
end;
$function$;
