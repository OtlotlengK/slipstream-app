create or replace function public.get_webhook_destinations(p_merchant_id uuid,p_event_type text,p_environment text default 'production')
returns table(endpoint_id uuid,url text,secret text)
language sql security definer set search_path to ''
as $$ select w.id,w.url,v.decrypted_secret from public.webhook_endpoints w join vault.decrypted_secrets v on v.id=w.secret_vault_id where w.merchant_id=p_merchant_id and w.environment=lower(coalesce(p_environment,'production')) and w.active=true and p_event_type=any(w.events) $$;

create or replace function public.create_webhook_endpoint(p_label text,p_url text,p_events text[] default array['transaction.created','transaction.updated'],p_environment text default 'production')
returns table(id uuid,secret text)
language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid();v_id uuid;v_secret text;v_vault_id uuid;v_env text:=lower(trim(coalesce(p_environment,'production')));
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if v_env not in ('production','sandbox') then raise exception 'invalid_environment'; end if;
 if p_label is null or char_length(trim(p_label)) not between 1 and 120 then raise exception 'invalid_label'; end if;
 if p_url is null or p_url !~ '^https://[^[:space:]]+$' then raise exception 'invalid_url'; end if;
 if exists(select 1 from public.webhook_endpoints where merchant_id=v_uid and url=p_url and environment=v_env) then raise exception 'endpoint_exists'; end if;
 v_secret:='whsec_'||encode(extensions.gen_random_bytes(32),'base64');
 v_secret:=replace(replace(replace(replace(v_secret,'+','-'),'/','_'),'=',''),E'\\n','');
 v_vault_id:=vault.create_secret(v_secret,'valoratap_webhook_'||gen_random_uuid()::text,'ValoraTap webhook signing secret');
 insert into public.webhook_endpoints(merchant_id,label,url,secret_hash,secret_vault_id,events,environment) values(v_uid,trim(p_label),trim(p_url),encode(extensions.digest(v_secret,'sha256'),'hex'),v_vault_id,p_events,v_env) returning webhook_endpoints.id into v_id;
 return query select v_id,v_secret;
end $$;