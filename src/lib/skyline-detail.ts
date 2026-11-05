// The skylines' detail (2026-11-05; of a preview of two levels, approach A "Shaded", picked to bring the
// drawings to the explainer hiker's level of detail), flat colours only. The drawings in skylines.ts stay
// as they are; this adds detail shapes to each outline from what it was made of (SHAPE_META): light from
// the left, so every prominent peak of a range has its shadow face in a darker flat colour (and its snow
// a cool shaded part), forested hills and a forested profile ridge get a fringe of tree crowns (rounded
// broadleaves or pointed conifers) with a darker row inside, and water small glints. withDetail() gives a
// skyline's shapes with their details in drawing order, for the trail page's head (TrailSkyline.astro),
// the link-preview image (og-image.ts) and the animals' backdrop (animal-art.ts).
import { SHAPE_META, SKY_W, SKY_H, type Skyline } from "./skylines";

type P = [number, number];
export type Detail = { d: string; c: string };
const G = SKY_H;

// ---- colours: a flat shade (toward black) and a tint (toward white), one colour per shape
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const shade = (c: string, k: number) => hex(rgb(c).map((v) => v * (1 - k)));
export const tint = (c: string, k: number) => hex(rgb(c).map((v) => v + (255 - v) * k));
const isForest = (c: string) => {
  const [r, g, b] = rgb(c);
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  return g > r && g >= b && l < 0.36;
};
const isConifer = (c: string) => {
  const [r, g, b] = rgb(c);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 < 0.3;
};

// ---- an SVG path (absolute M L H V Q C Z, as the helpers write them) sampled into points
export function sample(d: string): P[] {
  const out: P[] = [];
  const tok = d.match(/[MLHVQCAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0, cmd = "", x = 0, y = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === "Z" || cmd === "z") continue;
    if (cmd === "M" || cmd === "L") { x = num(); y = num(); out.push([x, y]); }
    else if (cmd === "H") { x = num(); out.push([x, y]); }
    else if (cmd === "V") { y = num(); out.push([x, y]); }
    else if (cmd === "Q") {
      const [cx, cy, ex, ey] = [num(), num(), num(), num()];
      for (let t = 1; t <= 8; t++) { const u = t / 8; out.push([(1 - u) ** 2 * x + 2 * (1 - u) * u * cx + u * u * ex, (1 - u) ** 2 * y + 2 * (1 - u) * u * cy + u * u * ey]); }
      x = ex; y = ey;
    } else if (cmd === "C") {
      const [c1x, c1y, c2x, c2y, ex, ey] = [num(), num(), num(), num(), num(), num()];
      for (let t = 1; t <= 10; t++) { const u = t / 10, v = 1 - u; out.push([v ** 3 * x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u ** 3 * ex, v ** 3 * y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u ** 3 * ey]); }
      x = ex; y = ey;
    } else if (cmd === "A") { for (let k = 0; k < 5; k++) num(); x = num(); y = num(); out.push([x, y]); }
    else i++;
  }
  return out;
}
// the outline's height at x (its highest point there), or undefined outside it
const heightAt = (line: P[], x: number) => {
  let best: number | undefined;
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    best = best === undefined ? y : Math.min(best, y);
  }
  return best;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: P[]) => `M${pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`;
// a polygon cut to the part above a level (y <= line)
const above = (pts: P[], line: number): P[] => {
  const out: P[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    if (a[1] <= line) out.push(a);
    if (a[1] <= line !== b[1] <= line) out.push([a[0] + ((b[0] - a[0]) * (line - a[1])) / (b[1] - a[1]), line]);
  });
  return out;
};
// deterministic jitter
const jit = (i: number) => Math.abs((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1);

// ---- a range's shadow faces: light from the left, so each prominent peak's slope down to the next
// valley is in shadow, a facet narrowing from that slope to one foot on the ground below the peak
// (SLANT units right of it per unit down); only where the drawn outline follows the points (not in the
// eased ends at the box's edges)
const SLANT = 0.22;
const PROMINENCE = 14;
function shadowFaces(pts: P[], outline: P[] | null): P[][] {
  const top = pts.slice(1, -1);
  const faces: P[][] = [];
  for (let k = 0; k < top.length; k++) {
    const p = top[k];
    const prev = top[k - 1] ?? pts[0];
    const next = top[k + 1] ?? pts[pts.length - 1];
    if (!(p[1] <= prev[1] && p[1] < next[1])) continue; // not a peak
    if (G - p[1] < 18) continue; // too low to show a face
    let v = k + 1;
    while (v < top.length - 1 && top[v + 1][1] >= top[v][1]) v++;
    const slope = top.slice(k + 1, v + 1);
    const last = slope[slope.length - 1] ?? next;
    // only peaks standing clear of the valley beside them (not every notch in a ridge)
    if (last[1] - p[1] < PROMINENCE) continue;
    const foot: P = [p[0] + (G - p[1]) * SLANT, G];
    const face: P[] = [p, ...slope];
    if (v >= top.length - 1 && pts[pts.length - 1][1] >= G) face.push(pts[pts.length - 1]);
    else if (last[0] > foot[0]) face.push([Math.max(foot[0], last[0] - (G - last[1]) * 0.35), G]);
    face.push(foot);
    // the face must lie under the drawn outline (skip faces in the eased ends)
    if (outline && [p, ...slope].some(([x, y]) => { const h = heightAt(outline, x); return h === undefined || Math.abs(h - y) > 3; })) continue;
    // and its feet within the shape's own foot
    const xr = pts[pts.length - 1][0];
    if (face.some(([x]) => x > xr + 1)) continue;
    faces.push(face);
  }
  return faces;
}

// ---- tree crowns along a forested outline: rounded broadleaves, or pointed conifers in dark firs; a
// fringe on the edge (the same colour, so the outline itself turns leafy) and a darker row inside
function crowns(outline: P[], c: string, seed: number): Detail[] {
  const conifer = isConifer(c);
  const xs = outline.filter(([, y]) => y < G - 6).map(([x]) => x);
  if (xs.length < 2) return [];
  const [x0, x1] = [Math.min(...xs) + 14, Math.max(...xs) - 14];
  const fringe: string[] = [], inner: string[] = [];
  for (let x = x0, i = 0; x < x1; i++) {
    const y = heightAt(outline, x);
    const step = conifer ? 13 + jit(seed + i) * 6 : 17 + jit(seed + i) * 8;
    if (y !== undefined && y < G - 8) {
      const s = 0.8 + jit(seed + i + 50) * 0.45;
      if (conifer) {
        const h = 22 * s, w = 6.5 * s;
        fringe.push(`M${r1(x - w)},${r1(y + 4)}L${r1(x)},${r1(y + 4 - h)}L${r1(x + w)},${r1(y + 4)}Z`);
        if (G - y > 34) inner.push(`M${r1(x + 6 - w)},${r1(y + 20)}L${r1(x + 6)},${r1(y + 20 - h)}L${r1(x + 6 + w)},${r1(y + 20)}Z`);
      } else {
        const r = 8.5 * s;
        fringe.push(`M${r1(x - r)},${r1(y + 3)}A${r1(r)},${r1(r)} 0 0 1 ${r1(x + r)},${r1(y + 3)}Z`);
        if (G - y > 30) inner.push(`M${r1(x + 7 - r)},${r1(y + 17)}A${r1(r)},${r1(r * 0.85)} 0 0 1 ${r1(x + 7 + r)},${r1(y + 17)}Z`);
      }
    }
    x += step;
  }
  return [
    { d: fringe.join(" "), c },
    { d: inner.join(" "), c: shade(c, 0.18) },
  ].filter((s) => s.d);
}

// ---- small glints on water, a lighter flat colour
function glints(x0: number, x1: number, y: number, c: string, seed: number): Detail[] {
  const run = Math.max(30, G - y);
  const a = Math.max(x0 + run, 40), b = Math.min(x1 - run, SKY_W - 40);
  const out: string[] = [];
  for (let x = a + 10, i = 0; x < b - 40; i++) {
    const len = 18 + jit(seed + i) * 34, row = y + 5 + (i % 3) * 6;
    if (row < G - 4) out.push(`M${r1(x)},${r1(row)}h${r1(len)}v2.4h${r1(-len)}Z`);
    x += len + 40 + jit(seed + i + 9) * 70;
  }
  return out.length ? [{ d: out.join(" "), c: tint(c, 0.38) }] : [];
}

// the details for one drawn shape, drawn right after it
export function shapeDetail(d: string, c: string, seed: number): Detail[] {
  const m = SHAPE_META.get(d);
  if (!m) return [];
  if (m.kind === "range" && m.pts) {
    const faces = shadowFaces(m.pts, sample(d));
    return faces.length ? [{ d: faces.map(poly).join(" "), c: shade(c, 0.17) }] : [];
  }
  if (m.kind === "snow" && m.pts && m.line !== undefined) {
    const faces = shadowFaces(m.pts, null).map((f) => above(f, m.line!)).filter((f) => f.length > 2);
    return faces.length ? [{ d: faces.map(poly).join(" "), c: "#dce3e8" }] : [];
  }
  if (m.kind === "hills" && isForest(c)) return crowns(sample(d), c, seed);
  if (m.kind === "water" && m.x0 !== undefined) return glints(m.x0, m.x1!, m.y!, c, seed);
  return [];
}

// the trail's own profile, the nearest ridge: tree crowns where its colour is a forest's
export function ridgeDetail(d: string, c: string): Detail[] {
  return isForest(c) ? crowns(sample(d), c, 900) : [];
}

// a skyline's shapes with their details, back to front: each drawn shape followed by its details, the
// trail's profile (when given) with its crowns, then the shapes in front of it
export function withDetail(sky: Skyline, ridge?: string): Detail[] {
  const out: Detail[] = [];
  sky.shapes.forEach((s, i) => out.push(s, ...shapeDetail(s.d, s.c, i * 31)));
  if (ridge) out.push({ d: ridge, c: sky.ridge }, ...ridgeDetail(ridge, sky.ridge));
  (sky.front ?? []).forEach((s, i) => out.push(s, ...shapeDetail(s.d, s.c, 500 + i * 31)));
  return out;
}
