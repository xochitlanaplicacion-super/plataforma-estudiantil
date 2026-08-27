begin;
set local search_path = public, extensions;

select plan(36);

select has_table('public', 'ciclos_escolares', 'Existe public.ciclos_escolares');

select has_column('public', 'ciclos_escolares', column_name, format('ciclos_escolares incluye %s', column_name))
from unnest(array[
  'id', 'tenant_id', 'nombre', 'fecha_inicio', 'fecha_fin', 'estado',
  'zona_horaria', 'updated_at'
]) as required(column_name);

select has_column('public', 'inscripciones_alumno', column_name, format('inscripciones_alumno incluye %s', column_name))
from unnest(array['ciclo_escolar_id', 'updated_at']) as required(column_name);

select has_column('public', 'asignaciones_profesor', column_name, format('asignaciones_profesor incluye %s', column_name))
from unnest(array[
  'ciclo_escolar_id', 'tipo_participacion', 'vigencia_desde',
  'vigencia_hasta', 'updated_at'
]) as required(column_name);

select col_type_is('public', 'asignaciones_profesor', 'grado_id', 'uuid', 'grado_id quedó normalizado a uuid');
select col_not_null('public', 'inscripciones_alumno', 'ciclo_escolar_id', 'La inscripción exige ciclo');
select col_not_null('public', 'asignaciones_profesor', 'ciclo_escolar_id', 'La asignación exige ciclo');
select has_check('public', 'ciclos_escolares', 'Los ciclos tienen checks de dominio');
select has_check('public', 'asignaciones_profesor', 'Las asignaciones tienen checks de dominio');

select has_fk('public', 'ciclos_escolares', 'El ciclo tiene FK tenant-safe');
select has_fk('public', 'inscripciones_alumno', 'La inscripción tiene FKs tenant-safe');
select has_fk('public', 'asignaciones_profesor', 'La asignación tiene FKs tenant-safe');

select has_index('public', 'ciclos_escolares', 'ciclos_escolares_un_activo_por_tenant_idx', 'Índice de ciclo activo único');
select has_index('public', 'inscripciones_alumno', 'inscripciones_alumno_un_activo_idx', 'Índice de inscripción activa única');
select has_index('public', 'asignaciones_profesor', 'asignaciones_profesor_clase_activa_idx', 'Índice de asignación activa única');

select ok(c.relrowsecurity, format('RLS habilitada en public.%s', c.relname))
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array['ciclos_escolares', 'inscripciones_alumno', 'asignaciones_profesor'])
order by c.relname;

select ok(
  not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE'),
  format('authenticated no puede borrar %s', table_name)
)
from unnest(array['ciclos_escolares', 'inscripciones_alumno', 'asignaciones_profesor']) as protected(table_name);

select is(
  (
    select count(*)
    from public.profiles p
    where p.rol = 'alumno' and p.estatus = 'activo'
      and 1 = (
        select count(*) from public.inscripciones_alumno i
        join public.ciclos_escolares c
          on c.id = i.ciclo_escolar_id and c.tenant_id = i.tenant_id
        where i.alumno_id = p.id and i.tenant_id = p.tenant_id
          and i.activo and c.estado = 'activo'
      )
  ),
  (select count(*) from public.profiles where rol = 'alumno' and estatus = 'activo'),
  'Cada alumno activo tiene exactamente una inscripción coherente en el ciclo activo'
);

select is(
  (select count(*) from public.asignaciones_profesor where ciclo_escolar_id is null),
  0::bigint,
  'Cada asignación tiene ciclo escolar'
);

select is(
  (
    select count(*) from (
      select i.id
      from public.inscripciones_alumno i
      left join public.profiles p on p.id = i.alumno_id and p.tenant_id = i.tenant_id
      left join public.grupos g on g.id = i.grupo_id and g.tenant_id = i.tenant_id
      left join public.ciclos_escolares c on c.id = i.ciclo_escolar_id and c.tenant_id = i.tenant_id
      where p.id is null or g.id is null or c.id is null
      union all
      select a.id
      from public.asignaciones_profesor a
      left join public.profiles p on p.id = a.profesor_id and p.tenant_id = a.tenant_id
      left join public.grupos g on g.id = a.grupo_id and g.tenant_id = a.tenant_id
      left join public.materias m on m.id = a.materia_id and m.tenant_id = a.tenant_id
      left join public.ciclos_escolares c on c.id = a.ciclo_escolar_id and c.tenant_id = a.tenant_id
      where p.id is null or g.id is null or m.id is null or c.id is null
    ) orphaned
  ),
  0::bigint,
  'No existen matrículas ni asignaciones huérfanas'
);

select * from finish();
rollback;
