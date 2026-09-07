-- ValoraTap production security reconciliation
-- This migration records the final security posture reached in production on 2026-09-07.
-- It is intentionally additive/idempotent where practical and must run after prior
-- ValoraTap security migrations.

BEGIN;

-- Sensitive merchant RPCs are no longer exposed directly to signed-in clients.
REVOKE EXECUTE ON FUNCTION public.confirm_invoice_payment(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_invoice(text,text,text,text,numeric,numeric,numeric,date,date,jsonb,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_short_link(text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_business_passport(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invoice_timeline(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_merchant_invoice(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_merchant_invoices() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_proof_chain_status(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_receipt(text,text,text,numeric,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merchant_mark_invoice_payment_submitted(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_invoice_payment(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_api_key(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_business_passport_token() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_invoice_public_token(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_receipt_pop(uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_receipt_status(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_transaction_category(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_api_key(text,text,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_webhook_endpoint(text,text,text[]) FROM authenticated;

-- Audit history cannot be forged directly by merchants.
REVOKE EXECUTE ON FUNCTION public.record_invoice_event(uuid,text,text,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,text,jsonb) FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.transaction_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.api_keys FROM authenticated;

-- Public verification/token lookup functions are service-layer only.
REVOKE EXECUTE ON FUNCTION public.customer_confirm_invoice_payment(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invoice_by_token(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_evidence_events_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_passport_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_short_link(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_receipt_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_business_passport(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_business_passport_by_token(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_evidence_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_transaction_events(text) FROM anon, authenticated;

-- Sensitive internal control tables are service-role only.
REVOKE ALL ON public.api_idempotency_keys FROM anon, authenticated;
REVOKE ALL ON public.api_key_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.short_links FROM anon, authenticated;
REVOKE ALL ON public.verification_events FROM anon, authenticated;

-- Prevent duplicate provider identities and enforce short-link format.
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_reference_uq
  ON public.payment_intents(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS short_links_code_uq
  ON public.short_links(code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'short_links_code_format_chk'
  ) THEN
    ALTER TABLE public.short_links
      ADD CONSTRAINT short_links_code_format_chk
      CHECK (code ~ '^[A-F0-9]{12}$');
  END IF;
END $$;

-- Enforce invoice -> receipt ownership and one-invoice-per-receipt linkage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_merchant_receipt_fk'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_merchant_receipt_fk
      FOREIGN KEY (merchant_id, receipt_id)
      REFERENCES public.receipts (merchant_id, id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_receipt_id_uq
  ON public.invoices(receipt_id)
  WHERE receipt_id IS NOT NULL;

COMMIT;
