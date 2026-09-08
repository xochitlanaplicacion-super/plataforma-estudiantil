-- Actividades efimeras de aula: banco de preguntas y Bet Win Lose.
-- No existe ninguna FK hacia calificaciones, criterios, entregas o ejercicios:
-- estas sesiones son practica en clase y nunca modifican la libreta.

set search_path = public, extensions;

create table public.classroom_question_banks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  teacher_id uuid not null,
  subject_id uuid not null,
  title text not null,
  unit_name text,
  topic_name text,
  description text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_question_banks_identity_unique unique (id, tenant_id),
  constraint classroom_question_banks_title_check check (char_length(btrim(title)) between 3 and 120),
  constraint classroom_question_banks_status_check check (status in ('draft','ready','archived')),
  constraint classroom_question_banks_teacher_fkey foreign key (teacher_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint classroom_question_banks_subject_fkey foreign key (subject_id, tenant_id)
    references public.materias(id, tenant_id) on delete restrict
);

create table public.classroom_question_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  bank_id uuid not null,
  position integer not null,
  question_type text not null,
  prompt text not null,
  options jsonb not null,
  correct_index smallint not null,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_question_items_identity_unique unique (id, tenant_id),
  constraint classroom_question_items_position_unique unique (bank_id, position),
  constraint classroom_question_items_bank_fkey foreign key (bank_id, tenant_id)
    references public.classroom_question_banks(id, tenant_id) on delete cascade,
  constraint classroom_question_items_type_check check (question_type in ('multiple_choice','true_false')),
  constraint classroom_question_items_prompt_check check (char_length(btrim(prompt)) between 3 and 1000),
  constraint classroom_question_items_options_check check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
    and correct_index >= 0
    and correct_index < jsonb_array_length(options)
  )
);

create table public.classroom_game_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  assignment_id uuid not null,
  cycle_id uuid not null,
  bank_id uuid not null,
  teacher_id uuid not null,
  title text not null,
  status text not null default 'draft',
  max_players smallint not null default 40,
  starting_coins smallint not null default 10,
  response_seconds smallint not null default 15,
  steal_seconds smallint not null default 15,
  current_round integer not null default 0,
  current_question_position integer not null default 0,
  question_order uuid[] not null default '{}',
  opened_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_game_sessions_identity_unique unique (id, tenant_id),
  constraint classroom_game_sessions_assignment_fkey foreign key (assignment_id, tenant_id, cycle_id)
    references public.asignaciones_profesor(id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint classroom_game_sessions_bank_fkey foreign key (bank_id, tenant_id)
    references public.classroom_question_banks(id, tenant_id) on delete restrict,
  constraint classroom_game_sessions_teacher_fkey foreign key (teacher_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint classroom_game_sessions_title_check check (char_length(btrim(title)) between 3 and 120),
  constraint classroom_game_sessions_status_check check (status in ('draft','lobby','active','finished','cancelled')),
  constraint classroom_game_sessions_max_players_check check (max_players between 2 and 40),
  constraint classroom_game_sessions_starting_coins_check check (starting_coins between 1 and 1000),
  constraint classroom_game_sessions_response_check check (response_seconds between 5 and 60),
  constraint classroom_game_sessions_steal_check check (steal_seconds between 5 and 30)
);

create table public.classroom_game_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  session_id uuid not null,
  student_id uuid not null,
  points integer not null,
  momentum smallint not null default 0,
  is_king boolean not null default false,
  has_played_round boolean not null default false,
  eliminated boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint classroom_game_participants_identity_unique unique (id, tenant_id),
  constraint classroom_game_participants_student_unique unique (session_id, student_id),
  constraint classroom_game_participants_session_fkey foreign key (session_id, tenant_id)
    references public.classroom_game_sessions(id, tenant_id) on delete cascade,
  constraint classroom_game_participants_student_fkey foreign key (student_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint classroom_game_participants_points_check check (points >= 0)
);

create table public.classroom_game_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  session_id uuid not null,
  round_number integer not null,
  question_item_id uuid not null,
  challenger_id uuid not null,
  opponent_id uuid not null,
  status text not null default 'betting',
  challenger_bet integer,
  opponent_bet integer,
  stake integer,
  challenger_answer smallint,
  opponent_answer smallint,
  challenger_correct boolean,
  opponent_correct boolean,
  challenger_answered_at timestamptz,
  opponent_answered_at timestamptz,
  answer_deadline timestamptz,
  folded_id uuid,
  steal_deadline timestamptz,
  winner_id uuid,
  result_summary text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint classroom_game_matches_identity_unique unique (id, tenant_id),
  constraint classroom_game_matches_session_fkey foreign key (session_id, tenant_id)
    references public.classroom_game_sessions(id, tenant_id) on delete cascade,
  constraint classroom_game_matches_question_fkey foreign key (question_item_id, tenant_id)
    references public.classroom_question_items(id, tenant_id) on delete restrict,
  constraint classroom_game_matches_challenger_fkey foreign key (challenger_id, tenant_id)
    references public.classroom_game_participants(id, tenant_id) on delete restrict,
  constraint classroom_game_matches_opponent_fkey foreign key (opponent_id, tenant_id)
    references public.classroom_game_participants(id, tenant_id) on delete restrict,
  constraint classroom_game_matches_winner_fkey foreign key (winner_id, tenant_id)
    references public.classroom_game_participants(id, tenant_id) on delete restrict,
  constraint classroom_game_matches_folded_fkey foreign key (folded_id, tenant_id)
    references public.classroom_game_participants(id, tenant_id) on delete restrict,
  constraint classroom_game_matches_players_check check (challenger_id <> opponent_id),
  constraint classroom_game_matches_status_check check (status in ('betting','steal','answering','resolved','cancelled')),
  constraint classroom_game_matches_bets_check check (
    (challenger_bet is null or challenger_bet > 0)
    and (opponent_bet is null or opponent_bet > 0)
    and (stake is null or stake > 0)
  )
);

create unique index classroom_game_one_open_match_idx
  on public.classroom_game_matches(session_id)
  where status in ('betting','steal','answering');
create index classroom_question_banks_teacher_idx
  on public.classroom_question_banks(tenant_id, teacher_id, status, updated_at desc);
create index classroom_question_items_bank_idx
  on public.classroom_question_items(tenant_id, bank_id, position);
create index classroom_game_sessions_teacher_idx
  on public.classroom_game_sessions(tenant_id, teacher_id, status, updated_at desc);
create index classroom_game_sessions_assignment_idx
  on public.classroom_game_sessions(tenant_id, assignment_id, status);
create index classroom_game_participants_session_idx
  on public.classroom_game_participants(tenant_id, session_id, eliminated, points desc);
create index classroom_game_matches_session_idx
  on public.classroom_game_matches(tenant_id, session_id, created_at desc);

create trigger touch_classroom_question_banks before update on public.classroom_question_banks
  for each row execute function private.touch_academic_updated_at();
create trigger touch_classroom_question_items before update on public.classroom_question_items
  for each row execute function private.touch_academic_updated_at();
create trigger touch_classroom_game_sessions before update on public.classroom_game_sessions
  for each row execute function private.touch_academic_updated_at();

alter table public.classroom_question_banks enable row level security;
alter table public.classroom_question_items enable row level security;
alter table public.classroom_game_sessions enable row level security;
alter table public.classroom_game_participants enable row level security;
alter table public.classroom_game_matches enable row level security;

-- Toda lectura/escritura pasa por acciones de servidor que vuelven a validar rol,
-- tenant, asignacion e inscripcion. La clave de respuestas nunca llega por Data API.
revoke all on public.classroom_question_banks from anon, authenticated;
revoke all on public.classroom_question_items from anon, authenticated;
revoke all on public.classroom_game_sessions from anon, authenticated;
revoke all on public.classroom_game_participants from anon, authenticated;
revoke all on public.classroom_game_matches from anon, authenticated;

comment on table public.classroom_game_sessions is
  'Sesion efimera no calificable. Su estado persistente permite reconexion por identidad autenticada.';
comment on column public.classroom_game_sessions.question_order is
  'Orden barajado en servidor; nunca se expone al navegador completo.';

create or replace function public.join_classroom_bwl_session(target_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.classroom_game_sessions%rowtype;
  participant_id uuid;
  participant_count integer;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;

  select * into target
  from public.classroom_game_sessions
  where id = target_session_id
  for update;

  if not found or target.status not in ('lobby','active') then
    raise exception 'La actividad no esta disponible';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.inscripciones_alumno i
      on i.alumno_id = p.id and i.tenant_id = p.tenant_id
    join public.asignaciones_profesor a
      on a.id = target.assignment_id and a.tenant_id = target.tenant_id
    where p.id = actor_id and p.tenant_id = target.tenant_id
      and p.rol::text = 'alumno' and p.estatus = 'activo'
      and i.ciclo_escolar_id = target.cycle_id and i.grupo_id = a.grupo_id and i.activo
  ) then
    raise exception 'El alumno no pertenece al grupo de esta actividad';
  end if;

  select id into participant_id
  from public.classroom_game_participants
  where session_id = target.id and student_id = actor_id;
  if participant_id is not null then
    update public.classroom_game_participants set last_seen_at = now()
    where id = participant_id;
    return participant_id;
  end if;

  select count(*) into participant_count
  from public.classroom_game_participants where session_id = target.id;
  if participant_count >= target.max_players then
    raise exception 'La actividad alcanzo el limite de participantes';
  end if;

  insert into public.classroom_game_participants(
    tenant_id, session_id, student_id, points
  ) values (target.tenant_id, target.id, actor_id, target.starting_coins)
  returning id into participant_id;
  return participant_id;
end;
$$;

create or replace function public.place_classroom_bwl_bet(
  target_match_id uuid,
  requested_bet integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  match_row public.classroom_game_matches%rowtype;
  participant_row public.classroom_game_participants%rowtype;
  session_row public.classroom_game_sessions%rowtype;
  other_bet integer;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into match_row from public.classroom_game_matches where id = target_match_id for update;
  if not found or match_row.status <> 'betting' then raise exception 'La apuesta ya cerro'; end if;
  select * into session_row from public.classroom_game_sessions where id = match_row.session_id;
  if session_row.status <> 'active' then raise exception 'La partida no esta activa'; end if;
  select * into participant_row from public.classroom_game_participants
    where session_id = match_row.session_id and student_id = actor_id and id in (match_row.challenger_id, match_row.opponent_id);
  if not found then raise exception 'No eres participante de este duelo'; end if;
  if requested_bet < 1 or requested_bet > participant_row.points then raise exception 'Apuesta invalida'; end if;

  if participant_row.id = match_row.challenger_id then
    if match_row.challenger_bet is not null then raise exception 'La apuesta ya fue registrada'; end if;
    update public.classroom_game_matches set challenger_bet = requested_bet where id = match_row.id;
    other_bet := match_row.opponent_bet;
  else
    if match_row.opponent_bet is not null then raise exception 'La apuesta ya fue registrada'; end if;
    update public.classroom_game_matches set opponent_bet = requested_bet where id = match_row.id;
    other_bet := match_row.challenger_bet;
  end if;
  if other_bet is not null then
    update public.classroom_game_matches
      set stake = least(requested_bet, other_bet), status = 'answering',
          answer_deadline = now() + make_interval(secs => session_row.response_seconds)
      where id = match_row.id;
  end if;
end;
$$;

create or replace function public.fold_classroom_bwl_match(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  m public.classroom_game_matches%rowtype;
  participant_id uuid;
  seconds_to_steal integer;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into m from public.classroom_game_matches where id = target_match_id for update;
  if not found or m.status <> 'betting' then raise exception 'Ya no puedes retirarte de este duelo'; end if;
  select id into participant_id from public.classroom_game_participants
    where session_id = m.session_id and student_id = actor_id and id in (m.challenger_id, m.opponent_id);
  if participant_id is null then raise exception 'No eres participante de este duelo'; end if;
  select steal_seconds into seconds_to_steal from public.classroom_game_sessions where id = m.session_id and status = 'active';
  if seconds_to_steal is null then raise exception 'La partida ya no esta activa'; end if;
  update public.classroom_game_matches set status = 'steal', folded_id = participant_id,
    steal_deadline = now() + make_interval(secs => seconds_to_steal),
    challenger_bet = case when participant_id = challenger_id then null else challenger_bet end,
    opponent_bet = case when participant_id = opponent_id then null else opponent_bet end
  where id = m.id;
end;
$$;

create or replace function public.steal_classroom_bwl_match(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  m public.classroom_game_matches%rowtype;
  replacement_id uuid;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into m from public.classroom_game_matches where id = target_match_id for update;
  if not found or m.status <> 'steal' or m.steal_deadline is null or now() > m.steal_deadline then
    raise exception 'La oportunidad de robo ya termino';
  end if;
  select id into replacement_id from public.classroom_game_participants
    where session_id = m.session_id and student_id = actor_id and not eliminated
      and id not in (m.challenger_id, m.opponent_id) and not has_played_round;
  if replacement_id is null then raise exception 'No puedes robar este duelo'; end if;
  update public.classroom_game_matches set
    challenger_id = case when folded_id = challenger_id then replacement_id else challenger_id end,
    opponent_id = case when folded_id = opponent_id then replacement_id else opponent_id end,
    folded_id = null, steal_deadline = null, status = 'betting'
  where id = m.id;
end;
$$;

create or replace function public.resolve_classroom_bwl_steal(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  m public.classroom_game_matches%rowtype;
  replacement_id uuid;
  remaining_id uuid;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into m from public.classroom_game_matches where id = target_match_id for update;
  if not found or m.status <> 'steal' or m.steal_deadline is null or now() <= m.steal_deadline then return; end if;
  if not exists (
    select 1 from public.classroom_game_participants p where p.session_id = m.session_id and p.student_id = actor_id
    union all
    select 1 from public.classroom_game_sessions s where s.id = m.session_id and s.teacher_id = actor_id
  ) then raise exception 'No autorizado'; end if;
  select id into replacement_id from public.classroom_game_participants
    where session_id = m.session_id and not eliminated and not has_played_round
      and id not in (m.challenger_id, m.opponent_id)
    order by random() limit 1;
  if replacement_id is null then
    remaining_id := case when m.folded_id = m.challenger_id then m.opponent_id else m.challenger_id end;
    update public.classroom_game_participants set has_played_round = true where id = remaining_id;
    update public.classroom_game_matches set status = 'cancelled', resolved_at = now(),
      result_summary = 'Nadie robo el duelo' where id = m.id;
  else
    update public.classroom_game_matches set
      challenger_id = case when folded_id = challenger_id then replacement_id else challenger_id end,
      opponent_id = case when folded_id = opponent_id then replacement_id else opponent_id end,
      folded_id = null, steal_deadline = null, status = 'betting'
    where id = m.id;
  end if;
end;
$$;

create or replace function public.expire_classroom_bwl_question(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  m public.classroom_game_matches%rowtype;
  winner uuid;
  loser uuid;
  reward integer;
  bounty integer := 0;
  winner_momentum integer;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into m from public.classroom_game_matches where id = target_match_id for update;
  if not found or m.status <> 'answering' or m.answer_deadline is null or now() <= m.answer_deadline then return; end if;
  if not exists (
    select 1 from public.classroom_game_participants p where p.session_id = m.session_id and p.student_id = actor_id
    union all
    select 1 from public.classroom_game_sessions s where s.id = m.session_id and s.teacher_id = actor_id
  ) then raise exception 'No autorizado'; end if;

  m.challenger_correct := coalesce(m.challenger_correct, false);
  m.opponent_correct := coalesce(m.opponent_correct, false);
  if m.challenger_correct and m.opponent_correct then
    winner := case when m.challenger_answered_at <= m.opponent_answered_at then m.challenger_id else m.opponent_id end;
  elsif m.challenger_correct then winner := m.challenger_id; loser := m.opponent_id;
  elsif m.opponent_correct then winner := m.opponent_id; loser := m.challenger_id;
  end if;

  if winner is null then
    update public.classroom_game_participants set points = greatest(0, points - m.stake), momentum = 0,
      eliminated = points - m.stake <= 0, has_played_round = true where id in (m.challenger_id, m.opponent_id);
  else
    select momentum into winner_momentum from public.classroom_game_participants where id = winner;
    reward := m.stake * (case when winner_momentum >= 5 then 3 when winner_momentum >= 3 then 2 else 1 end);
    if loser is not null then
      select case when is_king then 10 else 0 end into bounty from public.classroom_game_participants where id = loser;
      update public.classroom_game_participants set points = greatest(0, points - m.stake), momentum = 0,
        eliminated = points - m.stake <= 0, has_played_round = true where id = loser;
    end if;
    update public.classroom_game_participants set points = points + reward + bounty,
      momentum = momentum + 1, has_played_round = true where id = winner;
    update public.classroom_game_participants set has_played_round = true where id in (m.challenger_id, m.opponent_id);
  end if;
  update public.classroom_game_participants set is_king = false where session_id = m.session_id;
  update public.classroom_game_participants set is_king = true where id = (
    select id from public.classroom_game_participants where session_id = m.session_id and not eliminated
    order by points desc, joined_at asc limit 1
  );
  update public.classroom_game_matches set status = 'resolved', winner_id = winner,
    challenger_correct = m.challenger_correct, opponent_correct = m.opponent_correct,
    result_summary = case when winner is null then 'Tiempo agotado: ninguno acerto' else 'Duelo resuelto por tiempo' end,
    resolved_at = now() where id = m.id;
end;
$$;

create or replace function public.answer_classroom_bwl_question(
  target_match_id uuid,
  selected_index integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  m public.classroom_game_matches%rowtype;
  actor_participant uuid;
  correct_answer integer;
  actor_correct boolean;
  challenger_done boolean;
  opponent_done boolean;
  winner uuid;
  loser uuid;
  reward integer;
  bounty integer := 0;
  winner_momentum integer;
begin
  if actor_id is null then raise exception 'No autenticado'; end if;
  select * into m from public.classroom_game_matches where id = target_match_id for update;
  if not found or m.status <> 'answering' then raise exception 'La pregunta no esta disponible'; end if;
  if m.answer_deadline is not null and now() > m.answer_deadline then raise exception 'El tiempo termino'; end if;
  select id into actor_participant from public.classroom_game_participants
    where session_id = m.session_id and student_id = actor_id and id in (m.challenger_id, m.opponent_id);
  if actor_participant is null then raise exception 'No eres participante de este duelo'; end if;
  if not exists (select 1 from public.classroom_game_sessions where id = m.session_id and status = 'active') then
    raise exception 'La partida ya no esta activa';
  end if;
  select correct_index into correct_answer from public.classroom_question_items where id = m.question_item_id;
  actor_correct := selected_index = correct_answer;

  if actor_participant = m.challenger_id then
    if m.challenger_answered_at is not null then raise exception 'La respuesta ya fue registrada'; end if;
    update public.classroom_game_matches set challenger_answer = selected_index,
      challenger_correct = actor_correct, challenger_answered_at = now() where id = m.id;
    m.challenger_answer := selected_index; m.challenger_correct := actor_correct; m.challenger_answered_at := now();
  else
    if m.opponent_answered_at is not null then raise exception 'La respuesta ya fue registrada'; end if;
    update public.classroom_game_matches set opponent_answer = selected_index,
      opponent_correct = actor_correct, opponent_answered_at = now() where id = m.id;
    m.opponent_answer := selected_index; m.opponent_correct := actor_correct; m.opponent_answered_at := now();
  end if;

  challenger_done := m.challenger_answered_at is not null;
  opponent_done := m.opponent_answered_at is not null;
  if not (challenger_done and opponent_done) then return; end if;

  if m.challenger_correct and m.opponent_correct then
    winner := case when m.challenger_answered_at <= m.opponent_answered_at then m.challenger_id else m.opponent_id end;
  elsif m.challenger_correct then winner := m.challenger_id; loser := m.opponent_id;
  elsif m.opponent_correct then winner := m.opponent_id; loser := m.challenger_id;
  end if;

  if winner is null then
    update public.classroom_game_participants set points = greatest(0, points - m.stake), momentum = 0,
      eliminated = points - m.stake <= 0, has_played_round = true
      where id in (m.challenger_id, m.opponent_id);
  else
    select momentum into winner_momentum from public.classroom_game_participants where id = winner;
    reward := m.stake * (case when winner_momentum >= 5 then 3 when winner_momentum >= 3 then 2 else 1 end);
    if loser is not null then
      select case when is_king then 10 else 0 end into bounty from public.classroom_game_participants where id = loser;
      update public.classroom_game_participants set points = greatest(0, points - m.stake), momentum = 0,
        eliminated = points - m.stake <= 0, has_played_round = true where id = loser;
    end if;
    update public.classroom_game_participants set points = points + reward + bounty,
      momentum = momentum + 1, has_played_round = true where id = winner;
    update public.classroom_game_participants set has_played_round = true
      where id in (m.challenger_id, m.opponent_id);
  end if;

  update public.classroom_game_participants set is_king = false where session_id = m.session_id;
  update public.classroom_game_participants set is_king = true where id = (
    select id from public.classroom_game_participants
    where session_id = m.session_id and not eliminated order by points desc, joined_at asc limit 1
  );
  update public.classroom_game_matches set status = 'resolved', winner_id = winner,
    result_summary = case when winner is null then 'Ninguno acerto' else 'Duelo resuelto' end,
    resolved_at = now() where id = m.id;
end;
$$;

revoke all on function public.join_classroom_bwl_session(uuid) from public, anon;
revoke all on function public.place_classroom_bwl_bet(uuid, integer) from public, anon;
revoke all on function public.fold_classroom_bwl_match(uuid) from public, anon;
revoke all on function public.steal_classroom_bwl_match(uuid) from public, anon;
revoke all on function public.resolve_classroom_bwl_steal(uuid) from public, anon;
revoke all on function public.answer_classroom_bwl_question(uuid, integer) from public, anon;
revoke all on function public.expire_classroom_bwl_question(uuid) from public, anon;
grant execute on function public.join_classroom_bwl_session(uuid) to authenticated;
grant execute on function public.place_classroom_bwl_bet(uuid, integer) to authenticated;
grant execute on function public.fold_classroom_bwl_match(uuid) to authenticated;
grant execute on function public.steal_classroom_bwl_match(uuid) to authenticated;
grant execute on function public.resolve_classroom_bwl_steal(uuid) to authenticated;
grant execute on function public.answer_classroom_bwl_question(uuid, integer) to authenticated;
grant execute on function public.expire_classroom_bwl_question(uuid) to authenticated;

create index classroom_game_participants_student_idx
  on public.classroom_game_participants(tenant_id, student_id, last_seen_at desc);

comment on table public.classroom_question_banks is
  'Bancos reutilizables propiedad de un profesor; independientes de tareas y calificaciones.';
comment on column public.classroom_game_participants.last_seen_at is
  'Marca de reconexion; el participante se identifica por usuario, no por almacenamiento local.';
