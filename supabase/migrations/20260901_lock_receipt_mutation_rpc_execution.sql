begin;
revoke execute on function public.set_receipt_status(uuid,text) from public, anon;
revoke execute on function public.set_receipt_pop(uuid,text,text) from public, anon;
grant execute on function public.set_receipt_status(uuid,text) to authenticated;
grant execute on function public.set_receipt_pop(uuid,text,text) to authenticated;
commit;
