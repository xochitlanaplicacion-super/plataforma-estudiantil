-- Paso 6: autorización académica tenant-safe, grants mínimos y modelos de
-- lectura que conservan la escala fuente sin calcular todavía la nota final.

set search_path = public, extensions;

-- Los helpers son SECURITY DEFINER para evaluar pertenencia sin recursión RLS.
-- Todos fijan search_path, usan auth.uid() explícito y fallan cerrados con NULL.
create or replace function private.can_manage_teaching_assignment(
  target_tenant_id uuid,
  target_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select private.has_active_tenant_membership(target_tenant_id))
    and (
      (select private.has_tenant_role(
        target_tenant_id, array['superuser','admin']::text[]
      ))
      or exists (
        select 1
        from public.asignaciones_profesor a
        where a.id = target_assignment_id
          and a.tenant_id = target_tenant_id
          and a.profesor_id = (select auth.uid())
          and a.activo
      )
    );
$$;

create or replace function private.can_view_enrollment(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select private.has_active_tenant_membership(target_tenant_id))
    and exists (
      select 1
      from public.inscripciones_alumno i
      where i.id = target_enrollment_id
        and i.tenant_id = target_tenant_id
        and i.activo
        and (
          i.alumno_id = (select auth.uid())
          or (select private.has_tenant_role(
            target_tenant_id, array['superuser','admin']::text[]
          ))
          or exists (
            select 1
            from public.asignaciones_profesor a
            where a.id = target_assignment_id
              and a.tenant_id = i.tenant_id
              and a.ciclo_escolar_id = i.ciclo_escolar_id
              and a.grupo_id = i.grupo_id
              and a.profesor_id = (select auth.uid())
              and a.activo
          )
        )
    );
$$;

-- Variante para listados de matrícula: el profesor debe tener al menos una
-- asignación activa en el grupo/ciclo; las notas exigen siempre la variante
-- anterior con asignación exacta para impedir cruces Historia/Matemáticas.
create or replace function private.can_view_enrollment(
  target_tenant_id uuid,
  target_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select private.has_active_tenant_membership(target_tenant_id))
    and exists (
      select 1
      from public.inscripciones_alumno i
      where i.id = target_enrollment_id
        and i.tenant_id = target_tenant_id
        and i.activo
        and (
          i.alumno_id = (select auth.uid())
          or (select private.has_tenant_role(
            target_tenant_id, array['superuser','admin']::text[]
          ))
          or exists (
            select 1
            from public.asignaciones_profesor a
            where a.tenant_id = i.tenant_id
              and a.ciclo_escolar_id = i.ciclo_escolar_id
              and a.grupo_id = i.grupo_id
              and a.profesor_id = (select auth.uid())
              and a.activo
          )
        )
    );
$$;

revoke all on function private.can_manage_teaching_assignment(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_enrollment(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_enrollment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_manage_teaching_assignment(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_enrollment(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_enrollment(uuid, uuid)
  to authenticated, service_role;

-- Predicados RLS: tenant/actor/asignación/inscripción como leading columns.
create index if not exists academic_profiles_membership_rls_idx
  on public.profiles (id, tenant_id, estatus, rol);
create index if not exists academic_assignments_rls_idx
  on public.asignaciones_profesor
    (tenant_id, id, profesor_id, activo, ciclo_escolar_id, grupo_id);
create index if not exists academic_enrollments_rls_idx
  on public.inscripciones_alumno
    (tenant_id, id, alumno_id, activo, ciclo_escolar_id, grupo_id);
create index if not exists academic_results_rls_idx
  on public.resultados_ejercicios
    (tenant_id, vinculo_evaluacion_id, inscripcion_alumno_id, alumno_id);
create index if not exists academic_direct_grades_rls_idx
  on public.calificaciones_directas
    (tenant_id, asignacion_profesor_id, inscripcion_alumno_id, alumno_id);
create index if not exists academic_participation_rls_idx
  on public.eventos_participacion
    (tenant_id, asignacion_profesor_id, inscripcion_alumno_id, alumno_id);

-- Se eliminan todas las políticas académicas previas para no combinar
-- accidentalmente permisos permisivos antiguos con la matriz nueva.
do $drop_academic_policies$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array[
    'ciclos_escolares', 'inscripciones_alumno', 'asignaciones_profesor',
    'periodos_evaluacion', 'esquemas_evaluacion',
    'criterios_evaluacion', 'subcriterios_evaluacion',
    'vinculos_evaluacion_ejercicio', 'resultados_ejercicios',
    'calificaciones_directas', 'eventos_participacion'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);
    for policy_name in
      select p.polname
      from pg_catalog.pg_policy p
      where p.polrelid = format('public.%I', target_table)::regclass
    loop
      execute format('drop policy %I on public.%I', policy_name, target_table);
    end loop;
    execute format(
      'create policy academic_active_tenant_boundary on public.%I as restrictive for all to authenticated using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)))',
      target_table
    );
  end loop;
end
$drop_academic_policies$;

-- Ciclos: lectura de miembro activo; administración por admin/superuser.
create policy academic_cycle_member_select on public.ciclos_escolares
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy academic_cycle_admin_insert on public.ciclos_escolares
  for insert to authenticated
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )) and created_by = (select auth.uid()));
create policy academic_cycle_admin_update on public.ciclos_escolares
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

-- Matrículas: el profesor ve alumnos de sus grupos, pero las notas requieren
-- además la asignación exacta mediante can_view_enrollment(..., assignment).
create policy academic_enrollment_admin_select on public.inscripciones_alumno
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_enrollment_student_own_select on public.inscripciones_alumno
  for select to authenticated using (alumno_id = (select auth.uid()));
create policy academic_enrollment_professor_related_select on public.inscripciones_alumno
  for select to authenticated
  using ((select private.can_view_enrollment(tenant_id, id)));
create policy academic_enrollment_admin_insert on public.inscripciones_alumno
  for insert to authenticated
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_enrollment_admin_update on public.inscripciones_alumno
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

create policy academic_assignment_admin_select on public.asignaciones_profesor
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_assignment_professor_own_select on public.asignaciones_profesor
  for select to authenticated
  using (profesor_id = (select auth.uid()) and activo);
create policy academic_assignment_student_related_select on public.asignaciones_profesor
  for select to authenticated using (exists (
    select 1 from public.inscripciones_alumno i
    where i.tenant_id = asignaciones_profesor.tenant_id
      and i.ciclo_escolar_id = asignaciones_profesor.ciclo_escolar_id
      and i.grupo_id = asignaciones_profesor.grupo_id
      and i.alumno_id = (select auth.uid()) and i.activo
  ));
create policy academic_assignment_admin_insert on public.asignaciones_profesor
  for insert to authenticated
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_assignment_admin_update on public.asignaciones_profesor
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

-- Periodos y esquema: sólo configuración administrativa; profesores/alumnos
-- leen únicamente relaciones académicas propias.
create policy academic_period_admin_select on public.periodos_evaluacion
  for select to authenticated using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_period_professor_related_select on public.periodos_evaluacion
  for select to authenticated using (exists (
    select 1 from public.asignaciones_profesor a
    where a.tenant_id = periodos_evaluacion.tenant_id
      and a.ciclo_escolar_id = periodos_evaluacion.ciclo_escolar_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));
create policy academic_period_student_related_select on public.periodos_evaluacion
  for select to authenticated using (exists (
    select 1 from public.inscripciones_alumno i
    where i.tenant_id = periodos_evaluacion.tenant_id
      and i.ciclo_escolar_id = periodos_evaluacion.ciclo_escolar_id
      and i.alumno_id = (select auth.uid()) and i.activo
  ));
create policy academic_period_admin_insert on public.periodos_evaluacion
  for insert to authenticated with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid()) and estado <> 'cerrado'
  );
create policy academic_period_admin_update on public.periodos_evaluacion
  for update to authenticated using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and estado <> 'cerrado'
  ) with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and estado <> 'cerrado'
  );

create policy academic_scheme_admin_select on public.esquemas_evaluacion
  for select to authenticated using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_scheme_assignment_select on public.esquemas_evaluacion
  for select to authenticated using (
    (select private.can_manage_teaching_assignment(tenant_id, asignacion_profesor_id))
    or exists (
      select 1 from public.inscripciones_alumno i
      where i.tenant_id = esquemas_evaluacion.tenant_id
        and i.ciclo_escolar_id = esquemas_evaluacion.ciclo_escolar_id
        and i.alumno_id = (select auth.uid()) and i.activo
        and (select private.can_view_enrollment(
          esquemas_evaluacion.tenant_id, i.id,
          esquemas_evaluacion.asignacion_profesor_id
        ))
    )
  );
create policy academic_scheme_admin_insert on public.esquemas_evaluacion
  for insert to authenticated with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid())
  );
create policy academic_scheme_admin_update on public.esquemas_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

create policy academic_criterion_related_select on public.criterios_evaluacion
  for select to authenticated using (exists (
    select 1 from public.esquemas_evaluacion e
    where e.id = criterios_evaluacion.esquema_evaluacion_id
      and e.tenant_id = criterios_evaluacion.tenant_id
      and (
        (select private.can_manage_teaching_assignment(
          e.tenant_id, e.asignacion_profesor_id
        ))
        or exists (
          select 1 from public.inscripciones_alumno i
          where i.tenant_id = e.tenant_id
            and i.ciclo_escolar_id = e.ciclo_escolar_id
            and i.alumno_id = (select auth.uid()) and i.activo
            and (select private.can_view_enrollment(
              e.tenant_id, i.id, e.asignacion_profesor_id
            ))
        )
      )
  ));
create policy academic_criterion_admin_insert on public.criterios_evaluacion
  for insert to authenticated with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid())
  );
create policy academic_criterion_admin_update on public.criterios_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

create policy academic_subcriterion_related_select on public.subcriterios_evaluacion
  for select to authenticated using (exists (
    select 1
    from public.criterios_evaluacion c
    join public.esquemas_evaluacion e
      on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
    where c.id = subcriterios_evaluacion.criterio_evaluacion_id
      and c.tenant_id = subcriterios_evaluacion.tenant_id
      and (
        (select private.can_manage_teaching_assignment(
          e.tenant_id, e.asignacion_profesor_id
        ))
        or exists (
          select 1 from public.inscripciones_alumno i
          where i.tenant_id = e.tenant_id
            and i.ciclo_escolar_id = e.ciclo_escolar_id
            and i.alumno_id = (select auth.uid()) and i.activo
            and (select private.can_view_enrollment(
              e.tenant_id, i.id, e.asignacion_profesor_id
            ))
        )
      )
  ));
create policy academic_subcriterion_admin_insert on public.subcriterios_evaluacion
  for insert to authenticated with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid())
  );
create policy academic_subcriterion_admin_update on public.subcriterios_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

-- Vínculos y fuentes: profesor exacto, no profesor del mismo tenant/grupo.
create policy academic_link_related_select on public.vinculos_evaluacion_ejercicio
  for select to authenticated using (
    (select private.can_manage_teaching_assignment(
      tenant_id, asignacion_profesor_id
    ))
    or exists (
      select 1 from public.inscripciones_alumno i
      where i.tenant_id = vinculos_evaluacion_ejercicio.tenant_id
        and i.ciclo_escolar_id = vinculos_evaluacion_ejercicio.ciclo_escolar_id
        and i.alumno_id = (select auth.uid()) and i.activo
        and (select private.can_view_enrollment(
          vinculos_evaluacion_ejercicio.tenant_id, i.id,
          vinculos_evaluacion_ejercicio.asignacion_profesor_id
        ))
    )
  );
create policy academic_link_authorized_insert on public.vinculos_evaluacion_ejercicio
  for insert to authenticated with check (
    (select private.can_manage_teaching_assignment(
      tenant_id, asignacion_profesor_id
    )) and created_by = (select auth.uid())
  );
create policy academic_link_authorized_update on public.vinculos_evaluacion_ejercicio
  for update to authenticated
  using ((select private.can_manage_teaching_assignment(
    tenant_id, asignacion_profesor_id
  )))
  with check ((select private.can_manage_teaching_assignment(
    tenant_id, asignacion_profesor_id
  )));

create policy academic_result_authorized_select on public.resultados_ejercicios
  for select to authenticated using (
    alumno_id = (select auth.uid())
    or (select private.has_tenant_role(
      tenant_id, array['superuser','admin']::text[]
    ))
    or exists (
      select 1 from public.vinculos_evaluacion_ejercicio v
      where v.id = resultados_ejercicios.vinculo_evaluacion_id
        and v.tenant_id = resultados_ejercicios.tenant_id
        and (select private.can_view_enrollment(
          resultados_ejercicios.tenant_id,
          resultados_ejercicios.inscripcion_alumno_id,
          v.asignacion_profesor_id
        ))
    )
  );

create policy academic_direct_authorized_select on public.calificaciones_directas
  for select to authenticated using ((select private.can_view_enrollment(
    tenant_id, inscripcion_alumno_id, asignacion_profesor_id
  )));
create policy academic_direct_authorized_insert on public.calificaciones_directas
  for insert to authenticated with check (
    (select private.can_manage_teaching_assignment(
      tenant_id, asignacion_profesor_id
    )) and (select private.can_view_enrollment(
      tenant_id, inscripcion_alumno_id, asignacion_profesor_id
    ))
  );
create policy academic_direct_authorized_update on public.calificaciones_directas
  for update to authenticated
  using ((select private.can_manage_teaching_assignment(
    tenant_id, asignacion_profesor_id
  )))
  with check (
    (select private.can_manage_teaching_assignment(
      tenant_id, asignacion_profesor_id
    )) and (select private.can_view_enrollment(
      tenant_id, inscripcion_alumno_id, asignacion_profesor_id
    ))
  );

create policy academic_participation_authorized_select on public.eventos_participacion
  for select to authenticated using ((select private.can_view_enrollment(
    tenant_id, inscripcion_alumno_id, asignacion_profesor_id
  )));
create policy academic_participation_authorized_insert on public.eventos_participacion
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and (select private.can_manage_teaching_assignment(
      tenant_id, asignacion_profesor_id
    ))
    and (select private.can_view_enrollment(
      tenant_id, inscripcion_alumno_id, asignacion_profesor_id
    ))
  );

-- Grants mínimos. Resultados legacy/canónicos quedan de sólo lectura directa;
-- la edición atómica y auditada se expondrá exclusivamente en el Paso 8.
revoke all on public.ciclos_escolares, public.inscripciones_alumno,
  public.asignaciones_profesor, public.periodos_evaluacion,
  public.esquemas_evaluacion, public.criterios_evaluacion,
  public.subcriterios_evaluacion, public.vinculos_evaluacion_ejercicio,
  public.resultados_ejercicios, public.calificaciones_directas,
  public.eventos_participacion from public, anon, authenticated;

grant select, insert, update on public.ciclos_escolares,
  public.inscripciones_alumno, public.asignaciones_profesor,
  public.periodos_evaluacion, public.criterios_evaluacion,
  public.subcriterios_evaluacion, public.vinculos_evaluacion_ejercicio,
  public.calificaciones_directas to authenticated;
grant select, insert on public.eventos_participacion to authenticated;
grant select on public.resultados_ejercicios to authenticated;
grant select on public.esquemas_evaluacion to authenticated;
grant insert (
  tenant_id, ciclo_escolar_id, asignacion_profesor_id, periodo_evaluacion_id,
  nombre, calificacion_aprobatoria, decimales_mostrados, modo_redondeo,
  regla_no_entrego, valor_no_entrego, regla_justificado, created_by
) on public.esquemas_evaluacion to authenticated;
grant update (
  nombre, calificacion_aprobatoria, decimales_mostrados, modo_redondeo,
  regla_no_entrego, valor_no_entrego, regla_justificado
) on public.esquemas_evaluacion to authenticated;

grant select, insert, update, delete on public.ciclos_escolares,
  public.inscripciones_alumno, public.asignaciones_profesor,
  public.periodos_evaluacion, public.esquemas_evaluacion,
  public.criterios_evaluacion, public.subcriterios_evaluacion,
  public.vinculos_evaluacion_ejercicio, public.resultados_ejercicios,
  public.calificaciones_directas, public.eventos_participacion to service_role;

-- Read model 1: captura del profesor/admin. Los valores 0-10 y ratios 0-1 no
-- se mezclan; el motor determinista del Paso 7 consumirá escala_fuente.
create view public.vista_libreta_profesor
with (security_invoker = true)
as
select f.tenant_id, f.ciclo_escolar_id, f.asignacion_profesor_id,
       f.periodo_evaluacion_id, f.criterio_evaluacion_id,
       f.subcriterio_evaluacion_id, f.inscripcion_alumno_id, f.alumno_id,
       f.tipo_fuente, f.fuente_id, f.estado,
       f.calificacion::numeric(10,8) as valor_fuente,
       '0-10'::text as escala_fuente, f.observacion, f.row_version,
       f.calificado_at as actualizado_at
from public.vista_fuentes_calificacion f
where (select private.can_manage_teaching_assignment(
  f.tenant_id, f.asignacion_profesor_id
))
union all
select p.tenant_id, p.ciclo_escolar_id, p.asignacion_profesor_id,
       p.periodo_evaluacion_id, p.criterio_evaluacion_id,
       p.subcriterio_evaluacion_id, p.inscripcion_alumno_id, p.alumno_id,
       'participation'::text, null::uuid,
       case when p.ratio_normalizado is null then 'pendiente' else 'calificado' end,
       p.ratio_normalizado::numeric(10,8), '0-1'::text, null::text,
       null::bigint, null::timestamptz
from public.vista_participacion_normalizada p
where (select private.can_manage_teaching_assignment(
  p.tenant_id, p.asignacion_profesor_id
));

-- Read model 2: desglose con pesos y nombres, siempre limitado a una matrícula
-- y asignación autorizadas. No calcula ni persiste el total final.
create view public.vista_desglose_calificacion
with (security_invoker = true)
as
select l.tenant_id, l.ciclo_escolar_id, l.asignacion_profesor_id,
       l.periodo_evaluacion_id, l.inscripcion_alumno_id, l.alumno_id,
       l.criterio_evaluacion_id, c.nombre as criterio_nombre,
       c.tipo as criterio_tipo, c.peso as criterio_peso,
       l.subcriterio_evaluacion_id, s.nombre as subcriterio_nombre,
       s.tipo as subcriterio_tipo, s.peso_interno,
       l.tipo_fuente, l.fuente_id, l.estado, l.valor_fuente,
       l.escala_fuente, l.observacion, l.row_version, l.actualizado_at
from public.vista_libreta_profesor l
join public.criterios_evaluacion c
  on c.id = l.criterio_evaluacion_id and c.tenant_id = l.tenant_id
left join public.subcriterios_evaluacion s
  on s.id = l.subcriterio_evaluacion_id and s.tenant_id = l.tenant_id
where (select private.can_view_enrollment(
  l.tenant_id, l.inscripcion_alumno_id, l.asignacion_profesor_id
));

-- El desglose también debe estar disponible al propio alumno. Se parte de las
-- mismas fuentes, pero el filtro no permite reutilizar la vista de profesor.
create view public.vista_calificaciones_alumno
with (security_invoker = true)
as
select f.tenant_id, f.ciclo_escolar_id, f.asignacion_profesor_id,
       f.periodo_evaluacion_id, f.inscripcion_alumno_id, f.alumno_id,
       f.criterio_evaluacion_id, c.nombre as criterio_nombre,
       c.tipo as criterio_tipo, c.peso as criterio_peso,
       f.subcriterio_evaluacion_id, s.nombre as subcriterio_nombre,
       s.tipo as subcriterio_tipo, s.peso_interno,
       f.tipo_fuente, f.fuente_id, f.estado,
       f.calificacion::numeric(10,8) as valor_fuente,
       '0-10'::text as escala_fuente, f.observacion, f.row_version,
       f.calificado_at as actualizado_at
from public.vista_fuentes_calificacion f
join public.criterios_evaluacion c
  on c.id = f.criterio_evaluacion_id and c.tenant_id = f.tenant_id
left join public.subcriterios_evaluacion s
  on s.id = f.subcriterio_evaluacion_id and s.tenant_id = f.tenant_id
where f.alumno_id = (select auth.uid())
  and (select private.can_view_enrollment(
    f.tenant_id, f.inscripcion_alumno_id, f.asignacion_profesor_id
  ))
union all
select p.tenant_id, p.ciclo_escolar_id, p.asignacion_profesor_id,
       p.periodo_evaluacion_id, p.inscripcion_alumno_id, p.alumno_id,
       p.criterio_evaluacion_id, c.nombre, c.tipo, c.peso,
       p.subcriterio_evaluacion_id, s.nombre, s.tipo, s.peso_interno,
       'participation'::text, null::uuid,
       case when p.ratio_normalizado is null then 'pendiente' else 'calificado' end,
       p.ratio_normalizado::numeric(10,8), '0-1'::text, null::text,
       null::bigint, null::timestamptz
from public.vista_participacion_normalizada p
join public.criterios_evaluacion c
  on c.id = p.criterio_evaluacion_id and c.tenant_id = p.tenant_id
left join public.subcriterios_evaluacion s
  on s.id = p.subcriterio_evaluacion_id and s.tenant_id = p.tenant_id
where p.alumno_id = (select auth.uid())
  and (select private.can_view_enrollment(
    p.tenant_id, p.inscripcion_alumno_id, p.asignacion_profesor_id
  ));

revoke all on public.vista_fuentes_calificacion,
  public.vista_participacion_normalizada, public.vista_libreta_profesor,
  public.vista_desglose_calificacion, public.vista_calificaciones_alumno
  from public, anon, authenticated;
grant select on public.vista_fuentes_calificacion,
  public.vista_participacion_normalizada, public.vista_libreta_profesor,
  public.vista_desglose_calificacion, public.vista_calificaciones_alumno
  to authenticated, service_role;

comment on function private.can_manage_teaching_assignment(uuid, uuid) is
  'Autoriza admin/superuser del tenant o al profesor activo de la asignación exacta.';
comment on function private.can_view_enrollment(uuid, uuid, uuid) is
  'Autoriza matrícula activa y, para profesor, exige asignación exacta del mismo ciclo/grupo.';
comment on view public.vista_libreta_profesor is
  'Fuentes tenant-safe para profesor/admin; conserva por separado escalas 0-10 y 0-1.';
comment on view public.vista_desglose_calificacion is
  'Desglose autorizado con pesos; no calcula el total final del Paso 7.';
comment on view public.vista_calificaciones_alumno is
  'Fuentes y desglose visibles exclusivamente para el alumno autenticado.';

reset search_path;
