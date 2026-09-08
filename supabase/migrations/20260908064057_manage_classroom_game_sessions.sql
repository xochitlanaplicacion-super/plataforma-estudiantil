-- Reinicia una partida finalizada sin alterar su banco ni configuración.
-- Sólo el backend service_role puede invocarla después de validar profesor/tenant.
create or replace function public.reset_classroom_game_session(
  target_session_id uuid,
  target_tenant_id uuid,
  target_teacher_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reset_id uuid;
begin
  if not exists (
    select 1
    from public.classroom_game_sessions session
    where session.id = target_session_id
      and session.tenant_id = target_tenant_id
      and session.teacher_id = target_teacher_id
      and session.status in ('finished', 'cancelled')
    for update
  ) then
    raise exception 'La sesión no puede reiniciarse';
  end if;

  delete from public.classroom_game_matches
  where session_id = target_session_id and tenant_id = target_tenant_id;

  delete from public.classroom_game_participants
  where session_id = target_session_id and tenant_id = target_tenant_id;

  update public.classroom_game_sessions
  set status = 'draft',
      current_round = 0,
      current_question_position = 0,
      question_order = '{}',
      opened_at = null,
      started_at = null,
      finished_at = null
  where id = target_session_id
    and tenant_id = target_tenant_id
    and teacher_id = target_teacher_id
  returning id into reset_id;

  return reset_id;
end;
$$;

revoke execute on function public.reset_classroom_game_session(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reset_classroom_game_session(uuid, uuid, uuid)
  to service_role;

comment on function public.reset_classroom_game_session(uuid, uuid, uuid) is
  'Elimina duelos y participantes de una sesión finalizada y la devuelve a borrador. Sólo backend.';
