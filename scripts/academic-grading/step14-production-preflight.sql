\set ON_ERROR_STOP on
begin transaction read only;

select 'tenants' as metric, count(*)::bigint as value from public.tenants
union all select 'profiles', count(*) from public.profiles
union all select 'cycles', count(*) from public.ciclos_escolares
union all select 'periods', count(*) from public.periodos_evaluacion
union all select 'enrollments', count(*) from public.inscripciones_alumno
union all select 'assignments', count(*) from public.asignaciones_profesor
union all select 'schemes', count(*) from public.esquemas_evaluacion
union all select 'criteria', count(*) from public.criterios_evaluacion
union all select 'exercises', count(*) from public.ejercicios
union all select 'links', count(*) from public.vinculos_evaluacion_ejercicio
union all select 'exercise_results', count(*) from public.resultados_ejercicios
order by metric;

select 'grade_out_of_range' as anomaly, count(*)::bigint as value
from public.resultados_ejercicios
where calificacion is not null and calificacion not between 0 and 10
   or calificacion_manual is not null and calificacion_manual not between 0 and 10
union all
select 'grade_shadow_difference', count(*)
from public.resultados_ejercicios
where calificacion is distinct from calificacion_manual
union all
select 'legacy_result_without_context', count(*)
from public.resultados_ejercicios r
where r.registro_legacy and not exists (
  select 1
  from public.ejercicios e
  join public.temas t on t.id=e.tema_id and t.tenant_id=e.tenant_id
  join public.unidades u on u.id=t.unidad_id and u.tenant_id=t.tenant_id
  join public.asignaciones_profesor a
    on a.tenant_id=e.tenant_id and a.materia_id=u.materia_id and a.activo
  join public.inscripciones_alumno i
    on i.tenant_id=r.tenant_id and i.ciclo_escolar_id=a.ciclo_escolar_id
   and i.grupo_id=a.grupo_id and i.alumno_id=r.alumno_id and i.activo
  where e.id=r.ejercicio_id and e.tenant_id=r.tenant_id
)
union all
select 'exercise_assignment_ambiguous', count(*)
from (
  select e.tenant_id,e.id
  from public.ejercicios e
  join public.temas t on t.id=e.tema_id and t.tenant_id=e.tenant_id
  join public.unidades u on u.id=t.unidad_id and u.tenant_id=t.tenant_id
  join public.asignaciones_profesor a
    on a.tenant_id=e.tenant_id and a.materia_id=u.materia_id and a.activo
  where not exists (
    select 1 from public.vinculos_evaluacion_ejercicio v
    where v.tenant_id=e.tenant_id and v.ejercicio_id=e.id and v.activo
  )
  group by e.tenant_id,e.id having count(distinct a.id)>1
) ambiguous
union all
select 'duplicate_active_enrollment', count(*)
from (
  select tenant_id,alumno_id,ciclo_escolar_id
  from public.inscripciones_alumno where activo
  group by tenant_id,alumno_id,ciclo_escolar_id having count(*)>1
) duplicates
union all
select 'duplicate_active_link', count(*)
from (
  select tenant_id,ejercicio_id
  from public.vinculos_evaluacion_ejercicio where activo
  group by tenant_id,ejercicio_id having count(*)>1
) duplicates
order by anomaly;

select t.id as tenant_id, count(e.id)::bigint as exercises,
       count(v.id) filter (where v.activo)::bigint as active_links
from public.tenants t
left join public.ejercicios e on e.tenant_id=t.id
left join public.vinculos_evaluacion_ejercicio v
  on v.tenant_id=e.tenant_id and v.ejercicio_id=e.id and v.activo
group by t.id order by t.id;

rollback;
