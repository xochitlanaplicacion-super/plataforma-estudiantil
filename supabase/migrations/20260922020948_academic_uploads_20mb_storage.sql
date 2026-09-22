-- Las cargas académicas llegan directamente a Storage, sin atravesar el límite
-- de cuerpo de las funciones web. Las políticas multitenant permanecen intactas.
update storage.buckets
set file_size_limit = 20971520
where id in ('recursos-educativos', 'entregas-alumnos');

-- Políticas permisivas versionadas para los recursos docentes. La barrera
-- tenant_storage_* (RESTRICTIVE) sigue evaluándose mediante AND y conserva el
-- aislamiento por institución y por rol.
drop policy if exists kibo_teacher_resources_select on storage.objects;
create policy kibo_teacher_resources_select
on storage.objects as permissive for select to authenticated
using (
  bucket_id = 'recursos-educativos'
  and (select private.can_access_storage_object(bucket_id, name, true))
);

drop policy if exists kibo_teacher_resources_insert on storage.objects;
create policy kibo_teacher_resources_insert
on storage.objects as permissive for insert to authenticated
with check (
  bucket_id = 'recursos-educativos'
  and (select private.can_access_storage_object(bucket_id, name, true))
);

drop policy if exists kibo_teacher_resources_update on storage.objects;
create policy kibo_teacher_resources_update
on storage.objects as permissive for update to authenticated
using (
  bucket_id = 'recursos-educativos'
  and (select private.can_access_storage_object(bucket_id, name, true))
)
with check (
  bucket_id = 'recursos-educativos'
  and (select private.can_access_storage_object(bucket_id, name, true))
);

drop policy if exists kibo_teacher_resources_delete on storage.objects;
create policy kibo_teacher_resources_delete
on storage.objects as permissive for delete to authenticated
using (
  bucket_id = 'recursos-educativos'
  and (select private.can_access_storage_object(bucket_id, name, true))
);
