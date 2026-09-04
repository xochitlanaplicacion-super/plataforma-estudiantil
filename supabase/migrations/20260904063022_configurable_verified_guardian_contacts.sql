-- Cada institución decide si una entrega extraordinaria exige que la persona
-- que autoriza ya exista como contacto oficial verificado. El valor seguro y
-- compatible con el comportamiento previo es true.
alter table public.filter_alert_settings
  add column if not exists require_verified_guardian_contact boolean not null default true;

-- El contacto puede ser nulo únicamente cuando la política aplicada al
-- expediente permitía documentar la autorización manualmente. La FK compuesta
-- existente sigue validando tenant y alumno cuando sí se proporciona un id.
alter table public.filter_extraordinary_handoffs
  alter column guardian_contact_id drop not null,
  add column if not exists verified_guardian_contact_required boolean not null default true;

do $constraint$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'filter_extraordinary_required_guardian_check'
       and conrelid = 'public.filter_extraordinary_handoffs'::regclass
  ) then
    alter table public.filter_extraordinary_handoffs
      add constraint filter_extraordinary_required_guardian_check
      check (not verified_guardian_contact_required or guardian_contact_id is not null)
      not valid;
  end if;
end
$constraint$;

alter table public.filter_extraordinary_handoffs
  validate constraint filter_extraordinary_required_guardian_check;

-- La aplicación inserta con service_role después de cargar las evidencias. La
-- política y el estado del contacto deben releerse al momento exacto del
-- INSERT, no confiarse al valor que envió el cliente varios segundos antes.
-- Los bloqueos FOR SHARE impiden que la política o el contacto se modifiquen
-- hasta que termine la transacción que crea el expediente.
create or replace function private.enforce_extraordinary_guardian_policy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  guardian_is_required boolean := true;
begin
  select settings.require_verified_guardian_contact
    into guardian_is_required
    from public.filter_alert_settings as settings
   where settings.tenant_id = new.tenant_id
   for share;

  -- Ante una fila de configuración ausente se conserva el comportamiento
  -- seguro: exigir contacto verificado.
  if not found then
    guardian_is_required := true;
  end if;

  -- La instantánea histórica siempre la deriva el servidor. Un payload no
  -- puede declarar una política más permisiva que la vigente.
  new.verified_guardian_contact_required := guardian_is_required;

  if new.guardian_contact_id is null then
    if guardian_is_required then
      raise exception using
        errcode = '23514',
        message = 'La política institucional exige un contacto oficial verificado.';
    end if;
  else
    perform 1
      from public.filter_guardian_contacts as guardian
     where guardian.id = new.guardian_contact_id
       and guardian.tenant_id = new.tenant_id
       and guardian.student_id = new.student_id
       and guardian.active
       and guardian.verification_status = 'verified'
     for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'El contacto seleccionado no está activo y verificado para este alumno e institución.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_extraordinary_guardian_policy()
  from public, anon, authenticated;
grant execute on function private.enforce_extraordinary_guardian_policy()
  to service_role;

drop trigger if exists filter_extraordinary_guardian_policy_guard
  on public.filter_extraordinary_handoffs;
create trigger filter_extraordinary_guardian_policy_guard
before insert on public.filter_extraordinary_handoffs
for each row execute function private.enforce_extraordinary_guardian_policy();

-- La lectura continúa protegida por tenant, pero ninguna sesión authenticated
-- puede relajar la política escribiendo directamente por Data API. Las
-- mutaciones pasan por el servidor (service_role) y por la RPC auditada.
drop policy if exists filter_tenant_access on public.filter_alert_settings;
create policy filter_alert_settings_read
on public.filter_alert_settings
for select
to authenticated
using ((select private.has_filter_access(tenant_id)));

revoke all on table public.filter_alert_settings from anon, authenticated;
grant select on table public.filter_alert_settings to authenticated;
grant select, insert, update, delete on table public.filter_alert_settings
  to service_role;

-- Punto de escritura transaccional para la acción servidor. Valida que el
-- actor siga activo en el mismo tenant, actualiza la configuración y crea la
-- auditoría en una sola transacción: si cualquiera falla, todo se revierte.
create or replace function public.update_filter_alert_settings_atomic(
  target_tenant_id uuid,
  actor_id uuid,
  setting_enabled boolean,
  setting_threshold integer,
  setting_window_unit text,
  setting_window_value integer,
  setting_require_verified_guardian_contact boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor_display_name text;
  previous_settings jsonb;
  saved_settings public.filter_alert_settings%rowtype;
  changed_at timestamptz := now();
begin
  if target_tenant_id is null
     or actor_id is null
     or setting_enabled is null
     or setting_require_verified_guardian_contact is null
     or setting_threshold is null
     or setting_threshold not between 1 and 100
     or setting_window_unit not in ('days', 'months', 'years', 'global')
     or setting_window_value is null
     or setting_window_value not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'La configuración de alertas recibida no es válida.';
  end if;

  select coalesce(
           nullif(concat_ws(' ', nullif(btrim(profile.nombre), ''), nullif(btrim(profile.apellidos), '')), ''),
           'Usuario autorizado'
         )
    into actor_display_name
    from public.profiles as profile
   where profile.id = actor_id
     and profile.tenant_id = target_tenant_id
     and profile.estatus = 'activo'
     and profile.rol::text in ('superuser', 'admin', 'encargado_filtro')
   for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'El actor no está autorizado para modificar esta política institucional.';
  end if;

  perform 1
    from public.tenant_features as feature
   where feature.tenant_id = target_tenant_id
     and feature.primary_filter_enabled
   for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'El servicio Control de Filtro no está activo para esta institución.';
  end if;

  select to_jsonb(settings)
    into previous_settings
    from public.filter_alert_settings as settings
   where settings.tenant_id = target_tenant_id
   for update;

  insert into public.filter_alert_settings (
    tenant_id,
    enabled,
    threshold,
    window_unit,
    window_value,
    require_verified_guardian_contact,
    updated_at,
    updated_by
  ) values (
    target_tenant_id,
    setting_enabled,
    setting_threshold,
    setting_window_unit,
    setting_window_value,
    setting_require_verified_guardian_contact,
    changed_at,
    actor_id
  )
  on conflict (tenant_id) do update set
    enabled = excluded.enabled,
    threshold = excluded.threshold,
    window_unit = excluded.window_unit,
    window_value = excluded.window_value,
    require_verified_guardian_contact = excluded.require_verified_guardian_contact,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning * into saved_settings;

  insert into public.filter_audit_log (
    tenant_id,
    actor_user_id,
    actor_name,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    target_tenant_id,
    actor_id,
    actor_display_name,
    'alert_settings.updated',
    'settings',
    target_tenant_id::text,
    jsonb_build_object(
      'previous', previous_settings,
      'enabled', saved_settings.enabled,
      'threshold', saved_settings.threshold,
      'windowUnit', saved_settings.window_unit,
      'windowValue', saved_settings.window_value,
      'requireVerifiedGuardianContact', saved_settings.require_verified_guardian_contact
    )
  );

  return to_jsonb(saved_settings);
end
$function$;

revoke all on function public.update_filter_alert_settings_atomic(
  uuid, uuid, boolean, integer, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.update_filter_alert_settings_atomic(
  uuid, uuid, boolean, integer, text, integer, boolean
) to service_role;

comment on function public.update_filter_alert_settings_atomic(
  uuid, uuid, boolean, integer, text, integer, boolean
) is 'Actualiza políticas de Control de Filtro y su auditoría en una sola transacción; sólo invocable por service_role.';
