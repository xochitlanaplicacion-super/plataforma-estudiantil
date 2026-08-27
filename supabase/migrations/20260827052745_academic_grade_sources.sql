-- Paso 5: fuentes trazables de calificacion, escala canonica 0-10 y estados
-- separados del valor numerico. La migracion conserva filas historicas y no
-- activa todavia el editor matricial del Paso 6.

set search_path = public, extensions;

create unique index if not exists academic_exercises_id_tenant_uidx
  on public.ejercicios (id, tenant_id);
create unique index if not exists academic_enrollments_id_tenant_cycle_uidx
  on public.inscripciones_alumno (id, tenant_id, ciclo_escolar_id);
create unique index if not exists academic_enrollments_id_tenant_uidx
  on public.inscripciones_alumno (id, tenant_id);
create unique index if not exists academic_units_id_tenant_uidx
  on public.unidades (id, tenant_id);

create table public.vinculos_evaluacion_ejercicio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  criterio_evaluacion_id uuid not null,
  subcriterio_evaluacion_id uuid,
  ejercicio_id uuid not null,
  origen text not null,
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vinculos_evaluacion_origen_valido
    check (origen in ('automaticExercise', 'descriptiveSubmission')),
  constraint vinculos_evaluacion_id_tenant_unique unique (id, tenant_id),
  constraint vinculos_evaluacion_assignment_period_exercise_unique
    unique (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, ejercicio_id),
  constraint vinculos_evaluacion_exercise_period_unambiguous
    unique (tenant_id, periodo_evaluacion_id, ejercicio_id),
  constraint vinculos_evaluacion_assignment_tenant_cycle_fkey
    foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint vinculos_evaluacion_period_tenant_cycle_fkey
    foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion (id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint vinculos_evaluacion_criterion_tenant_fkey
    foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete restrict,
  constraint vinculos_evaluacion_subcriterion_tenant_fkey
    foreign key (subcriterio_evaluacion_id, tenant_id)
    references public.subcriterios_evaluacion (id, tenant_id) on delete restrict,
  constraint vinculos_evaluacion_exercise_tenant_fkey
    foreign key (ejercicio_id, tenant_id)
    references public.ejercicios (id, tenant_id) on delete restrict,
  constraint vinculos_evaluacion_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create index vinculos_evaluacion_assignment_period_idx
  on public.vinculos_evaluacion_ejercicio
    (tenant_id, asignacion_profesor_id, periodo_evaluacion_id);
create index vinculos_evaluacion_exercise_idx
  on public.vinculos_evaluacion_ejercicio (tenant_id, ejercicio_id);
create index vinculos_evaluacion_active_idx
  on public.vinculos_evaluacion_ejercicio
    (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, activo)
  where activo;

-- Preflight y conversion determinista del legado 0-100. Los resultados
-- automaticos anteriores a este paso se expresaban en porcentaje; las notas
-- manuales ya estaban en 0-10.
do $grade_scale_preflight$
begin
  if exists (
    select 1 from public.resultados_ejercicios
    where calificacion < 0 or calificacion > 100
       or calificacion_manual < 0 or calificacion_manual > 10
  ) then
    raise exception 'Hay calificaciones historicas fuera de los rangos conciliables 0-100/0-10';
  end if;
end
$grade_scale_preflight$;

alter table public.resultados_ejercicios
  alter column calificacion drop default,
  alter column calificacion type numeric(6,4)
    using case when calificacion > 10 then round(calificacion / 10.0, 4)
               else calificacion::numeric(6,4) end,
  alter column calificacion_manual type numeric(6,4)
    using calificacion_manual::numeric(6,4),
  alter column suma_calificaciones type numeric(14,4)
    using case when suma_calificaciones > (coalesce(intentos, 0) * 10)
               then round(suma_calificaciones / 10.0, 4)
               else suma_calificaciones::numeric(14,4) end,
  add column inscripcion_alumno_id uuid,
  add column vinculo_evaluacion_id uuid,
  add column unidad_origen_id uuid,
  add column origen text,
  add column observacion text,
  add column calificado_por uuid,
  add column calificado_at timestamptz,
  add column row_version bigint not null default 1,
  add column idempotency_key uuid,
  add column registro_legacy boolean not null default false,
  add column updated_at timestamptz not null default now();

update public.resultados_ejercicios r
set registro_legacy = true,
    calificacion = case
      when e.tipo = 'actividad_descriptiva' then r.calificacion_manual
      else coalesce(r.calificacion_manual, r.calificacion)
    end,
    estado = case
      when e.tipo = 'actividad_descriptiva' and r.calificacion_manual is null
        then case when r.archivo_path is null and r.archivo_url is null
                  then 'sin_capturar' else 'entregado' end
      when coalesce(r.calificacion_manual, r.calificacion) is not null then 'calificado'
      else 'pendiente'
    end,
    origen = case when e.tipo = 'actividad_descriptiva'
                  then 'descriptiveSubmission' else 'automaticExercise' end,
    calificado_at = case when coalesce(r.calificacion_manual, r.calificacion) is not null
                         then coalesce(r.fecha_completado, now()) end,
    updated_at = now()
from public.ejercicios e
where e.id = r.ejercicio_id and e.tenant_id = r.tenant_id;

-- El campo manual queda como espejo de compatibilidad, nunca como autoridad.
update public.resultados_ejercicios
set calificacion_manual = calificacion
where calificacion_manual is distinct from calificacion;

alter table public.resultados_ejercicios
  alter column estado set default 'sin_capturar',
  add constraint resultados_calificacion_0_10
    check (calificacion is null or calificacion between 0.0000 and 10.0000),
  add constraint resultados_manual_shadow_0_10
    check (calificacion_manual is null or calificacion_manual between 0.0000 and 10.0000),
  add constraint resultados_estado_valido
    check (estado in ('sin_capturar','pendiente','entregado','tardio','no_entregado','justificado','calificado')),
  add constraint resultados_estado_calificacion_coherente check (
    (estado = 'calificado' and calificacion is not null)
    or (estado <> 'calificado' and calificacion is null)
  ),
  add constraint resultados_origen_valido check (
    origen is null or origen in ('automaticExercise', 'descriptiveSubmission')
  ),
  add constraint resultados_version_positiva check (row_version > 0),
  add constraint resultados_contexto_canonico check (
    registro_legacy
    or (inscripcion_alumno_id is not null and vinculo_evaluacion_id is not null
        and unidad_origen_id is not null and origen is not null
        and (estado <> 'calificado' or (calificado_por is not null and calificado_at is not null)))
  ),
  add constraint resultados_id_tenant_unique unique (id, tenant_id),
  add constraint resultados_enrollment_tenant_cycle_fkey
    foreign key (inscripcion_alumno_id, tenant_id)
    references public.inscripciones_alumno (id, tenant_id) on delete restrict,
  add constraint resultados_link_tenant_fkey
    foreign key (vinculo_evaluacion_id, tenant_id)
    references public.vinculos_evaluacion_ejercicio (id, tenant_id) on delete restrict,
  add constraint resultados_unit_tenant_fkey
    foreign key (unidad_origen_id, tenant_id)
    references public.unidades (id, tenant_id) on delete restrict,
  add constraint resultados_grader_tenant_fkey
    foreign key (calificado_por, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict;

create unique index resultados_fuente_canonica_unique_idx
  on public.resultados_ejercicios
    (tenant_id, inscripcion_alumno_id, vinculo_evaluacion_id)
  where not registro_legacy;
create unique index resultados_idempotency_unique_idx
  on public.resultados_ejercicios (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index resultados_assignment_period_idx
  on public.resultados_ejercicios (tenant_id, vinculo_evaluacion_id, inscripcion_alumno_id)
  where not registro_legacy;
create index resultados_student_idx
  on public.resultados_ejercicios (tenant_id, alumno_id, inscripcion_alumno_id);

create table public.calificaciones_directas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  criterio_evaluacion_id uuid not null,
  subcriterio_evaluacion_id uuid,
  inscripcion_alumno_id uuid not null,
  alumno_id uuid not null,
  estado text not null default 'sin_capturar',
  calificacion numeric(6,4),
  observacion text,
  calificado_por uuid,
  calificado_at timestamptz,
  row_version bigint not null default 1,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calificaciones_directas_estado_valido
    check (estado in ('sin_capturar','pendiente','entregado','tardio','no_entregado','justificado','calificado')),
  constraint calificaciones_directas_0_10
    check (calificacion is null or calificacion between 0.0000 and 10.0000),
  constraint calificaciones_directas_estado_calificacion_coherente check (
    (estado = 'calificado' and calificacion is not null)
    or (estado <> 'calificado' and calificacion is null)
  ),
  constraint calificaciones_directas_actor_coherente check (
    (estado = 'calificado' and calificado_por is not null and calificado_at is not null)
    or (estado <> 'calificado' and calificado_por is null and calificado_at is null)
  ),
  constraint calificaciones_directas_version_positiva check (row_version > 0),
  constraint calificaciones_directas_id_tenant_unique unique (id, tenant_id),
  constraint calificaciones_directas_assignment_tenant_cycle_fkey
    foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint calificaciones_directas_period_tenant_cycle_fkey
    foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint calificaciones_directas_criterion_tenant_fkey
    foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete restrict,
  constraint calificaciones_directas_subcriterion_tenant_fkey
    foreign key (subcriterio_evaluacion_id, tenant_id)
    references public.subcriterios_evaluacion (id, tenant_id) on delete restrict,
  constraint calificaciones_directas_enrollment_tenant_cycle_fkey
    foreign key (inscripcion_alumno_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint calificaciones_directas_student_tenant_fkey
    foreign key (alumno_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint calificaciones_directas_grader_tenant_fkey
    foreign key (calificado_por, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create unique index calificaciones_directas_fuente_unique_idx
  on public.calificaciones_directas
    (tenant_id, inscripcion_alumno_id, criterio_evaluacion_id,
     coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index calificaciones_directas_idempotency_unique_idx
  on public.calificaciones_directas (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index calificaciones_directas_assignment_period_idx
  on public.calificaciones_directas
    (tenant_id, asignacion_profesor_id, periodo_evaluacion_id);
create index calificaciones_directas_student_idx
  on public.calificaciones_directas (tenant_id, inscripcion_alumno_id);

create table public.eventos_participacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  criterio_evaluacion_id uuid not null,
  subcriterio_evaluacion_id uuid,
  inscripcion_alumno_id uuid not null,
  alumno_id uuid not null,
  tipo_evento text not null default 'registro',
  puntos numeric(10,8) not null,
  reversa_de_id uuid,
  modo_normalizacion text not null,
  meta_objetivo numeric(10,8),
  maximo_computable numeric(10,8),
  regla_denominador_cero text not null default 'cero',
  observacion text,
  actor_id uuid not null,
  idempotency_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint eventos_participacion_tipo_valido check (tipo_evento in ('registro','reversa')),
  constraint eventos_participacion_puntos_positivos check (puntos > 0),
  constraint eventos_participacion_modo_valido
    check (modo_normalizacion in ('maximo_grupo','meta_fija')),
  constraint eventos_participacion_config_valida check (
    (modo_normalizacion = 'meta_fija' and meta_objetivo > 0)
    or (modo_normalizacion = 'maximo_grupo' and meta_objetivo is null)
  ),
  constraint eventos_participacion_maximo_valido
    check (maximo_computable is null or maximo_computable > 0),
  constraint eventos_participacion_denominador_cero
    check (regla_denominador_cero in ('cero','excluir')),
  constraint eventos_participacion_reversa_coherente check (
    (tipo_evento = 'registro' and reversa_de_id is null)
    or (tipo_evento = 'reversa' and reversa_de_id is not null)
  ),
  constraint eventos_participacion_id_tenant_unique unique (id, tenant_id),
  constraint eventos_participacion_idempotency_unique unique (tenant_id, idempotency_key),
  constraint eventos_participacion_reversa_unique unique (tenant_id, reversa_de_id),
  constraint eventos_participacion_assignment_tenant_cycle_fkey
    foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint eventos_participacion_period_tenant_cycle_fkey
    foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint eventos_participacion_criterion_tenant_fkey
    foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete restrict,
  constraint eventos_participacion_subcriterion_tenant_fkey
    foreign key (subcriterio_evaluacion_id, tenant_id)
    references public.subcriterios_evaluacion (id, tenant_id) on delete restrict,
  constraint eventos_participacion_enrollment_tenant_cycle_fkey
    foreign key (inscripcion_alumno_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint eventos_participacion_student_tenant_fkey
    foreign key (alumno_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint eventos_participacion_actor_tenant_fkey
    foreign key (actor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint eventos_participacion_reversa_tenant_fkey
    foreign key (reversa_de_id, tenant_id)
    references public.eventos_participacion (id, tenant_id) on delete restrict
);

create index eventos_participacion_assignment_period_idx
  on public.eventos_participacion
    (tenant_id, asignacion_profesor_id, periodo_evaluacion_id);
create index eventos_participacion_student_idx
  on public.eventos_participacion (tenant_id, inscripcion_alumno_id, created_at);
create index eventos_participacion_criterion_idx
  on public.eventos_participacion
    (tenant_id, criterio_evaluacion_id, subcriterio_evaluacion_id);

create or replace function private.validate_evaluation_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_materia uuid;
  scheme_assignment uuid;
  scheme_period uuid;
  criterion_kind text;
  subcriterion_parent uuid;
  subcriterion_kind text;
  exercise_kind text;
  exercise_materia uuid;
begin
  select a.materia_id into assignment_materia
  from public.asignaciones_profesor a
  where a.id = new.asignacion_profesor_id
    and a.tenant_id = new.tenant_id
    and a.ciclo_escolar_id = new.ciclo_escolar_id;

  select e.asignacion_profesor_id, e.periodo_evaluacion_id, c.tipo
    into scheme_assignment, scheme_period, criterion_kind
  from public.criterios_evaluacion c
  join public.esquemas_evaluacion e
    on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
  where c.id = new.criterio_evaluacion_id and c.tenant_id = new.tenant_id;

  if new.subcriterio_evaluacion_id is not null then
    select s.criterio_evaluacion_id, s.tipo
      into subcriterion_parent, subcriterion_kind
    from public.subcriterios_evaluacion s
    where s.id = new.subcriterio_evaluacion_id and s.tenant_id = new.tenant_id;
    if subcriterion_parent is distinct from new.criterio_evaluacion_id then
      raise exception 'El subcriterio no pertenece al criterio del vinculo';
    end if;
  end if;

  select e.tipo, u.materia_id into exercise_kind, exercise_materia
  from public.ejercicios e
  join public.temas t on t.id = e.tema_id and t.tenant_id = e.tenant_id
  join public.unidades u on u.id = t.unidad_id and u.tenant_id = t.tenant_id
  where e.id = new.ejercicio_id and e.tenant_id = new.tenant_id;

  if assignment_materia is null or exercise_materia is null
     or assignment_materia is distinct from exercise_materia then
    raise exception 'El ejercicio no pertenece a la materia de la asignacion';
  end if;
  if scheme_assignment is distinct from new.asignacion_profesor_id
     or scheme_period is distinct from new.periodo_evaluacion_id then
    raise exception 'El criterio no pertenece a la asignacion y periodo del vinculo';
  end if;
  if coalesce(subcriterion_kind, criterion_kind) not in ('actividades','hibrido') then
    raise exception 'Solo criterios de actividades pueden vincular ejercicios';
  end if;
  if (exercise_kind = 'actividad_descriptiva') is distinct from
     (new.origen = 'descriptiveSubmission') then
    raise exception 'El origen no coincide con el tipo del ejercicio';
  end if;
  return new;
end;
$$;

create or replace function private.validate_grade_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_group uuid;
  enrollment_group uuid;
  scheme_assignment uuid;
  scheme_period uuid;
  criterion_kind text;
  subcriterion_parent uuid;
  subcriterion_kind text;
begin
  select a.grupo_id into assignment_group
  from public.asignaciones_profesor a
  where a.id = new.asignacion_profesor_id and a.tenant_id = new.tenant_id
    and a.ciclo_escolar_id = new.ciclo_escolar_id;
  select i.grupo_id into enrollment_group
  from public.inscripciones_alumno i
  where i.id = new.inscripcion_alumno_id and i.tenant_id = new.tenant_id
    and i.ciclo_escolar_id = new.ciclo_escolar_id and i.activo;
  if not exists (
    select 1 from public.inscripciones_alumno i
    where i.id = new.inscripcion_alumno_id and i.tenant_id = new.tenant_id
      and i.alumno_id = new.alumno_id
  ) then
    raise exception 'El alumno no coincide con la inscripcion';
  end if;
  if assignment_group is null or enrollment_group is null
     or assignment_group is distinct from enrollment_group then
    raise exception 'La inscripcion no pertenece al grupo/ciclo de la asignacion';
  end if;

  select e.asignacion_profesor_id, e.periodo_evaluacion_id, c.tipo
    into scheme_assignment, scheme_period, criterion_kind
  from public.criterios_evaluacion c
  join public.esquemas_evaluacion e
    on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
  where c.id = new.criterio_evaluacion_id and c.tenant_id = new.tenant_id;
  if scheme_assignment is distinct from new.asignacion_profesor_id
     or scheme_period is distinct from new.periodo_evaluacion_id then
    raise exception 'El criterio no pertenece a la asignacion y periodo indicados';
  end if;

  if new.subcriterio_evaluacion_id is not null then
    select s.criterio_evaluacion_id, s.tipo
      into subcriterion_parent, subcriterion_kind
    from public.subcriterios_evaluacion s
    where s.id = new.subcriterio_evaluacion_id and s.tenant_id = new.tenant_id;
    if subcriterion_parent is distinct from new.criterio_evaluacion_id then
      raise exception 'El subcriterio no pertenece al criterio indicado';
    end if;
  end if;

  if tg_table_name = 'calificaciones_directas' then
    if coalesce(subcriterion_kind, criterion_kind) not in ('directo','hibrido') then
      raise exception 'La calificacion directa exige un criterio directo';
    end if;
    if exists (
      select 1 from public.vinculos_evaluacion_ejercicio v
      where v.tenant_id = new.tenant_id
        and v.criterio_evaluacion_id = new.criterio_evaluacion_id
        and v.subcriterio_evaluacion_id is not distinct from new.subcriterio_evaluacion_id
        and v.activo
    ) then
      raise exception 'Un criterio vinculado a ejercicio no admite calificacion directa';
    end if;
  elsif coalesce(subcriterion_kind, criterion_kind) <> 'participacion' then
    raise exception 'El evento exige un criterio de participacion';
  end if;
  return new;
end;
$$;

create or replace function private.validate_exercise_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  enrollment_student uuid;
  enrollment_group uuid;
  link_exercise uuid;
  link_origin text;
  link_assignment uuid;
  assignment_group uuid;
  source_unit uuid;
begin
  if tg_op = 'UPDATE' then
    new.row_version := old.row_version + 1;
    new.updated_at := now();
  end if;

  -- Sombra temporal para consumidores antiguos: siempre copia el canonico.
  new.calificacion_manual := new.calificacion;
  if new.estado = 'calificado' then
    new.calificado_at := coalesce(new.calificado_at, now());
  else
    new.calificado_at := null;
    new.calificado_por := null;
  end if;

  if new.registro_legacy then
    if tg_op = 'INSERT' then
      raise exception 'No se pueden crear resultados legacy nuevos';
    end if;
    return new;
  end if;

  select i.alumno_id, i.grupo_id into enrollment_student, enrollment_group
  from public.inscripciones_alumno i
  where i.id = new.inscripcion_alumno_id and i.tenant_id = new.tenant_id and i.activo;
  select v.ejercicio_id, v.origen, v.asignacion_profesor_id
    into link_exercise, link_origin, link_assignment
  from public.vinculos_evaluacion_ejercicio v
  where v.id = new.vinculo_evaluacion_id and v.tenant_id = new.tenant_id and v.activo;
  select a.grupo_id into assignment_group
  from public.asignaciones_profesor a
  where a.id = link_assignment and a.tenant_id = new.tenant_id and a.activo;
  select t.unidad_id into source_unit
  from public.ejercicios e
  join public.temas t on t.id = e.tema_id and t.tenant_id = e.tenant_id
  where e.id = link_exercise and e.tenant_id = new.tenant_id;

  if enrollment_student is distinct from new.alumno_id
     or enrollment_group is distinct from assignment_group
     or link_exercise is distinct from new.ejercicio_id
     or link_origin is distinct from new.origen
     or source_unit is distinct from new.unidad_origen_id then
    raise exception 'El resultado no coincide con su inscripcion, vinculo o unidad de origen';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_participation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'eventos_participacion es append-only; registre una reversa';
end;
$$;

create or replace function private.validate_participation_reversal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare original public.eventos_participacion%rowtype;
begin
  if new.tipo_evento = 'reversa' then
    select * into original from public.eventos_participacion
    where id = new.reversa_de_id and tenant_id = new.tenant_id
    for key share;
    if original.id is null or original.tipo_evento <> 'registro'
       or original.ciclo_escolar_id <> new.ciclo_escolar_id
       or original.asignacion_profesor_id <> new.asignacion_profesor_id
       or original.periodo_evaluacion_id <> new.periodo_evaluacion_id
       or original.criterio_evaluacion_id <> new.criterio_evaluacion_id
       or original.subcriterio_evaluacion_id is distinct from new.subcriterio_evaluacion_id
       or original.inscripcion_alumno_id <> new.inscripcion_alumno_id
       or original.puntos <> new.puntos then
      raise exception 'La reversa debe reproducir exactamente el evento original';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_evaluation_link
  before insert or update on public.vinculos_evaluacion_ejercicio
  for each row execute function private.validate_evaluation_link();
create trigger validate_exercise_result
  before insert or update on public.resultados_ejercicios
  for each row execute function private.validate_exercise_result();
create trigger validate_direct_grade_context
  before insert or update on public.calificaciones_directas
  for each row execute function private.validate_grade_context();
create trigger validate_participation_context
  before insert on public.eventos_participacion
  for each row execute function private.validate_grade_context();
create trigger validate_participation_reversal
  before insert on public.eventos_participacion
  for each row execute function private.validate_participation_reversal();
create trigger prevent_participation_update_delete
  before update or delete on public.eventos_participacion
  for each row execute function private.prevent_participation_mutation();

create trigger touch_evaluation_link_updated_at
  before update on public.vinculos_evaluacion_ejercicio
  for each row execute function private.touch_academic_updated_at();
create trigger touch_direct_grade_updated_at
  before update on public.calificaciones_directas
  for each row execute function private.touch_academic_updated_at();

create or replace function private.prepare_direct_grade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.row_version := old.row_version + 1;
  end if;
  if new.estado = 'calificado' then
    new.calificado_por := coalesce(new.calificado_por, (select auth.uid()));
    new.calificado_at := coalesce(new.calificado_at, now());
  else
    new.calificado_por := null;
    new.calificado_at := null;
  end if;
  return new;
end;
$$;
create trigger prepare_direct_grade
  before insert or update on public.calificaciones_directas
  for each row execute function private.prepare_direct_grade();

-- Read models only expose rows already authorized by RLS on their source
-- tables because both views execute with security_invoker.
create view public.vista_fuentes_calificacion
with (security_invoker = true)
as
select r.tenant_id,
       v.ciclo_escolar_id,
       v.asignacion_profesor_id,
       v.periodo_evaluacion_id,
       v.criterio_evaluacion_id,
       v.subcriterio_evaluacion_id,
       r.inscripcion_alumno_id,
       r.alumno_id,
       r.origen as tipo_fuente,
       r.id as fuente_id,
       r.ejercicio_id,
       r.estado,
       r.calificacion,
       r.observacion,
       r.calificado_por,
       r.calificado_at,
       r.row_version,
       r.registro_legacy
from public.resultados_ejercicios r
left join public.vinculos_evaluacion_ejercicio v
  on v.id = r.vinculo_evaluacion_id and v.tenant_id = r.tenant_id
union all
select d.tenant_id,
       d.ciclo_escolar_id,
       d.asignacion_profesor_id,
       d.periodo_evaluacion_id,
       d.criterio_evaluacion_id,
       d.subcriterio_evaluacion_id,
       d.inscripcion_alumno_id,
       d.alumno_id,
       'directCriterion'::text,
       d.id,
       null::uuid,
       d.estado,
       d.calificacion,
       d.observacion,
       d.calificado_por,
       d.calificado_at,
       d.row_version,
       false
from public.calificaciones_directas d;

create view public.vista_participacion_normalizada
with (security_invoker = true)
as
with net as (
  select e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
         e.periodo_evaluacion_id, e.criterio_evaluacion_id,
         e.subcriterio_evaluacion_id, e.inscripcion_alumno_id, e.alumno_id,
         e.modo_normalizacion, e.meta_objetivo, e.regla_denominador_cero,
         max(e.maximo_computable)::numeric(18,8) as maximo_computable,
         sum(case when e.tipo_evento = 'registro' then e.puntos else -e.puntos end)
           ::numeric(18,8) as puntos_netos
  from public.eventos_participacion e
  group by e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
           e.periodo_evaluacion_id, e.criterio_evaluacion_id,
           e.subcriterio_evaluacion_id, e.inscripcion_alumno_id, e.alumno_id,
           e.modo_normalizacion, e.meta_objetivo, e.regla_denominador_cero
), denominators as (
  select n.*,
         case when n.modo_normalizacion = 'meta_fija' then n.meta_objetivo
              else coalesce(n.maximo_computable, max(n.puntos_netos) over (
                partition by n.tenant_id, n.asignacion_profesor_id,
                  n.periodo_evaluacion_id, n.criterio_evaluacion_id,
                  n.subcriterio_evaluacion_id
              )) end::numeric(18,8) as denominador
  from net n
)
select d.*,
       case
         when d.denominador > 0 then
           least(1.00000000, greatest(0.00000000, d.puntos_netos / d.denominador))::numeric(10,8)
         when d.regla_denominador_cero = 'cero' then 0.00000000::numeric(10,8)
         else null::numeric(10,8)
       end as ratio_normalizado
from denominators d;

-- Se sustituyen las politicas historicas de resultados: contenian lectura de
-- tenant completo y escritura directa de alumnos/profesores sobre la nota.
do $drop_result_policies$
declare policy_name text;
begin
  for policy_name in
    select polname from pg_policy
    where polrelid = 'public.resultados_ejercicios'::regclass
  loop
    execute format('drop policy %I on public.resultados_ejercicios', policy_name);
  end loop;
end
$drop_result_policies$;

alter table public.resultados_ejercicios enable row level security;
alter table public.resultados_ejercicios force row level security;
alter table public.vinculos_evaluacion_ejercicio enable row level security;
alter table public.vinculos_evaluacion_ejercicio force row level security;
alter table public.calificaciones_directas enable row level security;
alter table public.calificaciones_directas force row level security;
alter table public.eventos_participacion enable row level security;
alter table public.eventos_participacion force row level security;

create policy academic_active_tenant_boundary on public.resultados_ejercicios
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_result_admin_select on public.resultados_ejercicios
  for select to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_result_student_own_select on public.resultados_ejercicios
  for select to authenticated using (alumno_id = (select auth.uid()));
create policy academic_result_professor_assignment_select on public.resultados_ejercicios
  for select to authenticated using (
    exists (
      select 1
      from public.vinculos_evaluacion_ejercicio v
      join public.asignaciones_profesor a
        on a.id = v.asignacion_profesor_id and a.tenant_id = v.tenant_id
      where v.id = resultados_ejercicios.vinculo_evaluacion_id
        and v.tenant_id = resultados_ejercicios.tenant_id
        and a.profesor_id = (select auth.uid()) and a.activo
    )
  );

create policy academic_active_tenant_boundary on public.vinculos_evaluacion_ejercicio
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_link_admin_manage on public.vinculos_evaluacion_ejercicio
  for all to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])))
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_link_professor_own_manage on public.vinculos_evaluacion_ejercicio
  for all to authenticated
  using (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ))
  with check (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));

create policy academic_active_tenant_boundary on public.calificaciones_directas
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_direct_admin_manage on public.calificaciones_directas
  for all to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])))
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_direct_professor_own_manage on public.calificaciones_directas
  for all to authenticated
  using (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ))
  with check (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));
create policy academic_direct_student_own_select on public.calificaciones_directas
  for select to authenticated using (alumno_id = (select auth.uid()));

create policy academic_active_tenant_boundary on public.eventos_participacion
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_participation_admin_select on public.eventos_participacion
  for select to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_participation_admin_insert on public.eventos_participacion
  for insert to authenticated
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_participation_professor_own_select on public.eventos_participacion
  for select to authenticated using (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));
create policy academic_participation_professor_own_insert on public.eventos_participacion
  for insert to authenticated with check (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = asignacion_profesor_id and a.tenant_id = tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
      and actor_id = (select auth.uid())
  ));
create policy academic_participation_student_own_select on public.eventos_participacion
  for select to authenticated using (alumno_id = (select auth.uid()));

revoke all on public.resultados_ejercicios,
  public.vinculos_evaluacion_ejercicio, public.calificaciones_directas,
  public.eventos_participacion from public, anon, authenticated;
grant select on public.resultados_ejercicios to authenticated;
grant select, insert, update on public.vinculos_evaluacion_ejercicio,
  public.calificaciones_directas to authenticated;
grant select, insert on public.eventos_participacion to authenticated;
grant select, insert, update, delete on public.resultados_ejercicios,
  public.vinculos_evaluacion_ejercicio, public.calificaciones_directas,
  public.eventos_participacion to service_role;

revoke all on public.vista_fuentes_calificacion,
  public.vista_participacion_normalizada from public, anon;
grant select on public.vista_fuentes_calificacion,
  public.vista_participacion_normalizada to authenticated, service_role;

comment on table public.vinculos_evaluacion_ejercicio is
  'Relacion inequivoca ejercicio-asignacion-periodo-criterio dentro del mismo tenant.';
comment on column public.resultados_ejercicios.calificacion is
  'Unica calificacion canonica 0-10; calificacion_manual es una sombra legacy temporal.';
comment on table public.calificaciones_directas is
  'Notas 0-10 para criterios sin ejercicio; la tabla no contiene ejercicio_id.';
comment on table public.eventos_participacion is
  'Ledger append-only: las correcciones se expresan como eventos de reversa positivos.';

revoke all on function private.validate_evaluation_link(),
  private.validate_grade_context(), private.validate_exercise_result(),
  private.prevent_participation_mutation(), private.validate_participation_reversal(),
  private.prepare_direct_grade() from public, anon, authenticated;

reset search_path;
