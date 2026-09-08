-- Conserva las preguntas usadas por partidas anteriores y reemplaza la version
-- editable en una sola transaccion. Sólo se expone al service_role.
alter table public.classroom_question_items
  add column if not exists retired_at timestamptz;

alter table public.classroom_question_items
  drop constraint if exists classroom_question_items_position_unique;

create unique index if not exists classroom_question_items_active_position_unique
  on public.classroom_question_items(bank_id, position)
  where retired_at is null;
create or replace function public.replace_classroom_question_bank(
  target_bank_id uuid,
  target_tenant_id uuid,
  target_teacher_id uuid,
  target_subject_id uuid,
  target_title text,
  target_unit_name text,
  target_topic_name text,
  target_description text,
  target_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_bank_id uuid;
begin
  if jsonb_typeof(target_questions) <> 'array'
     or jsonb_array_length(target_questions) < 1
     or jsonb_array_length(target_questions) > 100 then
    raise exception 'El banco debe contener entre 1 y 100 preguntas';
  end if;

  if not exists (
    select 1
    from public.asignaciones_profesor assignment
    where assignment.tenant_id = target_tenant_id
      and assignment.profesor_id = target_teacher_id
      and assignment.materia_id = target_subject_id
      and assignment.activo
  ) then
    raise exception 'La materia no pertenece a las asignaciones activas del profesor';
  end if;

  if target_bank_id is null then
    insert into public.classroom_question_banks (
      tenant_id, teacher_id, subject_id, title, unit_name, topic_name, description, status
    ) values (
      target_tenant_id, target_teacher_id, target_subject_id, target_title,
      nullif(target_unit_name, ''), nullif(target_topic_name, ''), nullif(target_description, ''), 'ready'
    ) returning id into saved_bank_id;
  else
    update public.classroom_question_banks
    set subject_id = target_subject_id,
        title = target_title,
        unit_name = nullif(target_unit_name, ''),
        topic_name = nullif(target_topic_name, ''),
        description = nullif(target_description, ''),
        status = 'ready'
    where id = target_bank_id
      and tenant_id = target_tenant_id
      and teacher_id = target_teacher_id
      and status <> 'archived'
    returning id into saved_bank_id;

    if saved_bank_id is null then raise exception 'Banco no encontrado'; end if;

    update public.classroom_question_items
    set retired_at = now()
    where bank_id = saved_bank_id
      and tenant_id = target_tenant_id
      and retired_at is null;
  end if;

  insert into public.classroom_question_items (
    tenant_id, bank_id, position, question_type, prompt, options, correct_index, explanation
  )
  select
    target_tenant_id,
    saved_bank_id,
    item.ordinality::integer - 1,
    item.value->>'questionType',
    item.value->>'prompt',
    item.value->'options',
    (item.value->>'correctIndex')::smallint,
    nullif(item.value->>'explanation', '')
  from jsonb_array_elements(target_questions) with ordinality as item(value, ordinality);

  return saved_bank_id;
end;
$$;

revoke execute on function public.replace_classroom_question_bank(uuid, uuid, uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_classroom_question_bank(uuid, uuid, uuid, uuid, text, text, text, text, jsonb)
  to service_role;

comment on function public.replace_classroom_question_bank(uuid, uuid, uuid, uuid, text, text, text, text, jsonb) is
  'Guarda atomicamente un banco de aula completo. Sólo puede invocarlo el backend con service_role.';
