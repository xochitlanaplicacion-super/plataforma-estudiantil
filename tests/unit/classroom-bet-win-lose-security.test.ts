import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260908011020_classroom_bet_win_lose.sql'), 'utf8');
const actions = readFileSync(join(process.cwd(), 'src/lib/actions/classroom-games.ts'), 'utf8');
const room = readFileSync(join(process.cwd(), 'src/components/classroom-games/BetWinLoseRoom.tsx'), 'utf8');

describe('Bet Win Lose multi-tenant y recuperable', () => {
  it('mantiene la actividad fuera de la libreta de calificaciones', () => {
    expect(migration).not.toMatch(/references public\.(calificaciones|criterios_evaluacion|resultados_academicos)/);
    expect(migration).toContain('practica en clase');
  });

  it('bloquea acceso directo y valida identidad en mutaciones competitivas', () => {
    for (const table of ['classroom_question_banks', 'classroom_question_items', 'classroom_game_sessions', 'classroom_game_participants', 'classroom_game_matches']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toMatch(new RegExp(`revoke all on(?: table)? public\\.${table} from anon, authenticated`));
    }
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain("p.tenant_id = target.tenant_id");
    expect(migration).toContain("i.grupo_id = a.grupo_id");
  });

  it('reconecta por usuario y conserva todo el estado en base de datos', () => {
    expect(migration).toContain('unique (session_id, student_id)');
    expect(migration).toContain('last_seen_at');
    expect(actions).toContain('item.student_id === profile.id');
    expect(room).toContain("document.addEventListener('visibilitychange', resume)");
    expect(room).toContain("window.addEventListener('online', resume)");
    expect(room).toContain('setInterval(() => void refresh(), 1500)');
  });

  it('no entrega la clave correcta mientras el duelo sigue abierto', () => {
    expect(actions).toContain("match.status === 'resolved' ? { correctIndex: data.correct_index");
    expect(actions).not.toContain('question_order: session.question_order');
  });

  it('limita la sala a cuarenta y resuelve apuestas y respuestas bajo bloqueo de fila', () => {
    expect(migration).toContain('max_players between 2 and 40');
    expect(migration.match(/for update/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('expire_classroom_bwl_question');
  });

  it('conserva retirada, robo y reemplazo aleatorio del juego original', () => {
    expect(migration).toContain('fold_classroom_bwl_match');
    expect(migration).toContain('steal_classroom_bwl_match');
    expect(migration).toContain('resolve_classroom_bwl_steal');
    expect(migration).toContain('steal_seconds smallint not null default 15');
    expect(migration).toContain('order by random() limit 1');
  });
});
