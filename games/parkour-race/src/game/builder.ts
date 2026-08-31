/* ============================================================
   BUILDER — materiales, plataformas, estaciones, decoración,
   cielo, luces. Todo el "look" del mundo vive aquí.
   ============================================================ */

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Scene } from "@babylonjs/core/scene";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

/* ---------------- tipos del contexto de generación ---------------- */

export interface BoxB {
  min: Vector3;
  max: Vector3;
}

export interface Animated {
  update(dt: number, t: number): void;
}

export interface Hazard {
  center: Vector3;
  halfLen: number;
  angle: number;
  speed: number;
  y: number;
  width: number;
}

export interface GenParams {
  maxH: number; // distancia de salto horizontal segura
  maxV: number; // altura de subida segura
  platW: number; // ancho base de plataformas
  barPeriod: number; // período de barras giratorias
}

export interface GenCtx {
  scene: Scene;
  rng: () => number;
  params: GenParams;
  mats: Mats;
  shadow: ShadowGenerator | null;
  colliders: Mesh[];
  aabbs: BoxB[];
  route: Vector3[];
  animated: Animated[];
  hazards: Hazard[];
  tryMeshes: Mesh[];
}

export interface TryMark {
  meshes: number;
  aabbs: number;
  route: number;
  colliders: number;
  animated: number;
  hazards: number;
}

export function beginTry(ctx: GenCtx): TryMark {
  return {
    meshes: ctx.tryMeshes.length,
    aabbs: ctx.aabbs.length,
    route: ctx.route.length,
    colliders: ctx.colliders.length,
    animated: ctx.animated.length,
    hazards: ctx.hazards.length,
  };
}

export function rollback(ctx: GenCtx, m: TryMark): void {
  for (let i = m.meshes; i < ctx.tryMeshes.length; i++) {
    ctx.tryMeshes[i].dispose(false, false);
  }
  ctx.tryMeshes.length = m.meshes;
  ctx.aabbs.length = m.aabbs;
  ctx.route.length = m.route;
  ctx.colliders.length = m.colliders;
  ctx.animated.length = m.animated;
  ctx.hazards.length = m.hazards;
}

export function trackMesh<T extends Mesh>(ctx: GenCtx, mesh: T): T {
  ctx.tryMeshes.push(mesh);
  return mesh;
}

const track = trackMesh;

export function aabbFromMesh(mesh: Mesh, pad = 0): BoxB {
  mesh.computeWorldMatrix(true);
  const bi = mesh.getBoundingInfo();
  const min = bi.boundingBox.minimumWorld.clone();
  const max = bi.boundingBox.maximumWorld.clone();
  if (pad) {
    min.subtractInPlace(new Vector3(pad, pad, pad));
    max.addInPlace(new Vector3(pad, pad, pad));
  }
  return { min, max };
}

/** intersección de cajas con encogimiento (%) para tolerancia */
export function boxesOverlap(a: BoxB, b: BoxB, shrinkA = 0.04, shrinkB = 0.12): boolean {
  const acx = (a.min.x + a.max.x) / 2;
  const acy = (a.min.y + a.max.y) / 2;
  const acz = (a.min.z + a.max.z) / 2;
  const bcx = (b.min.x + b.max.x) / 2;
  const bcz = (b.min.z + b.max.z) / 2;
  const asx = ((a.max.x - a.min.x) / 2) * (1 - shrinkA);
  const asy = ((a.max.y - a.min.y) / 2) * (1 - shrinkA);
  const asz = ((a.max.z - a.min.z) / 2) * (1 - shrinkA);
  const bsx = ((b.max.x - b.min.x) / 2) * (1 - shrinkB);
  const bsz = ((b.max.z - b.min.z) / 2) * (1 - shrinkB);
  const byMin = b.min.y;
  const byMax = b.max.y;
  return (
    Math.abs(acx - bcx) < asx + bsx &&
    Math.abs(acz - bcz) < asz + bsz &&
    acy - asy < byMax &&
    acy + asy > byMin
  );
}

/* ---------------- materiales ---------------- */

export interface Mats {
  tops: StandardMaterial[];
  base: StandardMaterial;
  cream: StandardMaterial;
  dark: StandardMaterial;
  charcoal: StandardMaterial;
  teal: StandardMaterial;
  gold: StandardMaterial;
  grass: StandardMaterial;
  dirt: StandardMaterial;
  trunk: StandardMaterial;
  leafA: StandardMaterial;
  leafB: StandardMaterial;
  rock: StandardMaterial;
  cloud: StandardMaterial;
  white: StandardMaterial;
  glowCyan: StandardMaterial;
  glowPink: StandardMaterial;
  glowGold: StandardMaterial;
  glowWhite: StandardMaterial;
}

const TOP_COLORS = ["#7CE3B1", "#FFD166", "#FF8FA3", "#9B8CFF", "#6EC6FF", "#B5E048"];

function std(scene: Scene, name: string, hex: string, spec = 0.04): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(spec, spec, spec);
  return m;
}

function glow(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex).scale(0.25);
  m.emissiveColor = Color3.FromHexString(hex);
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  if (alpha < 1) {
    m.alpha = alpha;
  }
  return m;
}

export function createMaterials(scene: Scene): Mats {
  return {
    tops: TOP_COLORS.map((c, i) => std(scene, "top" + i, c)),
    base: std(scene, "base", "#6E5BA6"),
    cream: std(scene, "cream", "#FFF3E4"),
    dark: std(scene, "dark", "#3F3A6B"),
    charcoal: std(scene, "charcoal", "#2E2A4F"),
    teal: std(scene, "teal", "#35C4B5"),
    gold: std(scene, "gold", "#FFB84D"),
    grass: std(scene, "grass", "#8BD16C"),
    dirt: std(scene, "dirt", "#A9746E"),
    trunk: std(scene, "trunk", "#8B5E3C"),
    leafA: std(scene, "leafA", "#5FBF6E"),
    leafB: std(scene, "leafB", "#3E9B5F"),
    rock: std(scene, "rock", "#B6B1C9"),
    cloud: std(scene, "cloud", "#FFFFFF"),
    white: std(scene, "white", "#FFFFFF"),
    glowCyan: glow(scene, "glowCyan", "#6FF7FF"),
    glowPink: glow(scene, "glowPink", "#FF6B9D"),
    glowGold: glow(scene, "glowGold", "#FFD166"),
    glowWhite: glow(scene, "glowWhite", "#FFFFFF"),
  };
}

/* ---------------- plataformas ---------------- */

export interface PlatOpts {
  colorIx?: number;
  topH?: number;
  baseH?: number;
  noBase?: boolean;
  noCollider?: boolean;
  noRoute?: boolean;
  material?: StandardMaterial;
  baseMaterial?: StandardMaterial;
  noShadowCaster?: boolean;
}

/** Crea una plataforma tipo "candy slab": capa superior clara + base violeta. */
export function plat(
  ctx: GenCtx,
  cx: number,
  cyTop: number,
  cz: number,
  w: number,
  d: number,
  yaw: number,
  opts: PlatOpts = {}
): Mesh {
  const topH = opts.topH ?? 0.5;
  const baseH = opts.baseH ?? 0.75;
  const mat = opts.material ?? ctx.mats.tops[(opts.colorIx ?? 0) % ctx.mats.tops.length];

  const top = track(
    ctx,
    MeshBuilder.CreateBox("plat", { width: w, height: topH, depth: d }, ctx.scene)
  );
  top.position.set(cx, cyTop - topH / 2, cz);
  top.rotation.y = yaw;
  top.material = mat;
  top.receiveShadows = true;
  if (!opts.noCollider) {
    top.checkCollisions = true;
    top.metadata = { ...(top.metadata || {}), solid: true };
    ctx.colliders.push(top);
  }
  if (ctx.shadow && !opts.noShadowCaster) ctx.shadow.addShadowCaster(top, false);
  if (!opts.noRoute) ctx.route.push(new Vector3(cx, cyTop, cz));

  if (!opts.noBase) {
    const base = track(
      ctx,
      MeshBuilder.CreateBox(
        "platBase",
        { width: w * 0.88, height: baseH, depth: d * 0.88 },
        ctx.scene
      )
    );
    base.position.set(cx, cyTop - topH - baseH / 2 + 0.06, cz);
    base.rotation.y = yaw;
    base.material = opts.baseMaterial ?? ctx.mats.base;
    base.receiveShadows = true;
  }

  // AABB incluye la base
  const bb = aabbFromMesh(top, 0.05);
  bb.min.y = Math.min(bb.min.y, cyTop - topH - baseH);
  ctx.aabbs.push(bb);

  if (!top.metadata) top.metadata = {};
  top.metadata.frozen = true;
  return top;
}

/** Plataforma redonda (pilares) con fuste decorativo hacia abajo. */
export function platRound(
  ctx: GenCtx,
  cx: number,
  cyTop: number,
  cz: number,
  radius: number,
  colorIx: number,
  shaftDepth = 3.2
): Mesh {
  const top = track(
    ctx,
    MeshBuilder.CreateCylinder(
      "pillarTop",
      { height: 0.55, diameter: radius * 2, tessellation: 20 },
      ctx.scene
    )
  );
  top.position.set(cx, cyTop - 0.275, cz);
  top.material = ctx.mats.tops[colorIx % ctx.mats.tops.length];
  top.receiveShadows = true;
  top.checkCollisions = true;
  top.metadata = { solid: true, frozen: true };
  ctx.colliders.push(top);
  if (ctx.shadow) ctx.shadow.addShadowCaster(top, false);
  ctx.route.push(new Vector3(cx, cyTop, cz));

  const shaft = track(
    ctx,
    MeshBuilder.CreateCylinder(
      "pillarShaft",
      { height: shaftDepth, diameterTop: radius * 1.7, diameterBottom: radius * 0.8, tessellation: 14 },
      ctx.scene
    )
  );
  shaft.position.set(cx, cyTop - 0.55 - shaftDepth / 2 + 0.05, cz);
  shaft.material = ctx.mats.base;

  const bb = aabbFromMesh(top, 0.05);
  ctx.aabbs.push(bb);
  return top;
}

/** Caja sólida genérica (paredes, barandillas, postes). */
export function solidBox(
  ctx: GenCtx,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  yaw: number,
  mat: StandardMaterial,
  opts: { collider?: boolean; route?: boolean; shadow?: boolean } = {}
): Mesh {
  const b = track(ctx, MeshBuilder.CreateBox("solid", { width: w, height: h, depth: d }, ctx.scene));
  b.position.set(cx, cy, cz);
  b.rotation.y = yaw;
  b.material = mat;
  b.receiveShadows = true;
  if (opts.collider !== false) {
    b.checkCollisions = true;
    b.metadata = { solid: true, frozen: true };
    ctx.colliders.push(b);
    ctx.aabbs.push(aabbFromMesh(b, 0.03));
  }
  if (ctx.shadow && opts.shadow !== false) ctx.shadow.addShadowCaster(b, false);
  if (opts.route) ctx.route.push(new Vector3(cx, cy + h / 2, cz));
  return b;
}

/* ---------------- estación de preguntas + portal de bloqueo ---------------- */

export interface StationState {
  index: number;
  center: Vector3; // centro de la plataforma (top)
  spawnPos: Vector3; // posición de checkpoint
  exitYaw: number;
  completed: boolean;
  open: () => void;
  totemCore: Mesh;
  beamMat: StandardMaterial;
  labelMat: StandardMaterial;
}

function numberTexture(scene: Scene, text: string, bg: string, fg: string): DynamicTexture {
  const t = new DynamicTexture("numTex" + text + Math.random(), { width: 256, height: 256 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, 256, 256);
  c.beginPath();
  c.arc(128, 128, 104, 0, Math.PI * 2);
  c.fillStyle = bg;
  c.fill();
  c.lineWidth = 14;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.stroke();
  c.fillStyle = fg;
  c.font = "900 130px 'Baloo 2', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 128, 138);
  t.update();
  t.hasAlpha = true;
  return t;
}

export function buildStation(
  ctx: GenCtx,
  center: Vector3,
  yaw: number,
  index: number,
  total: number
): StationState {
  const F = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const R = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const W = 8.6;
  const D = 9.6;
  const y = center.y;

  // Plataforma segura grande
  plat(ctx, center.x, y, center.z, W, D, yaw, {
    colorIx: 2,
    material: ctx.mats.teal,
    topH: 0.6,
    baseH: 1.4,
  });

  // Barandillas laterales (para que la única salida sea el portal)
  for (const s of [-1, 1]) {
    const p = center.add(R.scale(s * (W / 2 + 0.22)));
    solidBox(ctx, p.x, y + 0.5, p.z, 0.35, 1.0, D * 0.96, yaw, ctx.mats.dark, { shadow: false });
  }

  // ---- Tótem ----
  const tp = center.add(F.scale(-D / 2 + 2.4)).add(new Vector3(0, 0, 0));
  const baseDisc = track(
    ctx,
    MeshBuilder.CreateCylinder("stBase", { height: 0.3, diameter: 2.4, tessellation: 24 }, ctx.scene)
  );
  baseDisc.position.set(tp.x, y + 0.15, tp.z);
  baseDisc.material = ctx.mats.dark;
  if (ctx.shadow) ctx.shadow.addShadowCaster(baseDisc, false);

  const pedestal = track(
    ctx,
    MeshBuilder.CreateCylinder("stPed", { height: 1.5, diameterTop: 0.9, diameterBottom: 1.3, tessellation: 20 }, ctx.scene)
  );
  pedestal.position.set(tp.x, y + 0.3 + 0.75, tp.z);
  pedestal.material = ctx.mats.cream;
  if (ctx.shadow) ctx.shadow.addShadowCaster(pedestal, false);

  const beamMat = glow(ctx.scene, "beam" + index, "#6FF7FF", 0.22);
  const core = track(ctx, MeshBuilder.CreateSphere("stCore", { diameter: 1.05, segments: 20 }, ctx.scene));
  core.position.set(tp.x, y + 2.6, tp.z);
  const coreMat = glow(ctx.scene, "core" + index, "#6FF7FF");
  core.material = coreMat;
  if (ctx.shadow) ctx.shadow.addShadowCaster(core, false);

  // Anillo orbitando
  const ring = track(
    ctx,
    MeshBuilder.CreateTorus("stRing", { diameter: 2.2, thickness: 0.16, tessellation: 32 }, ctx.scene)
  );
  ring.position.copyFrom(core.position);
  const ringMat = glow(ctx.scene, "ring" + index, "#FF6B9D");
  ring.material = ringMat;
  ctx.animated.push({
    update: (_dt, t) => {
      ring.rotation.y = t * 0.9;
      ring.rotation.x = Math.sin(t * 0.6) * 0.35;
      core.scaling.setAll(1 + Math.sin(t * 2.2 + index) * 0.06);
      coreMat.emissiveColor.set(
        0.44 + Math.sin(t * 3) * 0.1,
        0.97,
        1.0
      );
    },
  });

  // Número de estación
  const labelMat = new StandardMaterial("stLabel" + index, ctx.scene);
  labelMat.diffuseTexture = numberTexture(ctx.scene, `${index + 1}`, "#2E2A4F", "#FFFFFF");
  labelMat.emissiveTexture = labelMat.diffuseTexture;
  labelMat.disableLighting = true;
  labelMat.opacityTexture = labelMat.diffuseTexture;
  const label = track(ctx, MeshBuilder.CreatePlane("stLabel", { width: 1.5, height: 1.5 }, ctx.scene));
  label.position.set(tp.x, y + 3.9, tp.z);
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.material = labelMat;

  // Columna de luz guía
  const beam = track(
    ctx,
    MeshBuilder.CreateCylinder("stBeam", { height: 46, diameter: 0.85, tessellation: 12 }, ctx.scene)
  );
  beam.position.set(tp.x, y + 23, tp.z);
  beam.material = beamMat;
  beam.metadata = { beam: true };

  // ---- Portal de bloqueo (compuerta) ----
  const gp = center.add(F.scale(D / 2 - 0.35));
  // arco
  const arch = track(
    ctx,
    MeshBuilder.CreateTorus("stArch", { diameter: 6.2, thickness: 0.42, tessellation: 40 }, ctx.scene)
  );
  arch.position.set(gp.x, y + 0.1, gp.z);
  arch.rotation.y = yaw;
  const archMat = glow(ctx.scene, "arch" + index, "#FF6B9D");
  arch.material = archMat;
  if (ctx.shadow) ctx.shadow.addShadowCaster(arch, false);

  // panel translúcido que bloquea
  const panelMat = new StandardMaterial("gatePanel" + index, ctx.scene);
  panelMat.diffuseColor = Color3.FromHexString("#FF4D6D");
  panelMat.emissiveColor = Color3.FromHexString("#FF4D6D").scale(0.55);
  panelMat.alpha = 0.5;
  panelMat.specularColor = Color3.Black();
  const panel = track(
    ctx,
    MeshBuilder.CreateBox("gatePanel", { width: W * 0.96, height: 3.6, depth: 0.45 }, ctx.scene)
  );
  panel.position.set(gp.x, y + 1.75, gp.z);
  panel.rotation.y = yaw;
  panel.material = panelMat;
  panel.checkCollisions = true;
  panel.metadata = { solid: true, gate: true };
  ctx.colliders.push(panel);
  ctx.aabbs.push(aabbFromMesh(panel, 0.05));

  // pilares del portal
  for (const s of [-1, 1]) {
    const pp = gp.add(R.scale(s * (W / 2 - 0.35)));
    const pil = track(
      ctx,
      MeshBuilder.CreateCylinder("gatePil", { height: 3.6, diameter: 0.5, tessellation: 14 }, ctx.scene)
    );
    pil.position.set(pp.x, y + 1.8, pp.z);
    pil.material = ctx.mats.dark;
    if (ctx.shadow) ctx.shadow.addShadowCaster(pil, false);
    const tip = track(ctx, MeshBuilder.CreateSphere("gateTip", { diameter: 0.62, segments: 10 }, ctx.scene));
    tip.position.set(pp.x, y + 3.85, pp.z);
    tip.material = ctx.mats.glowPink;
  }

  const spawnPos = center.add(F.scale(-D / 2 + 1.4));
  spawnPos.y = y + 0.05;

  const state: StationState = {
    index,
    center: center.clone(),
    spawnPos,
    exitYaw: yaw,
    completed: false,
    totemCore: core,
    beamMat,
    labelMat,
    open: () => {
      // abrir compuerta: animación de descenso + fade
      panel.checkCollisions = false;
      panel.metadata.solid = false;
      const startY = panel.position.y;
      let prog = 0;
      ctx.animated.push({
        update: (dt) => {
          if (prog >= 1) return;
          prog = Math.min(1, prog + dt * 0.9);
          const e = prog * prog * (3 - 2 * prog);
          panel.position.y = startY - e * 4.4;
          panelMat.alpha = 0.5 * (1 - e) + 0.05;
          if (prog >= 1) {
            panel.checkCollisions = false;
            panel.isVisible = false;
          }
        },
      });
      // portal se vuelve verde, haz guía se apaga
      archMat.emissiveColor = Color3.FromHexString("#4ADE80");
      archMat.diffuseColor = Color3.FromHexString("#14532D");
      coreMat.emissiveColor = Color3.FromHexString("#4ADE80");
      ringMat.emissiveColor = Color3.FromHexString("#4ADE80");
      beamMat.alpha = 0.05;
    },
  };

  ctx.route.push(center.clone());
  ctx.route.push(gp.clone().add(F.scale(1.2)));
  void total;
  return state;
}

/* ---------------- zona de inicio y meta ---------------- */

export function buildStart(ctx: GenCtx, center: Vector3, yaw: number): void {
  const R = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  plat(ctx, center.x, center.y, center.z, 10.5, 10.5, yaw, {
    material: ctx.mats.cream,
    topH: 0.7,
    baseH: 1.6,
  });
  // banderas esquineras
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    buildFlag(ctx, center.add(R.scale(sx * 4.3)).add(new Vector3(0, 0, 0)).subtract(new Vector3(Math.sin(yaw) * sz * 4.3, 0, Math.cos(yaw) * sz * 4.3)), sx > 0 ? "#FF6B9D" : "#6FF7FF");
  }
  // beacon suave
  const beam = track(
    ctx,
    MeshBuilder.CreateCylinder("startBeam", { height: 26, diameter: 0.7, tessellation: 10 }, ctx.scene)
  );
  beam.position.set(center.x, center.y + 13, center.z);
  const bm = glow(ctx.scene, "startBeamM", "#FFFFFF", 0.12);
  beam.material = bm;
}

export interface FinishState {
  center: Vector3;
  portalPos: Vector3;
}

export function buildFinish(ctx: GenCtx, center: Vector3, yaw: number): FinishState {
  plat(ctx, center.x, center.y, center.z, 11, 11, yaw, {
    material: ctx.mats.gold,
    topH: 0.7,
    baseH: 1.6,
  });

  const portal = track(
    ctx,
    MeshBuilder.CreateTorus("finishPortal", { diameter: 6.4, thickness: 0.6, tessellation: 48 }, ctx.scene)
  );
  const pp = center.add(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).scale(2.4));
  portal.position.set(pp.x, center.y + 0.4, pp.z);
  portal.rotation.y = yaw;
  const pm = glow(ctx.scene, "finishPortalM", "#FFD166");
  portal.material = pm;
  if (ctx.shadow) ctx.shadow.addShadowCaster(portal, false);

  // disco interior brillante
  const discMat = glow(ctx.scene, "finishDiscM", "#FFF3C4", 0.5);
  const disc = track(
    ctx,
    MeshBuilder.CreateDisc("finishDisc", { radius: 2.6, tessellation: 40 }, ctx.scene)
  );
  disc.position.copyFrom(portal.position);
  disc.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
  disc.material = discMat;
  disc.metadata = { finish: true };

  const beamM = glow(ctx.scene, "finishBeamM", "#FFD166", 0.2);
  const beam = track(
    ctx,
    MeshBuilder.CreateCylinder("finishBeam", { height: 60, diameter: 1.4, tessellation: 12 }, ctx.scene)
  );
  beam.position.set(pp.x, center.y + 30, pp.z);
  beam.material = beamM;

  ctx.animated.push({
    update: (_dt, t) => {
      portal.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, t * 0.45);
      disc.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, Math.sin(t * 0.8) * 0.1);
      discMat.alpha = 0.4 + Math.sin(t * 2) * 0.12;
    },
  });

  for (const s of [-1, 1]) {
    const fp = center.add(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).scale(s * 4.6));
    buildFlag(ctx, fp, "#FFD166");
  }

  ctx.route.push(center.clone());
  return { center: center.clone(), portalPos: portal.position.clone() };
}

/* ---------------- decoración low-poly ---------------- */

export function buildFlag(ctx: GenCtx, pos: Vector3, color: string): void {
  const pole = track(
    ctx,
    MeshBuilder.CreateCylinder("flagPole", { height: 2.6, diameter: 0.12, tessellation: 8 }, ctx.scene)
  );
  pole.position.set(pos.x, pos.y + 1.3, pos.z);
  pole.material = ctx.mats.dark;
  const flagMat = glow(ctx.scene, "flag" + Math.random(), color);
  const flag = track(ctx, MeshBuilder.CreateBox("flag", { width: 0.08, height: 0.55, depth: 1.0 }, ctx.scene));
  flag.position.set(pos.x, pos.y + 2.2, pos.z);
  flag.material = flagMat;
  flag.rotation.y = ctx.rng() * Math.PI;
  const ph = ctx.rng() * 10;
  ctx.animated.push({
    update: (_dt, t) => {
      flag.rotation.y += Math.sin(t * 1.4 + ph) * 0.0012;
      flag.scaling.z = 1 + Math.sin(t * 3 + ph) * 0.08;
    },
  });
}

export function buildTree(ctx: GenCtx, x: number, y: number, z: number, s = 1): void {
  const trunk = track(
    ctx,
    MeshBuilder.CreateCylinder("treeTrunk", { height: 1.4 * s, diameterTop: 0.22 * s, diameterBottom: 0.34 * s, tessellation: 8 }, ctx.scene)
  );
  trunk.position.set(x, y + 0.7 * s, z);
  trunk.material = ctx.mats.trunk;
  if (ctx.shadow) ctx.shadow.addShadowCaster(trunk, false);
  const mat = ctx.rng() > 0.5 ? ctx.mats.leafA : ctx.mats.leafB;
  const blobs = 2 + Math.floor(ctx.rng() * 2);
  for (let i = 0; i < blobs; i++) {
    const b = track(
      ctx,
      MeshBuilder.CreateIcoSphere("treeTop", { radius: (0.85 - i * 0.14) * s, subdivisions: 1 }, ctx.scene)
    );
    b.position.set(
      x + (ctx.rng() - 0.5) * 0.3 * s,
      y + (1.5 + i * 0.62) * s,
      z + (ctx.rng() - 0.5) * 0.3 * s
    );
    b.rotation.y = ctx.rng() * Math.PI;
    b.material = mat;
    if (ctx.shadow) ctx.shadow.addShadowCaster(b, false);
  }
}

export function buildRock(ctx: GenCtx, x: number, y: number, z: number, s = 1): void {
  const r = track(
    ctx,
    MeshBuilder.CreateIcoSphere("rock", { radius: s, subdivisions: 1 }, ctx.scene)
  );
  r.position.set(x, y + s * 0.4, z);
  r.rotation.set(ctx.rng() * 3, ctx.rng() * 3, ctx.rng() * 3);
  r.scaling.set(1, 0.65 + ctx.rng() * 0.3, 0.8 + ctx.rng() * 0.4);
  r.material = ctx.mats.rock;
  if (ctx.shadow) ctx.shadow.addShadowCaster(r, false);
}

export function buildCloud(ctx: GenCtx, x: number, y: number, z: number, s = 1): void {
  const n = 3 + Math.floor(ctx.rng() * 2);
  const mat = ctx.mats.cloud;
  for (let i = 0; i < n; i++) {
    const c = track(
      ctx,
      MeshBuilder.CreateIcoSphere("cloud", { radius: 1, subdivisions: 1 }, ctx.scene)
    );
    c.position.set(x + (i - n / 2) * 1.5 * s, y + (ctx.rng() - 0.5) * 0.6, z + (ctx.rng() - 0.5) * 1.2 * s);
    c.scaling.set((1.3 + ctx.rng()) * s, 0.62 * s, (0.9 + ctx.rng() * 0.6) * s);
    c.rotation.y = ctx.rng() * Math.PI;
    c.material = mat;
  }
}

/** Isla flotante decorativa (disco de césped + cono de tierra invertido) */
export function buildFloatingIsland(
  ctx: GenCtx,
  x: number,
  y: number,
  z: number,
  r: number,
  withTree = true
): void {
  const grass = track(
    ctx,
    MeshBuilder.CreateCylinder("islGrass", { height: 0.55, diameter: r * 2, tessellation: 18 }, ctx.scene)
  );
  grass.position.set(x, y - 0.275, z);
  grass.material = ctx.mats.grass;
  grass.receiveShadows = true;
  if (ctx.shadow) ctx.shadow.addShadowCaster(grass, false);

  const coneH = r * (0.9 + ctx.rng() * 0.5);
  const cone = track(
    ctx,
    MeshBuilder.CreateCylinder(
      "islCone",
      { height: coneH, diameterTop: r * 1.9, diameterBottom: 0.3, tessellation: 14 },
      ctx.scene
    )
  );
  cone.position.set(x, y - 0.55 - coneH / 2 + 0.1, z);
  cone.material = ctx.mats.dirt;

  if (withTree && r > 2.2) {
    if (ctx.rng() < 0.75) {
      buildTree(ctx, x + (ctx.rng() - 0.5) * r, y, z + (ctx.rng() - 0.5) * r, 0.8 + ctx.rng() * 0.6);
    } else {
      buildRock(ctx, x + (ctx.rng() - 0.5) * r * 0.8, y, z + (ctx.rng() - 0.5) * r * 0.8, 0.5 + ctx.rng() * 0.7);
    }
  }
}

/* ---------------- partículas ---------------- */

let dotTexture: DynamicTexture | null = null;
function getDotTexture(scene: Scene): DynamicTexture {
  if (dotTexture) return dotTexture;
  const t = new DynamicTexture("dot", { width: 64, height: 64 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  t.update();
  t.hasAlpha = true;
  dotTexture = t;
  return t;
}

export function burstConfetti(scene: Scene, pos: Vector3, hex: string): void {
  const ps = new ParticleSystem("burst", 260, scene);
  ps.particleTexture = getDotTexture(scene);
  ps.emitter = pos.clone();
  const col = Color3.FromHexString(hex);
  ps.color1 = new Color4(col.r, col.g, col.b, 1);
  ps.color2 = new Color4(1, 1, 1, 1);
  ps.colorDead = new Color4(col.r * 0.7, col.g * 0.7, col.b * 0.7, 0.4);
  ps.minSize = 0.14;
  ps.maxSize = 0.4;
  ps.minLifeTime = 0.5;
  ps.maxLifeTime = 1.4;
  ps.emitRate = 900;
  ps.createSphereEmitter(0.8);
  ps.direction1 = new Vector3(-4, 7, -4);
  ps.direction2 = new Vector3(4, 12, 4);
  ps.gravity = new Vector3(0, -14, 0);
  ps.minEmitPower = 2;
  ps.maxEmitPower = 6;
  ps.targetStopDuration = 0.35;
  ps.disposeOnStop = true;
  ps.start();
}

/* ---------------- cielo + luces ---------------- */

export interface SkyRig {
  hemi: HemisphericLight;
  sun: DirectionalLight;
  shadow: ShadowGenerator | null;
}

export function buildSkyAndLights(scene: Scene, quality: "low" | "high"): SkyRig {
  // Bóveda con gradiente
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 900, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = new StandardMaterial("skyMat", scene);
  const dt = new DynamicTexture("skyTex", { width: 16, height: 512 }, scene, false);
  const c = dt.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#1F4FD8");
  g.addColorStop(0.42, "#3E8EE8");
  g.addColorStop(0.72, "#8FD4F2");
  g.addColorStop(1, "#F3FBFF");
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 512);
  dt.update();
  skyMat.emissiveTexture = dt;
  skyMat.diffuseColor = Color3.Black();
  skyMat.specularColor = Color3.Black();
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.applyFog = false;

  scene.clearColor = new Color4(0.55, 0.78, 0.95, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 130;
  scene.fogEnd = 320;
  scene.fogColor = Color3.FromHexString("#BFE6F7");

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.diffuse = Color3.FromHexString("#D6F0FF");
  hemi.groundColor = Color3.FromHexString("#8B7CB8");
  hemi.specular = Color3.FromHexString("#223");
  hemi.intensity = 0.95;

  const sun = new DirectionalLight("sun", new Vector3(0.45, -1, 0.35).normalize(), scene);
  sun.position = new Vector3(-45, 70, -35);
  sun.diffuse = Color3.FromHexString("#FFF1D6");
  sun.specular = new Color3(0.15, 0.12, 0.08);
  sun.intensity = 0.85;

  let shadow: ShadowGenerator | null = null;
  try {
    shadow = new ShadowGenerator(quality === "high" ? 2048 : 1024, sun);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = quality === "high" ? 24 : 12;
    shadow.bias = 0.0008;
    shadow.normalBias = 0.02;
    sun.autoCalcShadowZBounds = true;
    sun.shadowOrthoScale = 0.35;
  } catch (err) {
    console.warn("[IslaSaber] sombras desactivadas:", err);
    shadow = null;
  }

  return { hemi, sun, shadow };
}
