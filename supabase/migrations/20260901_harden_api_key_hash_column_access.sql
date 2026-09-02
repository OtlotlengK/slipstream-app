begin;

revoke select (key_hash) on table public.api_keys from authenticated;
revoke select (key_hash) on table public.api_keys from anon;

commit;
