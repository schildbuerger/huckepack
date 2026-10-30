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
  const byCategory = new Map<string, string[]>();
  for (const r of mergeRuns(runs)) {
    const x0 = n1(x(r.fromKm));
    const w = n1(Math.max(x(r.toKm) - x(r.fromKm), minW));
    const d = byCategory.get(r.category) ?? [];
    d.push(`M${x0} ${y}h${w}v${h}h-${w}z`);
    byCategory.set(r.category, d);
  }
  return [...byCategory].map(([category, d]) => ({ category, d: d.join("") }));
}
