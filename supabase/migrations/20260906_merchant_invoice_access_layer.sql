create or replace function public.get_merchant_invoice(p_invoice_id uuid)
returns table(
  id uuid,
  invoice_no text,
  customer_name text,
  customer_email text,
  customer_phone text,
  issue_date date,
  due_date date,
  currency text,
  line_items jsonb,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  discount_amount numeric,
  total numeric,
  notes text,
  status text,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_rejected_at timestamptz,
  payment_rejection_reason text,
  receipt_id uuid,
  receipt_verification_hash text,
  pop_path text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id,
    i.invoice_no,
    i.customer_name,
    i.customer_email,
    i.customer_phone,
    i.issue_date,
    i.due_date,
    i.currency,
    i.line_items,
    i.subtotal,
    i.tax_rate,
    i.tax_amount,
    i.discount_amount,
    i.total,
    i.notes,
    i.status,
    i.payment_submitted_at,
    i.payment_confirmed_at,
    i.payment_rejected_at,
    i.payment_rejection_reason,
    i.receipt_id,
    i.receipt_verification_hash,
    i.pop_path,
    i.created_at,
    i.updated_at
  from public.invoices i
  where (select auth.uid()) is not null
    and i.id = p_invoice_id
    and i.merchant_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.get_merchant_invoices()
returns table(
  id uuid,
  invoice_no text,
  customer_name text,
  customer_email text,
  total numeric,
  status text,
  issue_date date,
  due_date date,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  receipt_verification_hash text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id,
    i.invoice_no,
    i.customer_name,
    i.customer_email,
    i.total,
    i.status,
    i.issue_date,
    i.due_date,
    i.payment_submitted_at,
    i.payment_confirmed_at,
    i.receipt_verification_hash,
    i.created_at,
    i.updated_at
  from public.invoices i
  where (select auth.uid()) is not null
    and i.merchant_id = (select auth.uid())
  order by i.created_at desc;
$$;

revoke all on function public.get_merchant_invoice(uuid) from public;
revoke all on function public.get_merchant_invoice(uuid) from anon;
revoke all on function public.get_merchant_invoices() from public;
revoke all on function public.get_merchant_invoices() from anon;
grant execute on function public.get_merchant_invoice(uuid) to authenticated;
grant execute on function public.get_merchant_invoices() to authenticated;
