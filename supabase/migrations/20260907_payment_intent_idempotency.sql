begin;

-- Prevent multiple live payment attempts for the same invoice.
drop index if exists public.payment_intents_provider_reference_uidx;
create unique index if not exists payment_intents_active_invoice_uq
  on public.payment_intents (invoice_id)
  where status in ('pending','initialized','processing');

-- Reserve one payment attempt atomically before contacting the provider.
create or replace function public.reserve_payment_intent(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_existing public.payment_intents%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_reference text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status <> 'issued' then raise exception 'invoice_not_payable'; end if;
  if v_invoice.customer_email is null or btrim(v_invoice.customer_email) = '' then raise exception 'customer_email_required'; end if;
  if v_invoice.total is null or v_invoice.total <= 0 then raise exception 'invalid_invoice_amount'; end if;

  select * into v_existing
    from public.payment_intents
   where invoice_id = v_invoice.id
     and status in ('pending','initialized','processing')
   order by created_at desc
   limit 1
   for update;

  if found then
    if v_existing.status = 'pending' and v_existing.created_at < timezone('utc', now()) - interval '5 minutes' then
      update public.payment_intents
         set status = 'failed', updated_at = timezone('utc', now()),
             metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('failure_reason','initialization_timeout')
       where id = v_existing.id;
    else
      return jsonb_build_object('created',false,'payment_intent_id',v_existing.id,'status',v_existing.status,'provider',v_existing.provider,'provider_reference',v_existing.provider_reference,'authorization_url',v_existing.authorization_url,'access_code',v_existing.access_code,'amount',v_existing.amount,'currency',v_existing.currency);
    end if;
  end if;

  v_reference := 'VT-' || coalesce(v_invoice.invoice_no, 'INV') || '-' || replace(substr(gen_random_uuid()::text,1,18),'-','');

  insert into public.payment_intents(id,invoice_id,merchant_id,provider,provider_reference,amount,currency,status,metadata)
  values(v_new_id,v_invoice.id,v_invoice.merchant_id,'paystack',v_reference,v_invoice.total,coalesce(v_invoice.currency,'ZAR'),'pending',jsonb_build_object('source','valoratap','idempotency_scope','invoice'));

  return jsonb_build_object('created',true,'payment_intent_id',v_new_id,'status','pending','provider','paystack','provider_reference',v_reference,'authorization_url',null,'access_code',null,'amount',v_invoice.total,'currency',coalesce(v_invoice.currency,'ZAR'));
end;
$function$;

revoke all on function public.reserve_payment_intent(uuid) from public, anon, authenticated;
grant execute on function public.reserve_payment_intent(uuid) to service_role;

commit;
