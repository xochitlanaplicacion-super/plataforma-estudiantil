/* ============================================================
   ADVENTURE GAME — orquesta escena, jugador, cámara, input,
   estaciones, checkpoints, HUD y fin de partida.
   ============================================================ */

import "@babylonjs/core/Collisions/collisionCoordinator"; // side-effect: habilita colisiones + pickWithRay
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Activity, Results } from "../lib/core";
import { seedCode, fmtTime } from "../lib/core";
import { useStore } from "../store";
import { buildSkyAndLights, burstConfetti, SkyRig } from "./builder";
import { generateCourse, GeneratedCourse } from "./generator";
import { Player, PlayerInput } from "./player";
import { sfx } from "./sfx";
import { gameMusic } from "./music";
import { hasTouchControls, installTouchControls } from '../../../shared/touch-controls';

const BODY_PALETTES: [string, string][] = [
  ["#FF6B8A", "#D84F74"],
  ["#FFB84D", "#E08E2B"],
  ["#4DD6C1", "#2BA898"],
  ["#8A7CFF", "#6556D6"],
  ["#FF8A5C", "#DE6234"],
];

export interface AdventureCallbacks {
  onFatal?: (msg: string) => void;
}

export class AdventureGame {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: UniversalCamera;
  private player: Player;
  private course: GeneratedCourse;
  private sky: SkyRig;
  private activity: Activity;
  private seed: number;
  private callbacks: AdventureCallbacks;

  private keys = new Set<string>();
  private removeTouch: () => void = () => {};
  private mobileFrameCount = 0;
  private mobileScale = 1;
  private camYaw = 0;
  private camPitch = 0.42;
  private locked = false;
  private t = 0;
  private time = 0;
  private hudTimer = 0;
  private finished = false;
  private disposed = false;

  private checkpoint: { pos: Vector3; yaw: number };
  private stats = { falls: 0, wrong: 0, score: 0, answered: 0, firstTryCorrect: 0 };
  private firstTry = true;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onLockChange: () => void;
  private onCanvasClick: () => void;
  private beforeUnload: (e: BeforeUnloadEvent) => void;

  constructor(canvas: HTMLCanvasElement, activity: Activity, seed: number, callbacks: AdventureCallbacks = {}) {
    this.canvas = canvas;
    this.activity = activity;
    this.seed = seed;
    this.callbacks = callbacks;

    const quality: "low" | "high" =
      (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high";

    this.engine = new Engine(canvas, true, { powerPreference: "high-performance" }, true);
    if (hasTouchControls()) this.engine.setHardwareScalingLevel(1);
    this.scene = new Scene(this.engine);
    this.scene.collisionsEnabled = true;

    this.sky = buildSkyAndLights(this.scene, quality);
    const genT0 = performance.now();
    this.course = generateCourse(this.scene, this.sky.shadow, activity, seed);
    console.log(`[IslaSaber] curso listo en ${(performance.now() - genT0).toFixed(0)}ms`);

    // jugador con color determinístico por seed
    const pal = BODY_PALETTES[seed % BODY_PALETTES.length];
    this.player = new Player(this.scene, pal[0], pal[1]);
    if (this.sky.shadow) this.player.addShadowCasters(this.sky.shadow);
    this.player.setPose(this.course.spawn, this.course.spawnYaw);
    this.checkpoint = { pos: this.course.spawn.clone(), yaw: this.course.spawnYaw };
    this.camYaw = this.course.spawnYaw + Math.PI;

    this.camera = new UniversalCamera("cam", this.cameraTarget().add(this.camOffset()), this.scene);
    this.camera.fov = 0.92;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 950;
    this.camera.setTarget(this.cameraTarget());

    // HUD inicial
    const st = useStore.getState();
    st.resetRunUi(this.course.stations.length);
    st.setHud({ checkpoint: -1 });
    st.setRunQuestions(this.course.orderedQuestions);

    /* ---------- listeners ---------- */
    this.onKeyDown = (e) => {
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyR", "ShiftLeft", "ShiftRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === "Backquote") {
        useStore.getState().toggleDebug();
        return;
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyE") this.tryInteract();
      if (e.code === "KeyR") this.doRespawn(false);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      if (!this.locked) return;
      const cfg = useStore.getState().mouseCfg;
      const k = 0.0027 * cfg.sens;
      this.camYaw -= e.movementX * k * (cfg.invertX ? -1 : 1);
      this.camPitch = Math.max(
        -0.2,
        Math.min(1.15, this.camPitch + e.movementY * k * (cfg.invertY ? 1 : -1))
      );
    };
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      const s = useStore.getState();
      if (!this.locked && s.playing && !s.question && !s.results && !this.finished) {
        s.setPaused(true);
        gameMusic.pause();
      } else if (this.locked) {
        s.setPaused(false);
        if (s.playing && !s.results && !this.finished) {
          gameMusic.resume(this.seed, s.musicMuted);
        }
      }
    };
    this.onCanvasClick = () => {
      const s = useStore.getState();
      if (!this.locked && s.playing && !s.question && !s.results && !s.paused) {
        this.requestLock();
      }
    };
    this.beforeUnload = () => this.dispose();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    canvas.addEventListener("click", this.onCanvasClick);
    window.addEventListener("beforeunload", this.beforeUnload);
    window.addEventListener("resize", this.onResize);
    this.removeTouch = installTouchControls({
      id: 'parkour-race', canvas,
      playing: () => !this.isSuspended(), paused: () => useStore.getState().paused,
      pause: () => { if (!this.isSuspended()) { useStore.getState().setPaused(true); gameMusic.pause(); } },
      key: (code, down) => down ? this.onKeyDown(new KeyboardEvent('keydown', { code })) : this.onKeyUp(new KeyboardEvent('keyup', { code })),
      look: (x, y) => {
        const cfg = useStore.getState().mouseCfg;
        this.camYaw -= x * 0.0027 * cfg.sens * (cfg.invertX ? -1 : 1);
        this.camPitch = Math.max(-0.2, Math.min(1.15, this.camPitch + y * 0.0027 * cfg.sens * (cfg.invertY ? 1 : -1)));
      },
      actions: [{code:'Space',label:'Saltar'}, {code:'ShiftLeft',label:'SHIFT'}, {code:'KeyE',label:'Interactuar'}, {code:'KeyR',label:'Regresar'}],
    });

    // Asegurar tamaño correcto del canvas tras el primer layout
    requestAnimationFrame(() => {
      if (!this.disposed) this.engine.resize();
    });

    console.log(
      `%c[IslaSaber] motor iniciado · WebGL OK · esperando clic del jugador (spawn ${this.course.spawn.x.toFixed(1)}, ${this.course.spawn.y.toFixed(1)}, ${this.course.spawn.z.toFixed(1)})`,
      "color:#8A7CFF;font-weight:bold"
    );

    this.engine.runRenderLoop(() => {
      if (this.disposed || document.hidden) return;
      try {
        this.tick();
        if (hasTouchControls() && ++this.mobileFrameCount % 180 === 0) {
          const fps = this.engine.getFps();
          const next = fps < 32 ? Math.min(1.6, this.mobileScale + 0.1)
            : fps > 55 ? Math.max(1, this.mobileScale - 0.1) : this.mobileScale;
          if (next !== this.mobileScale) {
            this.mobileScale = next;
            this.engine.setHardwareScalingLevel(next);
          }
        }
        this.scene.render();
      } catch (err) {
        if (!this.tickErrorLogged) {
          this.tickErrorLogged = true;
          console.error("[IslaSaber] error en el bucle de render:", err);
          this.callbacks.onFatal?.(err instanceof Error ? err.message : String(err));
        }
      }
    });
  }

  private onResize = (): void => {
    if (!this.disposed) this.engine.resize();
  };

  private tickErrorLogged = false;

  /* ================== API pública para la UI ================== */

  requestLock(): void {
    if (hasTouchControls()) {
      useStore.getState().setPaused(false);
      gameMusic.resume(this.seed, useStore.getState().musicMuted);
      return;
    }
    try {
      this.canvas.requestPointerLock();
    } catch {
      /* noop */
    }
  }

  begin(): void {
    const store = useStore.getState();
    store.setPlaying(true);
    gameMusic.start(this.seed, store.musicMuted);
    this.requestLock();
  }

  get questionOpen(): boolean {
    return !!useStore.getState().question;
  }

  /** La UI envía la respuesta elegida. Devuelve "correct" | "wrong" */
  submitAnswer(choice: number): "correct" | "wrong" {
    const store = useStore.getState();
    const q = store.question;
    if (!q) return "wrong";
    const question = this.course.orderedQuestions[q.index];
    if (!question) return "wrong";
    const ok = choice === question.correctIndex;
    if (ok) {
      this.completeStation(q.index);
    } else {
      this.stats.wrong++;
      this.firstTry = false;
      sfx.wrong();
      store.setQuestionFeedback("wrong");
    }
    return ok ? "correct" : "wrong";
  }

  continueAfterFeedback(): void {
    const store = useStore.getState();
    store.closeQuestion();
    this.requestLock();
  }

  retryAfterFeedback(): void {
    useStore.getState().setQuestionFeedback("idle");
  }

  respawn(): void {
    this.doRespawn(true);
  }

  getDebugInfo(): string {
    const p = this.player.position;
    const fps = this.engine.getFps().toFixed(0);
    return `seed ${this.seed} · map #${seedCode(this.seed)} · fps ${fps}\npos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · meshes ${this.course.meshCount}\ndificultad total ${this.course.totalDifficulty.toFixed(1)} · estaciones ${this.course.stations.length}`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeTouch();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    window.removeEventListener("beforeunload", this.beforeUnload);
    window.removeEventListener("resize", this.onResize);
    try {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } catch {
      /* noop */
    }
    this.engine.stopRenderLoop();
    gameMusic.stop();
    this.scene.dispose();
    this.engine.dispose();
  }

  /* ================== lógica interna ================== */

  private cameraTarget(): Vector3 {
    return this.player.position.add(new Vector3(0, 2.05, 0));
  }

  private isSuspended(): boolean {
    const s = useStore.getState();
    return !s.playing || s.paused || !!s.question || !!s.results || this.finished;
  }

  private tryInteract(): void {
    const s = useStore.getState();
    if (this.isSuspended()) return;
    const idx = this.stats.answered;
    const station = this.course.stations[idx];
    if (!station) return;
    const d = Vector3.Distance(this.player.position, station.center);
    if (d < 4.2) {
      sfx.ui();
      if (document.pointerLockElement) document.exitPointerLock();
      this.firstTry = true;
      s.openQuestion(idx, this.course.stations.length);
      s.setPrompt(false);
    }
  }

  private completeStation(index: number): void {
    const station = this.course.stations[index];
    const store = useStore.getState();
    station.completed = true;
    station.open();
    // siguiente haz guía
    const next = this.course.stations[index + 1];
    if (next) next.beamMat.alpha = 0.22;

    this.stats.score += this.firstTry ? 100 : 60;
    if (this.firstTry) this.stats.firstTryCorrect++;
    this.stats.answered++;
    this.checkpoint = { pos: station.spawnPos.clone(), yaw: station.exitYaw };

    sfx.correct();
    setTimeout(() => sfx.checkpoint(), 180);
    burstConfetti(this.scene, station.totemCore.getAbsolutePosition(), "#4ADE80");

    store.setCompleted(index, this.course.stations.length);
    store.setHud({
      answered: this.stats.answered,
      score: this.stats.score,
      checkpoint: index,
    });
    store.setQuestionFeedback("correct");
    // cerrar y reanudar (estamos dentro del gesto de click)
    if (!this.activity.settings.showFeedback) {
      setTimeout(() => {
        store.closeQuestion();
        this.requestLock();
      }, 420);
    }
  }

  private doRespawn(manual: boolean): void {
    if (this.finished) return;
    const store = useStore.getState();
    if (!manual) {
      if (this.isSuspended() && store.playing === false) return;
    }
    if (manual && !store.playing) return;
    this.stats.falls++;
    sfx.respawn();
    store.flashRespawn();
    store.setHud({ falls: this.stats.falls });
    this.player.setPose(this.checkpoint.pos.add(new Vector3(0, 0.25, 0)), this.checkpoint.yaw);
    this.camYaw = this.checkpoint.yaw + Math.PI;
    this.camPitch = 0.42;
    // acercar cámara de golpe para evitar clipping visual
    this.camera.position.copyFrom(this.cameraTarget().add(this.camOffset()));
  }

  private camOffset(): Vector3 {
    const dist = 7.4;
    const hd = Math.cos(this.camPitch) * dist;
    return new Vector3(Math.sin(this.camYaw) * hd, Math.sin(this.camPitch) * dist, Math.cos(this.camYaw) * hd);
  }

  private win(): void {
    if (this.finished) return;
    this.finished = true;
    gameMusic.pause();
    sfx.fanfare();
    burstConfetti(this.scene, this.course.finish.portalPos, "#FFD166");
    burstConfetti(this.scene, this.course.finish.portalPos.add(new Vector3(2, 1, 0)), "#FF6B9D");
    burstConfetti(this.scene, this.course.finish.portalPos.add(new Vector3(-2, 1, 0)), "#6FF7FF");
    const total = this.course.orderedQuestions.length;
    const acc = total + this.stats.wrong > 0 ? Math.round((total / (total + this.stats.wrong)) * 100) : 100;
    const results: Results = {
      title: this.activity.title,
      score: this.stats.score + Math.max(0, 300 - Math.floor(this.time)) + 200,
      answered: this.stats.answered,
      total,
      wrong: this.stats.wrong,
      accuracy: acc,
      time: this.time,
      falls: this.stats.falls,
      seedCode: seedCode(this.seed),
    };
    console.log("[IslaSaber] actividad completada:", results, "tiempo:", fmtTime(this.time));
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* noop */
    }
    useStore.getState().setResults(results);
    if (window.parent !== window) {
      window.parent.postMessage({
        type: "parkour-race:complete",
        payload: {
          hits: this.stats.firstTryCorrect,
          total,
          wrongAttempts: this.stats.wrong,
          time: this.time,
          falls: this.stats.falls,
          score: results.score,
          seedCode: results.seedCode,
        },
      }, window.location.origin);
    }
  }

  private tick(): void {
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    const store = useStore.getState();
    const suspended = this.isSuspended();

    if (!suspended) {
      this.t += dt;
      this.time += dt;

      // animaciones del mundo
      const anims = this.course.anims;
      for (let i = 0; i < anims.length; i++) anims[i].update(dt, this.t);

      // input
      const input: PlayerInput = {
        mx: (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
        mz: (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0),
        jump: this.keys.has("Space"),
        sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      };
      this.player.update(
        dt,
        input,
        this.camYaw,
        () => sfx.jump(),
        () => {},
        () => sfx.climb()
      );

      // peligros (barras giratorias)
      for (const h of this.course.hazards) {
        const ang = this.t * h.speed + h.angle;
        const ax = Math.cos(ang);
        const az = -Math.sin(ang);
        const p = this.player.position;
        // distancia punto-segmento en XZ
        const relX = p.x - h.center.x;
        const relZ = p.z - h.center.z;
        let tt = relX * ax + relZ * az;
        tt = Math.max(-h.halfLen, Math.min(h.halfLen, tt));
        const cx = h.center.x + ax * tt;
        const cz = h.center.z + az * tt;
        const dd = Math.hypot(p.x - cx, p.z - cz);
        const bodyY = p.y + 0.7;
        if (dd < 0.62 + h.width && Math.abs(bodyY - h.y) < 1.15) {
          const tang = new Vector3(-az, 0, ax);
          const side = (relX * -az + relZ * ax) >= 0 ? 1 : -1;
          this.player.applyKnock(tang.scale(side).add(new Vector3(relX, 0, relZ).normalize().scale(0.4)).normalize());
          sfx.knock();
        }
      }

      // prompt de estación
      const idx = this.stats.answered;
      const station = this.course.stations[idx];
      if (station && !store.prompt) {
        const d = Vector3.Distance(this.player.position, station.center);
        if (d < 4.2) store.setPrompt(true);
      } else if (store.prompt) {
        const d = station ? Vector3.Distance(this.player.position, station.center) : Infinity;
        if (!station || d >= 4.2) store.setPrompt(false);
      }

      // meta
      const fd = Vector3.Distance(this.player.position, this.course.finish.portalPos);
      if (fd < 2.7) this.win();

      // caída al vacío
      if (this.player.position.y < this.course.killY) {
        this.doRespawn(false);
      }

      // cámara
      const desired = this.cameraTarget().add(this.camOffset());
      const lerpK = 1 - Math.exp(-dt * 9);
      this.camera.position = Vector3.Lerp(this.camera.position, desired, lerpK);
      this.camera.setTarget(this.cameraTarget());

      // sol sigue al jugador para sombras coherentes
      const pp = this.player.position;
      this.sky.sun.position.set(pp.x - 45, pp.y + 70, pp.z - 35);
      this.sky.sun.setDirectionToTarget(pp);

      // HUD (throttle)
      this.hudTimer += dt;
      if (this.hudTimer > 0.25) {
        this.hudTimer = 0;
        store.setHud({ time: this.time });
      }
    } else {
      // mundo en pausa: pequeña animación ambiental congelada; cámara suave orbitando en resultados
      if (store.results) {
        this.camYaw += dt * 0.15;
        const desired = this.course.finish.portalPos.add(new Vector3(0, 2, 0)).add(this.camOffset());
        this.camera.position = Vector3.Lerp(this.camera.position, desired, 1 - Math.exp(-dt * 3));
        this.camera.setTarget(this.course.finish.portalPos);
      }
    }
  }

}
