-- Audiencias jerárquicas para encuestas: nivel -> carrera -> grado -> grupo.
-- Los filtros siempre pertenecen al mismo tenant y los profesores sólo alcanzan
-- alumnos de grupos que tienen asignados activamente.

create unique index if not exists niveles_id_tenant_id_key
  on public.niveles (id, tenant_id);
create unique index if not exists carreras_id_tenant_id_key
  on public.carreras (id, tenant_id);
create unique index if not exists grados_id_tenant_id_key
  on public.grados (id, tenant_id);

alter table public.encuestas
  add column if not exists nivel_id uuid,
  add column if not exists carrera_id uuid,
  add column if not exists grado_id uuid,
  add column if not exists restringir_a_asignaciones boolean not null default false;

-- Conservar las encuestas de grupo ya existentes y completar su ruta académica.
update public.encuestas e
set grado_id = g.grado_id,
    carrera_id = g.carrera_id,
    nivel_id = c.nivel_id
from public.grupos g
join public.carreras c
  on c.id = g.carrera_id
 and c.tenant_id = g.tenant_id
where e.grupo_id = g.id
  and e.tenant_id = g.tenant_id
  and (e.grado_id is null or e.carrera_id is null or e.nivel_id is null);

update public.encuestas e
set restringir_a_asignaciones = true
from public.profiles p
where p.id = e.creador_id
  and p.tenant_id = e.tenant_id
  and p.rol::text = 'profesor';

alter table public.encuestas
  drop constraint if exists encuestas_profesores_sin_grupo;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encuestas_nivel_tenant_fkey'
      and conrelid = 'public.encuestas'::regclass
  ) then
    alter table public.encuestas
      add constraint encuestas_nivel_tenant_fkey
      foreign key (nivel_id, tenant_id)
      references public.niveles (id, tenant_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'encuestas_carrera_tenant_fkey'
      and conrelid = 'public.encuestas'::regclass
  ) then
    alter table public.encuestas
      add constraint encuestas_carrera_tenant_fkey
      foreign key (carrera_id, tenant_id)
      references public.carreras (id, tenant_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'encuestas_grado_tenant_fkey'
      and conrelid = 'public.encuestas'::regclass
  ) then
    alter table public.encuestas
      add constraint encuestas_grado_tenant_fkey
      foreign key (grado_id, tenant_id)
      references public.grados (id, tenant_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'encuestas_destino_jerarquico_check'
      and conrelid = 'public.encuestas'::regclass
  ) then
    alter table public.encuestas
      add constraint encuestas_destino_jerarquico_check check (
        (carrera_id is null or nivel_id is not null)
        and (grado_id is null or carrera_id is not null)
        and (grupo_id is null or grado_id is not null)
      );
  end if;
end $$;

create index if not exists encuestas_nivel_tenant_idx
  on public.encuestas (nivel_id, tenant_id) where nivel_id is not null;
create index if not exists encuestas_carrera_tenant_idx
  on public.encuestas (carrera_id, tenant_id) where carrera_id is not null;
create index if not exists encuestas_grado_tenant_idx
  on public.encuestas (grado_id, tenant_id) where grado_id is not null;
create index if not exists encuestas_grupo_tenant_idx
  on public.encuestas (grupo_id, tenant_id) where grupo_id is not null;
create index if not exists encuestas_audiencia_jerarquia_idx
  on public.encuestas (
    tenant_id, audiencia, nivel_id, carrera_id, grado_id, grupo_id, activa
  );

create or replace function private.profile_matches_encuesta(
  target_encuesta_id uuid,
  target_tenant_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.encuestas e
    join public.profiles p
      on p.id = target_profile_id
     and p.tenant_id = e.tenant_id
     and p.estatus = 'activo'
    left join public.grupos pg
      on pg.id = p.grupo_id
     and pg.tenant_id = p.tenant_id
    left join public.carreras pc
      on pc.id = coalesce(p.carrera_id, pg.carrera_id)
     and pc.tenant_id = p.tenant_id
    where e.id = target_encuesta_id
      and e.tenant_id = target_tenant_id
      and p.rol::text = e.audiencia
      and (
        (
          e.audiencia = 'alumno'
          and (e.nivel_id is null or pc.nivel_id = e.nivel_id)
          and (e.carrera_id is null or coalesce(p.carrera_id, pg.carrera_id) = e.carrera_id)
          and (e.grado_id is null or pg.grado_id = e.grado_id)
          and (e.grupo_id is null or p.grupo_id = e.grupo_id)
          and (
            not e.restringir_a_asignaciones
            or exists (
              select 1
              from public.asignaciones_profesor ap
              where ap.tenant_id = e.tenant_id
                and ap.profesor_id = e.creador_id
                and ap.grupo_id = p.grupo_id
                and ap.activo
            )
          )
        )
        or (
          e.audiencia = 'profesor'
          and (
            (
              e.nivel_id is null and e.carrera_id is null
              and e.grado_id is null and e.grupo_id is null
            )
            or exists (
              select 1
              from public.asignaciones_profesor ap
              left join public.grupos ag
                on ag.id = ap.grupo_id
               and ag.tenant_id = ap.tenant_id
              left join public.carreras ac
                on ac.id = coalesce(ap.carrera_id, ag.carrera_id)
               and ac.tenant_id = ap.tenant_id
              where ap.tenant_id = e.tenant_id
                and ap.profesor_id = p.id
                and ap.activo
                and (e.nivel_id is null or coalesce(ap.nivel_id, ac.nivel_id) = e.nivel_id)
                and (e.carrera_id is null or coalesce(ap.carrera_id, ag.carrera_id) = e.carrera_id)
                and (e.grado_id is null or ag.grado_id = e.grado_id)
                and (e.grupo_id is null or ap.grupo_id = e.grupo_id)
            )
          )
        )
      )
  );
$$;

create or replace function private.can_view_encuesta(target_encuesta_id uuid, target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.encuestas e
    where e.id = target_encuesta_id
      and e.tenant_id = target_tenant_id
      and (
        e.creador_id = (select auth.uid())
        or private.profile_matches_encuesta(e.id, e.tenant_id, (select auth.uid()))
      )
  );
$$;

revoke all on function private.profile_matches_encuesta(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.profile_matches_encuesta(uuid, uuid, uuid) to service_role;

create or replace function private.reset_encuesta_votes_on_audience_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audiencia is distinct from old.audiencia
     or new.nivel_id is distinct from old.nivel_id
     or new.carrera_id is distinct from old.carrera_id
     or new.grado_id is distinct from old.grado_id
     or new.grupo_id is distinct from old.grupo_id
     or new.restringir_a_asignaciones is distinct from old.restringir_a_asignaciones then
    delete from public.encuesta_votos
    where encuesta_id = old.id and tenant_id = old.tenant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_encuesta_votes_on_audience_change on public.encuestas;
create trigger reset_encuesta_votes_on_audience_change
before update of audiencia, nivel_id, carrera_id, grado_id, grupo_id, restringir_a_asignaciones
on public.encuestas
for each row
execute function private.reset_encuesta_votes_on_audience_change();

create or replace function public.crear_encuesta(
  p_titulo text,
  p_descripcion text,
  p_audiencia text,
  p_nivel_id uuid,
  p_carrera_id uuid,
  p_grado_id uuid,
  p_grupo_id uuid,
  p_opciones text[],
  p_cierra_en timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tenant_id uuid;
  v_rol text;
  v_opciones text[];
  v_encuesta_id uuid;
begin
  select p.tenant_id, p.rol::text
    into v_tenant_id, v_rol
  from public.profiles p
  where p.id = v_user_id and p.estatus = 'activo';

  if v_tenant_id is null or v_rol not in ('superuser', 'admin', 'profesor') then
    raise exception 'No tienes permiso para crear encuestas';
  end if;
  if char_length(btrim(coalesce(p_titulo, ''))) not between 3 and 160 then
    raise exception 'El título debe tener entre 3 y 160 caracteres';
  end if;
  if char_length(coalesce(p_descripcion, '')) > 2000 then
    raise exception 'La descripción no puede exceder 2000 caracteres';
  end if;
  if p_audiencia not in ('alumno', 'profesor') then
    raise exception 'Audiencia inválida';
  end if;
  if p_cierra_en is not null and p_cierra_en <= now() then
    raise exception 'La fecha de cierre debe ser futura';
  end if;
  if (p_carrera_id is not null and p_nivel_id is null)
     or (p_grado_id is not null and p_carrera_id is null)
     or (p_grupo_id is not null and p_grado_id is null) then
    raise exception 'Selecciona el destino en orden: nivel, carrera, grado y grupo';
  end if;

  if p_nivel_id is not null and not exists (
    select 1 from public.niveles n
    where n.id = p_nivel_id and n.tenant_id = v_tenant_id and n.activo
  ) then raise exception 'El nivel no pertenece a la institución'; end if;
  if p_carrera_id is not null and not exists (
    select 1 from public.carreras c
    where c.id = p_carrera_id and c.tenant_id = v_tenant_id
      and c.nivel_id = p_nivel_id and c.activo
  ) then raise exception 'La carrera no pertenece al nivel seleccionado'; end if;
  if p_grado_id is not null and not exists (
    select 1 from public.grados g
    where g.id = p_grado_id and g.tenant_id = v_tenant_id
      and g.carrera_id = p_carrera_id and g.activo
  ) then raise exception 'El grado no pertenece a la carrera seleccionada'; end if;
  if p_grupo_id is not null and not exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.tenant_id = v_tenant_id
      and g.carrera_id = p_carrera_id and g.grado_id = p_grado_id and g.activo
  ) then raise exception 'El grupo no pertenece al grado seleccionado'; end if;

  if v_rol = 'profesor' then
    if p_audiencia <> 'alumno' then
      raise exception 'Los profesores sólo pueden encuestar a sus alumnos';
    end if;
    if not exists (
      select 1
      from public.asignaciones_profesor ap
      left join public.grupos ag
        on ag.id = ap.grupo_id and ag.tenant_id = ap.tenant_id
      left join public.carreras ac
        on ac.id = coalesce(ap.carrera_id, ag.carrera_id) and ac.tenant_id = ap.tenant_id
      where ap.tenant_id = v_tenant_id
        and ap.profesor_id = v_user_id
        and ap.activo
        and (p_nivel_id is null or coalesce(ap.nivel_id, ac.nivel_id) = p_nivel_id)
        and (p_carrera_id is null or coalesce(ap.carrera_id, ag.carrera_id) = p_carrera_id)
        and (p_grado_id is null or ag.grado_id = p_grado_id)
        and (p_grupo_id is null or ap.grupo_id = p_grupo_id)
    ) then
      raise exception 'No tienes grupos asignados dentro del destino seleccionado';
    end if;
  end if;

  select array_agg(btrim(o.valor) order by o.posicion)
    into v_opciones
  from unnest(coalesce(p_opciones, array[]::text[])) with ordinality as o(valor, posicion);

  if cardinality(v_opciones) not between 2 and 10
     or exists (select 1 from unnest(v_opciones) as o(valor) where o.valor = '' or char_length(o.valor) > 300)
     or (select count(distinct lower(o.valor)) from unnest(v_opciones) as o(valor)) <> cardinality(v_opciones) then
    raise exception 'Incluye de 2 a 10 opciones distintas de hasta 300 caracteres';
  end if;

  insert into public.encuestas (
    tenant_id, creador_id, titulo, descripcion, audiencia,
    nivel_id, carrera_id, grado_id, grupo_id,
    restringir_a_asignaciones, cierra_en
  ) values (
    v_tenant_id, v_user_id, btrim(p_titulo),
    nullif(btrim(coalesce(p_descripcion, '')), ''), p_audiencia,
    p_nivel_id, p_carrera_id, p_grado_id, p_grupo_id,
    v_rol = 'profesor', p_cierra_en
  ) returning id into v_encuesta_id;

  insert into public.encuesta_opciones (tenant_id, encuesta_id, texto, posicion)
  select v_tenant_id, v_encuesta_id, o.valor, o.posicion::smallint
  from unnest(v_opciones) with ordinality as o(valor, posicion);

  return v_encuesta_id;
end;
$$;

create or replace function public.actualizar_encuesta(
  p_encuesta_id uuid,
  p_titulo text,
  p_descripcion text,
  p_audiencia text,
  p_nivel_id uuid,
  p_carrera_id uuid,
  p_grado_id uuid,
  p_grupo_id uuid,
  p_opciones text[],
  p_cierra_en timestamptz,
  p_activa boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tenant_id uuid;
  v_rol text;
  v_actual public.encuestas%rowtype;
  v_opciones text[];
  v_opciones_actuales text[];
  v_reset_votos boolean := false;
begin
  select p.tenant_id, p.rol::text
    into v_tenant_id, v_rol
  from public.profiles p
  where p.id = v_user_id and p.estatus = 'activo';

  if v_tenant_id is null or v_rol not in ('superuser', 'admin', 'profesor') then
    raise exception 'No tienes permiso para editar encuestas';
  end if;
  select e.* into v_actual
  from public.encuestas e
  where e.id = p_encuesta_id
    and e.tenant_id = v_tenant_id
    and e.creador_id = v_user_id
  for update;
  if not found then
    raise exception 'Sólo quien creó la encuesta puede editarla';
  end if;
  if char_length(btrim(coalesce(p_titulo, ''))) not between 3 and 160 then
    raise exception 'El título debe tener entre 3 y 160 caracteres';
  end if;
  if char_length(coalesce(p_descripcion, '')) > 2000 then
    raise exception 'La descripción no puede exceder 2000 caracteres';
  end if;
  if p_audiencia not in ('alumno', 'profesor') then
    raise exception 'Audiencia inválida';
  end if;
  if (p_carrera_id is not null and p_nivel_id is null)
     or (p_grado_id is not null and p_carrera_id is null)
     or (p_grupo_id is not null and p_grado_id is null) then
    raise exception 'Selecciona el destino en orden: nivel, carrera, grado y grupo';
  end if;

  if p_nivel_id is not null and not exists (
    select 1 from public.niveles n
    where n.id = p_nivel_id and n.tenant_id = v_tenant_id and n.activo
  ) then raise exception 'El nivel no pertenece a la institución'; end if;
  if p_carrera_id is not null and not exists (
    select 1 from public.carreras c
    where c.id = p_carrera_id and c.tenant_id = v_tenant_id
      and c.nivel_id = p_nivel_id and c.activo
  ) then raise exception 'La carrera no pertenece al nivel seleccionado'; end if;
  if p_grado_id is not null and not exists (
    select 1 from public.grados g
    where g.id = p_grado_id and g.tenant_id = v_tenant_id
      and g.carrera_id = p_carrera_id and g.activo
  ) then raise exception 'El grado no pertenece a la carrera seleccionada'; end if;
  if p_grupo_id is not null and not exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.tenant_id = v_tenant_id
      and g.carrera_id = p_carrera_id and g.grado_id = p_grado_id and g.activo
  ) then raise exception 'El grupo no pertenece al grado seleccionado'; end if;

  if v_rol = 'profesor' then
    if p_audiencia <> 'alumno' then
      raise exception 'Los profesores sólo pueden encuestar a sus alumnos';
    end if;
    if not exists (
      select 1
      from public.asignaciones_profesor ap
      left join public.grupos ag
        on ag.id = ap.grupo_id and ag.tenant_id = ap.tenant_id
      left join public.carreras ac
        on ac.id = coalesce(ap.carrera_id, ag.carrera_id) and ac.tenant_id = ap.tenant_id
      where ap.tenant_id = v_tenant_id
        and ap.profesor_id = v_user_id
        and ap.activo
        and (p_nivel_id is null or coalesce(ap.nivel_id, ac.nivel_id) = p_nivel_id)
        and (p_carrera_id is null or coalesce(ap.carrera_id, ag.carrera_id) = p_carrera_id)
        and (p_grado_id is null or ag.grado_id = p_grado_id)
        and (p_grupo_id is null or ap.grupo_id = p_grupo_id)
    ) then
      raise exception 'No tienes grupos asignados dentro del destino seleccionado';
    end if;
  end if;

  select array_agg(btrim(o.valor) order by o.posicion)
    into v_opciones
  from unnest(coalesce(p_opciones, array[]::text[])) with ordinality as o(valor, posicion);
  if cardinality(v_opciones) not between 2 and 10
     or exists (select 1 from unnest(v_opciones) as o(valor) where o.valor = '' or char_length(o.valor) > 300)
     or (select count(distinct lower(o.valor)) from unnest(v_opciones) as o(valor)) <> cardinality(v_opciones) then
    raise exception 'Incluye de 2 a 10 opciones distintas de hasta 300 caracteres';
  end if;

  select coalesce(array_agg(o.texto order by o.posicion), array[]::text[])
    into v_opciones_actuales
  from public.encuesta_opciones o
  where o.encuesta_id = p_encuesta_id and o.tenant_id = v_tenant_id;

  if v_opciones_actuales is distinct from v_opciones then
    delete from public.encuesta_opciones
    where encuesta_id = p_encuesta_id and tenant_id = v_tenant_id;
    insert into public.encuesta_opciones (tenant_id, encuesta_id, texto, posicion)
    select v_tenant_id, p_encuesta_id, o.valor, o.posicion::smallint
    from unnest(v_opciones) with ordinality as o(valor, posicion);
    v_reset_votos := true;
  end if;

  if v_actual.audiencia is distinct from p_audiencia
     or v_actual.nivel_id is distinct from p_nivel_id
     or v_actual.carrera_id is distinct from p_carrera_id
     or v_actual.grado_id is distinct from p_grado_id
     or v_actual.grupo_id is distinct from p_grupo_id then
    v_reset_votos := true;
  end if;

  update public.encuestas
  set titulo = btrim(p_titulo),
      descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      audiencia = p_audiencia,
      nivel_id = p_nivel_id,
      carrera_id = p_carrera_id,
      grado_id = p_grado_id,
      grupo_id = p_grupo_id,
      restringir_a_asignaciones = v_rol = 'profesor',
      cierra_en = p_cierra_en,
      activa = coalesce(p_activa, false),
      updated_at = now()
  where id = p_encuesta_id and tenant_id = v_tenant_id;

  return v_reset_votos;
end;
$$;

create or replace function public.votar_encuesta(p_encuesta_id uuid, p_opcion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tenant_id uuid;
  v_rol text;
  v_encuesta public.encuestas%rowtype;
begin
  select p.tenant_id, p.rol::text
    into v_tenant_id, v_rol
  from public.profiles p
  where p.id = v_user_id and p.estatus = 'activo';

  if v_tenant_id is null or v_rol not in ('alumno', 'profesor') then
    raise exception 'Tu perfil no puede responder esta encuesta';
  end if;
  select e.* into v_encuesta
  from public.encuestas e
  where e.id = p_encuesta_id and e.tenant_id = v_tenant_id;
  if not found then raise exception 'Encuesta no encontrada'; end if;
  if not v_encuesta.activa or (v_encuesta.cierra_en is not null and v_encuesta.cierra_en <= now()) then
    raise exception 'La encuesta está cerrada';
  end if;
  if v_encuesta.creador_id = v_user_id
     or not private.profile_matches_encuesta(p_encuesta_id, v_tenant_id, v_user_id) then
    raise exception 'La encuesta no está dirigida a tu perfil';
  end if;
  if not exists (
    select 1 from public.encuesta_opciones o
    where o.id = p_opcion_id
      and o.encuesta_id = p_encuesta_id
      and o.tenant_id = v_tenant_id
  ) then raise exception 'Opción inválida'; end if;

  insert into public.encuesta_votos (tenant_id, encuesta_id, opcion_id, votante_id)
  values (v_tenant_id, p_encuesta_id, p_opcion_id, v_user_id)
  on conflict (encuesta_id, votante_id) do update
  set opcion_id = excluded.opcion_id, updated_at = now();
  return p_opcion_id;
end;
$$;

revoke all on function public.crear_encuesta(text, text, text, uuid, uuid, uuid, uuid, text[], timestamptz) from public, anon;
revoke all on function public.actualizar_encuesta(uuid, text, text, text, uuid, uuid, uuid, uuid, text[], timestamptz, boolean) from public, anon;
revoke all on function public.votar_encuesta(uuid, uuid) from public, anon;
grant execute on function public.crear_encuesta(text, text, text, uuid, uuid, uuid, uuid, text[], timestamptz) to authenticated, service_role;
grant execute on function public.actualizar_encuesta(uuid, text, text, text, uuid, uuid, uuid, uuid, text[], timestamptz, boolean) to authenticated, service_role;
grant execute on function public.votar_encuesta(uuid, uuid) to authenticated, service_role;

comment on column public.encuestas.nivel_id is 'Filtro jerárquico opcional de nivel; null incluye todos.';
comment on column public.encuestas.carrera_id is 'Filtro jerárquico opcional de carrera dentro del nivel.';
comment on column public.encuestas.grado_id is 'Filtro jerárquico opcional de grado dentro de la carrera.';
comment on column public.encuestas.restringir_a_asignaciones is 'Si es true, limita alumnos a grupos asignados al profesor creador.';
