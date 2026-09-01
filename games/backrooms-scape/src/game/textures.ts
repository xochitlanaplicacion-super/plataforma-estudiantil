// ------------------------------------------------------------------
// Texturas procedurales (canvas) — estética backrooms
// ------------------------------------------------------------------
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

function makeTex(scene: Scene, name: string, size: number): { tex: DynamicTexture; ctx: CanvasRenderingContext2D } {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  return { tex, ctx };
}

/** Papel tapiz amarillo con franjas, zócalo y suciedad sutil */
export function makeWallpaper(scene: Scene): DynamicTexture {
  const S = 512;
  const { tex, ctx } = makeTex(scene, "wallpaper", S);
  ctx.fillStyle = "#c3a967";
  ctx.fillRect(0, 0, S, S);

  // Franjas verticales
  for (let x = 0; x < S; x += 64) {
    ctx.fillStyle = "rgba(255,244,200,0.10)";
    ctx.fillRect(x, 0, 30, S - 44);
    ctx.fillStyle = "rgba(70,55,25,0.16)";
    ctx.fillRect(x + 30, 0, 3, S - 44);
  }
  // Motivo rombos tenue
  ctx.strokeStyle = "rgba(90,70,30,0.10)";
  ctx.lineWidth = 2;
  for (let y = 16; y < S - 60; y += 48) {
    for (let x = 0; x < S; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + 24, y);
      ctx.lineTo(x + 44, y + 20);
      ctx.lineTo(x + 24, y + 40);
      ctx.lineTo(x + 4, y + 20);
      ctx.closePath();
      ctx.stroke();
    }
  }
  // Moldura superior
  ctx.fillStyle = "#d8c283";
  ctx.fillRect(0, 0, S, 20);
  ctx.fillStyle = "rgba(60,45,20,0.5)";
  ctx.fillRect(0, 20, S, 4);
  // Zócalo oscuro
  ctx.fillStyle = "#4a3c26";
  ctx.fillRect(0, S - 44, S, 44);
  ctx.fillStyle = "rgba(255,240,200,0.25)";
  ctx.fillRect(0, S - 44, S, 3);
  // Manchas / mugre
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 14 + Math.random() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(60,45,20,0.06)");
    g.addColorStop(1, "rgba(60,45,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Ruido
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,250,220,0.05)" : "rgba(40,30,12,0.06)";
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  tex.update();
  return tex;
}

/** Alfombra mostaza con motas */
export function makeCarpet(scene: Scene): DynamicTexture {
  const S = 512;
  const { tex, ctx } = makeTex(scene, "carpet", S);
  ctx.fillStyle = "#8a7442";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 12000; i++) {
    const v = Math.random();
    ctx.fillStyle =
      v > 0.6
        ? "rgba(210,190,130,0.25)"
        : v > 0.25
          ? "rgba(120,100,55,0.28)"
          : "rgba(60,48,24,0.3)";
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 20 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(50,40,18,0.10)");
    g.addColorStop(1, "rgba(50,40,18,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  tex.update();
  return tex;
}

/** Techo de oficina con rejilla de paneles */
export function makeCeiling(scene: Scene): DynamicTexture {
  const S = 512;
  const { tex, ctx } = makeTex(scene, "ceiling", S);
  ctx.fillStyle = "#b3ab90";
  ctx.fillRect(0, 0, S, S);
  // tiles 4x4
  for (let i = 0; i <= 4; i++) {
    ctx.fillStyle = "rgba(50,45,30,0.55)";
    ctx.fillRect(i * 128 - 2, 0, 4, S);
    ctx.fillRect(0, i * 128 - 2, S, 4);
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,240,0.05)" : "rgba(60,55,35,0.07)";
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // manchas de humedad
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 24 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(90,70,40,0.16)");
    g.addColorStop(1, "rgba(90,70,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  tex.update();
  return tex;
}

/** Sonrisa dentada estilo Venom (blanca, sobre transparente) */
export function makeGrin(scene: Scene): DynamicTexture {
  const W = 256;
  const H = 128;
  const { tex, ctx } = makeTex(scene, "grin", W);
  ctx.clearRect(0, 0, W, H);
  const curve = (x: number) => {
    const t = (x - W / 2) / (W / 2);
    return 18 * (1 - t * t); // arco
  };
  ctx.fillStyle = "#f4f7ff";
  // dientes superiores
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 24;
    const yC = curve(x + 12);
    ctx.beginPath();
    ctx.moveTo(x, 6 + yC * 0.4);
    ctx.lineTo(x + 24, 6 + yC * 0.4);
    ctx.lineTo(x + 12, 52 - yC);
    ctx.closePath();
    ctx.fill();
  }
  // dientes inferiores
  for (let i = 0; i < 8; i++) {
    const x = 32 + i * 24;
    const yC = curve(x + 12);
    ctx.beginPath();
    ctx.moveTo(x, H - 6 - yC * 0.4);
    ctx.lineTo(x + 24, H - 6 - yC * 0.4);
    ctx.lineTo(x + 12, H - 52 + yC);
    ctx.closePath();
    ctx.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Textura del portal: anillos/espiral cian-violeta */
export function makePortal(scene: Scene): DynamicTexture {
  const S = 512;
  const { tex, ctx } = makeTex(scene, "portal", S);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  for (let i = 0; i < 26; i++) {
    const r = 20 + i * 9;
    const hue = 190 + i * 4;
    ctx.strokeStyle = `hsla(${hue}, 95%, ${55 + (i % 3) * 10}%, ${0.75 - i * 0.022})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    const start = i * 0.5;
    ctx.arc(cx, cy, r, start, start + Math.PI * 1.5);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, "rgba(160,220,255,0.5)");
  g.addColorStop(1, "rgba(120,150,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Sprite circular suave para partículas */
export function makeSoftDot(scene: Scene): DynamicTexture {
  const S = 64;
  const { tex, ctx } = makeTex(scene, "softdot", S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Gradiente vertical para haces de luz */
export function makeBeam(scene: Scene): DynamicTexture {
  const W = 64;
  const H = 256;
  const { tex, ctx } = makeTex(scene, "beam", W);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.85, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // fade horizontal
  const gx = ctx.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, "rgba(0,0,0,1)");
  gx.addColorStop(0.5, "rgba(0,0,0,0)");
  gx.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  tex.update();
  tex.hasAlpha = true;
  return tex;
}
