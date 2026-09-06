-- Credenciales QR para alumnos provisionales. Se mantienen separadas de las
-- inscripciones oficiales y dejan de ser utilizables al vincular/cancelar el alta.
set search_path = public, extensions;

create table public.identificadores_qr_alumno_provisional (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alumno_provisional_id uuid not null,
  token uuid not null default gen_random_uuid(),
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint qr_provisional_id_tenant_unique unique (id, tenant_id),
  constraint qr_provisional_token_unique unique (token),
  constraint qr_provisional_state_check check (
    (activo and revoked_at is null) or (not activo and revoked_at is not null)
  ),
  constraint qr_provisional_student_fkey foreign key (alumno_provisional_id, tenant_id)
    references public.alumnos_provisionales_docente(id, tenant_id) on delete restrict,
  constraint qr_provisional_creator_fkey foreign key (created_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict
);

create unique index qr_provisional_one_active_idx
  on public.identificadores_qr_alumno_provisional (tenant_id, alumno_provisional_id)
  where activo;

create index qr_provisional_lookup_idx
  on public.identificadores_qr_alumno_provisional (tenant_id, token)
  where activo;

alter table public.identificadores_qr_alumno_provisional enable row level security;
alter table public.identificadores_qr_alumno_provisional force row level security;

create policy qr_provisional_tenant_boundary on public.identificadores_qr_alumno_provisional
  as restrictive for select to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)));

create policy qr_provisional_teacher_select on public.identificadores_qr_alumno_provisional
  for select to authenticated using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    or exists (
      select 1
      from public.alumnos_provisionales_docente p
      join public.asignaciones_profesor a
        on a.tenant_id = p.tenant_id
       and a.ciclo_escolar_id = p.ciclo_escolar_id
       and a.grupo_id = p.grupo_id
       and a.profesor_id = (select auth.uid())
       and a.activo
      where p.id = identificadores_qr_alumno_provisional.alumno_provisional_id
        and p.tenant_id = identificadores_qr_alumno_provisional.tenant_id
    )
  );

revoke all on public.identificadores_qr_alumno_provisional from public, anon, authenticated;
grant select on public.identificadores_qr_alumno_provisional to authenticated;
grant all on public.identificadores_qr_alumno_provisional to service_role;

create or replace function public.obtener_asignaciones_credenciales_docente_movil()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'levelName', n.nombre,
    'gradeName', gr.nombre,
    'groupName', g.nombre,
    'subjectName', m.nombre
  ) order by n.nombre, gr.nombre, g.nombre, m.nombre), '[]'::jsonb)
  from public.asignaciones_profesor a
  join public.ciclos_escolares c
    on c.id = a.ciclo_escolar_id and c.tenant_id = a.tenant_id and c.estado = 'activo'
  join public.niveles n on n.id = a.nivel_id and n.tenant_id = a.tenant_id
  join public.grados gr on gr.id = a.grado_id and gr.tenant_id = a.tenant_id
  join public.grupos g on g.id = a.grupo_id and g.tenant_id = a.tenant_id
  join public.materias m on m.id = a.materia_id and m.tenant_id = a.tenant_id
  where a.profesor_id = (select auth.uid()) and a.activo;
$$;

create or replace function public.obtener_qrs_docente_movil(p_asignacion_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; assignment_group uuid; result jsonb;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,assignment_group
    from public.asignaciones_profesor a join public.ciclos_escolares c
      on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
    where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;

  insert into public.identificadores_qr_inscripcion(tenant_id,inscripcion_alumno_id,created_by)
    select tenant,i.id,actor from public.inscripciones_alumno i
    where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=assignment_group and i.activo
      and not exists(select 1 from public.identificadores_qr_inscripcion q
        where q.tenant_id=tenant and q.inscripcion_alumno_id=i.id and q.activo)
    on conflict do nothing;

  update public.identificadores_qr_alumno_provisional q
    set activo=false, revoked_at=now()
  from public.alumnos_provisionales_docente p
  where q.tenant_id=tenant and q.alumno_provisional_id=p.id and p.tenant_id=q.tenant_id
    and q.activo and p.estado<>'pendiente';

  insert into public.identificadores_qr_alumno_provisional(tenant_id,alumno_provisional_id,created_by)
    select tenant,p.id,actor from public.alumnos_provisionales_docente p
    where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=assignment_group
      and p.estado='pendiente'
      and not exists(select 1 from public.identificadores_qr_alumno_provisional q
        where q.tenant_id=tenant and q.alumno_provisional_id=p.id and q.activo)
    on conflict do nothing;

  select coalesce(jsonb_agg(rows.payload order by rows.student_name), '[]'::jsonb) into result
  from (
    select concat_ws(' ',pr.nombre,pr.apellidos) as student_name,
      jsonb_build_object(
        'studentType','registered', 'studentId',i.id, 'enrollmentId',i.id,
        'provisionalId',null, 'name',concat_ws(' ',pr.nombre,pr.apellidos),
        'enrollmentCode',pr.matricula, 'token',q.token
      ) as payload
    from public.identificadores_qr_inscripcion q
    join public.inscripciones_alumno i on i.id=q.inscripcion_alumno_id and i.tenant_id=q.tenant_id
    join public.profiles pr on pr.id=i.alumno_id and pr.tenant_id=i.tenant_id
    where q.tenant_id=tenant and q.activo and i.ciclo_escolar_id=cycle_id
      and i.grupo_id=assignment_group and i.activo
    union all
    select concat_ws(' ',p.nombre,p.apellidos) as student_name,
      jsonb_build_object(
        'studentType','provisional', 'studentId',p.id, 'enrollmentId',null,
        'provisionalId',p.id, 'name',concat_ws(' ',p.nombre,p.apellidos),
        'enrollmentCode',null, 'token',q.token
      ) as payload
    from public.identificadores_qr_alumno_provisional q
    join public.alumnos_provisionales_docente p
      on p.id=q.alumno_provisional_id and p.tenant_id=q.tenant_id
    where q.tenant_id=tenant and q.activo and p.ciclo_escolar_id=cycle_id
      and p.grupo_id=assignment_group and p.estado='pendiente'
  ) rows;
  return result;
end $$;

revoke all on function public.obtener_asignaciones_credenciales_docente_movil(),
  public.obtener_qrs_docente_movil(uuid) from public,anon,authenticated;
grant execute on function public.obtener_asignaciones_credenciales_docente_movil(),
  public.obtener_qrs_docente_movil(uuid) to authenticated,service_role;

comment on table public.identificadores_qr_alumno_provisional is
  'Tokens QR revocables de altas provisionales, separados de las inscripciones oficiales.';
