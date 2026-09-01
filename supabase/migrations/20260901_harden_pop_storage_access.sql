begin;

-- Keep POP evidence private. Access is granted only to the authenticated merchant
-- whose user id is the first path segment: <merchant_uuid>/<receipt_uuid>-<timestamp>-<filename>.
drop policy if exists "POP merchants can upload own files" on storage.objects;
create policy "POP merchants can upload own files"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'pop-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "POP merchants can view own files" on storage.objects;
create policy "POP merchants can view own files"
on storage.objects
for select to authenticated
using (
  bucket_id = 'pop-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "POP merchants can replace own files" on storage.objects;
create policy "POP merchants can replace own files"
on storage.objects
for update to authenticated
using (
  bucket_id = 'pop-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'pop-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "POP merchants can delete own files" on storage.objects;
create policy "POP merchants can delete own files"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'pop-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
