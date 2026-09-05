// ------------------------------------------------------------------
// Backrooms Scape — núcleo del juego (Babylon.js)
// ------------------------------------------------------------------
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import { hasTouchControls, installTouchControls } from '../../../shared/touch-controls';
import "@babylonjs/core/Engines/Extensions/engine.multiRender";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Culling/ray";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Scene } from "@babylonjs/core/scene";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { bfsDistances, bfsPath, generateMaze, mulberry32, type CellPos, type Maze } from "./maze";
import {
  makeBeam,
  makeCarpet,
  makeCeiling,
  makeGrin,
  makePortal,
  makeSoftDot,
  makeWallpaper,
} from "./textures";
import { shuffleQuestion, type ShuffledQuestion } from "./questions";
import { seedCode, type PlatformActivity, type PlatformResult } from "../platform";
import { AudioEngine } from "./audio";
import { backroomsMusic } from "./music";
import {
  animateBean,
  animateMarauder,
  buildBean,
  buildMarauder,
  marauderAttackPose,
  type BeanRefs,
  type MarauderRefs,
} from "./entities";

// ----------------------------- Tipos UI -----------------------------

export type GameMode = "menu" | "play" | "question" | "feedback" | "paused" | "dead" | "win";
export type Difficulty = "facil" | "normal" | "dificil";
export type BoostId = "sprint" | "shield" | "pulse" | "map";

export interface MouseConfig {
  invertX: boolean;
  invertY: boolean;
  sensitivity: number;
}

export interface BoostSlot {
  id: BoostId;
  name: string;
  count: number;
  active: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad";
  until: number;
}

export interface Marker {
  id: string;
  x: number; // 0..1
  y: number;
  behind: boolean;
  label: string;
  color: string;
  dist: number;
  icon: "door" | "exit";
}

export interface QuestionUI {
  cat: string;
  text: string;
  options: string[];
  timeLeft: number;
  total: number;
  roomLabel: string;
  type: "multiple_choice" | "true_false";
}

export interface AnswerFeedback {
  correct: boolean;
  timeout: boolean;
  explanation: string;
  correctAnswer: string;
}

export interface EndStats {
  time: number;
  score: number;
  correct: number;
  wrong: number;
  fragments: number;
  bestStreak: number;
}

export interface Snapshot {
  mode: GameMode;
  threat: number;
  stamina: number;
  speedActive: boolean;
  shieldActive: boolean;
  fragments: number;
  fragmentsNeeded: number;
  score: number;
  time: number;
  streak: number;
  boosts: BoostSlot[];
  question: QuestionUI | null;
  answerFeedback: AnswerFeedback | null;
  toasts: Toast[];
  markers: Marker[];
  objective: string;
  mapVisible: boolean;
  flash: { color: string; a: number } | null;
  stats: EndStats | null;
  difficulty: Difficulty;
}

export interface MinimapData {
  gw: number;
  gh: number;
  solid: boolean[][];
  player: { c: number; r: number; ang: number };
  rooms: { c: number; r: number; state: RoomState }[];
  exit: { c: number; r: number; active: boolean };
}

// --------------------------- Configuración ---------------------------

const CS = 4; // tamaño de celda
const WALL_H = 3.35;

interface DiffCfg {
  marSpeed: number;
  ramp: number;
  lock: number;
  qtime: number;
  grace: number;
}
const DIFFS: Record<Difficulty, DiffCfg> = {
  facil: { marSpeed: 1.8, ramp: 0.17, lock: 8, qtime: 25, grace: 2.6 },
  normal: { marSpeed: 2.1, ramp: 0.22, lock: 10, qtime: 20, grace: 2.0 },
  dificil: { marSpeed: 2.45, ramp: 0.27, lock: 12, qtime: 15, grace: 1.6 },
};

type RoomState = "open" | "active" | "locked" | "done";

interface Room {
  cell: CellPos;
  state: RoomState;
  lockUntil: number;
  beam: Mesh;
  ring: Mesh;
  light: PointLight;
  beamMat: StandardMaterial;
  ringMat: StandardMaterial;
  firstTry: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ============================== CLASE ================================

export class BackroomsGame {
  readonly audio = new AudioEngine();
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: UniversalCamera;
  private glow: GlowLayer;
  private pipeline: DefaultRenderingPipeline;
  private hemi: HemisphericLight;
  private spot: SpotLight;
  private shadows: ShadowGenerator;
  private onSnap: (s: Snapshot) => void;
  private activity: PlatformActivity;
  private onComplete: (result: PlatformResult) => void;
  private fragmentsNeeded: number;
  private cells: number;

  // texturas compartidas
  private texBeam: DynamicTexture;
  private texGrin: DynamicTexture;
  private texPortal: DynamicTexture;
  private texDot: DynamicTexture;

  // nivel
  private levelRes: { dispose: () => void }[] = [];
  private maze: Maze | null = null;
  private halfW = 0;
  private halfH = 0;
  private rooms: Room[] = [];
  private exitCell: CellPos | null = null;
  private exitActive = false;
  private exitBeam: Mesh | null = null;
  private exitBeamMat: StandardMaterial | null = null;
  private exitDisc: Mesh | null = null;
  private exitLight: PointLight | null = null;
  private panelMat: PBRMaterial | null = null;
  private seed = 0;
  private initialLevelReady = true;
  private previousBeanColor = -1;

  // entidades
  private bean: BeanRefs | null = null;
  private mar: MarauderRefs | null = null;

  // estado
  private mode: GameMode = "menu";
  private difficulty: Difficulty = "normal";
  private cfg: DiffCfg = DIFFS.normal;
  private t = 0; // reloj global de animación
  private runTime = 0;
  private score = 0;
  private scoreAcc = 0;
  private fragments = 0;
  private streak = 0;
  private bestStreak = 0;
  private correctN = 0;
  private firstTryN = 0;
  private wrongN = 0;
  private usedQuestions = new Set<number>();
  private question: { q: ShuffledQuestion; left: number; total: number; room: Room } | null = null;
  private answerFeedback: AnswerFeedback | null = null;
  private pendingAnswer: { room: Room; correct: boolean; timeout: boolean } | null = null;
  private stats: EndStats | null = null;
  private toasts: Toast[] = [];
  private toastId = 0;
  private flashA = 0;
  private flashColor = "#ffffff";
  private objective = "";

  // jugador
  private pPos = new Vector3();
  private pVel = new Vector3();
  private pFacing = 0;
  private grounded = true;
  private stamina = 1;
  private stamDelay = 0;
  private exhausted = false;
  private playerCell: CellPos = { c: 1, r: 1 };

  // cámara
  private camYaw = 0;
  private camPitch = 0.38;
  private camDist = 4.0;
  private fov = 1.22;
  private menuNext = new Vector3();
  private deathStart = new Vector3();
  private deathCam = new Vector3();
  private deathT = 0;
  private mouseConfig: MouseConfig = { invertX: true, invertY: true, sensitivity: 1 };

  // merodeador
  private mPos = new Vector3();
  private mCell: CellPos = { c: 1, r: 1 };
  private mLastValidCell: CellPos = { c: 1, r: 1 };
  private mPath: CellPos[] = [];
  private mRetarget = 0;
  private mVel = new Vector3();
  private mYaw = 0;
  private stunUntil = 0;
  private aggroUntil = 0;
  private roarUntil = 0;
  private lastRoar = -10;
  private noDamageUntil = 0;
  private threat = 0;
  private nearMissReadyAt = 0;
  private playerTrail: CellPos[] = [];

  // boosts
  private boostCounts: Record<BoostId, number> = { sprint: 1, shield: 0, pulse: 0, map: 0 };
  private sprintUntil = 0;
  private shieldUntil = 0;
  private mapUntil = 0;

  private keys = new Set<string>();
  private removeTouch: () => void = () => {};
  private flicker = 1;
  private emitAcc = 0;
  private performanceAcc = 0;
  private tentacleFrame = 0;
  private adaptiveScale = 1;
  private disposed = false;
  private lowq =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("lowq");

  constructor(canvas: HTMLCanvasElement, activity: PlatformActivity, seed: number, onSnap: (s: Snapshot) => void, onComplete: (result: PlatformResult) => void) {
    this.canvas = canvas;
    this.activity = activity;
    this.seed = seed;
    this.onSnap = onSnap;
    this.onComplete = onComplete;
    this.fragmentsNeeded = activity.settings.requiredFragments;
    this.cells = activity.settings.mazeSize === "small" ? 8 : activity.settings.mazeSize === "large" ? 13 : 11;
    this.engine = new Engine(canvas, true, { stencil: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }, false);
    this.adaptiveScale = this.lowq ? 1.35 : window.devicePixelRatio > 2 ? 1.18 : 1;
    this.engine.setHardwareScalingLevel(this.adaptiveScale);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.018, 0.01, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.16, 0.13, 0.07);
    this.scene.fogDensity = 0.035;
    this.scene.ambientColor = new Color3(0.25, 0.22, 0.15);

    // Cámara
    this.camera = new UniversalCamera("cam", new Vector3(0, 1.6, 0), this.scene);
    this.camera.inputs.clear();
    this.camera.fov = this.fov;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 120;

    // Luces base
    this.hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    this.hemi.diffuse = new Color3(1, 0.9, 0.68);
    this.hemi.groundColor = new Color3(0.32, 0.26, 0.15);
    this.hemi.intensity = 1.18;

    this.spot = new SpotLight(
      "spot",
      new Vector3(0, 3, 0),
      new Vector3(0, -1, 0.3),
      1.15,
      3,
      this.scene
    );
    this.spot.diffuse = new Color3(1, 0.94, 0.78);
    this.spot.specular = new Color3(1, 0.92, 0.7);
    this.spot.intensity = 6.5;
    this.spot.range = 20;
    this.shadows = new ShadowGenerator(this.lowq ? 512 : 1024, this.spot);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 16;
    this.shadows.darkness = 0.25;

    // Post-procesado cinematográfico
    this.glow = new GlowLayer("glow", this.scene, { mainTextureRatio: 0.4 });
    this.glow.intensity = 0.75;
    this.pipeline = new DefaultRenderingPipeline("rp", true, this.scene, [this.camera]);
    this.pipeline.samples = this.lowq ? 1 : 2;
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.72;
    this.pipeline.bloomWeight = 0.34;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.chromaticAberrationEnabled = true;
    this.pipeline.chromaticAberration.aberrationAmount = 2.5;
    this.pipeline.grainEnabled = true;
    this.pipeline.grain.intensity = 11;
    this.pipeline.grain.animated = true;
    this.pipeline.sharpenEnabled = true;
    this.pipeline.sharpen.edgeAmount = 0.26;
    this.pipeline.imageProcessing.toneMappingEnabled = true;
    this.pipeline.imageProcessing.contrast = 1.18;
    this.pipeline.imageProcessing.exposure = 1.24;
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.vignetteWeight = 1.7;
    this.pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 1);

    try {
      if (this.engine.webGLVersion >= 2 && !this.lowq) {
        this.scene.enableGeometryBufferRenderer();
        const ssao = new SSAO2RenderingPipeline(
          "ssao",
          this.scene,
          { ssaoRatio: 0.42, blurRatio: 0.45 },
          [this.camera]
        );
        ssao.totalStrength = 1.15;
        ssao.radius = 0.7;
        ssao.expensiveBlur = false;
      }
    } catch {
      /* SSAO opcional */
    }

    // Texturas compartidas
    this.texBeam = makeBeam(this.scene);
    this.texGrin = makeGrin(this.scene);
    this.texPortal = makePortal(this.scene);
    this.texDot = makeSoftDot(this.scene);

    // Entrada
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.canvas.addEventListener("click", this.onCanvasClick);
    window.addEventListener("resize", this.onResize);

    this.removeTouch = installTouchControls({
      id: 'backrooms-scape', canvas,
      playing: () => this.mode === 'play', paused: () => this.mode === 'paused',
      pause: () => this.pause(),
      key: (code, down) => down ? this.onKeyDown(new KeyboardEvent('keydown', { code })) : this.onKeyUp(new KeyboardEvent('keyup', { code })),
      look: (x, y) => {
        const cfg = this.mouseConfig;
        this.camYaw -= x * 0.0024 * cfg.sensitivity * (cfg.invertX ? -1 : 1);
        this.camPitch = clamp(this.camPitch + y * 0.0021 * cfg.sensitivity * (cfg.invertY ? -1 : 1), 0.04, 0.95);
      },
      actions: [{code:'Space',label:'Saltar'}, {code:'ShiftLeft',label:'SHIFT'}, {code:'Digit1',label:'Impulso'}, {code:'Digit2',label:'Escudo'}, {code:'Digit3',label:'Pulso'}, {code:'Digit4',label:'Mapa'}],
    });
    this.buildLevel(seed);
    this.spawnEntities(false);

    this.engine.runRenderLoop(() => {
      if (this.disposed || document.hidden) return;
      try {
        const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
        this.update(dt);
        this.scene.render();
      } catch (err) {
        // nunca dejar morir el loop por un frame defectuoso
        if (!(window as unknown as { __bsErr?: boolean }).__bsErr) {
          (window as unknown as { __bsErr?: boolean }).__bsErr = true;
          console.error("Frame error (recuperado):", err);
        }
      }
    });
  }

  // --------------------------- entrada ---------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    if (e.code.startsWith("Digit")) {
      const n = parseInt(e.code.slice(5), 10) - 1;
      if (this.mode === "play") this.useBoost(n);
      else if (this.mode === "question") this.answer(n);
    }
    if (e.code === "KeyP" && this.mode === "play") this.pause();
    else if (e.code === "KeyP" && this.mode === "paused") this.resume();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    if (this.mode !== "play") return;
    const { invertX, invertY, sensitivity } = this.mouseConfig;
    this.camYaw -= e.movementX * 0.0024 * sensitivity * (invertX ? -1 : 1);
    this.camPitch = clamp(this.camPitch + e.movementY * 0.0021 * sensitivity * (invertY ? -1 : 1), 0.04, 0.95);
  };
  private onLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas && this.mode === "play" && !this.question) {
      // pérdida del lock fuera de pregunta → pausa
      this.pause();
    }
  };
  private onCanvasClick = (): void => {
    if (this.mode === "play" && document.pointerLockElement !== this.canvas) this.lock();
  };
  private onResize = (): void => this.engine.resize();

  private lock(): void {
    if (hasTouchControls()) return;
    try {
      this.canvas.requestPointerLock();
    } catch {
      /* noop */
    }
  }
  private unlock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* noop */
    }
  }

  // --------------------------- nivel ---------------------------

  private track<T extends { dispose: (...args: never[]) => void }>(res: T): T {
    this.levelRes.push(res as unknown as { dispose: () => void });
    return res;
  }

  private cellCenter(c: number, r: number, y = 0): Vector3 {
    return new Vector3(c * CS - this.halfW, y, r * CS - this.halfH);
  }
  private worldCell(x: number, z: number): CellPos {
    return {
      c: clamp(Math.round((x + this.halfW) / CS), 0, (this.maze?.gw ?? 1) - 1),
      r: clamp(Math.round((z + this.halfH) / CS), 0, (this.maze?.gh ?? 1) - 1),
    };
  }
  private isRoomCell(c: number, r: number): boolean {
    return this.rooms.some((ro) => ro.cell.c === c && ro.cell.r === r);
  }
  private solidAt(c: number, r: number): boolean {
    const m = this.maze;
    if (!m) return true;
    if (c < 0 || r < 0 || c >= m.gw || r >= m.gh) return true;
    if (m.solid[r][c]) return true;
    // puertas bloqueadas o en pregunta activa (por si estás dentro) bloquean
    for (const ro of this.rooms) {
      if (ro.cell.c === c && ro.cell.r === r && ro.state === "locked") return true;
    }
    return false;
  }

  private disposeLevel(): void {
    for (const r of this.levelRes) {
      try {
        r.dispose();
      } catch {
        /* noop */
      }
    }
    this.levelRes = [];
    this.rooms = [];
    this.bean = null;
    this.mar = null;
    this.exitBeam = null;
    this.exitDisc = null;
    this.exitLight = null;
    this.panelMat = null;
    this.shadows.getShadowMap()?.renderList?.splice(0);
  }

  private buildLevel(seed: number): void {
    this.disposeLevel();
    this.seed = seed;
    const rand = mulberry32(seed);
    const roomCount = Math.min(this.activity.questions.length, Math.max(this.fragmentsNeeded, 5));
    const maze = generateMaze(this.cells, this.cells, seed, roomCount);
    this.maze = maze;
    this.halfW = ((maze.gw - 1) / 2) * CS;
    this.halfH = ((maze.gh - 1) / 2) * CS;
    const W = maze.gw * CS;
    const H = maze.gh * CS;

    // ---- materiales
    const wallTex = this.track(makeWallpaper(this.scene));
    wallTex.anisotropicFilteringLevel = 8;
    const matWall = this.track(new PBRMaterial("wall", this.scene));
    matWall.albedoTexture = wallTex;
    matWall.bumpTexture = wallTex;
    matWall.bumpTexture.level = 0.35;
    matWall.roughness = 0.75;
    matWall.maxSimultaneousLights = 10;

    const carpTex = this.track(makeCarpet(this.scene));
    carpTex.anisotropicFilteringLevel = 8;
    carpTex.uScale = W / 4;
    carpTex.vScale = H / 4;
    const matFloor = this.track(new PBRMaterial("floor", this.scene));
    matFloor.albedoTexture = carpTex;
    matFloor.bumpTexture = carpTex;
    matFloor.bumpTexture.level = 0.25;
    matFloor.roughness = 0.96;
    matFloor.maxSimultaneousLights = 10;

    const ceilTex = this.track(makeCeiling(this.scene));
    ceilTex.anisotropicFilteringLevel = 8;
    ceilTex.uScale = W / 4;
    ceilTex.vScale = H / 4;
    const matCeil = this.track(new PBRMaterial("ceil", this.scene));
    matCeil.albedoTexture = ceilTex;
    matCeil.roughness = 0.85;
    matCeil.maxSimultaneousLights = 10;

    this.panelMat = this.track(new PBRMaterial("panel", this.scene));
    this.panelMat.albedoColor = new Color3(1, 1, 1);
    this.panelMat.emissiveColor = new Color3(1, 0.96, 0.85);
    this.panelMat.emissiveIntensity = 1.7;
    this.panelMat.roughness = 0.4;

    const deadPanelMat = this.track(new PBRMaterial("panelDead", this.scene));
    deadPanelMat.albedoColor = new Color3(0.55, 0.53, 0.45);
    deadPanelMat.emissiveColor = new Color3(0.18, 0.17, 0.12);
    deadPanelMat.emissiveIntensity = 0.3;
    deadPanelMat.roughness = 0.5;

    // ---- suelo y techo
    const floor = this.track(MeshBuilder.CreateGround("floor", { width: W, height: H }, this.scene));
    floor.material = matFloor;
    floor.receiveShadows = true;

    const ceil = this.track(
      MeshBuilder.CreatePlane("ceil", { width: W, height: H }, this.scene)
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    ceil.material = matCeil;
    ceil.receiveShadows = true;

    // ---- muros instanciados
    const wallT = MeshBuilder.CreateBox("wall", { width: CS, height: WALL_H, depth: CS }, this.scene);
    wallT.material = matWall;
    wallT.isVisible = false;
    wallT.receiveShadows = true;
    this.track(wallT);
    for (let r = 0; r < maze.gh; r++) {
      for (let c = 0; c < maze.gw; c++) {
        if (!maze.solid[r][c]) continue;
        const inst = wallT.createInstance("wall" + r + "_" + c);
        inst.position = this.cellCenter(c, r, WALL_H / 2);
        inst.receiveShadows = true;
        this.track(inst);
      }
    }

    // ---- paneles de luz
    const panelT = MeshBuilder.CreateBox("panel", { width: 2.3, height: 0.07, depth: 1.3 }, this.scene);
    panelT.material = this.panelMat;
    panelT.isVisible = false;
    this.track(panelT);
    const deadT = MeshBuilder.CreateBox("panelD", { width: 2.3, height: 0.07, depth: 1.3 }, this.scene);
    deadT.material = deadPanelMat;
    deadT.isVisible = false;
    this.track(deadT);
    for (let r = 1; r < maze.gh - 1; r++) {
      for (let c = 1; c < maze.gw - 1; c++) {
        if (maze.solid[r][c]) continue;
        if ((c * 7 + r * 13) % 2 !== 0) continue;
        const dead = rand() < 0.14;
        const inst = (dead ? deadT : panelT).createInstance("p" + r + "_" + c);
        inst.position = this.cellCenter(c, r, WALL_H - 0.045);
        this.track(inst);
      }
    }

    // ---- charcos luminosos
    const puddleMat = this.track(new PBRMaterial("puddle", this.scene));
    puddleMat.albedoColor = new Color3(0.02, 0.06, 0.08);
    puddleMat.emissiveColor = new Color3(0.05, 0.35, 0.45);
    puddleMat.emissiveIntensity = 0.55;
    puddleMat.roughness = 0.06;
    puddleMat.metallic = 0.8;
    puddleMat.maxSimultaneousLights = 10;
    const puddleT = MeshBuilder.CreateDisc("puddle", { radius: 1.15, tessellation: 28 }, this.scene);
    puddleT.rotation.x = Math.PI / 2;
    puddleT.material = puddleMat;
    puddleT.isVisible = false;
    this.track(puddleT);
    for (let i = 0; i < 14; i++) {
      const c = 1 + Math.floor(rand() * (maze.gw - 2));
      const r = 1 + Math.floor(rand() * (maze.gh - 2));
      if (maze.solid[r][c]) continue;
      const inst = puddleT.createInstance("pd" + i);
      inst.position = this.cellCenter(c, r, 0.015);
      inst.scaling = new Vector3(0.7 + rand() * 0.7, 0.7 + rand() * 0.7, 1);
      this.track(inst);
    }

    // ---- paneles caídos (decoración)
    for (let i = 0; i < 12; i++) {
      const c = 1 + Math.floor(rand() * (maze.gw - 2));
      const r = 1 + Math.floor(rand() * (maze.gh - 2));
      if (maze.solid[r][c]) continue;
      const tile = this.track(
        MeshBuilder.CreateBox("tile" + i, { width: 1.7, height: 0.05, depth: 1.1 }, this.scene)
      );
      tile.material = deadPanelMat;
      tile.position = this.cellCenter(c, r, 0.03);
      tile.position.x += (rand() - 0.5) * 2;
      tile.position.z += (rand() - 0.5) * 2;
      tile.rotation.y = rand() * Math.PI;
      tile.rotation.x = (rand() - 0.5) * 0.12;
      tile.receiveShadows = true;
    }

    // ---- salas seguras
    for (const cell of maze.roomCells) {
      const p = this.cellCenter(cell.c, cell.r);
      const beamMat = this.track(new StandardMaterial("beam" + cell.c, this.scene));
      beamMat.emissiveColor = new Color3(0.2, 0.9, 1);
      beamMat.emissiveTexture = this.texBeam;
      beamMat.opacityTexture = this.texBeam;
      beamMat.disableLighting = true;
      beamMat.fogEnabled = false;
      beamMat.alpha = 0.8;
      const beam = this.track(
        MeshBuilder.CreateCylinder("beamM" + cell.c, { diameter: 0.55, height: WALL_H - 0.1, tessellation: 20 }, this.scene)
      );
      beam.position = p.add(new Vector3(0, WALL_H / 2, 0));
      beam.material = beamMat;

      const ringMat = this.track(new StandardMaterial("ring" + cell.c, this.scene));
      ringMat.emissiveColor = new Color3(0.2, 0.9, 1);
      ringMat.disableLighting = true;
      ringMat.fogEnabled = false;
      ringMat.alpha = 0.9;
      const ring = this.track(
        MeshBuilder.CreateTorus("ringM" + cell.c, { diameter: 1.7, thickness: 0.055, tessellation: 40 }, this.scene)
      );
      ring.position = p.add(new Vector3(0, 0.05, 0));
      ring.rotation.x = Math.PI / 2;
      ring.material = ringMat;

      const light = this.track(new PointLight("rl" + cell.c, p.add(new Vector3(0, 1.8, 0)), this.scene));
      light.diffuse = new Color3(0.2, 0.9, 1);
      light.specular = new Color3(0.3, 0.9, 1);
      light.intensity = 3.4;
      light.range = 9;

      this.rooms.push({ cell, state: "open", lockUntil: 0, beam, ring, light, beamMat, ringMat, firstTry: true });
    }

    // ---- salida (portal)
    this.exitCell = maze.exitCell;
    const ep = this.cellCenter(maze.exitCell.c, maze.exitCell.r);
    this.exitBeamMat = this.track(new StandardMaterial("exitBeam", this.scene));
    this.exitBeamMat.emissiveColor = new Color3(0.65, 0.4, 1);
    this.exitBeamMat.emissiveTexture = this.texBeam;
    this.exitBeamMat.opacityTexture = this.texBeam;
    this.exitBeamMat.disableLighting = true;
    this.exitBeamMat.fogEnabled = false;
    this.exitBeamMat.alpha = 0.15;
    this.exitBeam = this.track(
      MeshBuilder.CreateCylinder("exitBeamM", { diameter: 0.9, height: WALL_H - 0.1, tessellation: 24 }, this.scene)
    );
    this.exitBeam.position = ep.add(new Vector3(0, WALL_H / 2, 0));
    this.exitBeam.material = this.exitBeamMat;

    const discMat = this.track(new StandardMaterial("exitDisc", this.scene));
    discMat.emissiveColor = new Color3(0.7, 0.5, 1.2);
    discMat.emissiveTexture = this.texPortal;
    discMat.opacityTexture = this.texPortal;
    discMat.disableLighting = true;
    discMat.fogEnabled = false;
    this.exitDisc = this.track(MeshBuilder.CreateDisc("exitDiscM", { radius: 1.3, tessellation: 40 }, this.scene));
    this.exitDisc.position = ep.add(new Vector3(0, 1.6, 0));
    this.exitDisc.rotation.y = rand() * Math.PI;
    this.exitDisc.material = discMat;

    this.exitLight = this.track(new PointLight("exitL", ep.add(new Vector3(0, 1.8, 0)), this.scene));
    this.exitLight.diffuse = new Color3(0.6, 0.4, 1);
    this.exitLight.intensity = 1.2;
    this.exitLight.range = 10;
    this.exitActive = false;
  }

  private spawnEntities(forRun: boolean): void {
    const maze = this.maze;
    if (!maze) return;
    // jugador
    const beanColors = ["#FF5F8F", "#35D6C8", "#FFD34E", "#8A79FF", "#4EB7FF", "#F28C42", "#75D05B"];
    let colorIndex = Math.floor(Math.random() * beanColors.length);
    if (colorIndex === this.previousBeanColor) colorIndex = (colorIndex + 1) % beanColors.length;
    this.previousBeanColor = colorIndex;
    this.bean = buildBean(this.scene, Color3.FromHexString(beanColors[colorIndex]));
    for (const m of this.bean.meshes) {
      this.track(m);
      this.shadows.addShadowCaster(m, false);
    }
    for (const material of this.bean.materials) this.track(material);
    this.track(this.bean.root);
    const sp = this.cellCenter(maze.spawn.c, maze.spawn.r);
    this.pPos = sp.clone();
    this.pVel = Vector3.Zero();
    this.playerCell = { ...maze.spawn };
    // mirar hacia el primer pasillo abierto
    let fx = 0;
    let fz = 1;
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    for (const [dc, dr] of dirs) {
      if (!maze.solid[maze.spawn.r + dr][maze.spawn.c + dc]) {
        fx = dc;
        fz = dr;
        break;
      }
    }
    this.pFacing = Math.atan2(fx, fz);
    this.camYaw = this.pFacing;
    this.applyPos();

    // merodeador: celda abierta más lejana al spawn
    const dist = bfsDistances(maze.solid, maze.spawn);
    let best: CellPos = { c: maze.gw - 2, r: maze.gh - 2 };
    let bd = -1;
    for (let r = 1; r < maze.gh - 1; r++)
      for (let c = 1; c < maze.gw - 1; c++) {
        if (maze.solid[r][c] || this.isRoomCell(c, r)) continue;
        if (dist[r][c] > bd) {
          bd = dist[r][c];
          best = { c, r };
        }
      }
    this.mPos = this.cellCenter(best.c, best.r);
    this.mCell = best;
    this.mLastValidCell = { ...best };
    this.mPath = [];
    this.mar = buildMarauder(this.scene, this.texGrin);
    for (const m of this.mar.meshes) {
      this.track(m);
      if (m.name !== "marGrin") this.shadows.addShadowCaster(m, false);
    }
    for (const material of this.mar.materials) this.track(material);
    this.track(this.mar.root);
    this.track(this.mar.light);
    this.mar.root.position = this.mPos.clone();

    // partículas de baba negra
    const goo = new ParticleSystem("goo", this.lowq ? 45 : 80, this.scene);
    goo.particleTexture = this.texDot;
    goo.emitter = this.mar.body;
    goo.minEmitBox = new Vector3(-0.5, -0.5, -0.5);
    goo.maxEmitBox = new Vector3(0.5, -0.2, 0.5);
    goo.color1 = new Color4(0.01, 0, 0.02, 0.85);
    goo.color2 = new Color4(0.05, 0, 0.09, 0.6);
    goo.colorDead = new Color4(0, 0, 0, 0);
    goo.minSize = 0.06;
    goo.maxSize = 0.2;
    goo.minLifeTime = 0.5;
    goo.maxLifeTime = 1.2;
    goo.emitRate = this.lowq ? 10 : 18;
    goo.gravity = new Vector3(0, -2.5, 0);
    goo.direction1 = new Vector3(-0.3, -0.5, -0.3);
    goo.direction2 = new Vector3(0.3, 0.1, 0.3);
    goo.minEmitPower = 0.1;
    goo.maxEmitPower = 0.5;
    goo.start();
    this.track(goo);

    if (forRun) {
      this.camPitch = 0.38;
      this.camDist = 4.0;
    }
  }

  // --------------------------- API pública ---------------------------

  setMouseConfig(config: MouseConfig): void {
    this.mouseConfig = {
      invertX: config.invertX,
      invertY: config.invertY,
      sensitivity: clamp(config.sensitivity, 0.4, 2.2),
    };
  }

  setMusicMuted(muted: boolean): void {
    backroomsMusic.setMuted(muted);
  }

  startRun(diff: Difficulty, seed = Math.floor(Math.random() * 1e9)): void {
    this.difficulty = diff;
    this.cfg = {
      ...DIFFS[diff],
      lock: this.activity.settings.doorLockSeconds,
      qtime: this.activity.settings.questionTime,
    };
    const canReusePreparedLevel = this.initialLevelReady && this.seed === seed && this.maze !== null && this.bean !== null;
    this.initialLevelReady = false;
    if (!canReusePreparedLevel) {
      this.buildLevel(seed);
      this.spawnEntities(true);
    } else {
      // El escenario visible detrás del menú ya está completamente preparado.
      // Reutilizarlo evita construir dos veces el laberinto en el primer inicio.
      this.camPitch = 0.38;
      this.camDist = 4.0;
    }
    this.mode = "play";
    this.runTime = 0;
    this.score = 0;
    this.scoreAcc = 0;
    this.fragments = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.correctN = 0;
    this.firstTryN = 0;
    this.wrongN = 0;
    this.usedQuestions.clear();
    this.question = null;
    this.answerFeedback = null;
    this.pendingAnswer = null;
    this.stats = null;
    this.toasts = [];
    this.stamina = 1;
    this.exhausted = false;
    this.boostCounts = { sprint: 1, shield: 0, pulse: 0, map: 0 };
    this.sprintUntil = 0;
    this.shieldUntil = 0;
    this.mapUntil = 0;
    this.noDamageUntil = this.t + 3;
    this.nearMissReadyAt = this.t + 4;
    this.playerTrail = [{ ...this.playerCell }];
    this.stunUntil = 0;
    this.flashA = 0;
    this.deathT = 0;
    this.objective = `Consigue ${this.fragmentsNeeded} fragmentos del portal`;
    this.toast("Encuentra las salas marcadas con luz cian", "info");
    this.toast("¡El Merodeador ya te está buscando!", "bad");
    this.audio.init();
    backroomsMusic.start(diff);
    this.lock();
    this.emit(true);
  }

  toMenu(): void {
    backroomsMusic.stop();
    this.mode = "menu";
    this.unlock();
    this.menuNext = this.camera.globalPosition.clone();
    this.emit(true);
  }

  pause(): void {
    if (this.mode !== "play") return;
    this.mode = "paused";
    backroomsMusic.pause();
    this.unlock();
    this.emit(true);
  }
  resume(): void {
    if (this.mode !== "paused") return;
    this.mode = "play";
    backroomsMusic.resume();
    this.lock();
    this.emit(true);
  }

  useBoost(i: number): void {
    if (this.mode !== "play") return;
    const ids: BoostId[] = ["sprint", "shield", "pulse", "map"];
    const id = ids[i];
    if (!id || this.boostCounts[id] <= 0) return;
    const maze = this.maze;
    if (!maze) return;
    this.boostCounts[id]--;
    switch (id) {
      case "sprint":
        this.sprintUntil = this.t + 6;
        this.stamina = 1;
        this.exhausted = false;
        this.audio.pulse();
        this.toast("¡Impulso de velocidad!", "good");
        break;
      case "shield":
        this.shieldUntil = this.t + 40;
        this.audio.shield();
        this.toast("Escudo activado: sobrevivirás un toque", "good");
        break;
      case "pulse": {
        const dist = bfsDistances(maze.solid, this.worldCell(this.mPos.x, this.mPos.z), (c, r) => !this.isRoomCell(c, r));
        let best: CellPos = this.mCell;
        let bd = -1;
        const pc = this.playerCell;
        for (let r = 1; r < maze.gh - 1; r++)
          for (let c = 1; c < maze.gw - 1; c++) {
            if (dist[r][c] < 0 || this.isRoomCell(c, r)) continue;
            const dp = Math.abs(c - pc.c) + Math.abs(r - pc.r);
            if (dp > bd) {
              bd = dp;
              best = { c, r };
            }
          }
        this.mPos = this.cellCenter(best.c, best.r);
        this.mPath = [];
        this.stunUntil = this.t + 2.5;
        this.audio.pulse();
        this.flash("#37e0ff", 0.35);
        this.toast("Pulso seguro: el Merodeador fue repelido", "good");
        break;
      }
      case "map":
        this.mapUntil = this.t + 12;
        this.audio.mapPing();
        this.toast("Mapa revelado por 12 segundos", "good");
        break;
    }
    this.emit(true);
  }

  answer(i: number): void {
    if (this.mode !== "question" || !this.question) return;
    const { q, room } = this.question;
    const correct = i === q.correct;
    backroomsMusic.leaveQuestion();
    if (!this.activity.settings.showFeedback) {
      if (correct) this.onCorrect(room);
      else this.onWrong(room, false);
      return;
    }
    this.pendingAnswer = { room, correct, timeout: false };
    this.answerFeedback = {
      correct,
      timeout: false,
      explanation: q.feedback,
      correctAnswer: q.options[q.correct],
    };
    this.mode = "feedback";
    this.unlock();
    this.emit(true);
  }

  continueAfterAnswer(): void {
    const pending = this.pendingAnswer;
    if (!pending || !this.question) return;
    this.pendingAnswer = null;
    this.answerFeedback = null;
    if (pending.correct) this.onCorrect(pending.room);
    else this.onWrong(pending.room, pending.timeout);
  }

  getMinimap(): MinimapData | null {
    const maze = this.maze;
    if (!maze || this.t > this.mapUntil) return null;
    return {
      gw: maze.gw,
      gh: maze.gh,
      solid: maze.solid,
      player: { c: this.playerCell.c, r: this.playerCell.r, ang: this.pFacing },
      rooms: this.rooms.map((r) => ({ c: r.cell.c, r: r.cell.r, state: r.state })),
      exit: { c: maze.exitCell.c, r: maze.exitCell.r, active: this.exitActive },
    };
  }

  dispose(): void {
    this.removeTouch();
    this.disposed = true;
    backroomsMusic.stop();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    window.removeEventListener("resize", this.onResize);
    this.disposeLevel();
    this.scene.dispose();
    this.engine.dispose();
  }

  // --------------------------- lógica ---------------------------

  private toast(text: string, kind: Toast["kind"]): void {
    this.toasts.push({ id: ++this.toastId, text, kind, until: this.t + 3.6 });
  }

  private flash(color: string, a: number): void {
    this.flashColor = color;
    this.flashA = a;
  }

  private grantBoost(): void {
    const pool: [BoostId, number][] = [
      ["sprint", 0.3],
      ["shield", 0.2],
      ["pulse", 0.27],
      ["map", 0.23],
    ];
    let roll = Math.random();
    let id: BoostId = "sprint";
    for (const [bid, w] of pool) {
      if (roll < w) {
        id = bid;
        break;
      }
      roll -= w;
    }
    this.boostCounts[id]++;
    const names: Record<BoostId, string> = {
      sprint: "Impulso",
      shield: "Escudo",
      pulse: "Pulso seguro",
      map: "Mapa",
    };
    this.toast(`Boost obtenido: ${names[id]} (pulsa ${["1", "2", "3", "4"][["sprint", "shield", "pulse", "map"].indexOf(id)]})`, "good");
  }

  private openQuestion(room: Room): void {
    // elige pregunta no usada
    const questions = this.activity.questions;
    let idx = Math.floor(Math.random() * questions.length);
    if (this.usedQuestions.size < questions.length) {
      while (this.usedQuestions.has(idx)) idx = Math.floor(Math.random() * questions.length);
    }
    this.usedQuestions.add(idx);
    const rand = mulberry32(this.seed + idx * 977 + room.cell.c * 31);
    const q = shuffleQuestion(questions[idx], this.activity.subject, rand);
    room.state = "active";
    this.question = { q, left: this.cfg.qtime, total: this.cfg.qtime, room };
    this.mode = "question";
    this.unlock();
    this.updateRoomVisual(room);
    this.audio.enterRoom();
    backroomsMusic.enterQuestion();
    this.emit(true);
  }

  private onCorrect(room: Room): void {
    backroomsMusic.leaveQuestion();
    room.state = "done";
    this.question = null;
    this.mode = "play";
    this.fragments++;
    this.correctN++;
    if (room.firstTry) this.firstTryN++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += 100 + (this.streak - 1) * 25;
    this.noDamageUntil = this.t + 1.5;
    this.grantBoost();
    this.audio.correct();
    setTimeout(() => this.audio.pickup(), 250);
    this.flash("#ffd84d", 0.3);
    this.updateRoomVisual(room);
    if (this.streak >= 3) this.toast(`¡Racha de ${this.streak}!, bonus de puntos`, "good");
    this.toast(`¡Correcto! Fragmento ${this.fragments}/${this.fragmentsNeeded}`, "good");
    if (this.fragments >= this.fragmentsNeeded) this.openExit();
    this.lock();
    this.emit(true);
  }

  private onWrong(room: Room, timeout: boolean): void {
    backroomsMusic.leaveQuestion();
    this.question = null;
    this.mode = "play";
    this.wrongN++;
    this.streak = 0;
    room.state = "locked";
    room.firstTry = false;
    room.lockUntil = this.t + this.cfg.lock;
    this.noDamageUntil = this.t + this.cfg.grace;
    this.aggroUntil = this.t + 3;
    // expulsar al jugador fuera de la sala
    const maze = this.maze!;
    const nb: CellPos[] = [
      { c: room.cell.c + 1, r: room.cell.r },
      { c: room.cell.c - 1, r: room.cell.r },
      { c: room.cell.c, r: room.cell.r + 1 },
      { c: room.cell.c, r: room.cell.r - 1 },
    ].filter((n) => !maze.solid[n.r][n.c] && !this.isRoomCell(n.c, n.r));
    const target = nb.length ? nb[Math.floor(Math.random() * nb.length)] : room.cell;
    this.pPos = this.cellCenter(target.c, target.r);
    this.pVel = Vector3.Zero();
    this.audio.wrong();
    setTimeout(() => this.audio.slam(), 150);
    this.flash("#ff1b2d", 0.5);
    this.updateRoomVisual(room);
    this.toast(timeout ? "¡Tiempo agotado! La puerta se ha bloqueado" : `Fallaste: puerta bloqueada ${this.cfg.lock}s`, "bad");
    this.toast("¡Corre! El Merodeador te ha localizado", "bad");
    this.lock();
    this.emit(true);
  }

  private openExit(): void {
    this.exitActive = true;
    this.objective = "¡Dirígete al portal violeta y escapa!";
    if (this.exitLight) this.exitLight.intensity = 6;
    if (this.exitBeamMat) this.exitBeamMat.alpha = 0.95;
    this.audio.portal();
    this.flash("#a268ff", 0.45);
    this.toast("¡EL PORTAL DE ESCAPE ESTÁ ABIERTO!", "good");
  }

  private updateRoomVisual(room: Room): void {
    const colors: Record<RoomState, Color3> = {
      open: new Color3(0.2, 0.9, 1),
      active: new Color3(1, 0.75, 0.2),
      locked: new Color3(1, 0.12, 0.08),
      done: new Color3(0.45, 1, 0.6),
    };
    const c = colors[room.state];
    room.beamMat.emissiveColor = c;
    room.ringMat.emissiveColor = c;
    room.light.diffuse = c;
    room.light.specular = c;
    room.beamMat.alpha = room.state === "locked" ? 0.35 : 0.8;
    room.light.intensity = room.state === "done" ? 2 : 3.4;
  }

  private playerInSafeCell(): boolean {
    return this.rooms.some(
      (ro) =>
        ro.cell.c === this.playerCell.c &&
        ro.cell.r === this.playerCell.r &&
        ro.state !== "locked"
    );
  }

  // --------------------------- daño / muerte ---------------------------

  private onCaught(): void {
    if (this.t < this.noDamageUntil) return;
    if (this.t >= this.nearMissReadyAt) {
      const inDeadEnd = this.openNeighborCount(this.playerCell) <= 1;
      const grace = inDeadEnd ? 3.6 : 2.4;
      this.nearMissReadyAt = this.t + 16;
      this.noDamageUntil = this.t + grace;
      this.stunUntil = Math.max(this.stunUntil, this.t + 1.15);
      this.mVel.setAll(0);
      this.flash("#ffd84d", 0.2);
      this.toast(inDeadEnd
        ? "¡Encuentro cercano! Tienes unos segundos para salir del callejón"
        : "¡Pasó muy cerca! Aprovecha para cambiar de ruta", "info");
      return;
    }
    if (this.t < this.shieldUntil) {
      this.shieldUntil = 0;
      this.noDamageUntil = this.t + 3;
      this.retreatMarauderAlongMaze();
      this.audio.shield();
      this.audio.slam();
      this.flash("#37e0ff", 0.6);
      this.toast("¡El escudo te ha salvado!", "good");
      return;
    }
    // muerte
    this.mode = "dead";
    backroomsMusic.stop();
    this.deathT = 0;
    this.deathStart = this.camera.globalPosition.clone();
    // killcam 3/4 frontal: se ve la cara del monstruo
    const side = this.mYaw + 2.5;
    const off = new Vector3(Math.sin(side) * 2.4, 1.85, Math.cos(side) * 2.4);
    this.deathCam = this.mPos.add(off);
    this.audio.death();
    this.unlock();
    this.emit(true);
  }

  private onWin(): void {
    this.mode = "win";
    backroomsMusic.stop();
    const bonus = Math.max(0, Math.round(600 - this.runTime * 2));
    this.score += bonus;
    this.stats = {
      time: this.runTime,
      score: this.score,
      correct: this.correctN,
      wrong: this.wrongN,
      fragments: this.fragments,
      bestStreak: this.bestStreak,
    };
    this.audio.win();
    this.unlock();
    this.emit(true);
    this.onComplete({
      hits: this.firstTryN,
      total: this.fragmentsNeeded,
      wrongAttempts: this.wrongN,
      time: this.runTime,
      captures: 0,
      score: this.score,
      seedCode: seedCode(this.seed),
      fragments: this.fragments,
    });
  }

  // --------------------------- update ---------------------------

  private applyPos(): void {
    if (this.bean) {
      this.bean.root.position = this.pPos.clone();
      this.bean.root.rotation.y = this.pFacing;
    }
  }

  private resolveCircle(pos: Vector3, radius: number): void {
    const cc = this.worldCell(pos.x, pos.z);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = cc.c + dc;
        const r = cc.r + dr;
        if (!this.solidAt(c, r)) continue;
        const cx = c * CS - this.halfW;
        const cz = r * CS - this.halfH;
        const nx = clamp(pos.x, cx - CS / 2, cx + CS / 2);
        const nz = clamp(pos.z, cz - CS / 2, cz + CS / 2);
        let dx = pos.x - nx;
        let dz = pos.z - nz;
        let d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        if (d2 < 1e-6) {
          // dentro del bloque: empujar por el eje mínimo
          const pushL = pos.x - (cx - CS / 2) + radius;
          const pushR = cx + CS / 2 - pos.x + radius;
          const pushD = pos.z - (cz - CS / 2) + radius;
          const pushU = cz + CS / 2 - pos.z + radius;
          const m = Math.min(pushL, pushR, pushD, pushU);
          if (m === pushL) pos.x = cx - CS / 2 - radius;
          else if (m === pushR) pos.x = cx + CS / 2 + radius;
          else if (m === pushD) pos.z = cz - CS / 2 - radius;
          else pos.z = cz + CS / 2 + radius;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          pos.x = nx + dx * radius;
          pos.z = nz + dz * radius;
        }
      }
    }
  }

  private update(dt: number): void {
    this.t += dt;
    const t = this.t;

    // Conserva todos los efectos y ajusta únicamente la resolución interna
    // cuando el dispositivo no sostiene una tasa de cuadros fluida.
    this.performanceAcc += dt;
    if (this.performanceAcc >= 2.5) {
      this.performanceAcc = 0;
      const fps = this.engine.getFps();
      let target = this.adaptiveScale;
      if (fps < 38) target = Math.min(1.42, target + 0.12);
      else if (fps < 48) target = Math.min(1.28, target + 0.07);
      else if (fps > 57) target = Math.max(1, target - 0.05);
      if (Math.abs(target - this.adaptiveScale) >= 0.04) {
        this.adaptiveScale = target;
        this.engine.setHardwareScalingLevel(target);
      }
    }

    // parpadeo de fluorescentes
    this.flicker = 1 - (Math.random() < 0.012 + this.threat * 0.05 ? 0.5 : 0) - Math.sin(t * 11.7) * 0.02;
    if (this.panelMat) this.panelMat.emissiveIntensity = 1.7 * this.flicker;
    this.hemi.intensity = 1.18 * (0.94 + 0.06 * this.flicker);

    switch (this.mode) {
      case "menu":
        this.updateMenuCam(dt);
        if (this.bean) animateBean(this.bean, t, dt, 0.35, false, true);
        if (this.mar) animateMarauder(this.mar, t, Vector3.Zero(), this.scene);
        this.audio.update(0, false);
        break;
      case "play":
        this.updatePlay(dt);
        break;
      case "question":
        this.updateQuestion(dt);
        if (this.bean) animateBean(this.bean, t, dt, 0, false, true);
        if (this.mar) animateMarauder(this.mar, t, Vector3.Zero(), this.scene);
        this.updateSpot();
        this.audio.update(0.06, false);
        break;
      case "feedback":
        if (this.bean) animateBean(this.bean, t, dt, 0, false, true);
        if (this.mar) animateMarauder(this.mar, t, Vector3.Zero(), this.scene, false);
        this.updateSpot();
        this.audio.update(0.04, false);
        break;
      case "paused":
        this.audio.update(0, false);
        break;
      case "dead":
        this.updateDead(dt);
        break;
      case "win":
        if (this.exitDisc) this.exitDisc.rotation.z += dt * 2.4;
        this.audio.update(0, false);
        break;
    }

    // anillo de salas girando
    for (const ro of this.rooms) {
      ro.ring.rotation.z += dt * (ro.state === "locked" ? 3 : 0.8);
      if (ro.state === "locked" && t >= ro.lockUntil) {
        ro.state = "open";
        this.updateRoomVisual(ro);
        this.toast("Una puerta se ha desbloqueado", "info");
      }
    }
    if (this.exitDisc && this.mode !== "win") this.exitDisc.rotation.z += dt * (this.exitActive ? 2.2 : 0.4);
    if (this.exitBeam) {
      const s = this.exitActive ? 1 + Math.sin(t * 4) * 0.08 : 1;
      this.exitBeam.scaling.x = s;
      this.exitBeam.scaling.z = s;
    }

    this.flashA = Math.max(0, this.flashA - dt * 1.4);
    this.toasts = this.toasts.filter((x) => x.until > t);

    this.emitAcc += dt;
    if (this.emitAcc > 0.05) {
      this.emitAcc = 0;
      this.emit(false);
    }
  }

  private updateMenuCam(dt: number): void {
    const maze = this.maze;
    if (!maze) return;
    const pos = this.camera.globalPosition;
    if (Vector3.Distance(pos, this.menuNext) < 0.6) {
      // elige siguiente celda abierta aleatoria cercana
      const cur = this.worldCell(this.menuNext.x, this.menuNext.z);
      const nb: CellPos[] = [];
      for (const d of [
        { c: 1, r: 0 },
        { c: -1, r: 0 },
        { c: 0, r: 1 },
        { c: 0, r: -1 },
      ]) {
        const n = { c: cur.c + d.c, r: cur.r + d.r };
        if (n.c > 0 && n.r > 0 && n.c < maze.gw - 1 && n.r < maze.gh - 1 && !maze.solid[n.r][n.c]) nb.push(n);
      }
      const pick = nb.length ? nb[Math.floor(Math.random() * nb.length)] : cur;
      this.menuNext = this.cellCenter(pick.c, pick.r, 1.7);
    }
    const dir = this.menuNext.subtract(pos);
    dir.y = 0;
    const step = Math.min(dir.length(), 1.5 * dt);
    if (dir.length() > 0.001) {
      dir.normalize();
      pos.addInPlace(dir.scale(step));
      pos.y = 1.7 + Math.sin(this.t * 0.8) * 0.06;
      this.camera.setTarget(pos.add(dir.scale(4)));
      this.camera.fov = lerp(this.camera.fov, 1.05, dt * 2);
    }
  }

  private updatePlay(dt: number): void {
    const t = this.t;
    this.runTime += dt;
    this.scoreAcc += dt;
    if (this.scoreAcc >= 1) {
      this.score += 2;
      this.scoreAcc -= 1;
    }

    // ---- movimiento
    let ix = 0;
    let iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const speedBoost = t < this.sprintUntil;
    const wantSprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && moving;
    const canSprint = wantSprint && !this.exhausted && this.stamina > 0.02;

    if (wantSprint && !this.exhausted) {
      this.stamina -= dt / 5.5;
      this.stamDelay = 0.8;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      this.stamDelay -= dt;
      if (this.stamDelay <= 0) this.stamina = Math.min(1, this.stamina + dt / 3.5);
      if (this.exhausted && this.stamina > 0.24) this.exhausted = false;
    }
    if (speedBoost) this.stamina = 1;

    const base = 3.4;
    const sprintMult = canSprint || speedBoost ? (speedBoost ? 1.62 : 1.58) : 1;
    const speed = base * sprintMult;

    const fwd = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const wish = Vector3.Zero();
    if (moving) {
      wish.copyFrom(fwd.scale(iz).add(right.scale(ix)));
      wish.normalize();
    }
    const accel = this.grounded ? 22 : 8;
    this.pVel.x = lerp(this.pVel.x, wish.x * speed, Math.min(1, accel * dt));
    this.pVel.z = lerp(this.pVel.z, wish.z * speed, Math.min(1, accel * dt));

    // gravedad / salto
    if (this.grounded && this.keys.has("Space")) {
      this.pVel.y = 4.6;
      this.grounded = false;
    }
    if (!this.grounded) this.pVel.y -= 12.5 * dt;

    this.pPos.addInPlace(this.pVel.scale(dt));
    this.resolveCircle(this.pPos, 0.42);
    if (this.pPos.y <= 0) {
      if (!this.grounded && this.bean) this.bean.squash = Math.min(1, 0.4 + Math.abs(this.pVel.y) * 0.08);
      this.pPos.y = 0;
      this.pVel.y = 0;
      this.grounded = true;
    }
    // límites del mundo
    const maze = this.maze!;
    this.pPos.x = clamp(this.pPos.x, -this.halfW + 0.5, this.halfW + maze.gw * CS - 1 - 0.5);
    this.pPos.z = clamp(this.pPos.z, -this.halfH + 0.5, this.halfH + maze.gh * CS - 1 - 0.5);

    if (moving) {
      const targetFace = Math.atan2(this.pVel.x, this.pVel.z);
      let dAng = targetFace - this.pFacing;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      this.pFacing += dAng * Math.min(1, dt * 11);
    }
    this.applyPos();

    const speed01 = clamp(this.pVel.length() / (base * 1.58), 0, 1);
    let stepped = false;
    if (this.bean) stepped = animateBean(this.bean, t, dt, speed01, canSprint || speedBoost, this.grounded);
    if (stepped) this.audio.step();

    this.playerCell = this.worldCell(this.pPos.x, this.pPos.z);
    const lastTrail = this.playerTrail[this.playerTrail.length - 1];
    if (!lastTrail || lastTrail.c !== this.playerCell.c || lastTrail.r !== this.playerCell.r) {
      this.playerTrail.push({ ...this.playerCell });
      if (this.playerTrail.length > 96) this.playerTrail.shift();
    }

    // Las luces cian se mantienen intactas visualmente, pero sólo calculan
    // iluminación cuando pueden contribuir al cuadro actual.
    for (const room of this.rooms) {
      room.light.setEnabled(Vector3.DistanceSquared(room.light.position, this.pPos) < 24 * 24);
    }
    this.exitLight?.setEnabled(this.exitActive && Vector3.DistanceSquared(this.exitLight.position, this.pPos) < 28 * 28);

    // ---- entrar en sala
    for (const ro of this.rooms) {
      if (ro.state !== "open") continue;
      if (ro.cell.c === this.playerCell.c && ro.cell.r === this.playerCell.r) {
        const center = this.cellCenter(ro.cell.c, ro.cell.r);
        if (Vector3.Distance(new Vector3(center.x, this.pPos.y, center.z), this.pPos) < 1.7) {
          this.openQuestion(ro);
          return;
        }
      }
    }

    // ---- victoria
    if (this.exitActive && this.exitCell) {
      if (this.playerCell.c === this.exitCell.c && this.playerCell.r === this.exitCell.r) {
        this.onWin();
        return;
      }
    }

    this.updateMarauder(dt);
    this.updateSpot();
    this.updateCamera(dt, speed01);

    // heartbeat + audio
    this.audio.update(this.playerInSafeCell() ? 0.05 : this.threat, true);

    this.camera.fov = lerp(this.camera.fov, this.fov + (canSprint || speedBoost ? 0.09 : 0), dt * 5);
  }

  private updateSpot(): void {
    const fwd = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this.spot.position = this.pPos.add(new Vector3(0, WALL_H - 0.35, 0)).subtract(fwd.scale(0.8));
    this.spot.setDirectionToTarget(this.pPos.add(fwd.scale(2.4)).add(new Vector3(0, 0.6, 0)));
  }

  private updateCamera(dt: number, speed01: number): void {
    const head = this.pPos.add(new Vector3(0, 1.42, 0));
    const fwd = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const cp = Math.cos(this.camPitch);
    const sp = Math.sin(this.camPitch);
    const want = head
      .subtract(fwd.scale(this.camDist * cp))
      .add(new Vector3(0, this.camDist * sp, 0))
      .add(right.scale(0.32));

    // anti-clipping: DDA sobre la grilla
    const dir = want.subtract(head);
    const len = dir.length();
    dir.normalize();
    const dist = this.cameraRay(head, dir, len);

    const shake = this.threat > 0.5 ? (this.threat - 0.5) * 0.11 : 0;
    const bobA = Math.sin(this.t * 9) * 0.014 * speed01;
    const finalPos = head.add(dir.scale(Math.max(0.6, dist - 0.22)));
    finalPos.x += (Math.random() - 0.5) * shake;
    finalPos.y += (Math.random() - 0.5) * shake + bobA;
    finalPos.z += (Math.random() - 0.5) * shake;
    this.camera.position.copyFrom(finalPos);
    this.camera.setTarget(head.add(fwd.scale(3)).add(new Vector3(0, -Math.sin(this.camPitch) * 1.2, 0)));
    void dt;
  }

  private cameraRay(from: Vector3, dir: Vector3, maxLen: number): number {
    // Implementación manual DDA sobre la grilla (fiable para muros)
    let dist = 0;
    const step = 0.22;
    const p = from.clone();
    while (dist < maxLen) {
      p.addInPlace(dir.scale(step));
      dist += step;
      if (p.y > WALL_H - 0.12) return dist;
      const cell = this.worldCell(p.x, p.z);
      if (this.solidAt(cell.c, cell.r)) return dist;
    }
    return maxLen;
  }

  // --------------------------- Merodeador ---------------------------

  private nearestOpenCell(origin: CellPos): CellPos | null {
    const maze = this.maze;
    if (!maze) return null;
    if (!this.solidAt(origin.c, origin.r)) return { ...origin };
    const maxRadius = Math.max(maze.gw, maze.gh);
    for (let radius = 1; radius <= maxRadius; radius++) {
      let best: CellPos | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let r = Math.max(0, origin.r - radius); r <= Math.min(maze.gh - 1, origin.r + radius); r++) {
        for (let c = Math.max(0, origin.c - radius); c <= Math.min(maze.gw - 1, origin.c + radius); c++) {
          if (Math.max(Math.abs(c - origin.c), Math.abs(r - origin.r)) !== radius || this.solidAt(c, r)) continue;
          const distance = Math.abs(c - origin.c) + Math.abs(r - origin.r);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { c, r };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private marauderSegmentIsOpen(from: Vector3, to: Vector3): boolean {
    const distance = Vector3.Distance(from, to);
    const samples = Math.max(1, Math.ceil(distance / 0.2));
    for (let index = 1; index <= samples; index++) {
      const point = Vector3.Lerp(from, to, index / samples);
      const cell = this.worldCell(point.x, point.z);
      if (this.solidAt(cell.c, cell.r)) return false;
    }
    return true;
  }

  private openNeighborCount(cell: CellPos): number {
    return [
      { c: cell.c + 1, r: cell.r },
      { c: cell.c - 1, r: cell.r },
      { c: cell.c, r: cell.r + 1 },
      { c: cell.c, r: cell.r - 1 },
    ].filter((candidate) => !this.solidAt(candidate.c, candidate.r)).length;
  }

  private retreatMarauderAlongMaze(): void {
    const maze = this.maze;
    if (!maze) return;
    const passable = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < maze.gw && r < maze.gh && !this.solidAt(c, r);
    const distances = bfsDistances(maze.solid, this.playerCell, passable);
    let farthest = this.mCell;
    let farthestDistance = distances[this.mCell.r]?.[this.mCell.c] ?? -1;
    for (let r = 0; r < maze.gh; r++) {
      for (let c = 0; c < maze.gw; c++) {
        if (passable(c, r) && distances[r][c] > farthestDistance) {
          farthest = { c, r };
          farthestDistance = distances[r][c];
        }
      }
    }
    const retreatPath = bfsPath(maze.solid, this.mCell, farthest, passable);
    const target = retreatPath[Math.min(2, retreatPath.length - 1)] || this.mLastValidCell;
    if (!passable(target.c, target.r)) return;
    this.mPos.copyFrom(this.cellCenter(target.c, target.r));
    this.mCell = { ...target };
    this.mLastValidCell = { ...target };
    this.mPath = [];
    this.mVel.setAll(0);
    this.mRetarget = 0;
  }

  private updateMarauder(dt: number): void {
    const maze = this.maze;
    if (!maze || !this.mar) return;
    const t = this.t;
    const observedCell = this.worldCell(this.mPos.x, this.mPos.z);

    const passable = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < maze.gw && r < maze.gh && !this.solidAt(c, r);

    // Nunca aceptar una posición sólida. Si un frame, reinicio o empujón deja
    // al enemigo fuera de la navegación, vuelve a la última celda válida.
    if (!passable(observedCell.c, observedCell.r)) {
      const recovery = passable(this.mLastValidCell.c, this.mLastValidCell.r)
        ? this.mLastValidCell
        : this.nearestOpenCell(observedCell);
      if (!recovery) return;
      this.mCell = { ...recovery };
      this.mLastValidCell = { ...recovery };
      this.mPos.copyFrom(this.cellCenter(recovery.c, recovery.r));
      this.mVel.setAll(0);
      this.mPath = [];
      this.mRetarget = 0;
    } else {
      this.mCell = observedCell;
      this.mLastValidCell = { ...observedCell };
    }

    this.mRetarget -= dt;
    if (this.mRetarget <= 0) {
      this.mRetarget = 0.45;
      // La ruta reciente del jugador sirve como rastro válido. Dentro de una
      // sala segura se persigue el último punto exterior, nunca se atraviesa
      // una pared para llegar directamente hasta él.
      const trailTarget = [...this.playerTrail].reverse().find(
        (cell) => passable(cell.c, cell.r) && !this.isRoomCell(cell.c, cell.r)
      );
      const target = this.playerInSafeCell() ? trailTarget : this.playerCell;
      this.mPath = target && passable(target.c, target.r)
        ? bfsPath(maze.solid, this.mCell, target, passable)
        : [];
    }

    // velocidad
    let speed = this.cfg.marSpeed + this.cfg.ramp * this.fragments;
    if (t < this.aggroUntil) speed += 0.75;
    if (t < this.roarUntil) speed += 0.55;
    if (t < this.stunUntil) speed *= 0.08;

    // seguir camino
    if (this.mPath.length) {
      const next = this.mPath[0];
      const wp = this.cellCenter(next.c, next.r);
      const d = wp.subtract(this.mPos);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.3) {
        this.mPath.shift();
        this.mVel.setAll(0);
      } else {
        d.normalize();
        this.mVel.copyFrom(d.scale(speed));
      }
    } else {
      // Sin ruta sólo puede acercarse dentro de la misma celda abierta.
      // Queda prohibida la antigua persecución directa a través de paredes.
      if (this.mCell.c === this.playerCell.c && this.mCell.r === this.playerCell.r) {
        const d = this.pPos.subtract(this.mPos);
        d.y = 0;
        if (d.length() > 0.2) this.mVel.copyFrom(d.normalize().scale(speed * 0.7));
        else this.mVel.setAll(0);
      } else {
        this.mVel.setAll(0);
        this.mRetarget = 0;
      }
    }

    const previous = this.mPos.clone();
    const candidate = this.mPos.add(this.mVel.scale(dt));
    this.resolveCircle(candidate, 0.5);
    const candidateCell = this.worldCell(candidate.x, candidate.z);
    if (passable(candidateCell.c, candidateCell.r) && this.marauderSegmentIsOpen(previous, candidate)) {
      this.mPos.copyFrom(candidate);
      this.mCell = candidateCell;
      this.mLastValidCell = { ...candidateCell };
    } else {
      this.mPos.copyFrom(previous);
      this.mVel.setAll(0);
      this.mPath = [];
      this.mRetarget = 0;
    }
    this.mPos.y = 0;

    const vlen = this.mVel.length();
    if (vlen > 0.05) {
      const targetYaw = Math.atan2(this.mVel.x, this.mVel.z);
      let dAng = targetYaw - this.mYaw;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      this.mYaw += dAng * Math.min(1, dt * 6);
    }

    this.mar.root.position = this.mPos.clone();
    this.mar.root.rotation.y = this.mYaw;
    const drag = vlen > 0.05 ? this.mVel.normalizeToNew().scale(0.8) : Vector3.Zero();
    this.tentacleFrame++;
    animateMarauder(this.mar, t, drag, this.scene, this.tentacleFrame % 2 === 0);

    // ---- amenaza / proximidad
    const distP = Vector3.Distance(new Vector3(this.mPos.x, 0, this.mPos.z), new Vector3(this.pPos.x, 0, this.pPos.z));
    const sameCell = this.mCell.c === this.playerCell.c && this.mCell.r === this.playerCell.r;
    const navigationDistance = sameCell
      ? distP
      : this.mPath.length > 0
        ? Vector3.Distance(this.mPos, this.cellCenter(this.mPath[0].c, this.mPath[0].r)) + Math.max(0, this.mPath.length - 1) * CS
        : 30;
    const raw = clamp(1 - (navigationDistance - 1.6) / 17, 0, 1);
    this.threat = lerp(this.threat, raw, dt * 4);

    // rugido al acercarse
    if (this.threat > 0.55 && t - this.lastRoar > 11 && t > this.noDamageUntil) {
      this.lastRoar = t;
      this.roarUntil = t + 3;
      this.audio.sting();
      this.toast("Sientes que algo se acerca…", "bad");
    }

    // aberración cromática según amenaza
    this.pipeline.chromaticAberration.aberrationAmount = 2.5 + this.threat * 22;

    // ---- captura
    if (distP < 1.12 && !this.playerInSafeCell()) this.onCaught();
  }

  // --------------------------- pregunta ---------------------------

  private updateQuestion(dt: number): void {
    if (!this.question) return;
    this.runTime += dt;
    this.question.left -= dt;
    if (this.question.left <= 0) {
      this.question.left = 0;
      backroomsMusic.leaveQuestion();
      if (!this.activity.settings.showFeedback) {
        this.onWrong(this.question.room, true);
        return;
      }
      this.pendingAnswer = { room: this.question.room, correct: false, timeout: true };
      this.answerFeedback = {
        correct: false,
        timeout: true,
        explanation: this.question.q.feedback,
        correctAnswer: this.question.q.options[this.question.q.correct],
      };
      this.mode = "feedback";
      this.emit(true);
    }
  }

  // --------------------------- muerte ---------------------------

  private updateDead(dt: number): void {
    this.deathT += dt;
    const k = clamp(this.deathT / 1.25, 0, 1);
    const ease = 1 - Math.pow(1 - k, 3);
    this.camera.position.copyFrom(Vector3.Lerp(this.deathStart, this.deathCam, ease));
    const head = this.mPos.add(new Vector3(0, 1.62, 0));
    this.camera.setTarget(head);
    if (this.mar) marauderAttackPose(this.mar, ease);
    this.threat = 1;
    this.flashA = Math.max(this.flashA, k * 0.55);
    this.flashColor = "#ff1b2d";
    this.audio.update(1, true);
    if (this.deathT > 1.6 && !this.stats) {
      this.stats = {
        time: this.runTime,
        score: this.score,
        correct: this.correctN,
        wrong: this.wrongN,
        fragments: this.fragments,
        bestStreak: this.bestStreak,
      };
      this.emit(true);
    }
  }

  // --------------------------- snapshot ---------------------------

  private projectToScreen(pos: Vector3): { x: number; y: number; behind: boolean } {
    const w = this.engine.getRenderWidth(true);
    const h = this.engine.getRenderHeight(true);
    const vp = new Viewport(0, 0, w, h);
    const p = Vector3.Project(pos, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), vp);
    const toP = pos.subtract(this.camera.globalPosition);
    toP.normalize();
    const behind = Vector3.Dot(toP, this.camera.getForwardRay().direction) < 0;
    return { x: p.x / w, y: p.y / h, behind };
  }

  private buildSnapshot(): Snapshot {
    const markers: Marker[] = [];
    if (this.mode === "play" || this.mode === "question" || this.mode === "feedback") {
      for (let i = 0; i < this.rooms.length; i++) {
        const ro = this.rooms[i];
        if (ro.state === "done") continue;
        const wpos = this.cellCenter(ro.cell.c, ro.cell.r, 2.2);
        const p = this.projectToScreen(wpos);
        const dist = Math.round(Vector3.Distance(this.pPos, wpos));
        markers.push({
          id: "room" + i,
          x: p.x,
          y: p.y,
          behind: p.behind,
          label: ro.state === "locked" ? `${Math.max(0, Math.ceil(ro.lockUntil - this.t))}s` : `${dist}m`,
          color: ro.state === "locked" ? "#ff4444" : "#37e0ff",
          dist,
          icon: "door",
        });
      }
      if (this.exitActive && this.exitCell) {
        const wpos = this.cellCenter(this.exitCell.c, this.exitCell.r, 2.2);
        const p = this.projectToScreen(wpos);
        markers.push({
          id: "exit",
          x: p.x,
          y: p.y,
          behind: p.behind,
          label: `${Math.round(Vector3.Distance(this.pPos, wpos))}m`,
          color: "#b26bff",
          dist: 0,
          icon: "exit",
        });
      }
    }

    const boostNames: Record<BoostId, string> = {
      sprint: "Impulso",
      shield: "Escudo",
      pulse: "Pulso",
      map: "Mapa",
    };
    const boosts: BoostSlot[] = (["sprint", "shield", "pulse", "map"] as BoostId[]).map((id) => ({
      id,
      name: boostNames[id],
      count: this.boostCounts[id],
      active:
        (id === "sprint" && this.t < this.sprintUntil) ||
        (id === "shield" && this.t < this.shieldUntil) ||
        (id === "map" && this.t < this.mapUntil),
    }));

    return {
      mode: this.mode,
      threat: this.threat,
      stamina: this.stamina,
      speedActive: this.t < this.sprintUntil,
      shieldActive: this.t < this.shieldUntil,
      fragments: this.fragments,
      fragmentsNeeded: this.fragmentsNeeded,
      score: this.score,
      time: this.runTime,
      streak: this.streak,
      boosts,
      question: this.question
        ? {
            cat: this.question.q.cat,
            text: this.question.q.text,
            options: this.question.q.options,
            timeLeft: this.question.left,
            total: this.question.total,
            roomLabel: "Sala segura",
            type: this.question.q.type,
          }
        : null,
      answerFeedback: this.answerFeedback,
      toasts: [...this.toasts],
      markers,
      objective: this.objective,
      mapVisible: this.t < this.mapUntil,
      flash: this.flashA > 0.01 ? { color: this.flashColor, a: this.flashA } : null,
      stats: this.stats,
      difficulty: this.difficulty,
    };
  }

  private emit(force: boolean): void {
    if (force || this.mode !== "menu") this.onSnap(this.buildSnapshot());
    else this.onSnap(this.buildSnapshot());
  }
}
