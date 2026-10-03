create or replace function public.confirm_invoice_payment(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_i public.invoices%rowtype;
  v_rid uuid:=gen_random_uuid();
  v_hash text;
  v_receipt_no text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_i from public.invoices where id=p_invoice_id and merchant_id=v_uid for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_i.status<>'payment_submitted' then raise exception 'invoice_not_ready_for_confirmation'; end if;
  if v_i.receipt_id is not null then raise exception 'receipt_already_created'; end if;
  v_receipt_no:='VT-'||upper(substr(replace(v_rid::text,'-',''),1,12));
  v_hash:=encode(extensions.digest(convert_to(v_rid::text||':'||v_i.merchant_id::text||':'||v_i.total::text||':'||v_i.currency||':'||coalesce(v_i.invoice_no,'')||':confirmed','utf8'),'sha256'),'hex');
  insert into public.receipts(id,receipt_no,customer_name,customer_email,customer_phone,item_desc,description,amount,currency_code,created_at,merchant_id,pop_status,payment_method,verification_hash,status,external_reference,source,transaction_category)
  values(v_rid,v_receipt_no,v_i.customer_name,v_i.customer_email,v_i.customer_phone,'Invoice '||v_i.invoice_no,'Payment confirmed for invoice '||v_i.invoice_no,v_i.total,v_i.currency,timezone('utc',now()),v_i.merchant_id,'pending','EFT',v_hash,'issued',v_i.invoice_no,'invoice','other');
  update public.invoices set status='paid',payment_confirmed_at=timezone('utc',now()),receipt_id=v_rid,receipt_verification_hash=v_hash,updated_at=timezone('utc',now()) where id=v_i.id and merchant_id=v_uid;
  update public.invoice_pop_submissions set shield_status='verified',checks=checks || jsonb_build_object('settlement_confirmed',true,'amount_checked',true,'currency_checked',true),updated_at=timezone('utc',now()) where invoice_id=v_i.id and merchant_id=v_uid;
  perform public.record_invoice_event(v_i.id,'PAYMENT_CONFIRMED','merchant',jsonb_build_object('receipt_id',v_rid,'receipt_no',v_receipt_no));
  perform public.record_invoice_event(v_i.id,'RECEIPT_ISSUED','system',jsonb_build_object('receipt_id',v_rid,'receipt_no',v_receipt_no));
  return jsonb_build_object('ok',true,'status','paid','receipt_id',v_rid,'receipt_no',v_receipt_no,'verification_hash',v_hash);
end;
$function$;