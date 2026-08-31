-- Cambia el periodo activo de un ciclo en una sola transacción. La función
-- mantiene el control de concurrencia y deriva tenant/actor desde la sesión.
create or replace function public.activar_periodo_evaluacion(
  p_periodo_id uuid,
  p_ciclo_id uuid,
  p_expected_updated_at timestamptz,
  p_nombre text,
  p_orden smallint,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_color_semantico text
)
returns table (
  periodo_id uuid,
  updated_at timestamptz,
  estado text,
  periodo_anterior_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_period public.periodos_evaluacion%rowtype;
  previous_period_id uuid;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;

  select p.* into target_period
  from public.periodos_evaluacion p
  where p.id = p_periodo_id
    and p.ciclo_escolar_id = p_ciclo_id
  for update;

  if target_period.id is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_PERIOD_NOT_FOUND';
  end if;
  if not (select private.has_tenant_role(
    target_period.tenant_id, array['superuser', 'admin']::text[]
  )) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_PERIOD_FORBIDDEN';
  end if;
  if target_period.estado = 'cerrado' then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED';
  end if;
  if target_period.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_CONFLICT';
  end if;

  -- Todas las sesiones bloquean los periodos del ciclo en el mismo orden.
  perform 1
  from public.periodos_evaluacion p
  where p.tenant_id = target_period.tenant_id
    and p.ciclo_escolar_id = target_period.ciclo_escolar_id
  order by p.id
  for update;

  select p.id into previous_period_id
  from public.periodos_evaluacion p
  where p.tenant_id = target_period.tenant_id
    and p.ciclo_escolar_id = target_period.ciclo_escolar_id
    and p.estado = 'activo'
    and p.id <> target_period.id
  order by p.id
  limit 1;

  update public.periodos_evaluacion p
  set estado = 'borrador'
  where p.tenant_id = target_period.tenant_id
    and p.ciclo_escolar_id = target_period.ciclo_escolar_id
    and p.estado = 'activo'
    and p.id <> target_period.id;

  update public.periodos_evaluacion p
  set nombre = p_nombre,
      orden = p_orden,
      fecha_inicio = p_fecha_inicio,
      fecha_fin = p_fecha_fin,
      color_semantico = p_color_semantico,
      estado = 'activo'
  where p.id = target_period.id
    and p.tenant_id = target_period.tenant_id
  returning p.id, p.updated_at, p.estado
  into periodo_id, updated_at, estado;

  periodo_anterior_id := previous_period_id;
  return next;
end;
$$;

revoke all on function public.activar_periodo_evaluacion(
  uuid, uuid, timestamptz, text, smallint, date, date, text
) from public, anon, authenticated;
grant execute on function public.activar_periodo_evaluacion(
  uuid, uuid, timestamptz, text, smallint, date, date, text
) to authenticated, service_role;

comment on function public.activar_periodo_evaluacion(
  uuid, uuid, timestamptz, text, smallint, date, date, text
) is 'Activa atómicamente un periodo y devuelve el anterior a borrador dentro del mismo tenant/ciclo.';
