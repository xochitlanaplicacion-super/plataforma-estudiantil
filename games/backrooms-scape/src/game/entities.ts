// ------------------------------------------------------------------
// Entidades: Bean (estilo Fall Guys) y el Merodeador (gelatina Venom)
// ------------------------------------------------------------------
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";

// ================================ BEAN ================================

export interface BeanRefs {
  root: TransformNode;
  meshes: Mesh[];
  materials: Material[];
  body: Mesh;
  armL: Mesh;
  armR: Mesh;
  footL: Mesh;
  footR: Mesh;
  eyeL: Mesh;
  eyeR: Mesh;
  phase: number;
  squash: number;
}

export function buildBean(scene: Scene, color: Color3): BeanRefs {
  const root = new TransformNode("bean", scene);
  const meshes: Mesh[] = [];

  const bodyMat = new PBRMaterial("beanMat", scene);
  bodyMat.albedoColor = color;
  bodyMat.roughness = 0.34;
  bodyMat.metallic = 0.0;
  bodyMat.clearCoat.isEnabled = true;
  bodyMat.clearCoat.intensity = 0.85;
  bodyMat.clearCoat.roughness = 0.28;

  // Cuerpo cápsula "frijol"
  const body = MeshBuilder.CreateCapsule(
    "beanBody",
    { radius: 0.44, height: 1.14, tessellation: 32, capSubdivisions: 12 },
    scene
  );
  body.scaling = new Vector3(1, 1.12, 0.86);
  body.position.y = 0.92;
  body.material = bodyMat;
  body.parent = root;
  meshes.push(body);

  // Visor facial
  const visorMat = new PBRMaterial("visorMat", scene);
  visorMat.albedoColor = new Color3(0.06, 0.07, 0.12);
  visorMat.roughness = 0.12;
  visorMat.metallic = 0.25;
  visorMat.clearCoat.isEnabled = true;
  visorMat.clearCoat.intensity = 1.0;

  const visor = MeshBuilder.CreateSphere("beanVisor", { diameter: 1, segments: 24 }, scene);
  visor.scaling = new Vector3(0.6, 0.34, 0.34);
  visor.position = new Vector3(0, 1.14, 0.3);
  visor.material = visorMat;
  visor.parent = root;
  meshes.push(visor);

  // Ojos
  const eyeWhite = new PBRMaterial("eyeW", scene);
  eyeWhite.albedoColor = new Color3(1, 1, 1);
  eyeWhite.roughness = 0.15;
  const eyeBlack = new PBRMaterial("eyeB", scene);
  eyeBlack.albedoColor = new Color3(0.02, 0.02, 0.04);
  eyeBlack.roughness = 0.05;

  const mkEye = (sx: number): { white: Mesh; pupil: Mesh } => {
    const w = MeshBuilder.CreateSphere("eyeW", { diameter: 1, segments: 16 }, scene);
    w.scaling = new Vector3(0.13, 0.17, 0.07);
    w.position = new Vector3(sx, 1.15, 0.42);
    w.material = eyeWhite;
    w.parent = root;
    const p = MeshBuilder.CreateSphere("eyeP", { diameter: 1, segments: 12 }, scene);
    p.scaling = new Vector3(0.055, 0.08, 0.04);
    p.position = new Vector3(sx, 1.15, 0.47);
    p.material = eyeBlack;
    p.parent = root;
    meshes.push(w, p);
    return { white: w, pupil: p };
  };
  const eL = mkEye(-0.15);
  const eR = mkEye(0.15);

  // Bracitos
  const mkArm = (sx: number): Mesh => {
    const arm = MeshBuilder.CreateCapsule(
      "beanArm",
      { radius: 0.095, height: 0.42, tessellation: 16 },
      scene
    );
    arm.material = bodyMat;
    arm.position = new Vector3(sx * 0.5, 0.92, 0);
    arm.setPivotPoint(new Vector3(0, 0.18, 0));
    arm.parent = root;
    meshes.push(arm);
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // Pies
  const footMat = new PBRMaterial("footMat", scene);
  footMat.albedoColor = color.scale(0.72);
  footMat.roughness = 0.5;
  const mkFoot = (sx: number): Mesh => {
    const f = MeshBuilder.CreateCapsule(
      "beanFoot",
      { radius: 0.13, height: 0.34, tessellation: 16 },
      scene
    );
    f.rotation.x = Math.PI / 2;
    f.scaling = new Vector3(1, 1.15, 0.8);
    f.position = new Vector3(sx * 0.18, 0.11, 0.03);
    f.setPivotPoint(new Vector3(0, 0.14, 0));
    f.parent = root;
    f.material = footMat;
    meshes.push(f);
    return f;
  };
  const footL = mkFoot(-1);
  const footR = mkFoot(1);

  return { root, meshes, materials: [bodyMat, visorMat, eyeWhite, eyeBlack, footMat], body, armL, armR, footL, footR, eyeL: eL.white, eyeR: eR.white, phase: 0, squash: 0 };
}

export function animateBean(
  b: BeanRefs,
  t: number,
  dt: number,
  speed01: number,
  sprinting: boolean,
  grounded: boolean
): boolean {
  // devuelve true cuando hay pisada (para sonido)
  let stepped = false;
  const targetPhaseRate = 7 + speed01 * 8;
  b.phase += dt * targetPhaseRate * (speed01 > 0.02 ? 1 : 0);
  const ph = b.phase;

  // rebote del cuerpo
  const bob = speed01 > 0.02 ? Math.abs(Math.sin(ph)) * (0.05 + 0.05 * speed01) : Math.sin(t * 2.2) * 0.015;
  b.body.position.y = 0.92 + bob;
  // squash & stretch
  b.squash = Math.max(0, b.squash - dt * 5.5);
  const sq = 1 - b.squash * 0.22 + (speed01 > 0.02 ? Math.sin(ph * 2) * 0.02 : 0);
  b.body.scaling.set(1 / Math.sqrt(sq), 1.12 * sq, 0.86 / Math.sqrt(sq));
  // inclinación al correr
  b.body.rotation.x = sprinting ? 0.16 * speed01 : 0.06 * speed01;
  b.root.rotation.z = Math.sin(ph * 0.5) * 0.03 * speed01;

  // brazos y pies
  const swing = speed01 > 0.02 ? Math.sin(ph) * (0.5 + 0.45 * speed01) : Math.sin(t * 2.2) * 0.08;
  b.armL.rotation.x = swing;
  b.armR.rotation.x = -swing;
  b.armL.rotation.z = 0.28 + speed01 * 0.2;
  b.armR.rotation.z = -0.28 - speed01 * 0.2;

  const stompL = speed01 > 0.02 ? Math.max(0, Math.sin(ph)) * 0.16 : 0;
  const stompR = speed01 > 0.02 ? Math.max(0, Math.sin(ph + Math.PI)) * 0.16 : 0;
  b.footL.position.y = 0.11 + stompL;
  b.footR.position.y = 0.11 + stompR;

  const prevSin = Math.sin(ph - dt * targetPhaseRate);
  if (grounded && speed01 > 0.05 && prevSin >= 0 && Math.sin(ph) < 0) stepped = true;

  // parpadeo
  const blinkT = t % 3.3;
  const blink = blinkT < 0.14 ? Math.max(0.06, Math.abs(Math.cos((blinkT / 0.14) * Math.PI))) : 1;
  b.eyeL.scaling.y = 0.17 * blink;
  b.eyeR.scaling.y = 0.17 * blink;

  if (!grounded) {
    b.armL.rotation.z = 1.1;
    b.armR.rotation.z = -1.1;
    b.footL.position.y = 0.2;
    b.footR.position.y = 0.2;
  }
  return stepped;
}

// ============================= MERODEADOR =============================

export interface MarauderRefs {
  root: TransformNode;
  meshes: Mesh[];
  materials: Material[];
  body: Mesh;
  lumpA: Mesh;
  lumpB: Mesh;
  head: Mesh;
  eyeL: Mesh;
  eyeR: Mesh;
  tentacles: Mesh[];
  anchors: { x: number; z: number; phase: number; len: number }[];
  light: PointLight;
}

export function buildMarauder(scene: Scene, grinTex: DynamicTexture): MarauderRefs {
  const root = new TransformNode("marauder", scene);
  const meshes: Mesh[] = [];

  const gooMat = new PBRMaterial("gooMat", scene);
  gooMat.albedoColor = new Color3(0.012, 0.01, 0.02);
  gooMat.roughness = 0.08;
  gooMat.metallic = 0.35;
  gooMat.clearCoat.isEnabled = true;
  gooMat.clearCoat.intensity = 1.0;
  gooMat.clearCoat.roughness = 0.04;
  gooMat.emissiveColor = new Color3(0.05, 0.0, 0.09);

  const mkBlob = (name: string, d: number, pos: Vector3, sc: Vector3): Mesh => {
    const m = MeshBuilder.CreateSphere(name, { diameter: d, segments: 24 }, scene);
    m.position = pos;
    m.scaling = sc;
    m.material = gooMat;
    m.parent = root;
    meshes.push(m);
    return m;
  };

  const body = mkBlob("marBody", 1.5, new Vector3(0, 0.85, 0), new Vector3(1, 1.05, 1.12));
  const lumpA = mkBlob("marLumpA", 0.85, new Vector3(0.42, 1.3, -0.28), new Vector3(1, 1.1, 1));
  const lumpB = mkBlob("marLumpB", 0.7, new Vector3(-0.45, 1.15, 0.1), new Vector3(1.1, 0.9, 1));
  const head = mkBlob("marHead", 0.82, new Vector3(0, 1.62, 0.28), new Vector3(1, 0.92, 1.12));

  // Ojos blancos estilo Venom
  const eyeMat = new StandardMaterial("marEyeMat", scene);
  eyeMat.emissiveColor = new Color3(1.35, 1.4, 1.5);
  eyeMat.disableLighting = true;
  const mkEye = (sx: number): Mesh => {
    const e = MeshBuilder.CreateSphere("marEye", { diameter: 1, segments: 16 }, scene);
    e.scaling = new Vector3(0.34, 0.15, 0.1);
    e.position = new Vector3(sx * 0.22, 1.74, 0.62);
    e.rotation.z = sx * -0.45;
    e.rotation.y = sx * 0.35;
    e.material = eyeMat;
    e.parent = root;
    meshes.push(e);
    return e;
  };
  const eyeL = mkEye(-1);
  const eyeR = mkEye(1);

  // Sonrisa dentada
  const grinMat = new StandardMaterial("grinMat", scene);
  grinMat.emissiveColor = new Color3(1.2, 1.25, 1.35);
  grinMat.emissiveTexture = grinTex;
  grinMat.opacityTexture = grinTex;
  grinMat.disableLighting = true;
  const grin = MeshBuilder.CreatePlane("marGrin", { width: 0.72, height: 0.36 }, scene);
  grin.position = new Vector3(0, 1.5, 0.68);
  grin.material = grinMat;
  grin.parent = root;
  meshes.push(grin);

  // Tentáculos
  const tentacles: Mesh[] = [];
  const anchors: MarauderRefs["anchors"] = [];
  const T = 9;
  for (let i = 0; i < T; i++) {
    const a = (i / T) * Math.PI * 2 + 0.3;
    const ax = Math.sin(a) * 0.45;
    const az = Math.cos(a) * 0.5;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 8; j++) {
      pts.push(new Vector3(ax * (1 + j * 0.14), 0.62 - j * 0.075, az * (1 + j * 0.14)));
    }
    const tube = MeshBuilder.CreateTube(
      "marTent" + i,
      {
        path: pts,
        radiusFunction: (i2: number) => 0.15 * (1 - i2 / 9) + 0.015,
        tessellation: 8,
        updatable: true,
        cap: 3,
      },
      scene
    );
    tube.material = gooMat;
    tube.parent = root;
    meshes.push(tube);
    tentacles.push(tube);
    anchors.push({ x: ax, z: az, phase: i * 1.3 + Math.random() * 2, len: 1.0 + Math.random() * 0.7 });
  }

  // Luz siniestra
  const light = new PointLight("marLight", new Vector3(0, 1.6, 0), scene);
  light.diffuse = new Color3(0.5, 0.25, 0.95);
  light.specular = new Color3(0.6, 0.35, 1);
  light.intensity = 1.15;
  light.range = 5;
  light.parent = root;
  // el aura ilumina el pasillo, no la propia gelatina (permanece negra brillante)
  light.excludedMeshes.push(...meshes.filter((m) => m.name !== "marEye" && m.name !== "marGrin"));

  return { root, meshes, materials: [gooMat, eyeMat, grinMat], body, lumpA, lumpB, head, eyeL, eyeR, tentacles, anchors, light };
}

export function animateMarauder(m: MarauderRefs, t: number, drag: Vector3, scene: Scene, updateTentacles = true): void {
  const hover = 0.06 * Math.sin(t * 2.1);
  m.body.position.y = 0.85 + hover;
  const pulse = 1 + 0.055 * Math.sin(t * 3.0);
  m.body.scaling.set(pulse, 1.05 / Math.sqrt(pulse), 1.12 * pulse);
  m.lumpA.position.y = 1.3 + hover * 1.3 + 0.03 * Math.sin(t * 2.7 + 1);
  m.lumpB.position.y = 1.15 + hover * 1.2 + 0.03 * Math.cos(t * 2.3);
  m.head.position.y = 1.62 + hover * 1.5;
  m.head.rotation.y = Math.sin(t * 1.4) * 0.14;
  m.light.intensity = 1.0 + Math.sin(t * 7.3) * 0.22 + Math.sin(t * 13.7) * 0.13;

  // tentáculos ondulantes
  if (!updateTentacles) return;
  const N = 8;
  for (let i = 0; i < m.tentacles.length; i++) {
    const a = m.anchors[i];
    const pts: Vector3[] = [];
    for (let j = 0; j <= N; j++) {
      const f = j / N;
      const sway = Math.sin(t * 3.1 + a.phase + f * 3.6) * 0.16 * f;
      const sway2 = Math.cos(t * 2.2 + a.phase * 1.7 + f * 2.8) * 0.13 * f;
      pts.push(
        new Vector3(
          a.x * (1 + f * 0.25) + sway - drag.x * f * a.len * 0.55,
          0.62 - f * 0.52 * a.len + Math.abs(Math.sin(t * 3.1 + a.phase + f * 3)) * 0.06 * f,
          a.z * (1 + f * 0.25) + sway2 - drag.z * f * a.len * 0.55
        )
      );
    }
    MeshBuilder.CreateTube(
      "marTent" + i,
      {
        path: pts,
        radiusFunction: (i2: number) => 0.15 * (1 - i2 / (N + 1)) + 0.015,
        tessellation: 8,
        instance: m.tentacles[i],
      },
      scene
    );
  }
}

/** Pose de ataque (killcam): se abomba y abre los ojos */
export function marauderAttackPose(m: MarauderRefs, k: number): void {
  const s = 1 + k * 0.55;
  m.body.scaling.set(s, 1.05 * s, 1.12 * s);
  m.head.position.z = 0.28 + k * 0.35;
  m.eyeL.scaling.set(0.34 + k * 0.14, 0.15 + k * 0.1, 0.1);
  m.eyeR.scaling.set(0.34 + k * 0.14, 0.15 + k * 0.1, 0.1);
  m.light.intensity = 1.3 + k * 4.5;
}
