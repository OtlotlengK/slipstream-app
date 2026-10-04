create or replace function public.update_webhook_endpoint(p_id uuid,p_label text,p_url text,p_events text[],p_active boolean,p_environment text default 'production')
returns boolean language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid();v_env text:=lower(trim(coalesce(p_environment,'production')));
begin
 if v_uid is null then raise exception 'not_authenticated';end if;
 if v_env not in ('production','sandbox') then raise exception 'invalid_environment';end if;
 if p_label is null or char_length(trim(p_label)) not between 1 and 120 then raise exception 'invalid_label';end if;
 if p_url is null or p_url !~ '^https://[^[:space:]]+$' then raise exception 'invalid_url';end if;
 update public.webhook_endpoints set label=trim(p_label),url=trim(p_url),events=p_events,active=coalesce(p_active,true),environment=v_env,updated_at=clock_timestamp() where id=p_id and merchant_id=v_uid;
 return found;
end $$;
revoke all on function public.update_webhook_endpoint(uuid,text,text,text[],boolean,text) from public;
grant execute on function public.update_webhook_endpoint(uuid,text,text,text[],boolean,text) to authenticated;

create or replace function public.create_sandbox_transaction(p_api_key_id uuid,p_merchant_id uuid,p_idempotency_key text,p_request_hash text,p_customer_name text,p_customer_email text,p_customer_phone text,p_description text,p_amount numeric,p_currency text,p_payment_method text,p_external_reference text)
returns table(transaction_id uuid,transaction_reference text,verification_hash text,response_status integer,replayed boolean)
language plpgsql security definer set search_path to ''
as $$
declare existing public.sandbox_transactions%rowtype;v_id uuid;v_currency text:=upper(trim(coalesce(p_currency,'')));v_business_currency text;
begin
 if not exists(select 1 from public.api_keys where id=p_api_key_id and merchant_id=p_merchant_id and revoked_at is null and environment='sandbox') then raise exception 'invalid_api_identity';end if;
 if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 128 then raise exception 'invalid_idempotency_key';end if;
 if p_request_hash is null or char_length(p_request_hash)<>64 or p_request_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_request_hash';end if;
 if p_customer_name is null or char_length(trim(p_customer_name)) not between 1 and 160 then raise exception 'invalid_customer_name';end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999.99 then raise exception 'invalid_amount';end if;
 if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency';end if;
 if lower(coalesce(p_payment_method,'')) not in ('cash','eft','card','online') then raise exception 'invalid_payment_method';end if;
 select upper(coalesce(bp.currency_code,'ZAR')) into v_business_currency from public.business_profiles bp where bp.id=p_merchant_id or bp.merchant_id=p_merchant_id limit 1;
 if v_currency<>coalesce(v_business_currency,'ZAR') then raise exception 'currency_mismatch';end if;
 select * into existing from public.sandbox_transactions where api_key_id=p_api_key_id and idempotency_key=trim(p_idempotency_key) for update;
 if found then if existing.request_hash<>p_request_hash then raise exception 'idempotency_key_reused';end if;return query select existing.id,'TEST-'||upper(substr(replace(existing.id::text,'-',''),1,12)),existing.verification_hash,200,true;return;end if;
 v_id:=gen_random_uuid();
 insert into public.sandbox_transactions(id,merchant_id,api_key_id,idempotency_key,request_hash,customer_name,customer_email,customer_phone,description,amount,currency_code,payment_method,external_reference,verification_hash)
 values(v_id,p_merchant_id,p_api_key_id,trim(p_idempotency_key),p_request_hash,trim(p_customer_name),nullif(trim(coalesce(p_customer_email,'')),''),nullif(trim(coalesce(p_customer_phone,'')),''),trim(p_description),round(p_amount,2),v_currency,lower(trim(p_payment_method)),nullif(trim(coalesce(p_external_reference,'')),''),encode(extensions.digest(convert_to('sandbox:'||v_id::text||':'||p_request_hash,'UTF8'),'sha256'),'hex'));
 return query select v_id,'TEST-'||upper(substr(replace(v_id::text,'-',''),1,12)),(select verification_hash from public.sandbox_transactions where id=v_id),201,false;
end $$;
revoke all on function public.create_sandbox_transaction(uuid,uuid,text,text,text,text,text,text,numeric,text,text,text) from public;
grant execute on function public.create_sandbox_transaction(uuid,uuid,text,text,text,text,text,text,numeric,text,text,text) to service_role;