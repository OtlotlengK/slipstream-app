-- Store structured POP extraction alongside deterministic review checks.
-- Safe for projects where the POP Shield foundation migration already ran.
alter table public.invoice_pop_submissions
  add column if not exists evidence jsonb not null default '{}'::jsonb;
