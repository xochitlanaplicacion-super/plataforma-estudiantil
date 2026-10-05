'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import './flying-cat-joystick.css';

export interface FlyingCatControlPreferences {
  size: 'small' | 'medium' | 'large';
  side: 'left' | 'right';
  opacity: number;
  sensitivity: number;
}

export const FLYING_CAT_CONTROL_STORAGE_KEY = 'flying-cat:controls:v1';
export const DEFAULT_FLYING_CAT_CONTROLS: Readonly<FlyingCatControlPreferences> = Object.freeze({
  size: 'medium', side: 'left', opacity: 0.85, sensitivity: 1,
});

const clamp = (number: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, number));
const DIAMETER: Record<FlyingCatControlPreferences['size'], number> = { small: 80, medium: 108, large: 132 };
const DEAD_ZONE = 0.12;

/** Never trust stored values, including values written by another browser tab. */
export function normalizeFlyingCatControlPreferences(value: unknown): FlyingCatControlPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    size: source.size === 'small' || source.size === 'medium' || source.size === 'large' ? source.size : DEFAULT_FLYING_CAT_CONTROLS.size,
    side: source.side === 'left' || source.side === 'right' ? source.side : DEFAULT_FLYING_CAT_CONTROLS.side,
    opacity: typeof source.opacity === 'number' && Number.isFinite(source.opacity)
      ? clamp(source.opacity, 0.45, 1) : DEFAULT_FLYING_CAT_CONTROLS.opacity,
    sensitivity: typeof source.sensitivity === 'number' && Number.isFinite(source.sensitivity)
      ? clamp(source.sensitivity, 0.6, 1.8) : DEFAULT_FLYING_CAT_CONTROLS.sensitivity,
  };
}

function readPreferences(value: string | null): FlyingCatControlPreferences {
  try { return normalizeFlyingCatControlPreferences(value ? JSON.parse(value) : null); }
  catch { return { ...DEFAULT_FLYING_CAT_CONTROLS }; }
}

export function useFlyingCatControlPreferences() {
  // Identical server/client first render; restore this device's settings after mounting.
  const [preferences, setPreferences] = useState<FlyingCatControlPreferences>({ ...DEFAULT_FLYING_CAT_CONTROLS });
  const current = useRef(preferences);
  const updatePreferences = useCallback((changes: Partial<FlyingCatControlPreferences>) => {
    const next = normalizeFlyingCatControlPreferences({ ...current.current, ...changes });
    current.current = next;
    setPreferences(next);
    try { window.localStorage.setItem(FLYING_CAT_CONTROL_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Storage can be disabled in private browsing; in-memory settings still work. */ }
  }, []);
  const resetPreferences = useCallback(() => updatePreferences({ ...DEFAULT_FLYING_CAT_CONTROLS }), [updatePreferences]);

  useEffect(() => {
    const apply = (value: string | null) => {
      const next = readPreferences(value);
      current.current = next;
      setPreferences(next);
    };
    try { apply(window.localStorage.getItem(FLYING_CAT_CONTROL_STORAGE_KEY)); }
    catch { /* Keep safe defaults without preventing the game from opening. */ }
    const changed = (event: StorageEvent) => {
      if (event.key === FLYING_CAT_CONTROL_STORAGE_KEY || event.key === null) apply(event.newValue);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  return { preferences, updatePreferences, resetPreferences };
}

export function FlyingCatJoystick({ preferences, onMove, onRelease, disabled = false }: {
  preferences: FlyingCatControlPreferences;
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  disabled?: boolean;
}) {
  const settings = normalizeFlyingCatControlPreferences(preferences);
  const instructionsId = useId();
  const outer = useRef<HTMLDivElement>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const activePointer = useRef<number | null>(null);
  const latest = useRef({ onMove, onRelease, disabled, sensitivity: settings.sensitivity });
  latest.current = { onMove, onRelease, disabled, sensitivity: settings.sensitivity };

  const release = useCallback(() => {
    const pointer = activePointer.current;
    if (pointer === null) return;
    activePointer.current = null;
    if (thumb.current) thumb.current.style.transform = 'translate(-50%, -50%)';
    pad.current?.removeAttribute('data-active');
    try { pad.current?.releasePointerCapture(pointer); } catch { /* Capture can already be lost. */ }
    latest.current.onMove(0, 0);
    latest.current.onRelease();
  }, []);

  const move = useCallback((clientX: number, clientY: number) => {
    if (!pad.current || latest.current.disabled || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const box = pad.current.getBoundingClientRect();
    const diameter = Math.min(box.width, box.height);
    if (diameter <= 0) return;
    // Thumb is 38% of the pad: it never goes outside the circular housing.
    const radius = diameter * 0.31;
    let x = (clientX - box.left - box.width / 2) / radius;
    let y = (clientY - box.top - box.height / 2) / radius;
    const length = Math.hypot(x, y);
    const magnitude = Math.min(1, length);
    if (length > 1) { x /= length; y /= length; }
    if (thumb.current) thumb.current.style.transform = `translate(calc(-50% + ${(x * radius).toFixed(2)}px), calc(-50% + ${(y * radius).toFixed(2)}px))`;
    if (magnitude <= DEAD_ZONE) { latest.current.onMove(0, 0); return; }
    const response = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE) * latest.current.sensitivity);
    latest.current.onMove(x / magnitude * response, y / magnitude * response);
  }, []);

  const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Desktop piloting remains WASD-only. A second finger may use a bonus without stealing this pointer.
    if (latest.current.disabled || activePointer.current !== null || event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    activePointer.current = event.pointerId;
    event.currentTarget.dataset.active = 'true';
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Window listeners are a safe fallback. */ }
    move(event.clientX, event.clientY);
  };

  useEffect(() => {
    const moved = (event: PointerEvent) => {
      if (event.pointerId !== activePointer.current) return;
      if (event.cancelable) event.preventDefault();
      move(event.clientX, event.clientY);
    };
    const ended = (event: PointerEvent) => { if (event.pointerId === activePointer.current) release(); };
    const hidden = () => { if (document.hidden) release(); };
    window.addEventListener('pointermove', moved, { passive: false });
    window.addEventListener('pointerup', ended);
    window.addEventListener('pointercancel', ended);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointermove', moved);
      window.removeEventListener('pointerup', ended);
      window.removeEventListener('pointercancel', ended);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
      release();
    };
  }, [move, release]);

  useEffect(() => { if (disabled) release(); }, [disabled, release]);

  useEffect(() => {
    release();
    const node = outer.current;
    const scene = node?.parentElement;
    if (!node || !scene) return;
    let previousWidth = 0;
    let previousHeight = 0;
    const measure = () => {
      const bounds = scene.getBoundingClientRect();
      if (previousWidth > 0 && previousHeight > 0 && (bounds.width !== previousWidth || bounds.height !== previousHeight)) release();
      previousWidth = bounds.width; previousHeight = bounds.height;
      const style = window.getComputedStyle(node);
      const horizontalMargin = Number.parseFloat(settings.side === 'left' ? style.left : style.right) || 8;
      const bottomMargin = Number.parseFloat(style.bottom) || 8;
      // On very short scenes the prize rail becomes one row; otherwise two rows.
      // Measuring the height directly avoids a race with the parent's resize attribute.
      const prizeRail = settings.side === 'right' ? bounds.height > 0 && bounds.height < 170 ? 64 : 120 : 0;
      const maximumWidth = bounds.width > 0 ? Math.max(32, bounds.width - horizontalMargin - 8) : DIAMETER[settings.size];
      const maximumHeight = bounds.height > 0 ? Math.max(32, bounds.height - bottomMargin - 8 - prizeRail) : DIAMETER[settings.size];
      node.style.setProperty('--fc-stick-diameter', `${Math.min(DIAMETER[settings.size], maximumWidth, maximumHeight)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(scene);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [settings.size, settings.side, release]);

  return <div ref={outer} className="fc-touch-controls fc-joystick" data-size={settings.size} data-side={settings.side}
    role="group" aria-label="Controles táctiles de vuelo"
    style={{ opacity: settings.opacity, '--fc-stick-diameter': `${DIAMETER[settings.size]}px` } as CSSProperties}>
    <button ref={pad} className="fc-joystick-pad" type="button" disabled={disabled}
      aria-label="Palanca táctil de vuelo" aria-describedby={instructionsId}
      onPointerDown={press} onLostPointerCapture={(event) => { if (event.pointerId === activePointer.current) release(); }}
      onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
      <span className="fc-joystick-compass" aria-hidden="true"><i>↑</i><i>→</i><i>↓</i><i>←</i></span>
      <span ref={thumb} className="fc-joystick-thumb" aria-hidden="true" />
    </button>
    <span id={instructionsId} className="fc-joystick-sr">Mantén y arrastra la palanca circular. Suelta para detenerte. El resto del escenario no mueve al gato.</span>
  </div>;
}

/** The caller opens this inside the paused-game dialog, never above an active flight. */
export function FlyingCatControlSettings({ preferences, onChange, onReset }: {
  preferences: FlyingCatControlPreferences;
  onChange: (changes: Partial<FlyingCatControlPreferences>) => void;
  onReset?: () => void;
}) {
  const id = useId();
  const settings = normalizeFlyingCatControlPreferences(preferences);
  return <fieldset className="fc-control-settings">
    <legend>Ajustes de la palanca</legend>
    <p className="fc-control-settings-help">Se guardan sólo en este dispositivo. Puedes cambiarlos con el vuelo en pausa.</p>
    <div className="fc-control-settings-grid">
      <div>
        <label htmlFor={`${id}-size`}>Tamaño</label>
        <select id={`${id}-size`} value={settings.size} onChange={(event) => onChange({ size: event.target.value as FlyingCatControlPreferences['size'] })}>
          <option value="small">Pequeño</option><option value="medium">Mediano</option><option value="large">Grande</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-side`}>Lado del control</label>
        <select id={`${id}-side`} value={settings.side} onChange={(event) => onChange({ side: event.target.value as FlyingCatControlPreferences['side'] })}>
          <option value="left">Izquierda</option><option value="right">Derecha</option>
        </select>
      </div>
      <label htmlFor={`${id}-opacity`}>Visibilidad <span className="fc-control-value" aria-hidden="true">{Math.round(settings.opacity * 100)}%</span>
        <input id={`${id}-opacity`} type="range" min="0.45" max="1" step="0.05" value={settings.opacity}
          aria-valuetext={`${Math.round(settings.opacity * 100)} por ciento`}
          onChange={(event) => onChange({ opacity: Number(event.target.value) })} />
      </label>
      <label htmlFor={`${id}-sensitivity`}>Sensibilidad <span className="fc-control-value" aria-hidden="true">{settings.sensitivity.toFixed(1)}×</span>
        <input id={`${id}-sensitivity`} type="range" min="0.6" max="1.8" step="0.1" value={settings.sensitivity}
          aria-valuetext={`${settings.sensitivity.toFixed(1)} veces`}
          onChange={(event) => onChange({ sensitivity: Number(event.target.value) })} />
      </label>
    </div>
    <p className="fc-control-settings-help">Una sensibilidad baja permite maniobras suaves; una alta llega antes a la velocidad máxima.</p>
    {onReset && <button type="button" className="fc-control-settings-reset" onClick={onReset}>Restablecer controles</button>}
  </fieldset>;
}
