create or replace function public.generate_my_integration_notifications()
returns integer language plpgsql security definer set search_path to 'public','pg_catalog'
as $$
declare v_count integer:=0;
begin
 if auth.uid() is null then raise exception 'not_authenticated';end if;
 insert into public.notifications(merchant_id,type,title,message,severity,entity_type,entity_id,action_url,dedupe_key)
 select auth.uid(),'api_error','API integration error','ValoraTap detected server-side API errors in the last 24 hours. Review API Logs.','high','integration',null,'/api-logs.html','api_error:'||auth.uid()::text||':'||current_date::text
 where exists(select 1 from public.integration_logs l where l.merchant_id=auth.uid() and l.status_code>=500 and l.created_at>=now()-interval '24 hours')
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 insert into public.notifications(merchant_id,type,title,message,severity,entity_type,entity_id,action_url,dedupe_key)
 select d.merchant_id,'webhook_failed','Webhook delivery failed','A webhook delivery could not be delivered after its retry attempts. Review Delivery History.','high','webhook_delivery',d.id,'/webhook-deliveries.html','webhook_failed:'||d.id::text
 from public.webhook_deliveries d
 where d.merchant_id=auth.uid() and d.environment='production' and d.delivered_at is null and d.next_retry_at is null and coalesce(d.attempt_count,0)>0 and d.created_at>=now()-interval '30 days'
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 get diagnostics v_count=row_count;return v_count;
end $$;