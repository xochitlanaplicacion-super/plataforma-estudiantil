'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { NavalCell, NavalShip, NavalShot } from '@/lib/activities/naval-battle';
import { NAVAL_UNIT_NAMES, NavalPalm, NavalUnitIcon } from './NavalArt';
import './naval-board.css';

export interface NavalBoardProps {
  size: number;
  islands: readonly NavalCell[];
  ships?: readonly NavalShip[];
  shots?: readonly NavalShot[];
  showFleet?: boolean;
  radarCells?: readonly NavalCell[];
  radarInterference?: boolean;
  previewCells?: readonly NavalCell[];
  previewValid?: boolean;
  selectedCell?: NavalCell | null;
  onSelect?: (cell: NavalCell) => void;
  onHover?: (cell: NavalCell | null) => void;
  disabled?: boolean;
  effects?: readonly { row: number; col: number; hit: boolean }[];
  effectId?: number;
  playerName?: string;
  paused?: boolean;
  compact?: boolean;
}

const cellKey = ({ row, col }: NavalCell) => `${row}:${col}`;
const coordinate = ({ row, col }: NavalCell) => `${String.fromCharCode(65 + col)}${row + 1}`;
const inBounds = (cell: NavalCell, size: number) => Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size;

function FleetIllustration({ ship, id }: { ship: NavalShip; id: string }) {
  const minRow = Math.min(...ship.cells.map((cell) => cell.row));
  const maxRow = Math.max(...ship.cells.map((cell) => cell.row));
  const minCol = Math.min(...ship.cells.map((cell) => cell.col));
  const maxCol = Math.max(...ship.cells.map((cell) => cell.col));
  const centerX = (minCol + maxCol + 1) * 50;
  const centerY = (minRow + maxRow + 1) * 50;
  const linear = ship.kind === 'nuclear' || ship.kind === 'semi_nuclear' || ship.kind === 'destroyer';
  const length = linear ? (Math.hypot(maxCol - minCol, maxRow - minRow) + .85) * 100 : Math.max(maxCol - minCol + 1, maxRow - minRow + 1) * 100 - 16;
  const width = linear ? 78 : Math.min(maxCol - minCol + 1, maxRow - minRow + 1) * 100 - 16;
  // The engine's carrier starts as three rows and two columns (3 + 2 deck tiles).
  const rotation = ship.kind === 'troops' ? 0 : ship.kind === 'carrier' ? ship.rotation + 90 : ship.rotation;
  return <g className={`nb-fleet-unit ${ship.sunk ? 'nb-fleet-unit--sunk' : ''}`} role="img" aria-label={`${NAVAL_UNIT_NAMES[ship.kind]}${ship.sunk ? ', hundido' : ''}`}>
    <defs><clipPath id={id}>{ship.cells.map((cell) => <rect key={cellKey(cell)} x={cell.col * 100} y={cell.row * 100} width="100" height="100" />)}</clipPath></defs>
    {linear && <path d={`M${ship.cells.map((cell) => `${cell.col * 100 + 50},${cell.row * 100 + 50}`).join(' L')}`} fill="none" stroke={ship.sunk ? '#4b4240' : '#6a8f9b'} strokeWidth="12" strokeLinecap="round" opacity=".8" />}
    {ship.cells.map((cell) => <rect key={cellKey(cell)} x={cell.col * 100 + 6} y={cell.row * 100 + 6} width="88" height="88" rx="11" className="nb-fleet-footprint" />)}
    <g clipPath={`url(#${id})`}><g transform={`translate(${centerX} ${centerY}) rotate(${rotation})`}>
      <svg x={-length / 2} y={-width / 2} width={length} height={width} viewBox="0 0 160 100" preserveAspectRatio="none" overflow="visible"><NavalUnitIcon kind={ship.kind} sunk={ship.sunk} /></svg>
    </g></g>
    {ship.sunk && ship.cells.filter((_, index) => index % 2 === 0).map((cell, index) => <g key={cellKey(cell)} className="nb-wreck-fire" style={{ '--nb-fire-delay': `${index * -.23}s` } as CSSProperties} transform={`translate(${cell.col * 100 + 50} ${cell.row * 100 + 44})`}>
      <ellipse cy="12" rx="23" ry="12" fill="#ff7c24" opacity=".27" />
      <path d="M-15 16C-28-1-3-9-6-27 6-17 18-8 13 16Z" fill="#ff5833" /><path d="M-6 14C-14 1 4-4 3-16 14-2 12 6 5 14Z" fill="#ffdd78" />
      <circle className="nb-wreck-smoke" cx="0" cy="-27" r="11" fill="#192a35" opacity=".65" />
    </g>)}
  </g>;
}

interface Particle { x: number; y: number; vx: number; vy: number; radius: number; hit: boolean }
interface Burst { particles: Particle[]; elapsed: number; }

/** One short-lived canvas/RAF for the whole salvo; never one loop per coordinate. */
function NavalImpactParticles({ size, effects, effectId, paused }: {
  size: number;
  effects: NavalBoardProps['effects'];
  effectId?: number;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<Burst | null>(null);
  const effectRef = useRef(effects);
  effectRef.current = effects;
  const signature = (effects ?? []).slice(0, 9).map((cell) => `${cellKey(cell)}:${cell.hit}`).join('|');
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    const valid = (effectRef.current ?? []).filter((cell) => inBounds(cell, size)).slice(0, 9);
    const particles = valid.flatMap((cell, index) => Array.from({ length: 16 }, (_, point) => {
      const angle = point / 16 * Math.PI * 2 + index * .37;
      const speed = 14 + (point % 5) * 11;
      return { x: (cell.col + .5) / size, y: (cell.row + .5) / size, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: point % 3 === 0 ? 3 : 1.8, hit: cell.hit };
    }));
    burstRef.current = { particles, elapsed: 0 };
    if (canvasRef.current) canvasRef.current.dataset.particleCount = String(particles.length);
  }, [effectId, signature, size]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused || !burstRef.current?.particles.length) return;
    let candidate: CanvasRenderingContext2D | null;
    try { candidate = canvas.getContext('2d'); } catch { return; }
    if (!candidate) return;
    const context = candidate;
    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width || canvas.parentElement?.clientWidth || 600;
    const height = bounds.height || width;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const burst = burstRef.current;
    let frame = 0;
    let last: number | null = null;
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const time = (reduced ? 250 : burst.elapsed) / 1000;
      const alpha = Math.max(0, 1 - time / .9);
      context.globalCompositeOperation = 'lighter';
      for (const particle of burst.particles) {
        const x = particle.x * width + (reduced ? 0 : particle.vx * time);
        const y = particle.y * height + (reduced ? 0 : particle.vy * time + time * time * 19);
        context.beginPath();
        context.fillStyle = particle.hit ? `rgba(255,82,45,${alpha})` : `rgba(220,250,255,${alpha})`;
        context.arc(x, y, particle.radius * (1 + time * .4), 0, Math.PI * 2);
        context.fill();
        if (particle.radius === 3) {
          context.beginPath();
          context.fillStyle = particle.hit ? `rgba(255,98,53,${alpha * .17})` : `rgba(220,250,255,${alpha * .17})`;
          context.arc(x, y, particle.radius * 4, 0, Math.PI * 2);
          context.fill();
        }
      }
    };
    const tick = (now: number) => {
      if (last !== null) burst.elapsed += Math.min(Math.max(now - last, 0), 100);
      last = now;
      draw();
      if (burst.elapsed < 900) frame = window.requestAnimationFrame(tick);
      else { context.clearRect(0, 0, width, height); canvas.dataset.particleCount = '0'; }
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (reduced) { draw(); timeout = setTimeout(() => { context.clearRect(0, 0, width, height); canvas.dataset.particleCount = '0'; burst.elapsed = 900; }, 900); }
    else if (burst.elapsed < 900) frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); if (timeout !== undefined) clearTimeout(timeout); };
  }, [effectId, signature, size, paused, reduced]);
  return <canvas ref={canvasRef} className="nb-impact-canvas" aria-hidden="true" />;
}

export function NavalBoard({ size: requestedSize, islands, ships = [], shots = [], showFleet = false, radarCells = [], radarInterference = false, previewCells = [], previewValid = true, selectedCell, onSelect, onHover, disabled = false, effects, effectId, playerName, paused = false, compact = false }: NavalBoardProps) {
  const size = Math.max(10, Math.min(14, Math.round(Number.isFinite(requestedSize) ? requestedSize : 10)));
  const uid = useId().replace(/:/g, '');
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusCell, setFocusCell] = useState<NavalCell>({ row: 0, col: 0 });
  useEffect(() => setFocusCell((cell) => ({ row: Math.min(cell.row, size - 1), col: Math.min(cell.col, size - 1) })), [size]);
  const islandSet = new Set(islands.filter((cell) => inBounds(cell, size)).map(cellKey));
  const radarSet = new Set(radarCells.filter((cell) => inBounds(cell, size)).map(cellKey));
  const previewSet = new Set(previewCells.filter((cell) => inBounds(cell, size)).map(cellKey));
  const shotMap = new Map(shots.filter((cell) => inBounds(cell, size)).map((shot) => [cellKey(shot), shot]));
  const visibleShips = ships.filter((ship) => (showFleet || ship.sunk) && ship.cells.length > 0 && ship.cells.every((cell) => inBounds(cell, size)));
  // IMPORTANT: enemy live hulls are never rendered then "hidden" with CSS or a mask.
  // Radar gets only intersecting occupied cells, not a ship object, name or full footprint.
  const radarOccupied = showFleet || radarInterference ? [] : ships.filter((ship) => !ship.sunk).flatMap((ship) => ship.cells.filter((cell) => inBounds(cell, size) && radarSet.has(cellKey(cell))));
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, cell: NavalCell) => {
    const delta: Record<string, NavalCell> = { ArrowUp: { row: -1, col: 0 }, ArrowDown: { row: 1, col: 0 }, ArrowLeft: { row: 0, col: -1 }, ArrowRight: { row: 0, col: 1 } };
    if (!delta[event.key]) return;
    event.preventDefault();
    const next = { row: Math.max(0, Math.min(size - 1, cell.row + delta[event.key].row)), col: Math.max(0, Math.min(size - 1, cell.col + delta[event.key].col)) };
    setFocusCell(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)?.focus();
  };
  return <section className={`nb-board ${paused ? 'nb-board--paused' : ''} ${compact ? 'nb-board--compact' : ''} ${radarInterference ? 'nb-board--interference' : ''}`} style={{ '--nb-size': size } as CSSProperties} aria-label={playerName ? `Mapa de ${playerName}` : 'Mapa de batalla naval'}>
    <div className="nb-board-scroll">
      <div className="nb-coordinate-frame">
        <span className="nb-coordinate-corner" aria-hidden="true">⌖</span>
        <div className="nb-column-labels" aria-hidden="true">{Array.from({ length: size }, (_, col) => <span key={col}>{String.fromCharCode(65 + col)}</span>)}</div>
        <div className="nb-row-labels" aria-hidden="true">{Array.from({ length: size }, (_, row) => <span key={row}>{row + 1}</span>)}</div>
        <div className="nb-map">
          <div className="nb-ocean nb-ocean--far" aria-hidden="true" /><div className="nb-ocean nb-ocean--near" aria-hidden="true" />
          <svg className="nb-art-layer nb-terrain-layer" viewBox={`0 0 ${size * 100} ${size * 100}`} aria-hidden="true" focusable="false">
            {islands.filter((cell) => inBounds(cell, size)).map((cell) => <g key={`shore-${cellKey(cell)}`}>
              {islandSet.has(cellKey({ row: cell.row, col: cell.col + 1 })) && <><rect className="nb-island-shore" x={cell.col * 100 + 60} y={cell.row * 100 + 20} width="80" height="60" /><rect className="nb-island-green" x={cell.col * 100 + 60} y={cell.row * 100 + 26} width="80" height="48" /></>}
              {islandSet.has(cellKey({ row: cell.row + 1, col: cell.col })) && <><rect className="nb-island-shore" x={cell.col * 100 + 20} y={cell.row * 100 + 60} width="60" height="80" /><rect className="nb-island-green" x={cell.col * 100 + 26} y={cell.row * 100 + 60} width="48" height="80" /></>}
            </g>)}
            {islands.filter((cell) => inBounds(cell, size)).map((cell, index) => <g key={cellKey(cell)} transform={`translate(${cell.col * 100} ${cell.row * 100})`}><path className="nb-island-shore" d="M10 24Q28 5 54 9q31-1 38 23l-5 38Q68 99 39 90 8 91 7 59Z" /><path className="nb-island-green" d="M18 30Q36 15 56 17q23 0 27 22l-5 25Q64 84 39 79 15 76 16 53Z" />{index % 2 === 0 && <svg x="10" y="-2" width="76" height="88"><NavalPalm variation={index} /></svg>}</g>)}
          </svg>
          <svg className="nb-art-layer nb-fleet-layer" viewBox={`0 0 ${size * 100} ${size * 100}`} focusable="false" aria-label={showFleet ? 'Flota propia' : 'Restos visibles y zona de radar'}>
            {visibleShips.map((ship, index) => <FleetIllustration key={ship.id} ship={ship} id={`${uid}-fleet-${index}`} />)}
            {radarOccupied.map((cell) => <g key={cellKey(cell)} className="nb-radar-fragment" aria-hidden="true" transform={`translate(${cell.col * 100} ${cell.row * 100})`}><rect x="16" y="30" width="68" height="40" rx="15" fill="#75ffc2" /><path d="M28 38h40m-34 8h37m-37 8h29" fill="none" stroke="#165940" strokeWidth="4" /></g>)}
          </svg>
          <div ref={gridRef} className="nb-board-grid" role="grid" aria-label="Coordenadas del mapa" aria-rowcount={size} aria-colcount={size} onPointerLeave={() => onHover?.(null)}>
            {Array.from({ length: size }, (_, row) => <div role="row" className="nb-grid-row" key={row}>{Array.from({ length: size }, (_, col) => {
              const cell = { row, col };
              const key = cellKey(cell);
              const shot = shotMap.get(key);
              const selected = selectedCell?.row === row && selectedCell?.col === col;
              const radar = radarSet.has(key);
              const terrain = islandSet.has(key) ? 'isla' : 'mar';
              return <button key={col} type="button" role="gridcell" className={`nb-cell ${shot ? (shot.hit ? 'nb-cell--hit' : 'nb-cell--miss') : ''} ${radar ? 'nb-cell--radar' : ''} ${previewSet.has(key) ? (previewValid ? 'nb-cell--preview' : 'nb-cell--invalid') : ''}`} data-row={row} data-col={col} aria-label={`${coordinate(cell)}, ${terrain}${shot ? shot.hit ? ', impacto' : shot.repaired ? ', impacto anterior reparado; nave trasladada' : ', agua' : ', sin disparo'}${radar ? ', radar' : ''}`} aria-rowindex={row + 1} aria-colindex={col + 1} aria-selected={selected} disabled={disabled || !onSelect} tabIndex={onSelect && !disabled && focusCell.row === row && focusCell.col === col ? 0 : -1} onClick={() => onSelect?.(cell)} onPointerEnter={() => onHover?.(cell)} onFocus={() => { setFocusCell(cell); onHover?.(cell); }} onKeyDown={(event) => navigate(event, cell)}>
                {shot && <span className="nb-shot-marker" aria-hidden="true">{shot.hit ? <svg viewBox="0 0 40 40"><path d="m20 2 5 11 11-3-6 10 8 9-12-1-6 10-4-11-12 1 8-9-5-10 11 3Z" /><circle cx="20" cy="20" r="6" /></svg> : <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" /><circle cx="20" cy="20" r="5" /></svg>}</span>}
                {radar && <span className="nb-radar-scan" aria-hidden="true" />}
              </button>;
            })}</div>)}
          </div>
          <NavalImpactParticles size={size} effects={effects} effectId={effectId} paused={paused} />
        </div>
      </div>
    </div>
    <div className="nb-board-legend" aria-label="Leyenda del mapa"><span><i className="nb-legend-dot nb-legend-dot--hit" />Impacto</span><span><i className="nb-legend-dot nb-legend-dot--miss" />Agua</span><span><i className="nb-legend-dot nb-legend-dot--land" />Isla</span>{shots.some((shot) => shot.repaired) && <span><i className="nb-legend-dot nb-legend-dot--miss" />Impacto reparado: nave trasladada</span>}{radarSet.size > 0 && <span><i className="nb-legend-dot nb-legend-dot--radar" />{radarInterference ? 'Señal interferida: flota oculta' : 'Radar temporal'}</span>}<span className="nb-board-scroll-hint">Desplaza el mapa si no cabe completo.</span></div>
  </section>;
}
