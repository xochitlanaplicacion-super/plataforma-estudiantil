export const hasTouchControls = () => navigator.maxTouchPoints > 0;

type Options = {
  id: string;
  canvas: HTMLCanvasElement;
  playing: () => boolean;
  paused: () => boolean;
  pause: () => void;
  key: (code: string, down: boolean) => void;
  look: (x: number, y: number) => void;
  actions: { code: string; label: string }[];
};
type Preferences = { opacity: number; size: number; positions: Record<string, { x: number; y: number }> };

/** Pointer capture allows movement, looking and jumping with different fingers. */
export function installTouchControls(options: Options): () => void {
  if (!hasTouchControls()) return () => {};
  const storageKey = `game-touch-v1:${options.id}`;
  let preferences: Preferences = { opacity: 0.55, size: 64, positions: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      preferences.opacity = Math.max(0.2, Math.min(0.9, Number(saved.opacity) || 0.55));
      preferences.size = Math.max(44, Math.min(100, Number(saved.size) || 64));
      for (const [id, p] of Object.entries(saved.positions || {})) {
        const point = p as { x: number; y: number };
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
          preferences.positions[id] = { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) };
        }
      }
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  let editing = false;
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);z-index:60;pointer-events:none;overflow:hidden;';
  options.canvas.parentElement!.append(root);
  const held = new Map<number, Set<string>>();
  const updateKeys = (pointer: number, codes: string[]) => {
    const before = new Set([...held.values()].flatMap(s => [...s]));
    if (codes.length) held.set(pointer, new Set(codes)); else held.delete(pointer);
    const after = new Set([...held.values()].flatMap(s => [...s]));
    for (const code of before) if (!after.has(code)) options.key(code, false);
    for (const code of after) if (!before.has(code)) options.key(code, true);
  };
  const release = () => { for (const id of [...held.keys()]) updateKeys(id, []); };
  const controls: { node: HTMLButtonElement; id: string; x: number; y: number }[] = [];
  const position = () => {
    const { width, height } = root.getBoundingClientRect();
    for (const [index, control] of controls.entries()) {
      const columns = width < 600 ? 2 : 3;
      const defaultPoint = index === 0 ? control : {
        x: (width - 12 - preferences.size / 2 - ((index - 1) % columns) * (preferences.size + 10)) / Math.max(1, width),
        y: (height - 24 - preferences.size / 2 - Math.floor((index - 1) / columns) * (preferences.size + 10)) / Math.max(1, height),
      };
      const point = preferences.positions[control.id] || defaultPoint;
      const size = preferences.size * (control.id === 'move' ? 1.5 : 1);
      control.node.style.width = `${size}px`; control.node.style.height = `${size}px`;
      control.node.style.left = `${Math.max(8, Math.min(Math.max(8, width - size - 8), point.x * width - size / 2))}px`;
      control.node.style.top = `${Math.max(8, Math.min(Math.max(8, height - size - 8), point.y * height - size / 2))}px`;
      control.node.style.opacity = String(preferences.opacity);
      control.node.style.outline = editing ? '2px dashed #63e6cf' : 'none';
    }
  };
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); status.textContent = 'Preferencias guardadas en este dispositivo.'; } catch { status.textContent = 'El navegador no permite conservar los ajustes al cerrar.'; } };
  const makeButton = (label: string) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', label);
    button.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;background:rgba(15,23,42,.7);color:white;border:2px solid rgba(255,255,255,.65);border-radius:50%;font:600 12px system-ui;';
    return button;
  };
  const items = [{ code: 'move', label: 'Mover ↕ ↔' }, ...options.actions];
  items.forEach((action, index) => {
    const node = makeButton(action.label);
    const control = { node, id: action.code, x: index === 0 ? 0.15 : 0.92 - ((index - 1) % 3) * 0.13, y: index === 0 ? 0.78 : 0.8 - Math.floor((index - 1) / 3) * 0.19 };
    controls.push(control); root.append(node);
    let activePointer: number | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      event.preventDefault();
      const box = root.getBoundingClientRect();
      if (editing) {
        preferences.positions[action.code] = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
        position(); return;
      }
      if (!options.playing()) return;
      if (action.code !== 'move') { updateKeys(event.pointerId, [action.code]); return; }
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      updateKeys(event.pointerId, [x > .22 ? 'KeyD' : x < -.22 ? 'KeyA' : '', y < -.22 ? 'KeyW' : y > .22 ? 'KeyS' : ''].filter(Boolean));
    };
    node.addEventListener('pointerdown', event => {
      if (activePointer !== null || (!editing && !options.playing())) return;
      activePointer = event.pointerId; node.setPointerCapture(event.pointerId); move(event);
    });
    node.addEventListener('pointermove', move);
    const end = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      updateKeys(event.pointerId, []); activePointer = null;
      if (editing) persist();
    };
    node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end); node.addEventListener('lostpointercapture', end);
  });
  const settings = document.createElement('div');
  settings.style.cssText = 'position:absolute;top:64px;left:12px;right:12px;max-width:340px;max-height:45%;overflow:auto;pointer-events:auto;background:#101827;color:white;padding:16px;border:1px solid #64748b;border-radius:16px;font:14px system-ui;display:none;';
  settings.setAttribute('role', 'region'); settings.setAttribute('aria-label', 'Ajustes táctiles');
  const title = document.createElement('strong'); title.textContent = 'Controles táctiles'; settings.append(title);
  const status = document.createElement('p'); status.textContent = 'Arrastra sobre el escenario para mirar. Puedes mover, mirar y saltar simultáneamente.';
  for (const [key, label, min, max, step] of [['opacity', 'Opacidad', .2, .9, .05], ['size', 'Tamaño', 44, 100, 2]] as const) {
    const wrapper = document.createElement('label'); wrapper.style.cssText = 'display:block;margin:12px 0';
    wrapper.textContent = label;
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = String(step); slider.value = String(preferences[key]); slider.style.width = '100%';
    slider.oninput = () => { preferences[key] = Number(slider.value); position(); persist(); };
    wrapper.append(slider); settings.append(wrapper);
  }
  const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Mover botones';
  edit.style.cssText = 'padding:10px;margin:4px;color:white;background:#155e75;border-radius:8px;border:1px solid #67e8f9';
  edit.onclick = () => { editing = !editing; edit.textContent = editing ? 'Terminar de mover' : 'Mover botones'; release(); position(); };
  const reset = edit.cloneNode(false) as HTMLButtonElement; reset.textContent = 'Restablecer posiciones';
  reset.onclick = () => { preferences.positions = {}; position(); persist(); };
  settings.append(edit, reset, status); root.append(settings);
  const pauseButton = makeButton('PAUSA');
  pauseButton.setAttribute('aria-label', 'Pausar juego');
  pauseButton.style.cssText += 'top:8px;left:50%;transform:translateX(-50%);width:86px;height:46px;border-radius:13px;background:rgba(15,23,42,.88);border-color:rgba(255,255,255,.82);font-size:11px;letter-spacing:.12em;box-shadow:0 8px 24px rgba(0,0,0,.35);';
  pauseButton.onclick = () => { release(); options.pause(); editing = false; position(); };
  root.append(pauseButton);
  const openSettings = () => { release(); options.pause(); settings.style.display = 'block'; editing = false; position(); };
  window.addEventListener(`touch-settings:${options.id}`, openSettings);
  let lookPointer: number | null = null, lastX = 0, lastY = 0;
  const down = (event: PointerEvent) => {
    if (!options.playing() || lookPointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); lookPointer = event.pointerId; lastX = event.clientX; lastY = event.clientY;
    options.canvas.setPointerCapture(event.pointerId);
  };
  const look = (event: PointerEvent) => {
    if (event.pointerId !== lookPointer) return;
    if (options.playing()) options.look(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX; lastY = event.clientY;
  };
  const up = (event: PointerEvent) => { if (event.pointerId === lookPointer) lookPointer = null; };
  const blur = () => { release(); lookPointer = null; options.pause(); };
  const visibility = () => { if (document.hidden) blur(); };
  const oldTouchAction = options.canvas.style.touchAction; options.canvas.style.touchAction = 'none';
  options.canvas.addEventListener('pointerdown', down);
  options.canvas.addEventListener('pointermove', look);
  options.canvas.addEventListener('pointerup', up);
  options.canvas.addEventListener('pointercancel', up);
  options.canvas.addEventListener('lostpointercapture', up);
  window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  const observer = new ResizeObserver(position); observer.observe(root);
  let wasPlaying = false;
  const timer = window.setInterval(() => {
    const playing = options.playing(), paused = options.paused();
    if (!playing && wasPlaying) release();
    wasPlaying = playing;
    pauseButton.hidden = !playing;
    if (!paused) {
      settings.style.display = 'none';
      if (editing) { editing = false; edit.textContent = 'Mover botones'; position(); }
    }
    for (const control of controls) control.node.hidden = !playing && !(paused && editing);
  }, 100);
  position();
  return () => {
    release(); clearInterval(timer); observer.disconnect(); root.remove();
    options.canvas.style.touchAction = oldTouchAction;
    options.canvas.removeEventListener('pointerdown', down); options.canvas.removeEventListener('pointermove', look);
    options.canvas.removeEventListener('pointerup', up); options.canvas.removeEventListener('pointercancel', up); options.canvas.removeEventListener('lostpointercapture', up);
    window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener(`touch-settings:${options.id}`, openSettings);
  };
}
