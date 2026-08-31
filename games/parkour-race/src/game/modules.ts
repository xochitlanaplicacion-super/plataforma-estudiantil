/* ============================================================
   MODULE LIBRARY — 12 módulos de parkour.
   Cada módulo conoce su entrada/salida y respeta el
   "safe movement envelope" (maxH, maxV, platW) del jugador.
   ============================================================ */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import {
  GenCtx,
  aabbFromMesh,
  plat,
  platRound,
  solidBox,
  trackMesh,
} from "./builder";

export interface ModuleOut {
  exit: Vector3;
}

export interface ModuleDef {
  type: string;
  difficulty: number;
  /** 0 = easy+, 1 = normal+, 2 = hard */
  level: 0 | 1 | 2;
  canUse?: (y: number) => boolean;
  build: (ctx: GenCtx, entry: Vector3, yaw: number) => ModuleOut;
}

function fwd(yaw: number): Vector3 {
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}
function right(yaw: number): Vector3 {
  return new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}
function rr(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}
function wy(v: Vector3, y: number): Vector3 {
  return new Vector3(v.x, y, v.z);
}

/* ---------------- 1. STRAIGHT ---------------- */
const straight: ModuleDef = {
  type: "STRAIGHT",
  difficulty: 0.5,
  level: 0,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const len = rr(ctx.rng, 6, 9.5);
    const w = ctx.params.platW + 1.4;
    const c = entry.add(F.scale(len / 2 - 0.3));
    plat(ctx, c.x, entry.y, c.z, w, len, yaw, { colorIx: Math.floor(ctx.rng() * 6) });
    return { exit: wy(entry.add(F.scale(len - 0.3)), entry.y) };
  },
};

/* ---------------- 2. STAIRS ---------------- */
const stairs: ModuleDef = {
  type: "STAIRS",
  difficulty: 0.7,
  level: 0,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const goUp = entry.y < 6 ? true : entry.y > 22 ? false : ctx.rng() < 0.62;
    const steps = 4 + Math.floor(ctx.rng() * 3);
    const stepH = goUp ? rr(ctx.rng, 0.32, 0.44) : rr(ctx.rng, 0.4, 0.58);
    const stepD = rr(ctx.rng, 0.95, 1.15);
    const w = ctx.params.platW + 0.4;
    const colorIx = Math.floor(ctx.rng() * 6);
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * stepH;
      const c = entry.add(F.scale(i * stepD + stepD / 2 + 0.15));
      const top = entry.y + (goUp ? h : -h);
      solidBox(ctx, c.x, goUp ? entry.y + h / 2 : top - 0.8, c.z, w, goUp ? h : 1.6, stepD, yaw, ctx.mats.tops[colorIx], { shadow: i % 2 === 0 });
    }
    const yEnd = entry.y + (goUp ? steps * stepH : -steps * stepH);
    const c = entry.add(F.scale(steps * stepD + 1.2));
    plat(ctx, c.x, yEnd, c.z, w + 0.4, 2.4, yaw, { colorIx });
    return { exit: wy(entry.add(F.scale(steps * stepD + 2.4)), yEnd) };
  },
};

/* ---------------- 3. STEPPING STONES ---------------- */
const stepping: ModuleDef = {
  type: "STEPPING_STONES",
  difficulty: 1.0,
  level: 0,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const n = 3 + Math.floor(ctx.rng() * 3);
    const size = ctx.params.platW * rr(ctx.rng, 0.85, 1.0);
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    for (let i = 0; i < n; i++) {
      const gap = i === 0 ? rr(ctx.rng, 1.0, ctx.params.maxH * 0.8) : rr(ctx.rng, 1.4, ctx.params.maxH);
      const lat = i === 0 ? 0 : rr(ctx.rng, -1.2, 1.2);
      y = Math.max(3.5, y + rr(ctx.rng, -0.15, ctx.params.maxV * 0.5));
      cursor = cursor.add(F.scale(gap + size)).add(R.scale(lat));
      plat(ctx, cursor.x, y, cursor.z, size, size, yaw, { colorIx });
    }
    return { exit: wy(cursor.add(F.scale(size / 2)), y) };
  },
};

/* ---------------- 4. ZIGZAG ---------------- */
const zigzag: ModuleDef = {
  type: "ZIGZAG",
  difficulty: 1.2,
  level: 0,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const n = 4 + Math.floor(ctx.rng() * 3);
    const w = ctx.params.platW * 0.92;
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    let side = ctx.rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const advance = rr(ctx.rng, 2.3, 2.9);
      const lat = i === 0 ? side * rr(ctx.rng, 1.4, 1.9) : side * rr(ctx.rng, 2.4, 3.2);
      side *= -1;
      cursor = cursor.add(F.scale(advance)).add(R.scale(lat));
      y = Math.max(3.5, y + rr(ctx.rng, -0.1, 0.35));
      plat(ctx, cursor.x, y, cursor.z, w, w, yaw, { colorIx });
    }
    return { exit: wy(cursor.add(F.scale(w / 2)), y) };
  },
};

/* ---------------- 5. ASCENDING ---------------- */
const ascending: ModuleDef = {
  type: "ASCENDING",
  difficulty: 1.3,
  level: 0,
  canUse: (y) => y < 20,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const n = 4 + Math.floor(ctx.rng() * 3);
    const w = ctx.params.platW * 1.05;
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    for (let i = 0; i < n; i++) {
      const dy = rr(ctx.rng, ctx.params.maxV * 0.5, ctx.params.maxV * 0.9);
      const gap = rr(ctx.rng, 1.0, ctx.params.maxH * 0.75);
      y += dy;
      cursor = cursor.add(F.scale(gap + 1.9));
      plat(ctx, cursor.x, y, cursor.z, w, 1.9, yaw, { colorIx });
    }
    return { exit: wy(cursor.add(F.scale(0.95)), y) };
  },
};

/* ---------------- 6. DESCENDING ---------------- */
const descending: ModuleDef = {
  type: "DESCENDING",
  difficulty: 1.1,
  level: 0,
  canUse: (y) => y > 9,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const n = 3 + Math.floor(ctx.rng() * 3);
    const w = ctx.params.platW * 1.2;
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    for (let i = 0; i < n; i++) {
      const dy = rr(ctx.rng, 0.8, 1.5);
      const gap = rr(ctx.rng, 0.9, 1.5);
      y = Math.max(3.5, y - dy);
      cursor = cursor.add(F.scale(gap + 2.4));
      plat(ctx, cursor.x, y, cursor.z, w, 2.4, yaw, { colorIx });
    }
    return { exit: wy(cursor.add(F.scale(1.2)), y) };
  },
};

/* ---------------- 7. NARROW BRIDGE ---------------- */
const narrowBridge: ModuleDef = {
  type: "NARROW_BRIDGE",
  difficulty: 1.4,
  level: 0,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const len = rr(ctx.rng, 6.5, 9);
    const w = Math.max(0.85, ctx.params.platW * 0.38);
    const c = entry.add(F.scale(len / 2 - 0.25));
    plat(ctx, c.x, entry.y, c.z, w, len, yaw, {
      colorIx: Math.floor(ctx.rng() * 6),
      baseH: 0.5,
    });
    // bordillos visuales (bajos, sin colisión)
    for (const s of [-1, 1]) {
      const p = c.add(R.scale(s * (w / 2 + 0.09)));
      const rail = trackMesh(
        ctx,
        MeshBuilder.CreateBox("bridgeLip", { width: 0.12, height: 0.14, depth: len * 0.96 }, ctx.scene)
      );
      rail.position.set(p.x, entry.y + 0.07, p.z);
      rail.rotation.y = yaw;
      rail.material = ctx.mats.white;
    }
    return { exit: wy(entry.add(F.scale(len - 0.25)), entry.y) };
  },
};

/* ---------------- 8. GAP JUMPS ---------------- */
const gapJumps: ModuleDef = {
  type: "GAP_JUMPS",
  difficulty: 1.5,
  level: 1,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const n = 3 + Math.floor(ctx.rng() * 2);
    const w = ctx.params.platW;
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    for (let i = 0; i < n; i++) {
      const gap = rr(ctx.rng, ctx.params.maxH * 0.7, ctx.params.maxH);
      cursor = cursor.add(F.scale(gap + 2.2));
      y = Math.max(3.5, y + rr(ctx.rng, -0.2, ctx.params.maxV * 0.45));
      plat(ctx, cursor.x, y, cursor.z, w, 2.2, yaw, { colorIx });
    }
    return { exit: wy(cursor.add(F.scale(1.1)), y) };
  },
};

/* ---------------- 9. PILLAR JUMPS ---------------- */
const pillars: ModuleDef = {
  type: "PILLARS",
  difficulty: 1.7,
  level: 1,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const n = 3 + Math.floor(ctx.rng() * 3);
    const colorIx = Math.floor(ctx.rng() * 6);
    let y = entry.y;
    let cursor = entry.clone();
    for (let i = 0; i < n; i++) {
      const gap = rr(ctx.rng, 1.6, ctx.params.maxH * 0.9);
      const lat = i === 0 ? 0 : rr(ctx.rng, -1.4, 1.4);
      const rad = Math.max(0.95, ctx.params.platW * rr(ctx.rng, 0.4, 0.5));
      y = Math.max(3.5, y + rr(ctx.rng, -ctx.params.maxV * 0.5, ctx.params.maxV * 0.75));
      cursor = cursor.add(F.scale(gap + rad * 2)).add(R.scale(lat));
      platRound(ctx, cursor.x, y, cursor.z, rad, colorIx, 3 + ctx.rng() * 3);
    }
    return { exit: wy(cursor, y) };
  },
};

/* ---------------- 10. MOVING PLATFORM ---------------- */
const movingPlatform: ModuleDef = {
  type: "MOVING_PLATFORM",
  difficulty: 2.0,
  level: 1,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const colorIx = Math.floor(ctx.rng() * 6);
    // plataforma de salida
    const padA = entry.add(F.scale(1.4));
    plat(ctx, padA.x, entry.y, padA.z, ctx.params.platW + 0.8, 2.8, yaw, { colorIx });
    // plataforma móvil en el centro del hueco
    const gap1 = ctx.params.maxH * 0.62;
    const gap2 = ctx.params.maxH * 0.62;
    const mid = padA.add(F.scale(1.4 + gap1 + 1.2));
    const size = Math.min(2.4, ctx.params.platW * 0.85 + 0.6);
    const amp = rr(ctx.rng, 1.1, 1.6);
    const period = rr(ctx.rng, 2.6, 3.4);
    const phase = rr(ctx.rng, 0, Math.PI * 2);
    const mover = trackMesh(
      ctx,
      MeshBuilder.CreateBox("movingPlat", { width: size, height: 0.5, depth: size }, ctx.scene)
    );
    mover.position.set(mid.x, entry.y - 0.25, mid.z);
    const moverBase = trackMesh(
      ctx,
      MeshBuilder.CreateBox("movingPlatB", { width: size * 0.8, height: 0.5, depth: size * 0.8 }, ctx.scene)
    );
    moverBase.parent = mover;
    moverBase.position.set(0, -0.48, 0);
    moverBase.material = ctx.mats.dark;
    mover.material = ctx.mats.glowCyan;
    mover.checkCollisions = true;
    mover.receiveShadows = true;
    mover.metadata = { solid: true, ride: true, delta: new Vector3() };
    ctx.colliders.push(mover);
    ctx.aabbs.push(aabbFromMesh(mover, amp));
    ctx.route.push(wy(mid, entry.y));
    const basePos = mover.position.clone();
    const axis = R.clone();
    ctx.animated.push({
      update: (_dt, t) => {
        const target = basePos.add(axis.scale(Math.sin((t * Math.PI * 2) / period + phase) * amp));
        const delta = target.subtract(mover.position);
        mover.position.copyFrom(target);
        (mover.metadata as { delta: Vector3 }).delta.copyFrom(delta);
      },
    });
    // plataforma de llegada
    const padB = mid.add(F.scale(1.2 + gap2 + 1.4));
    plat(ctx, padB.x, entry.y, padB.z, ctx.params.platW + 0.8, 2.8, yaw, { colorIx });
    return { exit: wy(padB.add(F.scale(1.4)), entry.y) };
  },
};

/* ---------------- 11. ROTATING BAR ---------------- */
const rotatingBar: ModuleDef = {
  type: "ROTATING_BAR",
  difficulty: 2.2,
  level: 2,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const len = rr(ctx.rng, 7, 8.5);
    const w = ctx.params.platW + 0.9;
    const c = entry.add(F.scale(len / 2 - 0.3));
    plat(ctx, c.x, entry.y, c.z, w, len, yaw, { colorIx: Math.floor(ctx.rng() * 6) });
    // poste central
    solidBox(ctx, c.x, entry.y + 0.75, c.z, 0.5, 1.5, 0.5, yaw, ctx.mats.charcoal);
    const knob = trackMesh(ctx, MeshBuilder.CreateSphere("barKnob", { diameter: 0.7, segments: 10 }, ctx.scene));
    knob.position.set(c.x, entry.y + 1.65, c.z);
    knob.material = ctx.mats.glowPink;
    // brazo giratorio
    const armLen = Math.min(w * 1.6, len * 0.92);
    const arm = trackMesh(
      ctx,
      MeshBuilder.CreateBox("rotArm", { width: armLen, height: 0.42, depth: 0.42 }, ctx.scene)
    );
    arm.position.set(c.x, entry.y + 0.62, c.z);
    arm.material = ctx.mats.glowPink;
    const speed = (Math.PI * 2) / ctx.params.barPeriod;
    const phase = rr(ctx.rng, 0, Math.PI * 2);
    ctx.hazards.push({
      center: wy(c, entry.y + 0.62),
      halfLen: armLen / 2,
      angle: phase,
      speed,
      y: entry.y + 0.62,
      width: 0.42,
    });
    ctx.animated.push({
      update: (_dt, t) => {
        arm.rotation.y = t * speed + phase;
      },
    });
    return { exit: wy(entry.add(F.scale(len - 0.3)), entry.y) };
  },
};

/* ---------------- 12. SIMPLE MAZE ---------------- */
const maze: ModuleDef = {
  type: "SIMPLE_MAZE",
  difficulty: 1.6,
  level: 1,
  build(ctx, entry, yaw) {
    const F = fwd(yaw);
    const R = right(yaw);
    const W = 10;
    const D = 12;
    const c = entry.add(F.scale(D / 2 - 0.3));
    plat(ctx, c.x, entry.y, c.z, W, D, yaw, {
      colorIx: Math.floor(ctx.rng() * 6),
      material: ctx.mats.cream,
    });
    const variant = ctx.rng() < 0.5;
    const wallH = 2.4;
    // paredes que forman una S (dos variantes espejadas)
    const defs: { lat: number; lon: number; wlen: number }[] = variant
      ? [
          { lat: -1.6, lon: -1.6, wlen: W - 3.4 },
          { lat: 1.6, lon: 1.6, wlen: W - 3.4 },
        ]
      : [
          { lat: 1.6, lon: -1.6, wlen: W - 3.4 },
          { lat: -1.6, lon: 1.6, wlen: W - 3.4 },
        ];
    for (const d of defs) {
      const pos = c.add(F.scale(d.lon)).add(R.scale(d.lat));
      solidBox(ctx, pos.x, entry.y + wallH / 2, pos.z, d.wlen, wallH, 0.5, yaw, ctx.mats.dark);
    }
    // gemas decorativas dentro del laberinto
    for (let i = 0; i < 3; i++) {
      const gp = c.add(F.scale(rr(ctx.rng, -4, 4))).add(R.scale(rr(ctx.rng, -4, 4)));
      const gem = trackMesh(
        ctx,
        MeshBuilder.CreateIcoSphere("gem", { radius: 0.32, subdivisions: 1 }, ctx.scene)
      );
      gem.position.set(gp.x, entry.y + 0.5, gp.z);
      gem.material = ctx.mats.glowGold;
      const ph = ctx.rng() * 10;
      ctx.animated.push({
        update: (_dt, t) => {
          gem.rotation.y = t * 1.5 + ph;
          gem.position.y = entry.y + 0.55 + Math.sin(t * 2 + ph) * 0.15;
        },
      });
    }
    return { exit: wy(entry.add(F.scale(D - 0.3)), entry.y) };
  },
};

/* ---------------- biblioteca + fallback ---------------- */

export const MODULE_LIBRARY: ModuleDef[] = [
  straight,
  stairs,
  stepping,
  zigzag,
  ascending,
  descending,
  narrowBridge,
  gapJumps,
  pillars,
  movingPlatform,
  rotatingBar,
  maze,
];

/** Módulo siempre válido: plataforma ancha + salto corto + plataforma ancha. */
export function fallbackModule(ctx: GenCtx, entry: Vector3, yaw: number): ModuleOut {
  const F = fwd(yaw);
  const w = ctx.params.platW + 1.6;
  const c1 = entry.add(F.scale(1.6));
  plat(ctx, c1.x, entry.y, c1.z, w, 3.2, yaw, { colorIx: 0 });
  const c2 = c1.add(F.scale(3.2 + ctx.params.maxH * 0.55 + 1.6));
  plat(ctx, c2.x, entry.y, c2.z, w, 3.2, yaw, { colorIx: 4 });
  return { exit: wy(c2.add(F.scale(1.6)), entry.y) };
}
