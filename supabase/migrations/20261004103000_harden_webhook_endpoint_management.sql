create or replace function public.update_webhook_endpoint(
 p_id uuid,p_label text,p_url text,p_events text[],p_active boolean
) returns boolean
language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_event text; v_allowed text[]:=array['transaction.created','transaction.updated','transaction.refunded','transaction.cancelled','transaction.event'];
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if p_id is null or p_label is null or char_length(trim(p_label)) not between 1 and 120 then raise exception 'invalid_label'; end if;
 if p_url is null or p_url !~ '^https://[^[:space:]]+$' then raise exception 'invalid_url'; end if;
 if p_events is null or cardinality(p_events)<1 or cardinality(p_events)>10 then raise exception 'invalid_events'; end if;
 foreach v_event in array p_events loop if not (v_event=any(v_allowed)) then raise exception 'invalid_event_type'; end if; end loop;
 update public.webhook_endpoints set label=trim(p_label),url=trim(p_url),events=p_events,active=coalesce(p_active,true),updated_at=clock_timestamp() where id=p_id and merchant_id=v_uid;
 return found;
end;$function$;

create or replace function public.rotate_webhook_secret(p_id uuid)
returns table(secret text)
language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_secret text; v_vault_id uuid;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 v_secret:='whsec_'||encode(extensions.gen_random_bytes(32),'base64');
 v_secret:=replace(replace(replace(replace(v_secret,'+','-'),'/','_'),'=',''),E'\n','');
 v_vault_id:=vault.create_secret(v_secret,'valoratap_webhook_'||gen_random_uuid()::text,'ValoraTap webhook signing secret');
 update public.webhook_endpoints set secret_hash=encode(extensions.digest(v_secret,'sha256'),'hex'),secret_vault_id=v_vault_id,updated_at=clock_timestamp() where id=p_id and merchant_id=v_uid;
 if not found then raise exception 'endpoint_not_found'; end if;
 return query select v_secret;
end;$function$;

revoke all on function public.update_webhook_endpoint(uuid,text,text,text[],boolean) from public;
grant execute on function public.update_webhook_endpoint(uuid,text,text,text[],boolean) to authenticated;
revoke all on function public.rotate_webhook_secret(uuid) from public;
grant execute on function public.rotate_webhook_secret(uuid) to authenticated;