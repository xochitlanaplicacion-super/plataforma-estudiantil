-- Snapshot interno previo a la migración multitenant.
-- Conserva filas de tablas públicas y metadatos de Storage dentro del mismo proyecto.

create schema if not exists backup_multitenant_20260819;

revoke all on schema backup_multitenant_20260819 from public, anon, authenticated;

create table if not exists backup_multitenant_20260819.manifest (
  source_schema text not null,
  source_table text not null,
  row_count bigint not null,
  captured_at timestamptz not null default now(),
  primary key (source_schema, source_table)
);

do $backup$
declare
  item record;
  copied_count bigint;
begin
  for item in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format(
      'create table if not exists backup_multitenant_20260819.%I as table public.%I',
      item.tablename,
      item.tablename
    );
    execute format(
      'select count(*) from backup_multitenant_20260819.%I',
      item.tablename
    ) into copied_count;
    insert into backup_multitenant_20260819.manifest(source_schema, source_table, row_count)
    values ('public', item.tablename, copied_count)
    on conflict (source_schema, source_table)
    do update set row_count = excluded.row_count, captured_at = now();
  end loop;
end
$backup$;

create table if not exists backup_multitenant_20260819.storage_buckets as
select * from storage.buckets;

create table if not exists backup_multitenant_20260819.storage_objects_metadata as
select
  id,
  bucket_id,
  name,
  owner,
  created_at,
  updated_at,
  last_accessed_at,
  metadata
from storage.objects;

insert into backup_multitenant_20260819.manifest(source_schema, source_table, row_count)
select 'storage', 'buckets', count(*) from backup_multitenant_20260819.storage_buckets
on conflict (source_schema, source_table)
do update set row_count = excluded.row_count, captured_at = now();

insert into backup_multitenant_20260819.manifest(source_schema, source_table, row_count)
select 'storage', 'objects', count(*) from backup_multitenant_20260819.storage_objects_metadata
on conflict (source_schema, source_table)
do update set row_count = excluded.row_count, captured_at = now();

revoke all on all tables in schema backup_multitenant_20260819 from public, anon, authenticated;
