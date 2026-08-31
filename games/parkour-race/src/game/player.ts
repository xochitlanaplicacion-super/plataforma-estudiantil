/* ============================================================
   PLAYER — personaje "bean" estilo Fall Guys (100% procedural)
   + controlador de carácter en tercera persona con colisiones.
   ============================================================ */

import "@babylonjs/core/Collisions/collisionCoordinator"; // side-effect: colisiones del personaje
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export const MOVE_SPEED = 7.2;
export const SPRINT_MULT = 1.35;
export const JUMP_SPEED = 9.2;
export const GRAVITY = 26;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;

export interface PlayerInput {
  mx: number; // -1..1 lateral (A/D)
  mz: number; // -1..1 adelante (W/S)
  jump: boolean;
  sprint: boolean;
}

function mat(scene: Scene, name: string, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.06, 0.06, 0.08);
  return m;
}

export class Player {
  scene: Scene;
  body: Mesh; // colisionador invisible
  visual: TransformNode;
  torso: Mesh;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;

  vel = Vector3.Zero();
  grounded = false;
  facing = 0;
  walkPhase = 0;
  squash = 0; // negativo = aplastado, positivo = estirado
  knockCooldown = 0;

  private wasGrounded = false;
  private timeSinceGround = 0;
  private jumpBuffer = 0;
  private groundMesh: Mesh | null = null;

  /* ---- ledge grab / mantle ---- */
  private mantle: {
    t: number;
    dur: number;
    from: Vector3;
    ledge: Vector3; // punto del borde (altura de la superficie)
    to: Vector3; // posición final sobre la plataforma
  } | null = null;
  private mantleCooldown = 0;
  get isMantling(): boolean {
    return this.mantle !== null;
  }

  constructor(scene: Scene, bodyColor = "#FF6B8A", accent = "#D84F74") {
    this.scene = scene;

    /* ---------- colisionador ---------- */
    const body = MeshBuilder.CreateBox("playerBody", { width: 0.85, height: 1.55, depth: 0.85 }, scene);
    body.isVisible = false;
    body.checkCollisions = true;
    body.ellipsoid = new Vector3(0.42, 0.78, 0.42);
    body.ellipsoidOffset = new Vector3(0, 0.78, 0);
    body.metadata = { player: true };
    this.body = body;

    /* ---------- visual (bean bonito) ---------- */
    const root = new TransformNode("playerVisual", scene);
    this.visual = root;

    const bodyMat = mat(scene, "pBody", bodyColor);
    const darkMat = mat(scene, "pAccent", accent);
    const cream = mat(scene, "pCream", "#FFF3E4");
    const black = mat(scene, "pBlack", "#23202F");
    const whiteGlow = new StandardMaterial("pWhite", scene);
    whiteGlow.diffuseColor = Color3.White();
    whiteGlow.emissiveColor = Color3.White();
    whiteGlow.specularColor = Color3.Black();
    whiteGlow.disableLighting = true;
    const blush = mat(scene, "pBlush", "#FF9EBB");

    // torso: cápsula regordete
    const torso = MeshBuilder.CreateCapsule("pTorso", { radius: 0.44, height: 1.3, tessellation: 20 }, scene);
    torso.position.y = 0.86;
    torso.material = bodyMat;
    torso.parent = root;
    this.torso = torso;

    // panel facial ovalado
    const face = MeshBuilder.CreateSphere("pFace", { diameter: 1, segments: 16 }, scene);
    face.scaling.set(0.62, 0.5, 0.24);
    face.position.set(0, 1.08, 0.32);
    face.material = cream;
    face.parent = root;

    // ojos + brillos
    for (const s of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere("pEye", { diameter: 0.105, segments: 10 }, scene);
      eye.position.set(s * 0.135, 1.1, 0.52);
      eye.material = black;
      eye.parent = root;
      const spark = MeshBuilder.CreateSphere("pSpark", { diameter: 0.038, segments: 8 }, scene);
      spark.position.set(s * 0.135 + 0.018, 1.125, 0.565);
      spark.material = whiteGlow;
      spark.parent = root;
      // mejillas
      const cheek = MeshBuilder.CreateSphere("pCheek", { diameter: 0.11, segments: 8 }, scene);
      cheek.scaling.set(1, 0.7, 0.5);
      cheek.position.set(s * 0.27, 0.98, 0.47);
      cheek.material = blush;
      cheek.parent = root;
    }

    // brazos con pivote en el hombro
    const mkArm = (side: number): TransformNode => {
      const pivot = new TransformNode(side < 0 ? "pArmL" : "pArmR", scene);
      pivot.position.set(side * 0.5, 0.86, 0);
      pivot.parent = root;
      const arm = MeshBuilder.CreateCapsule("pArm", { radius: 0.115, height: 0.46, tessellation: 12 }, scene);
      arm.position.set(side * 0.06, -0.18, 0);
      arm.rotation.z = side * 0.5;
      arm.material = darkMat;
      arm.parent = pivot;
      const hand = MeshBuilder.CreateSphere("pHand", { diameter: 0.24, segments: 10 }, scene);
      hand.position.set(side * 0.17, -0.38, 0);
      hand.material = bodyMat;
      hand.parent = pivot;
      return pivot;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // piernas con pivote en la cadera
    const mkLeg = (side: number): TransformNode => {
      const pivot = new TransformNode(side < 0 ? "pLegL" : "pLegR", scene);
      pivot.position.set(side * 0.19, 0.34, 0);
      pivot.parent = root;
      const foot = MeshBuilder.CreateCapsule("pFoot", { radius: 0.13, height: 0.4, tessellation: 12 }, scene);
      foot.position.set(0, -0.14, 0.02);
      foot.material = darkMat;
      foot.parent = pivot;
      return pivot;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
  }

  get position(): Vector3 {
    return this.body.position;
  }

  addShadowCasters(sg: { addShadowCaster: (m: Mesh, inc?: boolean) => void }): void {
    sg.addShadowCaster(this.torso, true);
  }

  setPose(pos: Vector3, yaw: number): void {
    this.body.position.copyFrom(pos);
    this.vel.setAll(0);
    this.facing = yaw;
    // IMPORTANTE: si existe rotationQuaternion, Babylon ignora .rotation.
    // Lo eliminamos para que las animaciones Euler del update funcionen.
    this.visual.rotationQuaternion = null;
    this.visual.rotation.set(0, yaw, 0);
    this.visual.position.copyFrom(pos);
  }

  applyKnock(dir: Vector3): void {
    if (this.knockCooldown > 0) return;
    this.knockCooldown = 0.55;
    this.vel.x = dir.x * 7.5;
    this.vel.z = dir.z * 7.5;
    this.vel.y = 4.6;
    this.squash = -1;
    this.grounded = false;
  }

  /** Busca una repisa agarrable delante del personaje. */
  private findLedge(): { ledge: Vector3; to: Vector3 } | null {
    const solid = (m: { metadata?: unknown }) =>
      !!(m.metadata && (m.metadata as { solid?: boolean }).solid);

    const dir = new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const feetY = this.body.position.y;

    // 1) Buscar borde delante escaneando varias alturas (las losas son finas)
    let wallPoint: Vector3 | null = null;
    for (const h of [1.7, 1.35, 1.0, 0.7, 0.45]) {
      const from = this.body.position.add(new Vector3(0, h, 0));
      const hit = this.scene.pickWithRay(new Ray(from, dir, 0.9), solid);
      if (hit?.hit && hit.pickedPoint) {
        wallPoint = hit.pickedPoint;
        break;
      }
    }
    if (!wallPoint) return null;

    // 2) Sondear hacia abajo justo detrás del borde para hallar la superficie
    const probe = wallPoint.add(dir.scale(0.55));
    const MAX_REACH = 1.95; // altura máxima que el personaje puede trepar
    const top = new Vector3(probe.x, feetY + MAX_REACH + 0.6, probe.z);
    const downHit = this.scene.pickWithRay(new Ray(top, Vector3.Down(), MAX_REACH + 1.2), solid);
    if (!downHit?.hit || !downHit.pickedPoint) return null;

    const surfaceY = downHit.pickedPoint.y;
    const rise = surfaceY - feetY;
    // Debe estar por encima de los pies pero dentro del alcance
    if (rise < 0.35 || rise > MAX_REACH) return null;

    // 3) Comprobar que hay espacio libre sobre la repisa (no trepar dentro de un muro)
    const clearFrom = new Vector3(probe.x, surfaceY + 0.25, probe.z);
    const headroom = this.scene.pickWithRay(new Ray(clearFrom, Vector3.Up(), 1.5), solid);
    if (headroom?.hit) return null;

    return {
      ledge: new Vector3(wallPoint.x, surfaceY, wallPoint.z),
      to: new Vector3(probe.x, surfaceY + 0.06, probe.z),
    };
  }

  update(
    dt: number,
    input: PlayerInput,
    camYaw: number,
    onJump: () => void,
    onLand: () => void,
    onMantle?: () => void
  ): void {
    const body = this.body;
    const SPEED = MOVE_SPEED * (input.sprint ? SPRINT_MULT : 1);

    /* ---------- animación de trepada en curso ---------- */
    if (this.mantle) {
      const m = this.mantle;
      m.t += dt;
      const p = Math.min(1, m.t / m.dur);

      // fase 1 (0–55%): subir agarrado al borde · fase 2: impulsarse encima
      let pos: Vector3;
      if (p < 0.55) {
        const k = p / 0.55;
        const e = k * k * (3 - 2 * k);
        const hang = new Vector3(m.ledge.x, m.ledge.y - 0.55, m.ledge.z);
        pos = Vector3.Lerp(m.from, hang, e);
      } else {
        const k = (p - 0.55) / 0.45;
        const e = k * k * (3 - 2 * k);
        const hang = new Vector3(m.ledge.x, m.ledge.y - 0.55, m.ledge.z);
        pos = Vector3.Lerp(hang, m.to, e);
        pos.y += Math.sin(k * Math.PI) * 0.22; // pequeño arco al subir
      }
      body.position.copyFrom(pos);
      this.visual.position.copyFrom(pos);
      this.visual.rotation.y = this.facing;
      this.visual.rotation.x = 0;

      // pose: brazos arriba agarrando, piernas recogidas
      const reach = p < 0.55 ? -2.5 : -2.5 + (p - 0.55) / 0.45 * 2.5;
      this.armL.rotation.x = reach;
      this.armR.rotation.x = reach;
      const tuck = Math.sin(p * Math.PI) * 1.1;
      this.legL.rotation.x = tuck;
      this.legR.rotation.x = tuck * 0.7;
      this.torso.scaling.set(1 - tuck * 0.05, 1 + tuck * 0.08, 1 - tuck * 0.05);

      if (p >= 1) {
        this.mantle = null;
        this.mantleCooldown = 0.25;
        this.vel.setAll(0);
        this.grounded = true;
        this.timeSinceGround = 0;
        this.squash = -0.5;
      }
      return;
    }
    this.mantleCooldown = Math.max(0, this.mantleCooldown - dt);

    // dirección relativa a cámara
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw) * -1;
    const rz = Math.sin(camYaw) * 1;
    let dx = fx * input.mz + rx * input.mx;
    let dz = fz * input.mz + rz * input.mx;
    const il = Math.hypot(dx, dz);
    if (il > 0.001) {
      dx /= il;
      dz /= il;
    }

    // aceleración horizontal
    const accel = this.grounded ? 34 : 12;
    const tx = dx * SPEED;
    const tz = dz * SPEED;
    const k = Math.min(1, (accel * dt) / Math.max(0.001, SPEED));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // salto con coyote + buffer
    this.timeSinceGround += dt;
    if (input.jump) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.timeSinceGround <= COYOTE) {
      this.jumpBuffer = 0;
      this.timeSinceGround = COYOTE + 1;
      this.vel.y = JUMP_SPEED;
      this.grounded = false;
      this.squash = 1;
      onJump();
    }

    // gravedad
    this.vel.y -= GRAVITY * dt;
    this.vel.y = Math.max(this.vel.y, -34);

    // desplazamiento con colisiones
    const disp = new Vector3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    body.moveWithCollisions(disp);

    // grounded + plataformas móviles
    const ray = new Ray(body.position.add(new Vector3(0, 0.12, 0)), Vector3.Down(), 0.26);
    const pick = this.scene.pickWithRay(ray, (m) => !!(m.metadata && m.metadata.solid));
    this.wasGrounded = this.grounded;
    this.grounded = !!pick && !!pick.hit && this.vel.y <= 0.5;
    if (this.grounded) {
      this.timeSinceGround = 0;
      if (this.vel.y < 0) this.vel.y = -1.8;
      this.groundMesh = (pick?.pickedMesh as Mesh) ?? null;
      const gm = this.groundMesh;
      if (gm && gm.metadata && gm.metadata.ride && gm.metadata.delta instanceof Vector3) {
        body.position.addInPlace(gm.metadata.delta as Vector3);
      }
    } else {
      this.groundMesh = null;
    }

    if (!this.wasGrounded && this.grounded) {
      this.squash = Math.min(-0.7, Math.max(-1.25, this.vel.y * 0.06 - 0.7));
      onLand();
    }
    this.knockCooldown = Math.max(0, this.knockCooldown - dt);

    /* ---------- LEDGE GRAB: segunda oportunidad al borde ---------- */
    if (
      !this.grounded &&
      !this.mantle &&
      this.mantleCooldown <= 0 &&
      this.knockCooldown <= 0 &&
      this.vel.y < 1.2 // en la caída o cerca del ápice
    ) {
      const found = this.findLedge();
      if (found) {
        this.mantle = {
          t: 0,
          dur: 0.52,
          from: body.position.clone(),
          ledge: found.ledge,
          to: found.to,
        };
        this.vel.setAll(0);
        // encarar la repisa
        const d = found.to.subtract(body.position);
        if (Math.abs(d.x) + Math.abs(d.z) > 0.05) this.facing = Math.atan2(d.x, d.z);
        onMantle?.();
        return;
      }
    }

    /* ---------- animación procedural ---------- */
    const hz = Math.hypot(this.vel.x, this.vel.z);
    const sf = Math.min(1, hz / MOVE_SPEED);

    if (hz > 0.6 && il > 0.001) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 12);
    }
    this.visual.position.copyFrom(body.position);
    this.visual.rotation.y = this.facing;

    this.walkPhase += hz * dt * 1.9;
    const ph = this.walkPhase;
    if (this.grounded) {
      const swing = 0.75 * sf;
      this.armL.rotation.x = Math.sin(ph) * swing;
      this.armR.rotation.x = -Math.sin(ph) * swing;
      this.legL.rotation.x = -Math.sin(ph) * swing * 1.1;
      this.legR.rotation.x = Math.sin(ph) * swing * 1.1;
    } else {
      // brazos en pánico adorable al caer
      const up = this.vel.y < -4 ? 2.6 : 1.6;
      this.armL.rotation.x += ((-up + Math.sin(ph * 3) * 0.2) - this.armL.rotation.x) * Math.min(1, dt * 8);
      this.armR.rotation.x += ((-up - Math.sin(ph * 3) * 0.2) - this.armR.rotation.x) * Math.min(1, dt * 8);
      this.legL.rotation.x *= 1 - Math.min(1, dt * 8);
      this.legR.rotation.x *= 1 - Math.min(1, dt * 8);
    }

    // squash & stretch
    this.squash += (0 - this.squash) * Math.min(1, dt * 9);
    const sy = 1 + this.squash * 0.22;
    const sxz = 1 - this.squash * 0.12;
    this.torso.scaling.set(sxz, sy, sxz);
    const bob = this.grounded ? Math.abs(Math.cos(ph)) * 0.05 * sf : 0.02;
    this.visual.position.y = body.position.y + bob;

    // inclinación al correr
    const tiltX = sf * 0.12;
    this.visual.rotation.x = tiltX;
  }
}
