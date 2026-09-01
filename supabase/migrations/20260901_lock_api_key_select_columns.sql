begin;

revoke select on table public.api_keys from authenticated;
grant select (id, merchant_id, label, created_at) on table public.api_keys to authenticated;

commit;
