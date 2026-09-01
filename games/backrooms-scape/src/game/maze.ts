// ------------------------------------------------------------------
// Backrooms Scape — generación procedural del laberinto
// ------------------------------------------------------------------

export interface CellPos {
  c: number;
  r: number;
}

export interface Maze {
  gw: number; // grid width (odd)
  gh: number; // grid height (odd)
  solid: boolean[][]; // [r][c]
  spawn: CellPos;
  roomCells: CellPos[]; // salas seguras
  exitCell: CellPos;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distancias BFS desde una celda abierta sobre la grilla */
export function bfsDistances(
  solid: boolean[][],
  from: CellPos,
  passable?: (c: number, r: number) => boolean
): number[][] {
  const gh = solid.length;
  const gw = solid[0].length;
  const dist: number[][] = Array.from({ length: gh }, () => new Array<number>(gw).fill(-1));
  const q: CellPos[] = [from];
  dist[from.r][from.c] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const d = dist[cur.r][cur.c];
    const nb: CellPos[] = [
      { c: cur.c + 1, r: cur.r },
      { c: cur.c - 1, r: cur.r },
      { c: cur.c, r: cur.r + 1 },
      { c: cur.c, r: cur.r - 1 },
    ];
    for (const n of nb) {
      if (n.c < 0 || n.r < 0 || n.c >= gw || n.r >= gh) continue;
      if (solid[n.r][n.c]) continue;
      if (passable && !passable(n.c, n.r)) continue;
      if (dist[n.r][n.c] !== -1) continue;
      dist[n.r][n.c] = d + 1;
      q.push(n);
    }
  }
  return dist;
}

/** Camino BFS entre dos celdas (lista de celdas sin incluir origen) */
export function bfsPath(
  solid: boolean[][],
  from: CellPos,
  to: CellPos,
  passable?: (c: number, r: number) => boolean
): CellPos[] {
  const gh = solid.length;
  const gw = solid[0].length;
  const prev = new Map<number, number>();
  const seen = new Set<number>([from.r * gw + from.c]);
  const q: CellPos[] = [from];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    if (cur.c === to.c && cur.r === to.r) {
      const path: CellPos[] = [];
      let key = to.r * gw + to.c;
      while (key !== from.r * gw + from.c) {
        path.unshift({ c: key % gw, r: Math.floor(key / gw) });
        key = prev.get(key)!;
      }
      return path;
    }
    const nb: CellPos[] = [
      { c: cur.c + 1, r: cur.r },
      { c: cur.c - 1, r: cur.r },
      { c: cur.c, r: cur.r + 1 },
      { c: cur.c, r: cur.r - 1 },
    ];
    for (const n of nb) {
      if (n.c < 0 || n.r < 0 || n.c >= gw || n.r >= gh) continue;
      if (solid[n.r][n.c]) continue;
      if (passable && !passable(n.c, n.r)) continue;
      const k = n.r * gw + n.c;
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur.r * gw + cur.c);
      q.push(n);
    }
  }
  return [];
}

export function generateMaze(cellsW: number, cellsH: number, seed: number, requestedRooms = 5): Maze {
  const rand = mulberry32(seed);
  const gw = cellsW * 2 + 1;
  const gh = cellsH * 2 + 1;
  const solid: boolean[][] = Array.from({ length: gh }, () => new Array<boolean>(gw).fill(true));

  // Recursive backtracker (iterativo)
  const stack: CellPos[] = [{ c: 1, r: 1 }];
  solid[1][1] = false;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const dirs: CellPos[] = [
      { c: 2, r: 0 },
      { c: -2, r: 0 },
      { c: 0, r: 2 },
      { c: 0, r: -2 },
    ].filter((d) => {
      const nc = cur.c + d.c;
      const nr = cur.r + d.r;
      return nc > 0 && nr > 0 && nc < gw - 1 && nr < gh - 1 && solid[nr][nc];
    });
    if (!dirs.length) {
      stack.pop();
      continue;
    }
    const d = dirs[Math.floor(rand() * dirs.length)];
    solid[cur.r + d.r / 2][cur.c + d.c / 2] = false;
    solid[cur.r + d.r][cur.c + d.c] = false;
    stack.push({ c: cur.c + d.c, r: cur.r + d.r });
  }

  // Bucles extra: abrir algunas paredes internas para crear rutas alternativas
  const extraOpen = Math.floor(cellsW * cellsH * 0.16);
  for (let i = 0; i < extraOpen; i++) {
    const c = 1 + Math.floor(rand() * (gw - 2));
    const r = 1 + Math.floor(rand() * (gh - 2));
    if (!solid[r][c]) continue;
    const horizontal = !solid[r][c - 1] && !solid[r][c + 1];
    const vertical = !solid[r - 1][c] && !solid[r + 1][c];
    if (horizontal !== vertical) solid[r][c] = false;
  }

  // Plazas abiertas 3x3 ocasionales
  const plazas = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < plazas; i++) {
    const c = 1 + 2 * Math.floor(rand() * cellsW);
    const r = 1 + 2 * Math.floor(rand() * cellsH);
    if (c < 2 || r < 2 || c > gw - 3 || r > gh - 3) continue;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) solid[r + dr][c + dc] = false;
  }

  const spawn: CellPos = { c: 1, r: 1 };
  const dist = bfsDistances(solid, spawn);

  // Recolectar celdas abiertas
  const open: { pos: CellPos; d: number }[] = [];
  for (let r = 1; r < gh - 1; r++)
    for (let c = 1; c < gw - 1; c++)
      if (!solid[r][c] && dist[r][c] > 0) open.push({ pos: { c, r }, d: dist[r][c] });

  // Salas seguras: lejanas al spawn y separadas entre sí
  const far = open.filter((o) => o.d > 12);
  const roomCells: CellPos[] = [];
  const minSep = 7;
  const sorted = [...far].sort(() => rand() - 0.5);
  for (const o of sorted) {
    if (roomCells.length >= requestedRooms) break;
    if (
      roomCells.every(
        (rc) => Math.abs(rc.c - o.pos.c) + Math.abs(rc.r - o.pos.r) >= minSep
      )
    ) {
      roomCells.push(o.pos);
    }
  }
  // Fallback relajado si no alcanzaron
  for (const o of sorted) {
    if (roomCells.length >= requestedRooms) break;
    if (!roomCells.includes(o.pos) && !roomCells.some((rc) => rc.c === o.pos.c && rc.r === o.pos.r)) {
      roomCells.push(o.pos);
    }
  }

  // Salida: celda abierta más lejana que no sea sala
  let exitCell: CellPos = { c: gw - 2, r: gh - 2 };
  let best = -1;
  for (const o of open) {
    if (roomCells.some((rc) => rc.c === o.pos.c && rc.r === o.pos.r)) continue;
    if (o.d > best) {
      best = o.d;
      exitCell = o.pos;
    }
  }

  return { gw, gh, solid, spawn, roomCells, exitCell };
}
