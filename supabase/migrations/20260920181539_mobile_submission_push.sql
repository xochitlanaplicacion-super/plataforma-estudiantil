create table public.dispositivos_push_docente (
  token text primary key check(token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  profesor_id uuid not null references public.profiles(id),
  tenant_id uuid not null references public.tenants(id),
  updated_at timestamptz not null default now()
);
create index on public.dispositivos_push_docente(profesor_id);
create index on public.dispositivos_push_docente(tenant_id);
alter table public.dispositivos_push_docente enable row level security;
revoke all on public.dispositivos_push_docente from public,anon,authenticated;
grant select,delete on public.dispositivos_push_docente to authenticated;
grant all on public.dispositivos_push_docente to service_role;
create policy own_push_device on public.dispositivos_push_docente for select to authenticated using(profesor_id=(select auth.uid()));
create policy delete_own_push_device on public.dispositivos_push_docente for delete to authenticated using(profesor_id=(select auth.uid()));
create function private.registrar_push_docente(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select p.tenant_id into tenant from public.profiles p join public.tenants t on t.id=p.tenant_id and t.estado='activo'
    where p.id=auth.uid() and p.rol='profesor' and p.estatus='activo';
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_TEACHER_REQUIRED'; end if;
  insert into public.dispositivos_push_docente(token,profesor_id,tenant_id) values(p_token,auth.uid(),tenant)
    on conflict(token) do update set profesor_id=excluded.profesor_id,tenant_id=excluded.tenant_id,updated_at=now();
end $$;
revoke all on function private.registrar_push_docente(text) from public,anon;
grant execute on function private.registrar_push_docente(text) to authenticated;
create function public.registrar_push_docente(p_token text) returns void language sql security invoker set search_path='' as $$
  select private.registrar_push_docente(p_token);
$$;
revoke all on function public.registrar_push_docente(text) from public,anon;
grant execute on function public.registrar_push_docente(text) to authenticated;

create table public.cola_push_entregas (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.dispositivos_push_docente(token) on delete cascade,
  profesor_id uuid not null references public.profiles(id),
  tenant_id uuid not null references public.tenants(id),
  resultado_id uuid not null references public.resultados_ejercicios(id) on delete cascade,
  archivo_path text not null,
  asignacion_id uuid not null references public.asignaciones_profesor(id),
  ejercicio_id uuid not null references public.ejercicios(id),
  estado text not null default 'pending' check(estado in ('pending','sending','ticket','sent','failed')),
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  ticket_id text,
  error_code text,
  created_at timestamptz not null default now(),
  unique(token,resultado_id,archivo_path)
);
create index on public.cola_push_entregas(profesor_id);
create index on public.cola_push_entregas(tenant_id);
create index on public.cola_push_entregas(resultado_id);
create index on public.cola_push_entregas(asignacion_id);
create index on public.cola_push_entregas(ejercicio_id);
create index on public.cola_push_entregas(estado,next_attempt);
alter table public.cola_push_entregas enable row level security;
revoke all on public.cola_push_entregas from public,anon,authenticated;
grant all on public.cola_push_entregas to service_role;
create function private.encolar_entrega_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.archivo_path is null or new.origen is distinct from 'descriptiveSubmission' then return new; end if;
  if TG_OP='UPDATE' and old.archivo_path is not distinct from new.archivo_path then return new; end if;
  insert into public.cola_push_entregas(token,profesor_id,tenant_id,resultado_id,archivo_path,asignacion_id,ejercicio_id)
    select d.token,a.profesor_id,a.tenant_id,new.id,new.archivo_path,a.id,new.ejercicio_id
    from public.vinculos_evaluacion_ejercicio v
    join public.asignaciones_profesor a on a.id=v.asignacion_profesor_id and a.tenant_id=v.tenant_id and a.activo
    join public.inscripciones_alumno i on i.id=new.inscripcion_alumno_id and i.tenant_id=a.tenant_id
      and i.grupo_id=a.grupo_id and i.ciclo_escolar_id=a.ciclo_escolar_id and i.alumno_id=new.alumno_id and i.activo
    join public.dispositivos_push_docente d on d.profesor_id=a.profesor_id and d.tenant_id=a.tenant_id
    join public.profiles p on p.id=a.profesor_id and p.tenant_id=a.tenant_id and p.estatus='activo' and p.rol='profesor'
    where v.id=new.vinculo_evaluacion_id and v.tenant_id=new.tenant_id and v.ejercicio_id=new.ejercicio_id and v.activo
    on conflict(token,resultado_id,archivo_path) do nothing;
  return new;
end $$;
revoke all on function private.encolar_entrega_push() from public,anon,authenticated;
create trigger encolar_entrega_push after insert or update of archivo_path on public.resultados_ejercicios
  for each row execute function private.encolar_entrega_push();
create function public.reclamar_push_entregas() returns setof public.cola_push_entregas
language sql security invoker set search_path='' as $$
  update public.cola_push_entregas q set estado='sending',attempts=attempts+1,next_attempt=now()+interval '5 minutes'
  where q.id in (
    select x.id from public.cola_push_entregas x
    join public.dispositivos_push_docente d on d.token=x.token and d.profesor_id=x.profesor_id and d.tenant_id=x.tenant_id
    join public.asignaciones_profesor a on a.id=x.asignacion_id and a.profesor_id=x.profesor_id and a.tenant_id=x.tenant_id and a.activo
    join public.profiles p on p.id=x.profesor_id and p.tenant_id=x.tenant_id and p.estatus='activo' and p.rol='profesor'
    where x.estado in ('pending','sending') and x.next_attempt<=now() and x.attempts<5
    order by x.created_at for update of x skip locked limit 50
  ) returning q.*;
$$;
revoke all on function public.reclamar_push_entregas() from public,anon,authenticated;
grant execute on function public.reclamar_push_entregas() to service_role;
