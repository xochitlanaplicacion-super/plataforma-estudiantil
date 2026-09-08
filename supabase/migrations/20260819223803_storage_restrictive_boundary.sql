-- Las políticas históricas de Storage son permisivas; la barrera tenant debe
-- ser RESTRICTIVE para combinarse mediante AND con cualquiera de ellas.
drop policy if exists tenant_storage_select on storage.objects;
create policy tenant_storage_select on storage.objects as restrictive for select to authenticated
using ((select private.can_access_storage_object(bucket_id, name, false)));

drop policy if exists tenant_storage_insert on storage.objects;
create policy tenant_storage_insert on storage.objects as restrictive for insert to authenticated
with check ((select private.can_access_storage_object(bucket_id, name, true)));

drop policy if exists tenant_storage_update on storage.objects;
create policy tenant_storage_update on storage.objects as restrictive for update to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)))
with check ((select private.can_access_storage_object(bucket_id, name, true)));

drop policy if exists tenant_storage_delete on storage.objects;
create policy tenant_storage_delete on storage.objects as restrictive for delete to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)));
