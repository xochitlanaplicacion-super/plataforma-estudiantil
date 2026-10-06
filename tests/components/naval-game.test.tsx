// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavalState } from '@/lib/activities/naval-battle';

const observed = vi.hoisted(() => ({ state: null as NavalState | null, requestFullscreen: vi.fn(), exitFullscreen: vi.fn(), fullscreenChanged: null as ((active: boolean) => void) | null, closed: vi.fn() }));
vi.mock('@/lib/activities/naval-battle', async (loadOriginal) => {
  const engine = await loadOriginal<typeof import('@/lib/activities/naval-battle')>();
  const wrap = (operation: (...args: never[]) => NavalState) => (...args: never[]) => { const next = operation(...args); observed.state = next; return next; };
  const operations = ['createNavalBattle', 'placeNavalShip', 'removeNavalShip', 'autoPlaceNavalFleet', 'confirmNavalFleet', 'startNavalTurn', 'answerNavalTurn', 'continueNavalAnswer', 'attackNaval', 'advanceNavalTurn', 'skipNavalAttack', 'activateNavalRadar', 'activateNavalFlare', 'repairNavalShip', 'clearNavalRadar', 'selectNavalTarget'] as const;
  return { ...engine, ...Object.fromEntries(operations.map((name) => [name, wrap(engine[name] as (...args: never[]) => NavalState)])) };
});
vi.mock('@/components/activities/flying-cat/FlyingCatViewport', async () => {
  const React = await import('react');
  return {
    FlyingCatViewport: React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => <div ref={ref} data-testid="naval-native-viewport">{children}</div>),
    useFlyingCatFullscreen: () => {
      const [isFullscreen, setIsFullscreen] = React.useState(false);
      observed.fullscreenChanged = setIsFullscreen;
      return {
        viewportRef: () => {}, isFullscreen, supported: true, requesting: false, message: '', clearMessage: () => {},
        requestFullscreen: async () => { const accepted = await observed.requestFullscreen(); if (accepted) setIsFullscreen(true); return accepted; },
        exitFullscreen: async () => { const accepted = await observed.exitFullscreen(); if (accepted) setIsFullscreen(false); return accepted; },
      };
    },
  };
});
import NavalBattleGame from '@/components/classroom-games/naval/NavalBattleGame';
import { canPlaceNavalShip, NAVAL_CORRECT_XP, NAVAL_SHIP_KINDS, NAVAL_SUPPLY_XP, previewShipCells } from '@/lib/activities/naval-battle';

function questions(count = 10, optionCount = 4) {
  return { items: Array.from({ length: count }, (_, index) => ({ id: `q${index + 1}`, type: 'multiple_choice', prompt: `Pregunta educativa ${index + 1}: ¿qué palabra corresponde a un planeta?`, options: ['Tierra', 'Mesa', 'Lápiz', 'Puerta', 'Ventana', 'Libro'].slice(0, optionCount), correctIndex: 0, explanation: 'La Tierra es un planeta; las otras opciones son objetos cotidianos.' })) };
}
async function click(name: string | RegExp) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); }
async function advance(time: number) { await act(async () => { await vi.advanceTimersByTimeAsync(time); }); }
async function placeBoth() {
  await click('Comenzar colocación de flotas');
  for (let index = 0; index < 2; index++) {
    await click('Estoy listo para colocar mi flota');
    await click('Acomodar flota automáticamente');
    await click('Guardar flota y ocultar');
  }
  await click('Comenzar siguiente turno');
}
async function makeQuestionMode() {
  fireEvent.change(screen.getByLabelText('Modalidad de preguntas'), { target: { value: 'multiple_choice' } });
  fireEvent.change(screen.getByLabelText('Grado, nivel y dificultad'), { target: { value: 'Primero de secundaria, básico' } });
  fireEvent.change(screen.getByLabelText('Tema e instrucciones'), { target: { value: 'Los planetas del sistema solar.' } });
  await click('Generar banco para revisar');
  fireEvent.click(screen.getByRole('checkbox', { name: /Revisé el banco/ }));
}
const currentTarget = () => observed.state!.players.find((player) => player.id === observed.state!.targetId)!;
const currentActor = () => observed.state!.players.find((player) => player.id === observed.state!.actorId)!;
const nameOfCell = ({ row, col }: { row: number; col: number }) => new RegExp(`^${String.fromCharCode(65 + col)}${row + 1},`);
async function fireAtFreshUnit() {
  const target = currentTarget();
  const cell = target.ships.flatMap((unit) => unit.cells).find((candidate) => !target.shots.some((shot) => shot.row === candidate.row && shot.col === candidate.col))!;
  fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(cell) })); await click(/^Disparar en /);
}
async function reachThirdOwnAttack() {
  for (let turn = 1; turn <= 5; turn++) {
    await click(turn === 4 ? /Mesa/ : /Tierra/);
    if (turn === 4) { await click('Pasar al siguiente equipo'); await click('Comenzar siguiente turno'); continue; }
    await click('Elegir coordenada de disparo');
    if (turn === 5) return;
    await fireAtFreshUnit(); await click('Continuar al siguiente turno'); await click('Comenzar siguiente turno');
  }
}

beforeEach(() => {
  observed.state = null; observed.closed.mockReset(); observed.fullscreenChanged = null;
  observed.requestFullscreen.mockReset().mockResolvedValue(true); observed.exitFullscreen.mockReset().mockResolvedValue(true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => questions() }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect() {}, setTransform() {}, beginPath() {}, arc() {}, fill() {}, fillStyle: '', globalCompositeOperation: '' } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Naval classroom game: local setup and private handoffs', () => {
  it('defaults to an offline, ungraded game and does not request AI', () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    expect(screen.getByLabelText('Modalidad de preguntas')).toHaveValue('none');
    expect(screen.getByLabelText('Número de equipos')).toHaveValue('2');
    expect(screen.getByText(/LOCAL, SIN CALIFICACIÓN/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Generar banco para revisar' })).not.toBeInTheDocument();
  }, 10_000);

  it('supports ten teams, minimum 10 × 10 and a separate random rival rule', () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    fireEvent.change(screen.getByLabelText('Número de equipos'), { target: { value: '10' } });
    expect(screen.getAllByRole('textbox', { name: /^Nombre del equipo/ })).toHaveLength(10);
    expect(screen.getByRole('option', { name: 'Pequeño · 10 × 10' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Orden de turnos'), { target: { value: 'random' } });
    expect(screen.getByLabelText('Contrincante')).toHaveValue('sequential');
    fireEvent.change(screen.getByLabelText('Contrincante'), { target: { value: 'random' } });
    expect(screen.getByLabelText('Orden de turnos')).toHaveValue('random');
  }, 10_000);

  it('requests native fullscreen only on starting and hides every fleet between devices', async () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    expect(observed.requestFullscreen).not.toHaveBeenCalled();
    await click('Comenzar colocación de flotas');
    expect(observed.requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    await click('Estoy listo para colocar mi flota');
    await click('Acomodar flota automáticamente');
    expect(document.querySelectorAll('.nb-fleet-unit')).toHaveLength(NAVAL_SHIP_KINDS.length);
    expect(observed.state!.players[0].ships).toHaveLength(NAVAL_SHIP_KINDS.length);
    await click('Guardar flota y ocultar');
    expect(screen.getByText('Entrega el dispositivo a Equipo 2')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(document.querySelector('.nb-fleet-unit')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  }, 10_000);

  it('rejects incomplete fleets rather than silently duplicating or skipping boats', async () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    await click('Comenzar colocación de flotas'); await click('Estoy listo para colocar mi flota');
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeDisabled();
    await click('Acomodar flota automáticamente');
    const initial = observed.state!.players[0].ships;
    await click('Acomodar flota automáticamente');
    expect(observed.state!.players[0].ships).toHaveLength(NAVAL_SHIP_KINDS.length);
    expect(new Set(observed.state!.players[0].ships.map((unit) => unit.kind)).size).toBe(NAVAL_SHIP_KINDS.length);
    expect(initial).not.toBe(observed.state!.players[0].ships);
  }, 10_000);

  it('rotates the actual preview image and footprint without saving until explicit confirmation', async () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    await click('Comenzar colocación de flotas'); await click('Estoy listo para colocar mi flota');
    const before = observed.state!;
    const player = before.players[0];
    const anchor = Array.from({ length: before.size ** 2 }, (_, index) => ({ row: Math.floor(index / before.size), col: index % before.size }))
      .find((cell) => [0, 45].every((angle) => canPlaceNavalShip(before, player.id, 'nuclear', cell, angle)))!;
    expect(anchor).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmar posición' })).toBeDisabled();
    fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(anchor) }));
    const orientation = () => document.querySelector('.nb-fleet-unit > g[clip-path] > g')!.getAttribute('transform');
    expect(orientation()).toContain('rotate(0)');
    expect(observed.state).toBe(before);
    await click(/Girar ·/);
    expect(orientation()).toContain('rotate(45)');
    expect(observed.state).toBe(before);
    for (const cell of previewShipCells('nuclear', anchor, 45)) expect(screen.getByRole('gridcell', { name: nameOfCell(cell) })).toHaveClass('nb-cell--preview');
    const confirm = screen.getByRole('button', { name: 'Confirmar posición' });
    expect(confirm).toBeEnabled();
    await act(async () => {
      fireEvent.click(confirm);
      const justConfirmed = observed.state;
      fireEvent.click(confirm);
      expect(observed.state).toBe(justConfirmed);
    });
    expect(observed.state!.players[0].ships).toHaveLength(1);
    expect(observed.state!.players[0].ships[0]).toMatchObject({ kind: 'nuclear', rotation: 45, anchor, cells: previewShipCells('nuclear', anchor, 45) });
    expect(screen.getByRole('button', { name: 'Confirmar posición' })).toBeDisabled();
    expect(screen.getByText('Posición guardada.')).toBeInTheDocument();
  }, 15_000);

  it('keeps confirmed positions intact when cancelling a rotation or invalid position, and blocks handoff while pending', async () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    await click('Comenzar colocación de flotas'); await click('Estoy listo para colocar mi flota'); await click('Acomodar flota automáticamente');
    const before = observed.state;
    const saved = before!.players[0].ships.find((ship) => ship.kind === 'nuclear')!;
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeEnabled();
    await click(/Girar ·/);
    expect(observed.state).toBe(before);
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeDisabled();
    await click('Cancelar cambio');
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Girar ·/ })).toHaveTextContent(`${saved.rotation}°`);
    fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(before!.islands[0]) }));
    expect(screen.getByRole('button', { name: 'Confirmar posición' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeDisabled();
    expect(screen.getByText(/Posición no válida/)).toBeInTheDocument();
    await click('Cancelar cambio');
    expect(observed.state).toBe(before);
    expect(screen.getByRole('button', { name: 'Guardar flota y ocultar' })).toBeEnabled();
  }, 15_000);
});

describe('Naval classroom game: shared screen turns and active clocks', () => {
  it('selecting a cell does not shoot; confirmation records one shot even after a double click', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    const target = currentTarget(); const cell = target.ships[0].cells[0];
    expect(document.querySelector('.nb-fleet-unit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(cell) }));
    expect(target.shots).toHaveLength(0);
    const confirmation = screen.getByRole('button', { name: /^Disparar en / });
    await act(async () => { fireEvent.click(confirmation); fireEvent.click(confirmation); });
    expect(currentTarget().shots).toHaveLength(1);
    expect(currentTarget().shots[0]).toEqual({ ...cell, hit: true });
    expect(observed.state!.phase).toBe('attack_result');
    expect(screen.getByRole('gridcell', { name: nameOfCell(cell) })).toHaveClass('nb-cell--hit');
    expect(fetch).not.toHaveBeenCalled();
  }, 10_000);

  it('pausing freezes the shot clock and resuming preserves the remaining time', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    await advance(2_000);
    const before = screen.getByRole('timer').textContent;
    await click(/Pausa/);
    expect(screen.getByText('Partida en pausa')).toBeInTheDocument();
    await advance(20_000);
    expect(screen.getByRole('timer').textContent).toBe(before);
    expect(observed.state!.phase).toBe('attack');
    await click('Reanudar'); await advance(1_000);
    expect(screen.getByRole('timer').textContent).not.toBe(before);
    expect(observed.requestFullscreen).toHaveBeenCalledOnce();
  }, 10_000);

  it('touch panning, blur, visibility and browser fullscreen exits never open pause or close overlays', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    await advance(2_000);
    const before = observed.state;
    const remaining = screen.getByRole('timer').textContent;
    const scroller = document.querySelector('.nb-board-scroll')!;
    fireEvent.pointerDown(scroller, { pointerType: 'touch', clientX: 200, clientY: 300 });
    fireEvent.pointerMove(scroller, { pointerType: 'touch', clientX: 80, clientY: 200 });
    fireEvent.scroll(scroller, { target: { scrollLeft: 120, scrollTop: 100 } });
    fireEvent.pointerUp(scroller, { pointerType: 'touch', clientX: 80, clientY: 200 });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
      observed.fullscreenChanged?.(false);
      document.dispatchEvent(new Event('fullscreenchange'));
      document.dispatchEvent(new Event('webkitfullscreenchange'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(observed.state).toBe(before);
    expect(screen.queryByText('Partida en pausa')).not.toBeInTheDocument();
    expect(screen.queryByText('¿Cerrar Batalla Naval?')).not.toBeInTheDocument();
    expect(document.querySelector('.naval-content')).not.toHaveAttribute('inert');
    expect(observed.exitFullscreen).not.toHaveBeenCalled();
    expect(observed.closed).not.toHaveBeenCalled();
    expect(observed.requestFullscreen).toHaveBeenCalledOnce();
    await advance(1_100);
    expect(screen.getByRole('timer').textContent).not.toBe(remaining);
    expect(observed.state!.phase).toBe('attack');
    await fireAtFreshUnit();
    expect(observed.state!.phase).toBe('attack_result');
  }, 15_000);

  it('explicit fullscreen controls preserve the battle; resume never forces fullscreen back on', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    const before = observed.state;
    await click('Salir de pantalla completa');
    expect(observed.exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeInTheDocument();
    expect(screen.queryByText('Partida en pausa')).not.toBeInTheDocument();
    expect(observed.state).toBe(before);
    await click(/Pausa/);
    const remaining = screen.getByRole('timer').textContent;
    await advance(20_000);
    expect(screen.getByRole('timer').textContent).toBe(remaining);
    await click('Reanudar');
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeInTheDocument();
    expect(observed.requestFullscreen).toHaveBeenCalledOnce();
    await click('Pantalla completa');
    expect(observed.requestFullscreen).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Salir de pantalla completa' })).toBeInTheDocument();
    expect(screen.queryByText('Partida en pausa')).not.toBeInTheDocument();
    expect(observed.state).toBe(before);
  }, 15_000);

  it('an expired shot skips damage and allows the next team to continue', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    await advance(30_100);
    expect(observed.state!.phase).toBe('attack_result');
    expect(observed.state!.lastAttack).toBeNull();
    expect(screen.getByText('Tiempo agotado. No hubo disparo.')).toBeInTheDocument();
    expect(currentTarget().shots).toHaveLength(0);
    await click('Continuar al siguiente turno'); await click('Comenzar siguiente turno');
    expect(observed.state!.turnNumber).toBe(2);
    expect(observed.state!.actorId).toBe(observed.state!.players[1].id);
  }, 10_000);

  it('canceling close preserves the local game and confirming close exits fullscreen once', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    const before = observed.state;
    await click('Cerrar Batalla Naval');
    expect(screen.getByText('¿Cerrar Batalla Naval?')).toBeInTheDocument();
    await advance(10_000);
    expect(observed.state).toBe(before);
    await click('Seguir jugando');
    expect(observed.closed).not.toHaveBeenCalled();
    await click('Cerrar Batalla Naval'); await click('Sí, cerrar la partida');
    expect(observed.closed).toHaveBeenCalledOnce();
    expect(observed.exitFullscreen).toHaveBeenCalledOnce();
  }, 10_000);

  it('earns a real lower-tier bonus, freezes the shot during its cinematic and resolves it only once', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await placeBoth();
    const firstCell = currentTarget().ships[0].cells[0];
    fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(firstCell) })); await click(/^Disparar en /);
    await click('Continuar al siguiente turno'); await click('Comenzar siguiente turno');
    await advance(30_100); // Other team's turn expires without hurting the first team's nuclear vessel.
    await click('Continuar al siguiente turno'); await click('Comenzar siguiente turno');
    const bonus = screen.getByRole('button', { name: /Big Boy/ });
    expect(bonus).toBeEnabled();
    const cell = currentTarget().ships[0].cells[1];
    await click(/Big Boy/); fireEvent.click(screen.getByRole('gridcell', { name: nameOfCell(cell) }));
    const before = currentTarget().shots.length;
    const confirmation = screen.getByRole('button', { name: /^Disparar en / });
    await act(async () => { fireEvent.click(confirmation); fireEvent.click(confirmation); });
    expect(observed.state!.phase).toBe('attack');
    expect(currentTarget().shots).toHaveLength(before);
    expect(document.querySelector('.naval-cinematic')).toBeInTheDocument();
    await advance(1_100);
    expect(observed.state!.phase).toBe('attack_result');
    expect(observed.state!.lastAttack?.special).toBe('big_boy');
    expect(observed.state!.lastAttack!.cells.length).toBeGreaterThan(0);
    expect(observed.state!.lastAttack!.cells.length).toBeLessThanOrEqual(2);
    expect(currentTarget().shots.length).toBeGreaterThan(before);
    expect(document.querySelector('.naval-cinematic')).not.toBeInTheDocument();
  }, 10_000);
});

describe('Naval classroom game: reviewed AI bank and question-driven shots', () => {
  it('requires a reviewed bank before starting and invalidates approval after changing topic', async () => {
    render(<NavalBattleGame onClose={observed.closed} />);
    fireEvent.change(screen.getByLabelText('Modalidad de preguntas'), { target: { value: 'multiple_choice' } });
    expect(screen.getByRole('button', { name: 'Comenzar colocación de flotas' })).toBeDisabled();
    await makeQuestionMode();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/exercises/generate-naval-battle', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByRole('button', { name: 'Comenzar colocación de flotas' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Tema e instrucciones'), { target: { value: 'Otro tema' } });
    expect(screen.getByRole('button', { name: 'Comenzar colocación de flotas' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: /Revisé el banco/ })).not.toBeInTheDocument();
  }, 10_000);

  it('a correct shuffled answer grants one shot and educational feedback first', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await makeQuestionMode(); await placeBoth();
    expect(observed.state!.phase).toBe('question');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const correct = screen.getByRole('button', { name: /Tierra/ });
    await act(async () => { fireEvent.click(correct); fireEvent.click(correct); });
    expect(observed.state!.phase).toBe('answer_result');
    expect(observed.state!.answerCorrect).toBe(true);
    expect(screen.getByText('¡Preparen el disparo!')).toBeInTheDocument();
    expect(screen.getByText('La Tierra es un planeta; las otras opciones son objetos cotidianos.')).toBeInTheDocument();
    const actor = observed.state!.players.find((player) => player.id === observed.state!.actorId)!;
    expect(actor.xp).toBe(NAVAL_SUPPLY_XP + NAVAL_CORRECT_XP); // Supply tick + one answer, not two clicks.
    await click('Elegir coordenada de disparo');
    expect(observed.state!.phase).toBe('attack');
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('30s');
  }, 10_000);

  it('a wrong answer never offers a coordinate, while timeout records a wrong result without a fake choice', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await makeQuestionMode(); await placeBoth();
    await click(/Mesa/);
    expect(observed.state!.answerCorrect).toBe(false);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    await click('Pasar al siguiente equipo'); await click('Comenzar siguiente turno');
    await advance(45_100);
    expect(observed.state!.phase).toBe('answer_result');
    expect(observed.state!.answerCorrect).toBe(false);
    expect(screen.getByText('SE AGOTÓ EL TIEMPO')).toBeInTheDocument();
    expect(screen.queryByText(/Respuesta elegida:/)).not.toBeInTheDocument();
  }, 10_000);

  it('reports generation errors and remains safely in setup', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Saldo de IA insuficiente.' }) } as Response);
    render(<NavalBattleGame onClose={observed.closed} />);
    fireEvent.change(screen.getByLabelText('Modalidad de preguntas'), { target: { value: 'multiple_choice' } });
    fireEvent.change(screen.getByLabelText('Grado, nivel y dificultad'), { target: { value: 'Primaria' } });
    fireEvent.change(screen.getByLabelText('Tema e instrucciones'), { target: { value: 'Planetas' } });
    await click('Generar banco para revisar');
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo de IA insuficiente.');
    expect(screen.getByRole('button', { name: 'Comenzar colocación de flotas' })).toBeDisabled();
    expect(observed.state).toBeNull();
  }, 10_000);

  it('repairs a real own hit through an intact hospital after earning 100 XP, without exposing intact coordinates', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await makeQuestionMode(); await placeBoth(); await reachThirdOwnAttack();
    const damaged = currentActor().ships.find((unit) => unit.hits.length > 0)!;
    const cell = { ...damaged.hits[0] };
    expect(currentActor().xp).toBe(100);
    expect(screen.getByRole('button', { name: /Reparación/ })).toBeEnabled();
    await click(/Reparación/);
    const choices = document.querySelectorAll<HTMLButtonElement>('.naval-repair-picker button');
    expect(choices).toHaveLength(1); // Only the actual hit, never healthy coordinates or a full own fleet.
    await act(async () => { fireEvent.click(choices[0]); });
    expect(document.querySelector('.naval-cinematic')).toBeInTheDocument();
    await advance(1_100);
    expect(observed.state!.phase).toBe('attack');
    expect(currentActor().ships.find((unit) => unit.id === damaged.id)!.hits).toHaveLength(0);
    expect(currentActor().shots.some((shot) => shot.row === cell.row && shot.col === cell.col)).toBe(false);
    expect(currentActor().xp).toBe(0);
    expect(screen.getByText(/reparado\. Si esa nave queda intacta/)).toBeInTheDocument();
    expect(document.querySelector('.nb-fleet-unit')).not.toBeInTheDocument();
  }, 20_000);

  it('lets the defender answer a separate ten-second question before resolving a nuclear attack', async () => {
    render(<NavalBattleGame onClose={observed.closed} />); await makeQuestionMode(); await placeBoth(); await reachThirdOwnAttack();
    const defenderXP = currentTarget().xp;
    expect(currentActor().xp).toBe(100);
    await click(/Bomba nuclear/);
    fireEvent.click(screen.getByRole('gridcell', { name: /^F6,/ })); await click(/^Disparar en /);
    expect(screen.getByText(/¿Reto relámpago para/)).toBeInTheDocument();
    const shotsBefore = currentTarget().shots.length;
    await click('Activar reto defensor');
    await click(/Tierra/);
    expect(currentTarget().shots).toHaveLength(shotsBefore);
    expect(document.querySelector('.naval-cinematic')).toBeInTheDocument();
    await advance(1_100);
    expect(observed.state!.phase).toBe('attack_result');
    expect(observed.state!.lastAttack?.special).toBe('nuclear');
    expect(observed.state!.lastAttack!.cells.length).toBeLessThanOrEqual(5);
    expect(currentTarget().xp).toBe(defenderXP); // Defense never invents academic or team XP.
    expect(screen.getByText(/Humo táctico: el defensor acertó/)).toBeInTheDocument();
  }, 20_000);
});
