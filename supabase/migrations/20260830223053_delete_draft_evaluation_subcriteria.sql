-- El borrado se limita a subcriterios de un borrador editable perteneciente a
-- una asignación que el actor puede administrar. La política restrictiva de
-- tenant ya existente sigue aplicándose también a DELETE.
drop policy if exists academic_subcriterion_authorized_delete
  on public.subcriterios_evaluacion;

create policy academic_subcriterion_authorized_delete
  on public.subcriterios_evaluacion
  for delete to authenticated
  using (exists (
    select 1
    from public.criterios_evaluacion c
    join public.esquemas_evaluacion e
      on e.id = c.esquema_evaluacion_id
     and e.tenant_id = c.tenant_id
    join public.periodos_evaluacion p
      on p.id = e.periodo_evaluacion_id
     and p.tenant_id = e.tenant_id
    where c.id = subcriterios_evaluacion.criterio_evaluacion_id
      and c.tenant_id = subcriterios_evaluacion.tenant_id
      and e.estado = 'borrador'
      and p.estado <> 'cerrado'
      and (select private.can_manage_teaching_assignment(
        e.tenant_id, e.asignacion_profesor_id
      ))
  ));

grant delete on public.subcriterios_evaluacion to authenticated;
