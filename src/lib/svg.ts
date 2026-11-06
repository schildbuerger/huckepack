// Helpers that keep the inline charts' markup small: the charts are drawn in boxes about 1000 units
// wide, so a tenth of a unit is finer than a pixel on any screen.

// a coordinate rounded to a tenth of a unit
export const n1 = (v: number) => Math.round(v * 10) / 10;

// neighbouring runs of the same category joined into one, for strips that draw only the category
// (the runs themselves stay as they are wherever km or stages are shown)
export function mergeRuns<T extends { category: string; fromKm: number; toKm: number }>(runs: T[]): T[] {
  const out: T[] = [];
  for (const r of runs) {
    const last = out.at(-1);
    if (last && last.category === r.category && last.toKm >= r.fromKm) out[out.length - 1] = { ...last, toKm: r.toKm };
    else out.push(r);
  }
  return out;
}

// a number in a path, rounded to a tenth, without a leading zero (".6", "-.4")
const num = (v: number) => String(n1(v)).replace(/^(-?)0\./, "$1.");

// rectangles of one height on one row as one path: the first placed absolutely, each next one moved
// from the one before (after `z` the pen is back at that rectangle's corner), so each costs a few
// characters. `rects` are [x, width] in the chart's units, left to right
export function rectsPath(rects: [number, number][], y: number, h: number): string {
  let out = "";
  let prev: number | null = null;
  for (const [x, w] of rects) {
    const rx = n1(x);
    const rw = num(w);
    out += prev === null ? `M${num(rx)} ${num(y)}` : `m${num(rx - prev)} 0`;
    out += `h${rw}v${num(h)}h-${rw}z`;
    prev = rx;
  }
  return out;
}

// a strip of runs (surfaces) as one path per category, each run a rectangle in it: the same picture
// as a rectangle per run, in far less markup. `x` maps km to the chart's units; runs narrower than
// `minW` are widened to it, so short ones stay visible
export function stripPaths(
  runs: { category: string; fromKm: number; toKm: number }[],
  x: (km: number) => number,
  y: number,
  h: number,
  minW = 0.6,
): { category: string; d: string }[] {
  const byCategory = new Map<string, [number, number][]>();
  for (const r of mergeRuns(runs)) {
    const rects = byCategory.get(r.category) ?? [];
    rects.push([x(r.fromKm), Math.max(x(r.toKm) - x(r.fromKm), minW)]);
    byCategory.set(r.category, rects);
  }
  return [...byCategory].map(([category, rects]) => ({ category, d: rectsPath(rects, y, h) }));
}

// a line thinned to the points that matter at the chart's scale (Douglas-Peucker): every dropped
// point lies within `tol` units of the line drawn, so the picture is the same in far less markup
export function simplify(pts: [number, number][], tol = 0.2): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
