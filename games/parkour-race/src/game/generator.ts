/* ============================================================
   PROCEDURAL COURSE GENERATOR (constraint-based)
   Grafo dirigido: START → módulos → ESTACIÓN → ... → FINISH.
   Determinístico por seed. Valida solapes y envolvente de salto.
   ============================================================ */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Activity, Difficulty, Question } from "../lib/core";
import { hashSeed, mulberry32, stationCountFor } from "../lib/core";
import {
  Animated,
  FinishState,
  GenCtx,
  GenParams,
  Hazard,
  StationState,
  beginTry,
  boxesOverlap,
  buildCloud,
  buildFinish,
  buildFloatingIsland,
  buildStart,
  buildStation,
  createMaterials,
  rollback,
} from "./builder";
import { MODULE_LIBRARY, ModuleDef, ModuleOut, fallbackModule } from "./modules";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

export interface GeneratedCourse {
  spawn: Vector3;
  spawnYaw: number;
  stations: StationState[];
  finish: FinishState;
  killY: number;
  orderedQuestions: Question[];
  moduleLog: string[];
  totalDifficulty: number;
  attempts: number;
  meshCount: number;
  route: Vector3[];
  anims: Animated[];
  hazards: Hazard[];
}

/** Envolvente de movimiento seguro por dificultad */
function paramsFor(difficulty: Difficulty): GenParams {
  // Capacidad teórica del jugador (ver player.ts):
  // speed 7.2, jumpSpeed 9.2, gravity 26 → salto ≈ 4.9u / subida ≈ 1.63u
  switch (difficulty) {
    case "easy":
      return { maxH: 3.1, maxV: 1.0, platW: 3.5, barPeriod: 4.4 };
    case "normal":
      return { maxH: 3.6, maxV: 1.22, platW: 2.8, barPeriod: 3.4 };
    case "hard":
      return { maxH: 4.15, maxV: 1.42, platW: 2.15, barPeriod: 2.5 };
  }
}

function levelAllowed(difficulty: Difficulty, def: ModuleDef): boolean {
  if (difficulty === "easy") return def.level === 0;
  if (difficulty === "normal") return def.level <= 1;
  return true;
}

function yawDeltaList(difficulty: Difficulty): number[] {
  const deg = [-30, -15, 0, 15, 30];
  if (difficulty !== "easy") deg.push(-45, 45);
  return deg.map((d) => (d * Math.PI) / 180);
}

/** distancia mínima en XZ de un punto a la polilínea de ruta */
function distToRoute(route: Vector3[], p: Vector3): number {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    let t = 0;
    if (len2 > 0.0001) {
      t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

function checkNewAABBs(ctx: GenCtx, fromIndex: number, overlapAllowedWithLast: number): boolean {
  const limit = ctx.aabbs.length;
  for (let i = fromIndex; i < limit; i++) {
    const box = ctx.aabbs[i];
    // comparar contra todas las cajas previas excepto las de la conexión previa
    const prevLimit = Math.max(0, fromIndex - overlapAllowedWithLast);
    for (let j = 0; j < prevLimit; j++) {
      if (boxesOverlap(box, ctx.aabbs[j])) return false;
    }
  }
  return true;
}

export function generateCourse(
  scene: Scene,
  shadow: ShadowGenerator | null,
  activity: Activity,
  seed: number
): GeneratedCourse {
  const t0 = performance.now();
  const rng = mulberry32(hashSeed(`${activity.id}::${seed}`));

  /* -------- paso 1-3: estaciones + shuffle de preguntas -------- */
  const desired = stationCountFor(activity.settings, rng);
  const stationCount = Math.max(1, Math.min(desired, activity.questions.length));
  const orderedQuestions = [...activity.questions];
  for (let i = orderedQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [orderedQuestions[i], orderedQuestions[j]] = [orderedQuestions[j], orderedQuestions[i]];
  }
  const pickedQuestions = orderedQuestions.slice(0, stationCount);

  /* -------- setup de contexto -------- */
  const params = paramsFor(activity.settings.difficulty);
  const mats = createMaterials(scene);
  const ctx: GenCtx = {
    scene,
    rng,
    params,
    mats,
    shadow,
    colliders: [],
    aabbs: [],
    route: [],
    animated: [],
    hazards: [],
    tryMeshes: [],
  };

  const yawDeltas = yawDeltaList(activity.settings.difficulty);
  const density = activity.settings.parkour;
  const candidates = MODULE_LIBRARY.filter(
    (m) => levelAllowed(activity.settings.difficulty, m) && (m.canUse ? true : true)
  );

  let attempts = 0;
  let totalDifficulty = 0;
  const moduleLog: string[] = [];

  /* -------- paso 4: START -------- */
  const startY = 6;
  const startYaw = rng() * Math.PI * 2;
  const startCenter = new Vector3(0, startY, 0);
  buildStart(ctx, startCenter, startYaw);

  let cursor = startCenter.add(
    new Vector3(Math.sin(startYaw), 0, Math.cos(startYaw)).scale(10.5 / 2 - 0.2)
  );
  let yaw = startYaw;

  const spawn = startCenter.add(
    new Vector3(Math.sin(startYaw), 0, Math.cos(startYaw)).scale(-3)
  );
  spawn.y = startY + 0.1;

  /* -------- helper: construir un módulo con reintentos -------- */
  function buildOneModule(cursorIn: Vector3, yawIn: number): { out: ModuleOut; yawOut: number } {
    const y = cursorIn.y;
    const pool = candidates.filter((m) => !m.canUse || m.canUse(y));
    const maxAttempts = 9;
    let lastMark = beginTry(ctx);
    void lastMark;
    for (let a = 0; a < maxAttempts; a++) {
      attempts++;
      const mark = beginTry(ctx);
      const def = pool[Math.floor(rng() * pool.length)];
      const dy = yawDeltas[Math.floor(rng() * yawDeltas.length)];
      const newYaw = yawIn + dy;
      const out = def.build(ctx, cursorIn, newYaw);
      const yOk = out.exit.y >= 3.5 && out.exit.y <= 27;
      // solape permitido con las últimas cajas (conexión intencional)
      const ok = yOk && checkNewAABBs(ctx, mark.aabbs, 7);
      if (ok) {
        totalDifficulty += def.difficulty;
        moduleLog.push(`${def.type} (d=${def.difficulty})`);
        return { out, yawOut: newYaw };
      }
      rollback(ctx, mark);
    }
    // fallback seguro (sin giro)
    const mark = beginTry(ctx);
    const out = fallbackModule(ctx, cursorIn, yawIn);
    totalDifficulty += 0.5;
    moduleLog.push("FALLBACK (d=0.5)");
    void mark;
    return { out, yawOut: yawIn };
  }

  /* -------- paso 5: tramos de parkour + estaciones -------- */
  const stations: StationState[] = [];
  const F = (y2: number) => new Vector3(Math.sin(y2), 0, Math.cos(y2));

  for (let s = 0; s < stationCount; s++) {
    // densidad de parkour antes de la estación
    const mods = density === "low" ? 1 : density === "medium" ? (rng() < 0.55 ? 2 : 1) : 2;
    for (let m = 0; m < mods; m++) {
      const r = buildOneModule(cursor, yaw);
      yaw = r.yawOut;
      cursor = r.out.exit;
      cursor.y = Math.max(4, Math.min(26, cursor.y));
    }

    // estación: probar pequeñas variaciones de giro para evitar solapes graves
    let placed = false;
    for (let a = 0; a < 4 && !placed; a++) {
      attempts++;
      const mark = beginTry(ctx);
      const dy = a === 0 ? 0 : yawDeltas[Math.floor(rng() * yawDeltas.length)] * 0.6;
      const syaw = yaw + dy;
      const center = cursor.add(F(syaw).scale(9.6 / 2 - 0.5));
      const state = buildStation(ctx, center, syaw, s, stationCount);
      const ok = checkNewAABBs(ctx, mark.aabbs, 7);
      if (ok || a === 3) {
        stations.push(state);
        yaw = syaw;
        cursor = center.add(F(syaw).scale(9.6 / 2));
        placed = true;
      } else {
        rollback(ctx, mark);
      }
    }
  }

  /* -------- paso 6: tramo final -------- */
  {
    const mods = density === "high" ? 2 : 1;
    for (let m = 0; m < mods; m++) {
      const r = buildOneModule(cursor, yaw);
      yaw = r.yawOut;
      cursor = r.out.exit;
      cursor.y = Math.max(4, Math.min(26, cursor.y));
    }
  }
  const finishCenter = cursor.add(F(yaw).scale(11 / 2 - 0.4));
  const finish = buildFinish(ctx, finishCenter, yaw);

  /* -------- paso 7: decoración con corredor seguro -------- */
  const bboxMin = new Vector3(Infinity, Infinity, Infinity);
  const bboxMax = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const b of ctx.aabbs) {
    bboxMin.minimizeInPlace(b.min);
    bboxMax.maximizeInPlace(b.max);
  }
  const sizePref = activity.settings.mapSize;
  const islandCount = sizePref === "small" ? 10 : sizePref === "large" ? 26 : 17;

  // islas bajo puntos clave
  buildFloatingIsland(ctx, startCenter.x, startY - 6.5, startCenter.z, 6, true);
  buildFloatingIsland(ctx, finishCenter.x, finishCenter.y - 7.5, finishCenter.z, 5.5, true);
  for (const st of stations) {
    buildFloatingIsland(ctx, st.center.x + (rng() - 0.5) * 3, st.center.y - 7 - rng() * 3, st.center.z + (rng() - 0.5) * 3, 4 + rng() * 1.5, rng() < 0.7);
  }

  // islas libres (respetando corredor)
  let placedIslands = 0;
  let guard = 0;
  while (placedIslands < islandCount && guard < islandCount * 12) {
    guard++;
    const x = rr2(rng, bboxMin.x - 20, bboxMax.x + 20);
    const z = rr2(rng, bboxMin.z - 20, bboxMax.z + 20);
    const y = rr2(rng, bboxMin.y - 14, bboxMax.y + 10);
    const p = new Vector3(x, y, z);
    if (distToRoute(ctx.route, p) < 9) continue;
    buildFloatingIsland(ctx, x, y, z, 2.4 + rng() * 2.8, rng() < 0.8);
    placedIslands++;
  }

  // nubes
  const clouds = sizePref === "small" ? 10 : 16;
  for (let i = 0; i < clouds; i++) {
    const x = rr2(rng, bboxMin.x - 50, bboxMax.x + 50);
    const z = rr2(rng, bboxMin.z - 50, bboxMax.z + 50);
    const y = bboxMax.y + 12 + rng() * 22;
    buildCloud(ctx, x, y, z, 1.6 + rng() * 2.4);
  }

  /* -------- paso 8: validación global + kill plane -------- */
  const killY = bboxMin.y - 14;

  // La siguiente estación pendiente brilla; el resto, tenue
  stations.forEach((st, i) => {
    if (i > 0) st.beamMat.alpha = 0.05;
  });

  const validation = {
    start: true,
    finish: !!finish,
    stations: stations.length,
    questions: pickedQuestions.length,
    stationsMatchQuestions: stations.length === pickedQuestions.length,
    totalAabbs: ctx.aabbs.length,
    colliders: ctx.colliders.length,
  };

  console.groupCollapsed(
    `%c[IslaSaber] Mapa generado · seed=${seed} · estaciones=${stations.length} · dificultadTotal=${totalDifficulty.toFixed(1)}`,
    "color:#4DD6C1;font-weight:bold"
  );
  console.log("seed:", seed, "· hash:", hashSeed(`${activity.id}::${seed}`));
  console.log("módulos:", moduleLog);
  console.log("intentos de generación:", attempts);
  console.log("validación:", validation);
  console.log("meshes:", ctx.tryMeshes.length, "· tiempo:", (performance.now() - t0).toFixed(1) + "ms");
  console.groupEnd();

  return {
    spawn,
    spawnYaw: startYaw,
    stations,
    finish,
    killY,
    orderedQuestions: pickedQuestions,
    moduleLog,
    totalDifficulty,
    attempts,
    meshCount: ctx.tryMeshes.length,
    route: ctx.route,
    anims: ctx.animated,
    hazards: ctx.hazards,
  };
}

function rr2(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}
