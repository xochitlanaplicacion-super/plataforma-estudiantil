// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavalBoard } from '@/components/classroom-games/naval/NavalBoard';
import { NavalUnitIcon, NAVAL_UNIT_NAMES } from '@/components/classroom-games/naval/NavalArt';
import type { NavalCell, NavalShip, NavalShipKind } from '@/lib/activities/naval-battle';

const ship = (kind: NavalShipKind = 'nuclear', cells: NavalCell[] = [{ row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 }, { row: 1, col: 5 }], sunk = false): NavalShip => ({
  id: `secret-player:${kind}`, kind, cells, anchor: cells[0], rotation: 0, hits: sunk ? cells : [], sunk,
});

let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let context: { clearRect: ReturnType<typeof vi.fn>; setTransform: ReturnType<typeof vi.fn>; beginPath: ReturnType<typeof vi.fn>; arc: ReturnType<typeof vi.fn>; fill: ReturnType<typeof vi.fn>; fillStyle: string; globalCompositeOperation: string };
const advanceFrame = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(time)));
};

beforeEach(() => {
  nextFrame = 0;
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  context = { clearRect: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillStyle: '', globalCompositeOperation: '' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Naval board: coordinates, ocean and exact fleet footprint', () => {
  it('renders the minimum 10 × 10 board with accessible coordinates and no automatic selection', () => {
    const onSelect = vi.fn();
    render(<NavalBoard size={10} islands={[{ row: 0, col: 0 }]} onSelect={onSelect} playerName="Equipo rojo" />);
    expect(screen.getByRole('region', { name: 'Mapa de Equipo rojo' })).toBeInTheDocument();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '10');
    expect(screen.getAllByRole('gridcell')).toHaveLength(100);
    expect(screen.getByRole('gridcell', { name: 'A1, isla, sin disparo' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('gridcell', { name: 'J10, mar, sin disparo' })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([10, 12, 14])('renders every coordinate for a %i-cell map without cutting its last row', (size) => {
    const { container } = render(<NavalBoard size={size} islands={[]} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(size * size);
    expect(container.querySelector('.nb-board')).toHaveStyle(`--nb-size: ${size}`);
    expect(container.querySelector('.nb-board-scroll')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: `${String.fromCharCode(64 + size)}${size}, mar, sin disparo` })).toBeInTheDocument();
  });

  it('selects only the clicked coordinate and reports hover without firing a shot', () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    render(<NavalBoard size={10} islands={[]} onSelect={onSelect} onHover={onHover} />);
    const target = screen.getByRole('gridcell', { name: 'C4, mar, sin disparo' });
    fireEvent.pointerEnter(target);
    expect(onHover).toHaveBeenCalledWith({ row: 3, col: 2 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(target);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ row: 3, col: 2 });
  });

  it('provides roving keyboard focus, clamps the board edges and keeps a single tab stop', () => {
    const onSelect = vi.fn();
    render(<NavalBoard size={10} islands={[]} onSelect={onSelect} />);
    const first = screen.getByRole('gridcell', { name: 'A1, mar, sin disparo' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('gridcell', { name: 'B1, mar, sin disparo' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(screen.getByRole('gridcell', { name: 'B2, mar, sin disparo' })).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('blocks all selections during a disabled turn', () => {
    const onSelect = vi.fn();
    render(<NavalBoard size={10} islands={[]} onSelect={onSelect} disabled />);
    const first = screen.getAllByRole('gridcell')[0];
    expect(first).toBeDisabled();
    fireEvent.click(first);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByRole('gridcell').every((cell) => cell.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('marks a selected coordinate and valid or invalid placement preview independently', () => {
    const cells = [{ row: 2, col: 2 }, { row: 2, col: 3 }];
    const { rerender } = render(<NavalBoard size={10} islands={[]} selectedCell={cells[0]} previewCells={cells} previewValid />);
    expect(screen.getByRole('gridcell', { name: 'C3, mar, sin disparo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('gridcell', { name: 'D3, mar, sin disparo' })).toHaveClass('nb-cell--preview');
    rerender(<NavalBoard size={10} islands={[]} previewCells={cells} previewValid={false} />);
    expect(screen.getByRole('gridcell', { name: 'D3, mar, sin disparo' })).toHaveClass('nb-cell--invalid');
  });

  it('draws two animated ocean layers and a bounded number of vector palms', () => {
    const { container, rerender } = render(<NavalBoard size={10} islands={[{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 3 }]} />);
    expect(container.querySelectorAll('.nb-ocean')).toHaveLength(2);
    expect(container.querySelectorAll('.nb-palm')).toHaveLength(2);
    expect(container.querySelectorAll('path.nb-island-shore')).toHaveLength(4);
    expect(container.querySelectorAll('rect.nb-island-shore')).toHaveLength(4);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    rerender(<NavalBoard size={10} islands={[]} paused />);
    expect(container.querySelector('.nb-board')).toHaveClass('nb-board--paused');
  });

  it('clips a diagonal friendly submarine to exactly its four occupied cells', () => {
    const diagonal = ship('nuclear', [{ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 }, { row: 4, col: 4 }]);
    diagonal.rotation = 45;
    const { container } = render(<NavalBoard size={10} islands={[]} ships={[diagonal]} showFleet />);
    expect(screen.getByRole('img', { name: 'Submarino nuclear' })).toBeInTheDocument();
    const clip = container.querySelector('clipPath')!;
    expect(clip.querySelectorAll('rect')).toHaveLength(4);
    expect([...clip.querySelectorAll('rect')].map((rect) => [rect.getAttribute('x'), rect.getAttribute('y')])).toEqual([['100', '100'], ['200', '200'], ['300', '300'], ['400', '400']]);
    expect(container.innerHTML).toContain('rotate(45)');
  });

  it('uses independent SVG IDs when multiple boards and icons are mounted', () => {
    const { container } = render(<><NavalBoard size={10} islands={[]} ships={[ship()]} showFleet /><NavalBoard size={10} islands={[]} ships={[ship()]} showFleet /><NavalUnitIcon kind="carrier" /></>);
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(['nuclear', 'semi_nuclear', 'carrier', 'supply', 'destroyer', 'troops', 'hospital'] as const)('provides a native vector model for %s', (kind) => {
    const { container } = render(<NavalUnitIcon kind={kind} />);
    expect(container.querySelector('svg.nb-unit-icon path')).toBeInTheDocument();
    expect(container.querySelector('image')).not.toBeInTheDocument();
    expect(NAVAL_UNIT_NAMES[kind]).toBeTruthy();
  });
});

describe('Naval board: enemy confidentiality and readable shot evidence', () => {
  it('does not insert live enemy ship models, names, IDs or full masks in the DOM', () => {
    const { container } = render(<NavalBoard size={10} islands={[]} ships={[ship()]} />);
    expect(screen.queryByRole('img', { name: /Submarino nuclear/ })).not.toBeInTheDocument();
    expect(container.querySelector('.nb-fleet-unit')).not.toBeInTheDocument();
    expect(container.querySelector('clipPath')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('secret-player');
    expect(container.innerHTML).not.toContain('Submarino nuclear');
  });

  it('shows only the intersecting live ship cell during radar, not the remaining footprint', () => {
    const { container, rerender } = render(<NavalBoard size={10} islands={[]} ships={[ship()]} radarCells={[{ row: 1, col: 2 }, { row: 0, col: 2 }]} />);
    const fragments = container.querySelectorAll('.nb-radar-fragment');
    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toHaveAttribute('transform', 'translate(200 100)');
    expect(container.querySelector('clipPath')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain('Submarino nuclear');
    expect(container.querySelectorAll('.nb-cell--radar')).toHaveLength(2);
    rerender(<NavalBoard size={10} islands={[]} ships={[ship()]} radarCells={[]} />);
    expect(container.querySelector('.nb-radar-fragment')).not.toBeInTheDocument();
    expect(container.querySelector('.nb-cell--radar')).not.toBeInTheDocument();
  });

  it('hospital interference shows uniform static without exposing any live occupied radar cell', () => {
    const { container, rerender } = render(<NavalBoard size={10} islands={[]} ships={[ship()]} radarCells={[{ row: 1, col: 2 }, { row: 0, col: 2 }]} radarInterference />);
    expect(container.querySelector('.nb-board')).toHaveClass('nb-board--interference');
    expect(container.querySelector('.nb-radar-fragment')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.nb-cell--radar')).toHaveLength(2);
    expect(container.innerHTML).not.toContain('Submarino nuclear');
    expect(screen.getByText('Señal interferida: flota oculta')).toBeInTheDocument();
    rerender(<NavalBoard size={10} islands={[]} ships={[ship()]} radarCells={[{ row: 1, col: 2 }]} radarInterference={false} />);
    expect(container.querySelectorAll('.nb-radar-fragment')).toHaveLength(1);
  });

  it('clips the hospital to its three L-shaped coordinates', () => {
    const hospital = ship('hospital', [{ row: 2, col: 3 }, { row: 2, col: 4 }, { row: 3, col: 3 }]);
    const { container } = render(<NavalBoard size={10} islands={[]} ships={[hospital]} showFleet />);
    expect(screen.getByRole('img', { name: 'Hospital' })).toBeInTheDocument();
    expect(container.querySelectorAll('clipPath rect')).toHaveLength(3);
    expect(container.querySelector('.nb-unit-icon')).toBeInTheDocument();
  });

  it('leaves sunk enemy wrecks visible with fire and every red hit coordinate', () => {
    const wreck = ship('destroyer', [{ row: 3, col: 2 }, { row: 3, col: 3 }], true);
    const { container } = render(<NavalBoard size={10} islands={[]} ships={[wreck, ship()]} shots={wreck.cells.map((cell) => ({ ...cell, hit: true }))} />);
    expect(screen.getByRole('img', { name: 'Destructor, hundido' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Submarino nuclear' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.nb-fleet-unit')).toHaveLength(1);
    expect(container.querySelector('.nb-wreck-fire')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'C4, mar, impacto' })).toHaveClass('nb-cell--hit');
    expect(screen.getByRole('gridcell', { name: 'D4, mar, impacto' })).toHaveClass('nb-cell--hit');
  });

  it('keeps white splash markers distinct from red explosions, with text labels', () => {
    render(<NavalBoard size={10} islands={[]} shots={[{ row: 0, col: 0, hit: false }, { row: 0, col: 1, hit: true }]} />);
    expect(screen.getByRole('gridcell', { name: 'A1, mar, agua' })).toHaveClass('nb-cell--miss');
    expect(screen.getByRole('gridcell', { name: 'B1, mar, impacto' })).toHaveClass('nb-cell--hit');
    expect(screen.getByLabelText('Leyenda del mapa')).toHaveTextContent('ImpactoAguaIsla');
  });

  it('ignores malformed coordinates instead of placing art outside the board', () => {
    const malformed = ship('nuclear', [{ row: 0, col: 0 }, { row: 90, col: 90 }]);
    const { container } = render(<NavalBoard size={10} islands={[{ row: -1, col: 0 }]} ships={[malformed]} showFleet radarCells={[{ row: 999, col: 0 }]} />);
    expect(container.querySelector('.nb-island-shore')).not.toBeInTheDocument();
    expect(container.querySelector('.nb-fleet-unit')).not.toBeInTheDocument();
    expect(container.querySelector('.nb-cell--radar')).not.toBeInTheDocument();
  });
});

describe('Naval board: bounded particle lifecycle', () => {
  it('uses one canvas/RAF and at most 144 particles for an oversized salvo', () => {
    const effects = Array.from({ length: 30 }, (_, index) => ({ row: Math.floor(index / 10), col: index % 10, hit: index % 2 === 0 }));
    const { container, unmount } = render(<NavalBoard size={10} islands={[]} effects={effects} effectId={1} />);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelector('canvas')).toHaveAttribute('data-particle-count', '144');
    expect(frames.size).toBe(1);
    advanceFrame(0);
    expect(frames.size).toBe(1);
    expect(context.arc).toHaveBeenCalled();
    unmount();
    expect(frames.size).toBe(0);
  });

  it('stops after 900 milliseconds of active animation and clears the canvas', () => {
    const { container } = render(<NavalBoard size={10} islands={[]} effects={[{ row: 1, col: 1, hit: true }]} effectId={1} />);
    for (let time = 0; time <= 1_000; time += 100) advanceFrame(time);
    expect(frames.size).toBe(0);
    expect(container.querySelector('canvas')).toHaveAttribute('data-particle-count', '0');
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('cancels the old animation when a new salvo arrives rather than stacking loops', () => {
    const { rerender } = render(<NavalBoard size={10} islands={[]} effects={[{ row: 0, col: 0, hit: true }]} effectId={1} />);
    const firstId = nextFrame;
    rerender(<NavalBoard size={10} islands={[]} effects={[{ row: 2, col: 2, hit: false }]} effectId={2} />);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(firstId);
    expect(frames.size).toBe(1);
  });

  it('freezes particles during pause and resumes without advancing the paused time', () => {
    const effects = [{ row: 0, col: 0, hit: true }];
    const { rerender, container } = render(<NavalBoard size={10} islands={[]} effects={effects} effectId={1} />);
    advanceFrame(0); advanceFrame(100);
    rerender(<NavalBoard size={10} islands={[]} effects={effects} effectId={1} paused />);
    expect(frames.size).toBe(0);
    rerender(<NavalBoard size={10} islands={[]} effects={effects} effectId={1} paused={false} />);
    advanceFrame(10_000); advanceFrame(10_100);
    expect(frames.size).toBe(1);
    expect(container.querySelector('canvas')).toHaveAttribute('data-particle-count', '16');
  });

  it('uses a short static glow with no animation loop under reduced motion', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { container } = render(<NavalBoard size={10} islands={[]} effects={[{ row: 0, col: 0, hit: false }]} effectId={1} />);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(901));
    expect(container.querySelector('canvas')).toHaveAttribute('data-particle-count', '0');
  });

  it('fails safely when canvas is unavailable', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    render(<NavalBoard size={10} islands={[]} effects={[{ row: 0, col: 0, hit: true }]} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(100);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
