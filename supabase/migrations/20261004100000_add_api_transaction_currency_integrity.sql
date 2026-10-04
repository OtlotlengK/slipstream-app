create or replace function public.create_api_transaction_v2(
  p_api_key_id uuid,p_merchant_id uuid,p_idempotency_key text,p_request_hash text,p_customer_name text,p_customer_email text,p_customer_phone text,p_description text,p_amount numeric,p_currency text,p_payment_method text,p_external_reference text
) returns table(receipt_id uuid,receipt_no text,verification_hash text,response_status integer,replayed boolean)
language plpgsql security definer set search_path to ''
as $function$
declare existing public.api_idempotency_keys%rowtype; new_receipt_id uuid; new_receipt_no text; new_hash text; v_currency text:=upper(trim(coalesce(p_currency,''))); v_business_currency text;
begin
 if p_api_key_id is null or p_merchant_id is null then raise exception 'invalid_api_identity'; end if;
 if not exists(select 1 from public.api_keys k where k.id=p_api_key_id and k.merchant_id=p_merchant_id and k.revoked_at is null and k.environment='production') then raise exception 'invalid_api_identity'; end if;
 if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 128 then raise exception 'invalid_idempotency_key'; end if;
 if p_request_hash is null or char_length(p_request_hash)<>64 or p_request_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_request_hash'; end if;
 if p_customer_name is null or char_length(trim(p_customer_name)) not between 1 and 160 then raise exception 'invalid_customer_name'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999.99 then raise exception 'invalid_amount'; end if;
 if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
 if lower(coalesce(p_payment_method,'')) not in ('cash','eft','card','online') then raise exception 'invalid_payment_method'; end if;
 select upper(coalesce(bp.currency,'ZAR')) into v_business_currency from public.business_profiles bp where bp.id=p_merchant_id limit 1;
 if v_business_currency is null then v_business_currency:='ZAR'; end if;
 if v_currency<>v_business_currency then raise exception 'currency_mismatch'; end if;
 select * into existing from public.api_idempotency_keys where api_key_id=p_api_key_id and idempotency_key=trim(p_idempotency_key) for update;
 if found then
   if existing.request_hash<>p_request_hash then raise exception 'idempotency_key_reused'; end if;
   if existing.receipt_id is null then raise exception 'idempotency_incomplete'; end if;
   return query select r.id,r.receipt_no,r.verification_hash,coalesce(existing.response_status,200),true from public.receipts r where r.id=existing.receipt_id and r.merchant_id=p_merchant_id; return;
 end if;
 insert into public.api_idempotency_keys(api_key_id,idempotency_key,request_hash) values(p_api_key_id,trim(p_idempotency_key),p_request_hash);
 new_receipt_id:=gen_random_uuid(); new_receipt_no:='VT-'||upper(substr(replace(new_receipt_id::text,'-',''),1,12));
 new_hash:=encode(extensions.digest(convert_to(p_merchant_id::text||':'||new_receipt_id::text||':'||p_amount::text||':'||v_currency||':'||coalesce(p_external_reference,'')||':'||clock_timestamp()::text,'UTF8'),'sha256'),'hex');
 insert into public.receipts(id,receipt_no,merchant_id,customer_name,customer_email,customer_phone,description,item_desc,amount,payment_method,verification_hash,status,source,external_reference,currency_code,line_items)
 values(new_receipt_id,new_receipt_no,p_merchant_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_email,'')),''),nullif(trim(coalesce(p_customer_phone,'')),''),trim(p_description),trim(p_description),round(p_amount,2),lower(trim(p_payment_method)),new_hash,'issued','api',nullif(trim(coalesce(p_external_reference,'')),''),v_currency,jsonb_build_array(jsonb_build_object('description',trim(p_description),'quantity',1,'unit_price',round(p_amount,2),'line_total',round(p_amount,2))));
 update public.api_idempotency_keys set receipt_id=new_receipt_id,response_status=201 where api_key_id=p_api_key_id and idempotency_key=trim(p_idempotency_key);
 return query select new_receipt_id,new_receipt_no,new_hash,201,false;
exception when unique_violation then
 select * into existing from public.api_idempotency_keys where api_key_id=p_api_key_id and idempotency_key=trim(p_idempotency_key) for update;
 if existing.receipt_id is not null and existing.request_hash=p_request_hash then return query select r.id,r.receipt_no,r.verification_hash,coalesce(existing.response_status,200),true from public.receipts r where r.id=existing.receipt_id and r.merchant_id=p_merchant_id; return; end if; raise;
end;
$function$;
revoke all on function public.create_api_transaction_v2(uuid,uuid,text,text,text,text,text,text,numeric,text,text,text) from public;
grant execute on function public.create_api_transaction_v2(uuid,uuid,text,text,text,text,text,text,numeric,text,text,text) to service_role;