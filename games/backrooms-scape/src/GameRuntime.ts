import '@babylonjs/core/Collisions/collisionCoordinator';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Activity, Question, Result } from './core';
import { clamp, mulberry32, seedCode } from './core';

type Cell = { row: number; col: number };
type Station = { cell: Cell; pad: Mesh; questionIndex: number; completed: boolean; lockUntil: number; firstTry: boolean };
export interface HudState { fragments: number; required: number; time: number; threat: number; prompt: string; exitOpen: boolean; sprint: number }
export interface RuntimeCallbacks {
  onHud: (hud: HudState) => void;
  onQuestion: (question: Question, seconds: number) => void;
  onAutoFail: (feedback: string) => void;
  onGameOver: () => void;
  onComplete: (result: Result) => void;
  onPause: () => void;
}

const CELL = 7;
const HEIGHT = 4;

function edge(a: Cell, b: Cell) {
  return `${a.row},${a.col}|${b.row},${b.col}`;
}

export class GameRuntime {
  private engine: Engine;
  private scene: Scene;
  private camera: UniversalCamera;
  private player: Mesh;
  private activity: Activity;
  private callbacks: RuntimeCallbacks;
  private seed: number;
  private size: number;
  private passages = new Set<string>();
  private stations: Station[] = [];
  private exitCell: Cell = { row: 0, col: 0 };
  private exitPad!: Mesh;
  private keys = new Set<string>();
  private touch = { forward: false, back: false, left: false, right: false, sprint: false };
  private yaw = Math.PI;
  private pitch = 0.38;
  private elapsed = 0;
  private fragments = 0;
  private wrong = 0;
  private hits = 0;
  private score = 0;
  private captures = 0;
  private activeStation: Station | null = null;
  private questionRemaining = 0;
  private answerPending = false;
  private playing = false;
  private paused = false;
  private finished = false;
  private disposed = false;
  private threat = Vector3.Zero();
  private threatTarget = Vector3.Zero();
  private threatPathTimer = 0;
  private graceUntil = 0;
  private sprintUntil = 0;
  private hudTimer = 0;
  private mouseDragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, activity: Activity, seed: number, callbacks: RuntimeCallbacks) {
    this.activity = activity;
    this.seed = seed;
    this.callbacks = callbacks;
    this.size = activity.settings.mazeSize === 'small' ? 7 : activity.settings.mazeSize === 'large' ? 11 : 9;
    this.engine = new Engine(canvas, true, { powerPreference: 'high-performance' }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.055, 0.07, 0.075, 1);
    this.scene.collisionsEnabled = true;
    this.buildMaze();

    const start = this.cellPosition({ row: 0, col: 0 });
    const firstPassage = this.openNeighbors({ row: 0, col: 0 })[0];
    this.yaw = firstPassage?.col === 1 ? Math.PI / 2 : 0;
    this.player = MeshBuilder.CreateCapsule('bean-player', { height: 1.9, radius: 0.57, tessellation: 12 }, this.scene);
    this.player.position.copyFrom(start.add(new Vector3(0, .98, 0)));
    this.player.checkCollisions = true;
    this.player.ellipsoid = new Vector3(0.68, 1.1, 0.68);
    const playerMaterial = new StandardMaterial('bean-material', this.scene);
    playerMaterial.diffuseColor = Color3.FromHexString('#55D6BE');
    playerMaterial.emissiveColor = Color3.FromHexString('#153F39');
    this.player.material = playerMaterial;
    const face = MeshBuilder.CreateSphere('bean-face', { diameter: .72, segments: 12 }, this.scene);
    face.parent = this.player; face.position = new Vector3(0, .32, -.37); face.scaling = new Vector3(1, .72, .25);
    const faceMat = new StandardMaterial('bean-face-material', this.scene); faceMat.diffuseColor = Color3.FromHexString('#172026'); face.material = faceMat;

    this.camera = new UniversalCamera('camera', start.add(new Vector3(-Math.sin(this.yaw) * 3.15, 3.15, -Math.cos(this.yaw) * 3.15)), this.scene);
    this.camera.fov = 0.9; this.camera.minZ = 0.1; this.camera.maxZ = 500;
    const far = this.cellPosition({ row: this.size - 1, col: this.size - 1 });
    this.threat.copyFrom(far); this.threatTarget.copyFrom(far);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('click', this.onCanvasClick);

    this.engine.runRenderLoop(() => { if (!this.disposed) { this.tick(); this.scene.render(); } });
  }

  begin() { this.playing = true; this.graceUntil = this.elapsed + 5; this.requestPointerLock(); }
  resume() { this.paused = false; this.requestPointerLock(); }
  setPaused(value: boolean) { this.paused = value; }
  setTouch(control: keyof typeof this.touch, value: boolean) { this.touch[control] = value; }
  interact() { if (this.playing && !this.paused && !this.activeStation) this.tryInteract(true); }

  answer(index: number) {
    if (!this.activeStation || this.answerPending) return { correct: false, feedback: '' };
    const station = this.activeStation;
    const question = this.activity.questions[station.questionIndex];
    const correct = index === question.correctIndex;
    this.answerPending = true;
    if (correct) {
      station.completed = true;
      this.fragments++;
      this.score += station.firstTry ? 120 : 70;
      if (station.firstTry) this.hits++;
      station.pad.material = this.material(`complete-${station.questionIndex}`, '#55D6BE', '#1B675B');
      this.sprintUntil = this.elapsed + 7;
    } else {
      station.firstTry = false;
      station.lockUntil = Number.POSITIVE_INFINITY;
      this.wrong++;
      this.score = Math.max(0, this.score - 20);
    }
    return { correct, feedback: question.feedback };
  }

  continueAfterAnswer() {
    if (!this.activeStation) return;
    const wasCompleted = this.activeStation.completed;
    if (!wasCompleted) this.activeStation.lockUntil = this.elapsed + this.activity.settings.doorLockSeconds;
    this.activeStation = null;
    this.answerPending = false;
    this.questionRemaining = 0;
    this.graceUntil = this.elapsed + (wasCompleted ? 2.5 : 1.5);
    this.requestPointerLock();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize); document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLock); window.removeEventListener('pointerup', this.onPointerUp);
    const canvas = this.engine.getRenderingCanvas();
    canvas?.removeEventListener('pointerdown', this.onPointerDown); canvas?.removeEventListener('pointermove', this.onPointerMove); canvas?.removeEventListener('click', this.onCanvasClick);
    this.engine.stopRenderLoop(); this.scene.dispose(); this.engine.dispose();
  }

  private buildMaze() {
    const rng = mulberry32(this.seed);
    const visited = new Set<string>();
    const stack: Cell[] = [{ row: 0, col: 0 }];
    visited.add('0,0');
    while (stack.length) {
      const current = stack[stack.length - 1];
      const neighbors = this.rawNeighbors(current).filter((cell) => !visited.has(`${cell.row},${cell.col}`));
      if (!neighbors.length) { stack.pop(); continue; }
      const next = neighbors[Math.floor(rng() * neighbors.length)];
      this.passages.add(edge(current, next)); this.passages.add(edge(next, current));
      visited.add(`${next.row},${next.col}`); stack.push(next);
    }

    new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene).intensity = 0.6;
    const lamp = new PointLight('central-light', new Vector3(0, 8, 0), this.scene); lamp.intensity = 0.55; lamp.range = this.size * CELL;
    const palette = this.palette(this.activity.settings.biome);
    const floor = MeshBuilder.CreateGround('floor', { width: this.size * CELL + 2, height: this.size * CELL + 2 }, this.scene);
    floor.material = this.material('floor-material', palette.floor, palette.floor); floor.checkCollisions = true;
    const ceiling = MeshBuilder.CreateGround('ceiling', { width: this.size * CELL + 2, height: this.size * CELL + 2 }, this.scene);
    ceiling.position.y = HEIGHT; ceiling.rotation.x = Math.PI; ceiling.material = this.material('ceiling-material', palette.ceiling, '#111111');

    const wallMaterial = this.material('wall-material', palette.wall, palette.emissive);
    const makeWall = (name: string, x: number, z: number, width: number, depth: number) => {
      const wall = MeshBuilder.CreateBox(name, { width, height: HEIGHT, depth }, this.scene);
      wall.position.set(x, HEIGHT / 2, z); wall.material = wallMaterial; wall.checkCollisions = true;
    };
    for (let row = 0; row < this.size; row++) for (let col = 0; col < this.size; col++) {
      const cell = { row, col }; const center = this.cellPosition(cell);
      if (row === 0 || !this.passages.has(edge(cell, { row: row - 1, col }))) makeWall(`north-${row}-${col}`, center.x, center.z - CELL / 2, CELL + .35, .35);
      if (col === 0 || !this.passages.has(edge(cell, { row, col: col - 1 }))) makeWall(`west-${row}-${col}`, center.x - CELL / 2, center.z, .35, CELL + .35);
      if (row === this.size - 1) makeWall(`south-${row}-${col}`, center.x, center.z + CELL / 2, CELL + .35, .35);
      if (col === this.size - 1) makeWall(`east-${row}-${col}`, center.x + CELL / 2, center.z, .35, CELL + .35);
      this.decorateCell(cell, rng, palette.accent);
    }

    const cells: Cell[] = [];
    for (let row = 0; row < this.size; row++) for (let col = 0; col < this.size; col++) if (row + col > 2) cells.push({ row, col });
    cells.sort(() => rng() - 0.5);
    this.exitCell = cells.reduce((best, cell) => cell.row + cell.col > best.row + best.col ? cell : best, cells[0]);
    const stationCells = cells.filter((cell) => cell.row !== this.exitCell.row || cell.col !== this.exitCell.col).slice(0, this.activity.questions.length);
    this.stations = stationCells.map((cell, questionIndex) => {
      const pad = MeshBuilder.CreateCylinder(`safe-room-${questionIndex}`, { diameter: 3.2, height: .16, tessellation: 24 }, this.scene);
      pad.position.copyFrom(this.cellPosition(cell).add(new Vector3(0, .09, 0)));
      pad.material = this.material(`safe-${questionIndex}`, '#7B68A6', '#493A72');
      const light = new PointLight(`safe-light-${questionIndex}`, pad.position.add(new Vector3(0, 2.3, 0)), this.scene); light.diffuse = Color3.FromHexString('#BCA7FF'); light.intensity = .65; light.range = 8;
      return { cell, pad, questionIndex, completed: false, lockUntil: 0, firstTry: true };
    });
    this.exitPad = MeshBuilder.CreateCylinder('exit-pad', { diameter: 3.8, height: .2, tessellation: 32 }, this.scene);
    this.exitPad.position.copyFrom(this.cellPosition(this.exitCell).add(new Vector3(0, .11, 0)));
    this.exitPad.material = this.material('exit-closed', '#3B4145', '#15191C');
  }

  private palette(biome: Activity['settings']['biome']) {
    if (biome === 'flooded_rooms') return { floor: '#284750', wall: '#7DA8A8', ceiling: '#26383D', emissive: '#263F40', accent: '#6ED8E2' };
    if (biome === 'toy_rooms') return { floor: '#6A5B70', wall: '#B89AB9', ceiling: '#45384B', emissive: '#402C42', accent: '#F4B860' };
    if (biome === 'storage_maze') return { floor: '#383633', wall: '#81786A', ceiling: '#252421', emissive: '#302C26', accent: '#D99B52' };
    return { floor: '#6B654C', wall: '#C7B970', ceiling: '#77704D', emissive: '#4D4727', accent: '#E6D681' };
  }

  private decorateCell(cell: Cell, rng: () => number, accent: string) {
    if (rng() > .18 || (cell.row === 0 && cell.col === 0)) return;
    const center = this.cellPosition(cell);
    const height = .8 + rng() * 1.7;
    const box = MeshBuilder.CreateBox(`decor-${cell.row}-${cell.col}`, { width: 1 + rng() * 1.5, height, depth: 1 + rng() * 1.5 }, this.scene);
    box.position.set(center.x + (rng() - .5) * 3.5, height / 2, center.z + (rng() - .5) * 3.5);
    box.material = this.material(`decor-mat-${cell.row}-${cell.col}`, accent, '#191919'); box.checkCollisions = true;
  }

  private material(name: string, diffuse: string, emissive: string) {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(diffuse); material.emissiveColor = Color3.FromHexString(emissive).scale(.35);
    material.specularColor = Color3.Black(); return material;
  }

  private rawNeighbors(cell: Cell) {
    return [{ row: cell.row - 1, col: cell.col }, { row: cell.row + 1, col: cell.col }, { row: cell.row, col: cell.col - 1 }, { row: cell.row, col: cell.col + 1 }]
      .filter((candidate) => candidate.row >= 0 && candidate.col >= 0 && candidate.row < this.size && candidate.col < this.size);
  }
  private openNeighbors(cell: Cell) { return this.rawNeighbors(cell).filter((candidate) => this.passages.has(edge(cell, candidate))); }
  private cellPosition(cell: Cell) { return new Vector3((cell.col - (this.size - 1) / 2) * CELL, 0, (cell.row - (this.size - 1) / 2) * CELL); }
  private positionCell(position: Vector3): Cell { return { row: clamp(Math.round(position.z / CELL + (this.size - 1) / 2), 0, this.size - 1), col: clamp(Math.round(position.x / CELL + (this.size - 1) / 2), 0, this.size - 1) }; }

  private nextPathCell(start: Cell, goal: Cell) {
    const queue: Cell[] = [start]; const previous = new Map<string, Cell | null>([[`${start.row},${start.col}`, null]]);
    while (queue.length) {
      const current = queue.shift()!; if (current.row === goal.row && current.col === goal.col) break;
      for (const next of this.openNeighbors(current)) { const key = `${next.row},${next.col}`; if (!previous.has(key)) { previous.set(key, current); queue.push(next); } }
    }
    let current = goal; let parent = previous.get(`${current.row},${current.col}`);
    if (parent === undefined) return start;
    while (parent && !(parent.row === start.row && parent.col === start.col)) { current = parent; parent = previous.get(`${current.row},${current.col}`) ?? null; }
    return current;
  }

  private tick() {
    const dt = Math.min(.05, this.engine.getDeltaTime() / 1000);
    if (!this.playing || this.paused || this.finished) { this.followCamera(dt); return; }
    this.elapsed += dt;
    if (this.activeStation) {
      if (!this.answerPending) { this.questionRemaining -= dt; if (this.questionRemaining <= 0) this.timeoutQuestion(); }
      this.followCamera(dt); this.publishHud(dt); return;
    }
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.sprint || this.elapsed < this.sprintUntil);
    const forward = (this.keys.has('KeyW') || this.touch.forward ? 1 : 0) - (this.keys.has('KeyS') || this.touch.back ? 1 : 0);
    const side = (this.keys.has('KeyD') || this.touch.right ? 1 : 0) - (this.keys.has('KeyA') || this.touch.left ? 1 : 0);
    if (forward || side) {
      const direction = new Vector3(Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side, 0, Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side).normalize();
      this.player.moveWithCollisions(direction.scale(dt * (sprinting ? 6.3 : 3.8)));
      this.player.rotation.y = Math.atan2(direction.x, direction.z);
    }
    this.moveThreat(dt);
    this.tryInteract(false);
    if (this.fragments >= this.activity.settings.requiredFragments) {
      this.exitPad.material = this.material('exit-open-live', '#EBCB68', '#A87D19');
      if (Vector3.Distance(this.player.position, this.exitPad.position) < 2.1) this.win();
    }
    this.followCamera(dt); this.publishHud(dt);
  }

  private moveThreat(dt: number) {
    this.threatPathTimer -= dt;
    if (this.threatPathTimer <= 0) {
      this.threatPathTimer = .65;
      this.threatTarget = this.cellPosition(this.nextPathCell(this.positionCell(this.threat), this.positionCell(this.player.position)));
    }
    const speed = this.activity.settings.difficulty === 'easy' ? 1.05 : this.activity.settings.difficulty === 'hard' ? 1.75 : 1.38;
    const delta = this.threatTarget.subtract(this.threat); if (delta.length() > .1) this.threat.addInPlace(delta.normalize().scale(speed * dt));
    const distance = Vector3.Distance(this.threat, this.player.position);
    if (distance < 1.35 && this.elapsed > this.graceUntil) { this.captures++; this.finished = true; this.callbacks.onGameOver(); }
  }

  private tryInteract(force: boolean) {
    if (this.fragments >= this.activity.settings.requiredFragments) return;
    let nearest: Station | null = null; let distance = Infinity;
    for (const station of this.stations) {
      if (station.completed) continue;
      const current = Vector3.Distance(this.player.position, station.pad.position);
      if (current < distance) { nearest = station; distance = current; }
    }
    if (force && nearest && distance < 2.6) {
      if (nearest.lockUntil > this.elapsed) return;
      this.activeStation = nearest; this.questionRemaining = this.activity.settings.questionTime; this.answerPending = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.callbacks.onQuestion(this.activity.questions[nearest.questionIndex], this.questionRemaining);
    }
  }

  private timeoutQuestion() {
    if (!this.activeStation || this.answerPending) return;
    this.activeStation.firstTry = false; this.activeStation.lockUntil = Number.POSITIVE_INFINITY;
    this.wrong++; this.answerPending = true;
    this.callbacks.onAutoFail(this.activity.questions[this.activeStation.questionIndex].feedback);
  }

  private publishHud(dt: number) {
    this.hudTimer -= dt; if (this.hudTimer > 0) return; this.hudTimer = .1;
    const threatDistance = Vector3.Distance(this.threat, this.player.position);
    let prompt = '';
    const candidate = this.fragments < this.activity.settings.requiredFragments
      ? this.stations.find((station) => !station.completed && Vector3.Distance(this.player.position, station.pad.position) < 2.6)
      : undefined;
    if (candidate) prompt = candidate.lockUntil > this.elapsed ? `Sala bloqueada ${Math.ceil(candidate.lockUntil - this.elapsed)} s` : 'Pulsa E para entrar a la sala segura';
    this.callbacks.onHud({ fragments: this.fragments, required: this.activity.settings.requiredFragments, time: this.elapsed,
      threat: clamp(1 - threatDistance / 18, 0, 1), prompt, exitOpen: this.fragments >= this.activity.settings.requiredFragments,
      sprint: Math.max(0, this.sprintUntil - this.elapsed) });
  }

  private followCamera(dt: number) {
    // Keep the camera inside the current maze cell and safely below the ceiling.
    // A longer boom can cross a wall even when the player has not.
    const horizontal = Math.cos(this.pitch) * 3.15;
    const desired = this.player.position.add(new Vector3(-Math.sin(this.yaw) * horizontal, 1.75 + Math.sin(this.pitch) * .8, -Math.cos(this.yaw) * horizontal));
    this.camera.position = Vector3.Lerp(this.camera.position, desired, 1 - Math.exp(-dt * 8));
    this.camera.setTarget(this.player.position.add(new Vector3(0, .7, 0)));
  }

  private win() {
    if (this.finished) return; this.finished = true;
    const total = this.activity.settings.requiredFragments;
    const result: Result = { hits: this.hits, total, wrongAttempts: this.wrong, time: this.elapsed, captures: this.captures,
      score: this.score + Math.max(0, 400 - Math.floor(this.elapsed)), seedCode: seedCode(this.seed), fragments: this.fragments };
    this.callbacks.onComplete(result);
  }

  private requestPointerLock() { const canvas = this.engine.getRenderingCanvas(); if (canvas && matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.(); }
  private onKeyDown = (event: KeyboardEvent) => { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft'].includes(event.code)) event.preventDefault(); this.keys.add(event.code); if (event.code === 'KeyE' && !event.repeat) this.interact(); if (event.code === 'Escape' && !event.repeat && !this.activeStation) { this.paused = true; this.callbacks.onPause(); } };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onResize = () => this.engine.resize();
  private onPointerLock = () => { if (!document.pointerLockElement && this.playing && !this.activeStation && !this.finished && !this.paused) { this.paused = true; this.callbacks.onPause(); } };
  private onMouseMove = (event: MouseEvent) => { if (!document.pointerLockElement) return; this.yaw -= event.movementX * .0026; this.pitch = clamp(this.pitch + event.movementY * .002, -.1, .9); };
  private onPointerDown = (event: PointerEvent) => { this.mouseDragging = true; this.lastPointer = { x: event.clientX, y: event.clientY }; };
  private onPointerMove = (event: PointerEvent) => { if (!this.mouseDragging || document.pointerLockElement) return; this.yaw -= (event.clientX - this.lastPointer.x) * .007; this.pitch = clamp(this.pitch + (event.clientY - this.lastPointer.y) * .005, -.1, .9); this.lastPointer = { x: event.clientX, y: event.clientY }; };
  private onPointerUp = () => { this.mouseDragging = false; };
  private onCanvasClick = () => { if (this.playing && !this.paused && !this.activeStation) this.requestPointerLock(); };
}
