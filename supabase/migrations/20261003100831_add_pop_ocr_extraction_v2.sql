create or replace function public.record_invoice_pop_ocr(p_invoice_id uuid,p_ocr_text text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid(); v_i public.invoices%rowtype; v_s public.invoice_pop_submissions%rowtype;
  v_text text:=coalesce(p_ocr_text,''); v_norm text:=lower(regexp_replace(v_text,'[[:space:]]+',' ','g'));
  v_amount_text text; v_reference text; v_currency text; v_date_text text;
  v_invoice_match boolean; v_amount numeric; v_currency_match boolean; v_reference_present boolean;
  v_conflict boolean:=false; v_evidence jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_i from public.invoices where id=p_invoice_id and merchant_id=v_uid for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_i.status<>'payment_submitted' then raise exception 'invoice_not_ready_for_ocr'; end if;
  select * into v_s from public.invoice_pop_submissions where invoice_id=v_i.id and merchant_id=v_uid order by created_at desc limit 1 for update;
  if not found then raise exception 'pop_submission_not_found'; end if;
  v_invoice_match:=position(lower(coalesce(v_i.invoice_no,'')) in v_norm)>0;
  select (regexp_matches(v_norm,'(?:total|amount|paid|payment amount|transaction amount)[^0-9]{0,20}([0-9][0-9,\. ]{0,20})','i'))[1] into v_amount_text;
  if v_amount_text is not null then begin v_amount:=nullif(regexp_replace(v_amount_text,'[^0-9\.]','','g'),'')::numeric; exception when others then v_amount:=null; end; end if;
  select upper((regexp_matches(v_norm,'(?:currency)[^a-z]{0,8}(zar|usd|eur|gbp)','i'))[1]) into v_currency;
  if v_currency is null and (position('zar' in v_norm)>0 or position(' r ' in ' '||v_norm||' ')>0) then v_currency:='ZAR'; end if;
  select (regexp_matches(v_norm,'(?:reference|ref|payment reference)[^a-z0-9]{0,12}([a-z0-9][a-z0-9\-_/]{2,60})','i'))[1] into v_reference;
  select (regexp_matches(v_norm,'(?:date|transaction date|value date)[^0-9]{0,12}([0-9]{1,4}[/-][0-9]{1,2}[/-][0-9]{1,4})','i'))[1] into v_date_text;
  v_currency_match:=v_currency is not null and upper(v_currency)=upper(coalesce(v_i.currency,'ZAR'));
  v_reference_present:=v_reference is not null and length(trim(v_reference))>0;
  if v_amount is not null and abs(v_amount-v_i.total::numeric)>0.01 then v_conflict:=true; end if;
  if v_currency is not null and not v_currency_match then v_conflict:=true; end if;
  if v_invoice_match=false and v_reference_present=false then v_conflict:=true; end if;
  v_evidence:=jsonb_build_object('source','ocr','extracted',true,'ocr_text_length',length(v_text),'invoice_number',v_i.invoice_no,'invoice_match',v_invoice_match,'amount',v_amount,'amount_match',case when v_amount is null then null else abs(v_amount-v_i.total::numeric)<=0.01 end,'currency',v_currency,'currency_match',case when v_currency is null then null else v_currency_match end,'reference',v_reference,'reference_present',v_reference_present,'transaction_date',v_date_text,'transaction_date_present',v_date_text is not null,'conflict',v_conflict);
  update public.invoice_pop_submissions
  set evidence=evidence || v_evidence,
      checks=checks || jsonb_build_object('evidence_extracted',true,'invoice_match',v_invoice_match,'amount_checked',case when v_amount is null then false else abs(v_amount-v_i.total::numeric)<=0.01 end,'currency_checked',case when v_currency is null then false else v_currency_match end,'reference_checked',v_reference_present),
      shield_status=case when shield_status='duplicate' then 'duplicate' when v_conflict then 'suspicious' else 'unconfirmed' end,
      updated_at=timezone('utc',now())
  where id=v_s.id;
  return v_evidence;
end;
$function$;
revoke all on function public.record_invoice_pop_ocr(uuid,text) from public;
grant execute on function public.record_invoice_pop_ocr(uuid,text) to authenticated;