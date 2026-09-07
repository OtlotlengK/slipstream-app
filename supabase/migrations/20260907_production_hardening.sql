-- ValoraTap production hardening: function execution, trigger deduplication,
-- invoice event correctness, RLS init-plan optimization, and FK indexes.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.create_api_key(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice(text,text,text,date,date,jsonb,numeric,numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_short_link(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_webhook_endpoint(text,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_passport(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proof_chain_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_receipt(text,text,text,text,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_mark_invoice_payment_submitted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_event(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_invoice_payment(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_business_passport_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_invoice_public_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_receipt_pop(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_receipt_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_transaction_category(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_payment(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.customer_confirm_invoice_payment(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_business_passport_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_evidence_by_hash(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_evidence_events_by_hash(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_passport_by_hash(text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_receipt_by_hash(text) TO anon;

REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_invoice_payment(uuid,text,text,bigint,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_webhook_destinations(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret_for_delivery(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_webhook_delivery_for_retry(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_api_transaction(uuid,uuid,text,text,text,text,text,text,numeric,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_api_key_rate_limit(uuid,integer,integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_api_transaction_event(uuid,uuid,text,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_customer_acknowledgement(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_receipt(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_business_passport(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_timeline_trigger() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_receipt_immutability() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_receipt_status_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_api_key_record() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_receipt_integrity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

DROP TRIGGER IF EXISTS protect_api_key_record ON public.api_keys;
CREATE TRIGGER protect_api_key_record BEFORE INSERT OR UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.protect_api_key_record();
DROP TRIGGER IF EXISTS invoice_timeline_after_change ON public.invoices;
DROP TRIGGER IF EXISTS invoice_timeline_after_insert ON public.invoices;
CREATE TRIGGER invoice_timeline_after_insert AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_timeline_trigger();
DROP TRIGGER IF EXISTS webhook_delivery_retry_schedule ON public.webhook_deliveries;
CREATE TRIGGER webhook_delivery_retry_schedule BEFORE UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.mark_webhook_delivery_retryable();

DROP POLICY IF EXISTS "Merchants view own webhook deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "invoice_events_merchant_select" ON public.invoice_events;
CREATE POLICY "invoice_events_merchant_select" ON public.invoice_events FOR SELECT TO authenticated USING (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can insert their own profile" ON public.merchants;
CREATE POLICY "Merchants can insert their own profile" ON public.merchants FOR INSERT TO authenticated WITH CHECK (id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can update their own profile" ON public.merchants;
CREATE POLICY "Merchants can update their own profile" ON public.merchants FOR UPDATE TO authenticated USING (id=(SELECT auth.uid())) WITH CHECK (id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can view their own profile" ON public.merchants;
CREATE POLICY "Merchants can view their own profile" ON public.merchants FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can view their own receipt events" ON public.receipt_events;
CREATE POLICY "Merchants can view their own receipt events" ON public.receipt_events FOR SELECT TO authenticated USING (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can create their own receipts" ON public.receipts;
CREATE POLICY "Merchants can create their own receipts" ON public.receipts FOR INSERT TO authenticated WITH CHECK (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can update receipt POP fields" ON public.receipts;
CREATE POLICY "Merchants can update receipt POP fields" ON public.receipts FOR UPDATE TO authenticated USING (merchant_id=(SELECT auth.uid())) WITH CHECK (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can view their own receipts" ON public.receipts;
CREATE POLICY "Merchants can view their own receipts" ON public.receipts FOR SELECT TO authenticated USING (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can view own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Merchants can view own webhook deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated USING (merchant_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Merchants can view API key metadata" ON public.api_keys;
CREATE POLICY "Merchants can view API key metadata" ON public.api_keys FOR SELECT TO authenticated USING (merchant_id=(SELECT auth.uid()));

DROP INDEX IF EXISTS public.receipts_merchant_customer_name_idx;
DROP INDEX IF EXISTS public.webhook_deliveries_merchant_created_idx;
DROP INDEX IF EXISTS public.webhook_deliveries_endpoint_created_idx;
DROP INDEX IF EXISTS public.integration_logs_merchant_created_idx;
CREATE INDEX IF NOT EXISTS api_idempotency_keys_receipt_id_idx ON public.api_idempotency_keys(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_key_rate_limits_api_key_id_idx ON public.api_key_rate_limits(api_key_id);
CREATE INDEX IF NOT EXISTS integration_logs_api_key_id_idx ON public.integration_logs(api_key_id) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS integration_logs_receipt_id_idx ON public.integration_logs(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_events_merchant_created_idx ON public.invoice_events(merchant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_intents_merchant_id_idx ON public.payment_intents(merchant_id);
CREATE INDEX IF NOT EXISTS verification_events_api_key_id_idx ON public.verification_events(api_key_id) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS verification_events_merchant_created_idx ON public.verification_events(merchant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS verification_events_receipt_id_idx ON public.verification_events(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blockchain_anchors_merchant_receipt_idx ON public.blockchain_anchors(merchant_id,receipt_id);
CREATE INDEX IF NOT EXISTS crypto_payment_intents_merchant_receipt_idx ON public.crypto_payment_intents(merchant_id,receipt_id);
CREATE INDEX IF NOT EXISTS crypto_transactions_merchant_intent_idx ON public.crypto_transactions(merchant_id,payment_intent_id);
CREATE INDEX IF NOT EXISTS crypto_transactions_merchant_receipt_idx ON public.crypto_transactions(merchant_id,receipt_id);
CREATE INDEX IF NOT EXISTS transaction_events_merchant_receipt_idx ON public.transaction_events(merchant_id,receipt_id);
CREATE INDEX IF NOT EXISTS transaction_events_merchant_id_idx ON public.transaction_events(merchant_id);

CREATE OR REPLACE FUNCTION public.create_invoice(p_customer_name text,p_customer_email text DEFAULT NULL,p_customer_phone text DEFAULT NULL,p_issue_date date DEFAULT CURRENT_DATE,p_due_date date DEFAULT NULL,p_line_items jsonb DEFAULT '[]'::jsonb,p_subtotal numeric DEFAULT NULL,p_tax_rate numeric DEFAULT 0,p_discount_amount numeric DEFAULT 0,p_notes text DEFAULT NULL,p_public_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_uid uuid:=auth.uid(); v_invoice_id uuid:=gen_random_uuid(); v_invoice_no text; v_token_hash text; v_subtotal numeric(14,2); v_tax numeric(14,2); v_total numeric(14,2); v_discount numeric(14,2):=round(coalesce(p_discount_amount,0),2);
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.merchants where id=v_uid) then raise exception 'merchant_profile_required'; end if;
 if coalesce(length(trim(p_customer_name)),0)<1 or length(trim(p_customer_name))>160 then raise exception 'invalid_customer_name'; end if;
 if p_public_token is null or length(p_public_token)<>64 or p_public_token !~ '^[a-fA-F0-9]{64}$' then raise exception 'public_token_required'; end if;
 if p_subtotal is null or p_subtotal<=0 or p_subtotal>999999999.99 then raise exception 'invalid_subtotal'; end if;
 if coalesce(p_tax_rate,0)<0 or coalesce(p_tax_rate,0)>100 then raise exception 'invalid_tax_rate'; end if;
 if v_discount<0 or v_discount>p_subtotal then raise exception 'invalid_discount'; end if;
 if p_due_date is not null and coalesce(p_issue_date,current_date)>p_due_date then raise exception 'invalid_invoice_dates'; end if;
 if jsonb_typeof(coalesce(p_line_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_line_items,'[]'::jsonb))=0 then raise exception 'invalid_line_items'; end if;
 v_subtotal:=round(p_subtotal,2); v_tax:=round(greatest(v_subtotal-v_discount,0)*coalesce(p_tax_rate,0)/100,2); v_total:=round(v_subtotal-v_discount+v_tax,2);
 if v_total<=0 then raise exception 'invalid_total'; end if;
 v_invoice_no:='INV-'||upper(substr(replace(v_invoice_id::text,'-',''),1,10)); v_token_hash:=encode(extensions.digest(convert_to(lower(p_public_token),'utf8'),'sha256'),'hex');
 insert into public.invoices(id,merchant_id,invoice_no,customer_name,customer_email,customer_phone,issue_date,due_date,line_items,subtotal,tax_rate,tax_amount,discount_amount,total,notes,status,public_token_hash) values(v_invoice_id,v_uid,v_invoice_no,trim(p_customer_name),nullif(trim(p_customer_email),''),nullif(trim(p_customer_phone),''),coalesce(p_issue_date,current_date),p_due_date,p_line_items,v_subtotal,coalesce(p_tax_rate,0),v_tax,v_discount,v_total,left(p_notes,2000),'issued',v_token_hash);
 return jsonb_build_object('id',v_invoice_id,'invoice_no',v_invoice_no,'public_token',lower(p_public_token),'total',v_total);
end;$function$;
