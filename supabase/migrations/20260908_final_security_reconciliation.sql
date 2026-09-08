-- ValoraTap final production security reconciliation.
-- This migration is intentionally additive/idempotent and supersedes older
-- hardening migrations without rewriting migration history.

-- Public lookup/proof functions are reached only through hardened Edge Functions.
REVOKE EXECUTE ON FUNCTION public.customer_confirm_invoice_payment(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invoice_by_token(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_evidence_events_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_passport_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_short_link(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_receipt_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_business_passport(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_business_passport_by_token(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_evidence_by_hash(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_transaction_events(uuid) FROM anon, authenticated;

-- Audit/event writes are internal only.
REVOKE EXECUTE ON FUNCTION public.record_invoice_event(uuid,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,text,jsonb) FROM anon, authenticated;

-- Provider settlement/reservation and receipt mutation remain service-role only.
REVOKE EXECUTE ON FUNCTION public.settle_invoice_payment(uuid,text,text,bigint,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_payment_intent(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_receipt_pop(uuid,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_receipt_status(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_transaction_category(uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_receipt(text,text,text,text,numeric,text,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_invoice_payment(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_confirm_invoice_payment(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_evidence_events_by_hash(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_passport_by_hash(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_receipt_by_hash(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_business_passport(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_business_passport_by_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_evidence_by_hash(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_transaction_events(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_event(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transaction_event(uuid,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_invoice_payment(uuid,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_payment_intent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_receipt_pop(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_receipt_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_transaction_category(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_receipt(text,text,text,text,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_payment(uuid) TO service_role;

-- Preserve the intentionally browser-accessible merchant-scoped RPC surface.
GRANT EXECUTE ON FUNCTION public.get_merchant_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_passport(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proof_chain_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_short_link(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_business_passport_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_invoice_public_token(uuid) TO authenticated;

-- Service-only control tables: no direct client CRUD.
REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_intents FROM anon, authenticated;
REVOKE ALL ON TABLE public.crypto_payment_intents FROM anon, authenticated;
REVOKE ALL ON TABLE public.crypto_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.blockchain_anchors FROM anon, authenticated;
REVOKE ALL ON TABLE public.transaction_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.api_idempotency_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.api_key_rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.verification_events FROM anon, authenticated;
GRANT ALL ON TABLE public.api_keys, public.payment_intents, public.crypto_payment_intents, public.crypto_transactions, public.blockchain_anchors, public.transaction_events, public.api_idempotency_keys, public.api_key_rate_limits, public.verification_events TO service_role;

-- Payment intent uniqueness: one provider reference globally and one active
-- provider attempt per invoice.
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_reference_uq
  ON public.payment_intents(provider, provider_reference);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_active_invoice_uq
  ON public.payment_intents(invoice_id)
  WHERE status IN ('pending','initialized','processing');

-- Short-link codes are unique and constrained to the canonical 12-char format.
CREATE UNIQUE INDEX IF NOT EXISTS short_links_code_uq ON public.short_links(code);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.short_links'::regclass
      AND conname = 'short_links_code_format_chk'
  ) THEN
    ALTER TABLE public.short_links
      ADD CONSTRAINT short_links_code_format_chk
      CHECK (code ~ '^[A-F0-9]{12}$');
  END IF;
END $$;

-- Receipt linkage must remain merchant-consistent and one-to-one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND conname = 'invoices_receipt_merchant_fk'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_receipt_merchant_fk
      FOREIGN KEY (merchant_id, receipt_id)
      REFERENCES public.receipts(merchant_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_receipt_id_uq
  ON public.invoices(receipt_id)
  WHERE receipt_id IS NOT NULL;
