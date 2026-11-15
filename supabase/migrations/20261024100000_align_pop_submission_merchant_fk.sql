-- POP submissions belong to a ValoraTap merchant record, not directly to an auth.users row.
-- The Edge Functions resolve the invoice owner server-side and write that merchant ID.
alter table public.invoice_pop_submissions
  drop constraint if exists invoice_pop_submissions_merchant_id_fkey;

alter table public.invoice_pop_submissions
  add constraint invoice_pop_submissions_merchant_id_fkey
  foreign key (merchant_id) references public.merchants(id) on delete cascade;
