'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantSession } from '@/lib/tenant/context';

const questionSchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
  questionType: z.enum(['multiple_choice', 'true_false']),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(1000).optional(),
}).refine((value) => value.correctIndex < value.options.length, 'Respuesta correcta inválida');

const bankSchema = z.object({
  bankId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  unitName: z.string().trim().max(120).optional(),
  topicName: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  questions: z.array(questionSchema).min(1).max(100),
});

const sessionSchema = z.object({
  assignmentId: z.string().uuid(),
  bankId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  maxPlayers: z.number().int().min(2).max(40),
  startingCoins: z.number().int().min(1).max(1000),
  responseSeconds: z.number().int().min(5).max(60),
});

export type ClassroomQuestionInput = z.infer<typeof questionSchema>;
export type ClassroomBankInput = z.infer<typeof bankSchema>;
export type ClassroomSessionInput = z.infer<typeof sessionSchema>;
export type ClassroomActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación';
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export async function loadTeacherClassroomAction(): Promise<ClassroomActionResult<any>> {
  try {
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    const db = admin as any;
    const [{ data: assignments, error: assignmentsError }, { data: banks, error: banksError }, { data: sessions, error: sessionsError }] = await Promise.all([
      db.from('asignaciones_profesor')
        .select('id,ciclo_escolar_id,materia_id,grupo_id,materias(nombre),grupos(nombre,grados(nombre),carreras(nombre,niveles(nombre)))')
        .eq('tenant_id', tenantId).eq('profesor_id', profile.id).eq('activo', true)
        .order('created_at', { ascending: false }),
      db.from('classroom_question_banks')
        .select('id,subject_id,title,unit_name,topic_name,description,status,updated_at,classroom_question_items(id,position,question_type,prompt,options,correct_index,explanation)')
        .eq('tenant_id', tenantId).eq('teacher_id', profile.id).neq('status', 'archived')
        .order('updated_at', { ascending: false }),
      db.from('classroom_game_sessions')
        .select('id,assignment_id,bank_id,title,status,max_players,starting_coins,response_seconds,current_round,opened_at,started_at,finished_at,updated_at,classroom_question_banks(title),asignaciones_profesor(materias(nombre),grupos(nombre))')
        .eq('tenant_id', tenantId).eq('teacher_id', profile.id)
        .order('updated_at', { ascending: false }).limit(30),
    ]);
    if (assignmentsError || banksError || sessionsError) throw assignmentsError || banksError || sessionsError;
    return { ok: true, data: { assignments: assignments || [], banks: banks || [], sessions: sessions || [] } };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function saveClassroomBankAction(input: ClassroomBankInput): Promise<ClassroomActionResult<{ id: string }>> {
  try {
    const parsed = bankSchema.parse(input);
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    const db = admin as any;
    const { data: subjectAssignment } = await db.from('asignaciones_profesor').select('id')
      .eq('tenant_id', tenantId).eq('profesor_id', profile.id).eq('materia_id', parsed.subjectId).eq('activo', true).limit(1).maybeSingle();
    if (!subjectAssignment) throw new Error('La materia no pertenece a tus asignaciones activas');

    let bankId = parsed.bankId;
    if (bankId) {
      const { data: owned } = await db.from('classroom_question_banks').select('id,status')
        .eq('id', bankId).eq('tenant_id', tenantId).eq('teacher_id', profile.id).maybeSingle();
      if (!owned) throw new Error('Banco no encontrado');
      const { error } = await db.from('classroom_question_banks').update({
        subject_id: parsed.subjectId, title: parsed.title, unit_name: parsed.unitName || null,
        topic_name: parsed.topicName || null, description: parsed.description || null, status: 'ready',
      }).eq('id', bankId).eq('tenant_id', tenantId).eq('teacher_id', profile.id);
      if (error) throw error;
      const { error: deleteError } = await db.from('classroom_question_items').delete()
        .eq('bank_id', bankId).eq('tenant_id', tenantId);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await db.from('classroom_question_banks').insert({
        tenant_id: tenantId, teacher_id: profile.id, subject_id: parsed.subjectId, title: parsed.title,
        unit_name: parsed.unitName || null, topic_name: parsed.topicName || null,
        description: parsed.description || null, status: 'ready',
      }).select('id').single();
      if (error) throw error;
      bankId = data.id;
    }
    const { error: questionsError } = await db.from('classroom_question_items').insert(parsed.questions.map((question, position) => ({
      tenant_id: tenantId, bank_id: bankId, position, question_type: question.questionType,
      prompt: question.prompt, options: question.options, correct_index: question.correctIndex,
      explanation: question.explanation || null,
    })));
    if (questionsError) throw questionsError;
    revalidatePath('/dashboard/profesor/banco-actividades');
    return { ok: true, data: { id: bankId! } };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function createClassroomSessionAction(input: ClassroomSessionInput): Promise<ClassroomActionResult<{ id: string }>> {
  try {
    const parsed = sessionSchema.parse(input);
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    const db = admin as any;
    const { data: assignment } = await db.from('asignaciones_profesor').select('id,ciclo_escolar_id,materia_id')
      .eq('id', parsed.assignmentId).eq('tenant_id', tenantId).eq('profesor_id', profile.id).eq('activo', true).maybeSingle();
    if (!assignment) throw new Error('Asignación no disponible');
    const { data: bank } = await db.from('classroom_question_banks').select('id,subject_id,status')
      .eq('id', parsed.bankId).eq('tenant_id', tenantId).eq('teacher_id', profile.id).eq('status', 'ready').maybeSingle();
    if (!bank || bank.subject_id !== assignment.materia_id) throw new Error('El banco debe corresponder a la materia seleccionada');
    const { data, error } = await db.from('classroom_game_sessions').insert({
      tenant_id: tenantId, assignment_id: assignment.id, cycle_id: assignment.ciclo_escolar_id,
      bank_id: bank.id, teacher_id: profile.id, title: parsed.title, max_players: parsed.maxPlayers,
      starting_coins: parsed.startingCoins, response_seconds: parsed.responseSeconds,
    }).select('id').single();
    if (error) throw error;
    revalidatePath('/dashboard/profesor/actividades-clase');
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function openClassroomSessionAction(sessionId: string): Promise<ClassroomActionResult> {
  try {
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    const db = admin as any;
    const { data: session } = await db.from('classroom_game_sessions').select('id,bank_id,status')
      .eq('id', sessionId).eq('tenant_id', tenantId).eq('teacher_id', profile.id).maybeSingle();
    if (!session || session.status !== 'draft') throw new Error('La sesión no puede abrirse');
    const { data: questions } = await db.from('classroom_question_items').select('id')
      .eq('tenant_id', tenantId).eq('bank_id', session.bank_id).order('position');
    if (!questions || questions.length < 1) throw new Error('El banco no contiene preguntas');
    const order = shuffle(questions.map((item: any) => item.id));
    const { error } = await db.from('classroom_game_sessions').update({
      status: 'lobby', question_order: order, current_question_position: 0, current_round: 0, opened_at: new Date().toISOString(),
    }).eq('id', session.id).eq('status', 'draft');
    if (error) throw error;
    revalidatePath('/dashboard/profesor/actividades-clase');
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

async function createNextMatch(sessionId: string, teacherId: string, tenantId: string, db: any) {
  const { data: session } = await db.from('classroom_game_sessions').select('*')
    .eq('id', sessionId).eq('tenant_id', tenantId).eq('teacher_id', teacherId).maybeSingle();
  if (!session || !['lobby', 'active'].includes(session.status)) throw new Error('La partida no está disponible');
  const { data: openMatch } = await db.from('classroom_game_matches').select('id,status')
    .eq('session_id', sessionId).in('status', ['betting', 'steal', 'answering']).maybeSingle();
  if (openMatch) throw new Error('Primero debe concluir el duelo actual');
  let { data: participants } = await db.from('classroom_game_participants').select('id,points,has_played_round')
    .eq('session_id', sessionId).eq('eliminated', false);
  if (!participants || participants.length < 2) {
    await db.from('classroom_game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', sessionId);
    return;
  }
  let eligible = participants.filter((item: any) => !item.has_played_round);
  let round = session.current_round || 1;
  if (eligible.length < 2) {
    round += 1;
    await db.from('classroom_game_participants').update({ has_played_round: false }).eq('session_id', sessionId).eq('eliminated', false);
    eligible = participants;
  }
  if (session.current_question_position >= session.question_order.length) {
    await db.from('classroom_game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', sessionId);
    return;
  }
  const pair = shuffle(eligible as Array<{ id: string; points: number; has_played_round: boolean }>).slice(0, 2);
  const { error } = await db.from('classroom_game_matches').insert({
    tenant_id: tenantId, session_id: sessionId, round_number: round,
    question_item_id: session.question_order[session.current_question_position],
    challenger_id: pair[0].id, opponent_id: pair[1].id,
  });
  if (error) throw error;
  await db.from('classroom_game_sessions').update({
    status: 'active', started_at: session.started_at || new Date().toISOString(), current_round: round,
    current_question_position: session.current_question_position + 1,
  }).eq('id', sessionId);
}

export async function advanceClassroomSessionAction(sessionId: string): Promise<ClassroomActionResult> {
  try {
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    await createNextMatch(z.string().uuid().parse(sessionId), profile.id, tenantId, admin as any);
    revalidatePath(`/dashboard/profesor/actividades-clase/${sessionId}`);
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function finishClassroomSessionAction(sessionId: string): Promise<ClassroomActionResult> {
  try {
    const { profile, tenantId, admin } = await requireTenantSession(['profesor']);
    const db = admin as any;
    const id = z.string().uuid().parse(sessionId);
    const { data: finished, error } = await db.from('classroom_game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId).eq('teacher_id', profile.id).in('status', ['lobby','active']).select('id').maybeSingle();
    if (error) throw error;
    if (!finished) throw new Error('La partida no existe o no pertenece al profesor');
    await db.from('classroom_game_matches').update({ status: 'cancelled', resolved_at: new Date().toISOString(), result_summary: 'Partida finalizada por el profesor' })
      .eq('session_id', id).eq('tenant_id', tenantId).in('status', ['betting', 'steal', 'answering']);
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function loadStudentClassroomSessionsAction(): Promise<ClassroomActionResult<any[]>> {
  try {
    const { profile, tenantId, admin } = await requireTenantSession(['alumno']);
    const db = admin as any;
    const { data: enrollments } = await db.from('inscripciones_alumno').select('grupo_id,ciclo_escolar_id')
      .eq('tenant_id', tenantId).eq('alumno_id', profile.id).eq('activo', true);
    if (!enrollments?.length) return { ok: true, data: [] };
    const pairs = enrollments.map((item: any) => `${item.grupo_id}:${item.ciclo_escolar_id}`);
    const { data: assignments } = await db.from('asignaciones_profesor').select('id,grupo_id,ciclo_escolar_id,materias(nombre),profiles!asignaciones_profesor_profesor_tenant_fkey(nombre,apellidos)')
      .eq('tenant_id', tenantId).eq('activo', true);
    const allowedIds = (assignments || []).filter((item: any) => pairs.includes(`${item.grupo_id}:${item.ciclo_escolar_id}`)).map((item: any) => item.id);
    if (!allowedIds.length) return { ok: true, data: [] };
    const { data, error } = await db.from('classroom_game_sessions')
      .select('id,title,status,max_players,opened_at,started_at,assignment_id,classroom_game_participants(id,student_id,points,eliminated)')
      .eq('tenant_id', tenantId).in('assignment_id', allowedIds).in('status', ['lobby','active']).order('opened_at', { ascending: false });
    if (error) throw error;
    const assignmentMap = new Map((assignments || []).map((item: any) => [item.id, item]));
    return { ok: true, data: (data || []).map((item: any) => ({ ...item, assignment: assignmentMap.get(item.assignment_id), joined: item.classroom_game_participants.some((p: any) => p.student_id === profile.id) })) };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function joinClassroomSessionAction(sessionId: string): Promise<ClassroomActionResult<{ participantId: string }>> {
  try {
    const { supabase } = await requireTenantSession(['alumno']);
    const { data, error } = await (supabase as any).rpc('join_classroom_bwl_session', { target_session_id: z.string().uuid().parse(sessionId) });
    if (error) throw error;
    return { ok: true, data: { participantId: data } };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function placeClassroomBetAction(matchId: string, bet: number): Promise<ClassroomActionResult> {
  try {
    const { supabase } = await requireTenantSession(['alumno']);
    const { error } = await (supabase as any).rpc('place_classroom_bwl_bet', { target_match_id: z.string().uuid().parse(matchId), requested_bet: z.number().int().positive().parse(bet) });
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function answerClassroomQuestionAction(matchId: string, answerIndex: number): Promise<ClassroomActionResult> {
  try {
    const { supabase } = await requireTenantSession(['alumno']);
    const { error } = await (supabase as any).rpc('answer_classroom_bwl_question', { target_match_id: z.string().uuid().parse(matchId), selected_index: z.number().int().min(0).max(5).parse(answerIndex) });
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function foldClassroomMatchAction(matchId: string): Promise<ClassroomActionResult> {
  try {
    const { supabase } = await requireTenantSession(['alumno']);
    const { error } = await (supabase as any).rpc('fold_classroom_bwl_match', { target_match_id: z.string().uuid().parse(matchId) });
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function stealClassroomMatchAction(matchId: string): Promise<ClassroomActionResult> {
  try {
    const { supabase } = await requireTenantSession(['alumno']);
    const { error } = await (supabase as any).rpc('steal_classroom_bwl_match', { target_match_id: z.string().uuid().parse(matchId) });
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}

export async function loadClassroomGameStateAction(sessionId: string): Promise<ClassroomActionResult<any>> {
  try {
    const { profile, tenantId, admin, supabase } = await requireTenantSession(['profesor', 'alumno']);
    const db = admin as any;
    const id = z.string().uuid().parse(sessionId);
    const { data: session } = await db.from('classroom_game_sessions')
      .select('id,tenant_id,assignment_id,teacher_id,title,status,max_players,starting_coins,response_seconds,current_round,opened_at,started_at,finished_at')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (!session) throw new Error('Partida no encontrada');
    if (profile.rol === 'profesor' && session.teacher_id !== profile.id) throw new Error('No autorizado');
    if (profile.rol === 'alumno') {
      const { data: assignment } = await db.from('asignaciones_profesor').select('grupo_id,ciclo_escolar_id').eq('id', session.assignment_id).eq('tenant_id', tenantId).maybeSingle();
      const { data: enrollment } = await db.from('inscripciones_alumno').select('id').eq('tenant_id', tenantId).eq('alumno_id', profile.id)
        .eq('grupo_id', assignment?.grupo_id || '').eq('ciclo_escolar_id', assignment?.ciclo_escolar_id || '').eq('activo', true).maybeSingle();
      if (!enrollment) throw new Error('No perteneces al grupo de esta actividad');
    }
    const [{ data: participants }, matchResult] = await Promise.all([
      db.from('classroom_game_participants').select('id,student_id,points,momentum,is_king,has_played_round,eliminated,last_seen_at,profiles!classroom_game_participants_student_fkey(nombre,apellidos)').eq('session_id', id).order('points', { ascending: false }),
      db.from('classroom_game_matches').select('id,round_number,question_item_id,challenger_id,opponent_id,status,challenger_bet,opponent_bet,stake,challenger_answer,opponent_answer,challenger_correct,opponent_correct,challenger_answered_at,opponent_answered_at,answer_deadline,folded_id,steal_deadline,winner_id,result_summary,resolved_at').eq('session_id', id).order('created_at', { ascending: false }).limit(1),
    ]);
    let match = matchResult.data?.[0] || null;
    if (match?.status === 'answering' && match.answer_deadline && new Date(match.answer_deadline).getTime() <= Date.now()) {
      await (supabase as any).rpc('expire_classroom_bwl_question', { target_match_id: match.id });
      const { data: refreshedMatches } = await db.from('classroom_game_matches').select('id,round_number,question_item_id,challenger_id,opponent_id,status,challenger_bet,opponent_bet,stake,challenger_answer,opponent_answer,challenger_correct,opponent_correct,challenger_answered_at,opponent_answered_at,answer_deadline,folded_id,steal_deadline,winner_id,result_summary,resolved_at').eq('session_id', id).order('created_at', { ascending: false }).limit(1);
      match = refreshedMatches?.[0] || match;
    }
    if (match?.status === 'steal' && match.steal_deadline && new Date(match.steal_deadline).getTime() <= Date.now()) {
      await (supabase as any).rpc('resolve_classroom_bwl_steal', { target_match_id: match.id });
      const { data: refreshedMatches } = await db.from('classroom_game_matches').select('id,round_number,question_item_id,challenger_id,opponent_id,status,challenger_bet,opponent_bet,stake,challenger_answer,opponent_answer,challenger_correct,opponent_correct,challenger_answered_at,opponent_answered_at,answer_deadline,folded_id,steal_deadline,winner_id,result_summary,resolved_at').eq('session_id', id).order('created_at', { ascending: false }).limit(1);
      match = refreshedMatches?.[0] || match;
    }
    let question = null;
    if (match) {
      const { data } = await db.from('classroom_question_items').select('id,question_type,prompt,options,correct_index,explanation').eq('id', match.question_item_id).maybeSingle();
      question = data ? { id: data.id, questionType: data.question_type, prompt: data.prompt, options: data.options,
        ...(match.status === 'resolved' ? { correctIndex: data.correct_index, explanation: data.explanation } : {}) } : null;
    }
    const ownParticipant = (participants || []).find((item: any) => item.student_id === profile.id) || null;
    if (ownParticipant) await db.from('classroom_game_participants').update({ last_seen_at: new Date().toISOString() }).eq('id', ownParticipant.id);
    return { ok: true, data: { session, participants: participants || [], match, question, ownParticipant, viewerRole: profile.rol } };
  } catch (error) { return { ok: false, message: messageOf(error) }; }
}
