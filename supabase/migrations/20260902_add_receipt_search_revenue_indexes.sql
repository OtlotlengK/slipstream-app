create index if not exists receipts_merchant_created_at_idx on public.receipts (merchant_id, created_at desc);
create index if not exists receipts_merchant_customer_name_idx on public.receipts (merchant_id, lower(customer_name));
create index if not exists receipts_merchant_receipt_no_idx on public.receipts (merchant_id, receipt_no);
create index if not exists receipts_merchant_amount_idx on public.receipts (merchant_id, amount);
create index if not exists receipts_merchant_status_created_at_idx on public.receipts (merchant_id, status, created_at desc);
