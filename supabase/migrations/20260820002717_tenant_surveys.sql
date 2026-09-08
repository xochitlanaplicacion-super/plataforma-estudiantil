-- Encuestas multitenant para alumnos y profesores.
-- Las mutaciones pasan exclusivamente por RPC validadas; las tablas sólo exponen lectura con RLS.

create unique index if not exists profiles_id_tenant_id_key
  on public.profiles (id, tenant_id);

create unique index if not exists grupos_id_tenant_id_key
  on public.grupos (id, tenant_id);

create table public.encuestas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  creador_id uuid not null,
  titulo text not null,
  descripcion text,
  audiencia text not null,
  grupo_id uuid,
  activa boolean not null default true,
  cierra_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encuestas_id_tenant_id_key unique (id, tenant_id),
  constraint encuestas_creador_tenant_fkey
    foreign key (creador_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint encuestas_grupo_tenant_fkey
    foreign key (grupo_id, tenant_id)
    references public.grupos (id, tenant_id) on delete cascade,
  constraint encuestas_titulo_length check (char_length(btrim(titulo)) between 3 and 160),
  constraint encuestas_descripcion_length check (descripcion is null or char_length(descripcion) <= 2000),
  constraint encuestas_audiencia_check check (audiencia in ('alumno', 'profesor')),
  constraint encuestas_profesores_sin_grupo check (audiencia = 'alumno' or grupo_id is null)
);

create table public.encuesta_opciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  encuesta_id uuid not null,
  texto text not null,
  posicion smallint not null,
  created_at timestamptz not null default now(),
  constraint encuesta_opciones_id_encuesta_tenant_key unique (id, encuesta_id, tenant_id),
  constraint encuesta_opciones_encuesta_tenant_fkey
    foreign key (encuesta_id, tenant_id)
    references public.encuestas (id, tenant_id) on delete cascade,
  constraint encuesta_opciones_posicion_key unique (encuesta_id, posicion),
  constraint encuesta_opciones_texto_length check (char_length(btrim(texto)) between 1 and 300),
  constraint encuesta_opciones_posicion_check check (posicion between 1 and 10)
);

create table public.encuesta_votos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  encuesta_id uuid not null,
  opcion_id uuid not null,
  votante_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encuesta_votos_encuesta_tenant_fkey
    foreign key (encuesta_id, tenant_id)
    references public.encuestas (id, tenant_id) on delete cascade,
  constraint encuesta_votos_opcion_encuesta_tenant_fkey
    foreign key (opcion_id, encuesta_id, tenant_id)
    references public.encuesta_opciones (id, encuesta_id, tenant_id) on delete cascade,
  constraint encuesta_votos_votante_tenant_fkey
    foreign key (votante_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint encuesta_votos_un_voto_por_usuario unique (encuesta_id, votante_id)
);

create index encuestas_tenant_created_idx
  on public.encuestas (tenant_id, created_at desc);
create index encuestas_creador_idx
  on public.encuestas (creador_id, created_at desc);
create index encuestas_destino_idx
  on public.encuestas (tenant_id, audiencia, grupo_id, activa);
create index encuesta_opciones_encuesta_idx
  on public.encuesta_opciones (encuesta_id, posicion);
create index encuesta_opciones_tenant_idx
  on public.encuesta_opciones (tenant_id);
create index encuesta_votos_tenant_idx
  on public.encuesta_votos (tenant_id);
create index encuesta_votos_opcion_idx
  on public.encuesta_votos (opcion_id);
create index encuesta_votos_votante_idx
  on public.encuesta_votos (votante_id, created_at desc);

alter table public.encuestas enable row level security;
alter table public.encuesta_opciones enable row level security;
alter table public.encuesta_votos enable row level security;

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
    join public.profiles p
      on p.id = (select auth.uid())
     and p.tenant_id = e.tenant_id
     and p.estatus = 'activo'
    where e.id = target_encuesta_id
      and e.tenant_id = target_tenant_id
      and (
        e.creador_id = p.id
        or (
          p.rol::text = e.audiencia
          and (
            e.grupo_id is null
            or (e.audiencia = 'alumno' and p.grupo_id = e.grupo_id)
          )
        )
      )
  );
$$;

create or replace function private.is_encuesta_creator(target_encuesta_id uuid, target_tenant_id uuid)
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
      and e.creador_id = (select auth.uid())
  );
$$;

revoke all on function private.can_view_encuesta(uuid, uuid) from public;
revoke all on function private.is_encuesta_creator(uuid, uuid) from public;
grant execute on function private.can_view_encuesta(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_encuesta_creator(uuid, uuid) to authenticated, service_role;

create policy encuestas_tenant_boundary
on public.encuestas
as restrictive
for select
to authenticated
using (tenant_id = (select private.current_tenant_id()));

create policy encuestas_visible
on public.encuestas
for select
to authenticated
using ((select private.can_view_encuesta(id, tenant_id)));

create policy encuesta_opciones_tenant_boundary
on public.encuesta_opciones
as restrictive
for select
to authenticated
using (tenant_id = (select private.current_tenant_id()));

create policy encuesta_opciones_visible
on public.encuesta_opciones
for select
to authenticated
using ((select private.can_view_encuesta(encuesta_id, tenant_id)));

create policy encuesta_votos_tenant_boundary
on public.encuesta_votos
as restrictive
for select
to authenticated
using (tenant_id = (select private.current_tenant_id()));

create policy encuesta_votos_visible
on public.encuesta_votos
for select
to authenticated
using (
  votante_id = (select auth.uid())
  or (select private.is_encuesta_creator(encuesta_id, tenant_id))
);

revoke all on table public.encuestas from anon, authenticated;
revoke all on table public.encuesta_opciones from anon, authenticated;
revoke all on table public.encuesta_votos from anon, authenticated;
grant select on table public.encuestas to authenticated;
grant select on table public.encuesta_opciones to authenticated;
grant select on table public.encuesta_votos to authenticated;
grant all on table public.encuestas to service_role;
grant all on table public.encuesta_opciones to service_role;
grant all on table public.encuesta_votos to service_role;

create or replace function public.crear_encuesta(
  p_titulo text,
  p_descripcion text,
  p_audiencia text,
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
  if p_audiencia = 'profesor' and p_grupo_id is not null then
    raise exception 'Las encuestas para profesores no usan grupo';
  end if;
  if p_cierra_en is not null and p_cierra_en <= now() then
    raise exception 'La fecha de cierre debe ser futura';
  end if;

  select array_agg(btrim(o.valor) order by o.posicion)
    into v_opciones
  from unnest(coalesce(p_opciones, array[]::text[])) with ordinality as o(valor, posicion);

  if cardinality(v_opciones) not between 2 and 10
     or exists (select 1 from unnest(v_opciones) as o(valor) where o.valor = '' or char_length(o.valor) > 300)
     or (select count(distinct lower(o.valor)) from unnest(v_opciones) as o(valor)) <> cardinality(v_opciones) then
    raise exception 'Incluye de 2 a 10 opciones distintas de hasta 300 caracteres';
  end if;

  if v_rol = 'profesor' then
    if p_audiencia <> 'alumno' or p_grupo_id is null then
      raise exception 'Los profesores sólo pueden encuestar a uno de sus grupos de alumnos';
    end if;
    if not exists (
      select 1 from public.asignaciones_profesor a
      where a.tenant_id = v_tenant_id
        and a.profesor_id = v_user_id
        and a.grupo_id = p_grupo_id
        and a.activo
    ) then
      raise exception 'El grupo no está asignado a este profesor';
    end if;
  elsif p_grupo_id is not null and not exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.tenant_id = v_tenant_id and g.activo
  ) then
    raise exception 'El grupo no pertenece a la institución';
  end if;

  insert into public.encuestas (
    tenant_id, creador_id, titulo, descripcion, audiencia, grupo_id, cierra_en
  ) values (
    v_tenant_id,
    v_user_id,
    btrim(p_titulo),
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    p_audiencia,
    p_grupo_id,
    p_cierra_en
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
  if not exists (
    select 1 from public.encuestas e
    where e.id = p_encuesta_id
      and e.tenant_id = v_tenant_id
      and e.creador_id = v_user_id
    for update
  ) then
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
  if p_audiencia = 'profesor' and p_grupo_id is not null then
    raise exception 'Las encuestas para profesores no usan grupo';
  end if;

  select array_agg(btrim(o.valor) order by o.posicion)
    into v_opciones
  from unnest(coalesce(p_opciones, array[]::text[])) with ordinality as o(valor, posicion);

  if cardinality(v_opciones) not between 2 and 10
     or exists (select 1 from unnest(v_opciones) as o(valor) where o.valor = '' or char_length(o.valor) > 300)
     or (select count(distinct lower(o.valor)) from unnest(v_opciones) as o(valor)) <> cardinality(v_opciones) then
    raise exception 'Incluye de 2 a 10 opciones distintas de hasta 300 caracteres';
  end if;

  if v_rol = 'profesor' then
    if p_audiencia <> 'alumno' or p_grupo_id is null then
      raise exception 'Los profesores sólo pueden encuestar a uno de sus grupos de alumnos';
    end if;
    if not exists (
      select 1 from public.asignaciones_profesor a
      where a.tenant_id = v_tenant_id
        and a.profesor_id = v_user_id
        and a.grupo_id = p_grupo_id
        and a.activo
    ) then
      raise exception 'El grupo no está asignado a este profesor';
    end if;
  elsif p_grupo_id is not null and not exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.tenant_id = v_tenant_id and g.activo
  ) then
    raise exception 'El grupo no pertenece a la institución';
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

  update public.encuestas
  set titulo = btrim(p_titulo),
      descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      audiencia = p_audiencia,
      grupo_id = p_grupo_id,
      cierra_en = p_cierra_en,
      activa = coalesce(p_activa, false),
      updated_at = now()
  where id = p_encuesta_id and tenant_id = v_tenant_id;

  return v_reset_votos;
end;
$$;

create or replace function public.eliminar_encuesta(p_encuesta_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.encuestas e
  using public.profiles p
  where e.id = p_encuesta_id
    and e.creador_id = (select auth.uid())
    and p.id = (select auth.uid())
    and p.estatus = 'activo'
    and p.rol::text in ('superuser', 'admin', 'profesor')
    and p.tenant_id = e.tenant_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'Sólo quien creó la encuesta puede eliminarla';
  end if;
  return true;
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
  v_grupo_id uuid;
  v_encuesta public.encuestas%rowtype;
begin
  select p.tenant_id, p.rol::text, p.grupo_id
    into v_tenant_id, v_rol, v_grupo_id
  from public.profiles p
  where p.id = v_user_id and p.estatus = 'activo';

  if v_tenant_id is null or v_rol not in ('alumno', 'profesor') then
    raise exception 'Tu perfil no puede responder esta encuesta';
  end if;

  select e.* into v_encuesta
  from public.encuestas e
  where e.id = p_encuesta_id and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'Encuesta no encontrada';
  end if;
  if not v_encuesta.activa or (v_encuesta.cierra_en is not null and v_encuesta.cierra_en <= now()) then
    raise exception 'La encuesta está cerrada';
  end if;
  if v_encuesta.creador_id = v_user_id
     or v_encuesta.audiencia <> v_rol
     or (v_encuesta.grupo_id is not null and v_encuesta.grupo_id <> v_grupo_id) then
    raise exception 'La encuesta no está dirigida a tu perfil';
  end if;
  if not exists (
    select 1 from public.encuesta_opciones o
    where o.id = p_opcion_id
      and o.encuesta_id = p_encuesta_id
      and o.tenant_id = v_tenant_id
  ) then
    raise exception 'Opción inválida';
  end if;

  insert into public.encuesta_votos (tenant_id, encuesta_id, opcion_id, votante_id)
  values (v_tenant_id, p_encuesta_id, p_opcion_id, v_user_id)
  on conflict (encuesta_id, votante_id) do update
  set opcion_id = excluded.opcion_id, updated_at = now();

  return p_opcion_id;
end;
$$;

revoke all on function public.crear_encuesta(text, text, text, uuid, text[], timestamptz) from public, anon;
revoke all on function public.actualizar_encuesta(uuid, text, text, text, uuid, text[], timestamptz, boolean) from public, anon;
revoke all on function public.eliminar_encuesta(uuid) from public, anon;
revoke all on function public.votar_encuesta(uuid, uuid) from public, anon;
grant execute on function public.crear_encuesta(text, text, text, uuid, text[], timestamptz) to authenticated;
grant execute on function public.actualizar_encuesta(uuid, text, text, text, uuid, text[], timestamptz, boolean) to authenticated;
grant execute on function public.eliminar_encuesta(uuid) to authenticated;
grant execute on function public.votar_encuesta(uuid, uuid) to authenticated;
grant execute on function public.crear_encuesta(text, text, text, uuid, text[], timestamptz) to service_role;
grant execute on function public.actualizar_encuesta(uuid, text, text, text, uuid, text[], timestamptz, boolean) to service_role;
grant execute on function public.eliminar_encuesta(uuid) to service_role;
grant execute on function public.votar_encuesta(uuid, uuid) to service_role;

comment on table public.encuestas is 'Encuestas aisladas por institución; creador y audiencia controlados por RPC y RLS.';
comment on table public.encuesta_votos is 'Un voto vigente por encuesta y usuario; una nueva selección reemplaza la anterior.';
