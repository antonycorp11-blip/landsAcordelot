import type { Vec2 } from '../types';

/**
 * Extrai o contorno de uma máscara binária de células e devolve loops de pontos.
 * Cada aresta de fronteira é orientada com a região à esquerda, o que permite
 * costurar os segmentos em laços fechados por simples casamento de pontas.
 */
export function traceMaskContours(
  inside: (i: number, j: number) => boolean,
  w: number,
  h: number,
): Vec2[][] {
  type Key = number;
  const key = (x: number, y: number): Key => y * (w + 2) + x;
  const next = new Map<Key, Key>();
  const pts = new Map<Key, Vec2>();

  const push = (ax: number, ay: number, bx: number, by: number) => {
    const ka = key(ax, ay);
    const kb = key(bx, by);
    pts.set(ka, { x: ax, y: ay });
    pts.set(kb, { x: bx, y: by });
    next.set(ka, kb);
  };

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) push(i, j, i + 1, j);
      if (!inside(i + 1, j)) push(i + 1, j, i + 1, j + 1);
      if (!inside(i, j + 1)) push(i + 1, j + 1, i, j + 1);
      if (!inside(i - 1, j)) push(i, j + 1, i, j);
    }
  }

  const loops: Vec2[][] = [];
  const visited = new Set<Key>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: Vec2[] = [];
    let cur: Key | undefined = start;
    let guard = 0;
    while (cur !== undefined && !visited.has(cur) && guard++ < 200000) {
      visited.add(cur);
      const p = pts.get(cur)!;
      loop.push({ x: p.x, y: p.y });
      cur = next.get(cur);
    }
    if (loop.length > 6) loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  return loops;
}

/** Remove pontos colineares e detalhes menores que `eps` (Douglas–Peucker). */
export function simplify(points: Vec2[], eps: number): Vec2[] {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    const a = points[s];
    const b = points[e];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Suavização de Chaikin em laço fechado — transforma degraus em curvas orgânicas. */
export function chaikin(points: Vec2[], iterations = 2): Vec2[] {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out: Vec2[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
      out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    pts = out;
  }
  return pts;
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-6) return poly[0] ?? { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function boundsOf(poly: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Interpola uma polilinha em `n` pontos (usada para estradas e rios). */
export function resample(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points;
  const out: Vec2[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    while (t < seg) {
      const u = t / seg;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      t += step;
    }
    carry = t - seg;
  }
  out.push(points[points.length - 1]);
  return out;
}
