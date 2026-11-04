// The explainer film's data (build time only): the Tour du Mont Blanc, the trail whose Wikipedia articles
// were read most (the popular-trails measure, issue #84; chosen 2026-11-04), boiled down to what the film
// draws: the route's outline, the elevation profile, the ground, the climate, the animals to know
// about, and the sources the trail page names for them.
import { getEntry } from "astro:content";
import { readFileSync } from "node:fs";
import { SKYLINES } from "../skylines";
import type { FilmData } from "./film";

export const FILM_TRAIL = "tour-du-mont-blanc";

let cached: Promise<FilmData> | undefined;
export function filmData() {
  cached ??= build();
  return cached;
}

async function build(): Promise<FilmData> {
  const entry = await getEntry("trails", FILM_TRAIL);
  const d = (await getEntry("derived", FILM_TRAIL))?.data;
  if (!entry || !d?.elevation || !d.water || !d.along || !d.surface || !d.climate) throw new Error(`explainer: ${FILM_TRAIL} lacks derived data`);
  const t = entry.data;
  const routeKm = d.elevation.routeKm;

  // the route's outline from the map line's main stages, equirectangular, the longer side 1
  const fc = JSON.parse(readFileSync(`public/routes/${FILM_TRAIL}.geojson`, "utf8"));
  const coords: [number, number][] = fc.features
    .filter((f: { properties: { kind: string } }) => f.properties.kind === "main")
    .flatMap((f: { geometry: { coordinates: [number, number][] } }) => f.geometry.coordinates);
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = coords.map((c) => c[0] * k), ys = coords.map((c) => -c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0);
  const every = Math.max(1, Math.round(coords.length / 260));
  const loop = coords
    .filter((_, i) => i % every === 0)
    .map((_, j) => {
      const i = j * every;
      return [+((xs[i] - x0 + (span - (x1 - x0)) / 2) / span).toFixed(4), +((ys[i] - y0 + (span - (y1 - y0)) / 2) / span).toFixed(4)] as [number, number];
    });

  // the elevation profile, every ~0.8 km
  const pts = d.elevation.points as [number, number][];
  const step = Math.max(1, Math.round(pts.length / 200));
  const profile = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([km, m]) => [+km.toFixed(2), Math.round(m)] as [number, number]);

  // the ground in 1 km pieces (the commonest category of each), runs of one category joined
  const bins: string[] = [];
  for (let km = 0; km < routeKm; km++) {
    const share: Record<string, number> = {};
    for (const r of d.surface.runs) {
      const o = Math.min(km + 1, r.toKm) - Math.max(km, r.fromKm);
      if (o > 0) share[r.category] = (share[r.category] ?? 0) + o;
    }
    bins.push(Object.entries(share).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown");
  }
  const surface: FilmData["surface"] = [];
  bins.forEach((c, km) => {
    const last = surface.at(-1);
    if (last && last[2] === c) last[1] = Math.min(routeKm, km + 1);
    else surface.push([km, Math.min(routeKm, km + 1), c as FilmData["surface"][number][2]]);
  });

  // the climate as the trail page's chart has it: each month's mean night low and day high at the lowest
  // and the highest point, and the season's months from the record
  const range = (id: "low" | "high") => d.climate!.months.map((m) => [m[id].tmin, m[id].tmax] as [number, number]);
  const climate = { low: range("low"), high: range("high"), season: t.season?.months ?? [] };
  const animals = (t.animals?.list ?? []).map((a) => ({ name: a.name.replace(/\s*\(.*\)$/, ""), kind: a.kind, level: a.level }));
  const sky = SKYLINES[FILM_TRAIL];
  const title = (id: string) => t.sources.find((s) => s.id === id)!.title.split(/[:(]/)[0].trim();

  return {
    slug: FILM_TRAIL,
    name: t.name,
    routeKm,
    loop,
    profile,
    minM: Math.min(...profile.map((p) => p[1])),
    maxM: Math.max(...profile.map((p) => p[1])),
    surface,
    climate,
    animals,
    massif: sky.shapes.map((s) => ({ d: s.d, c: s.c })),
    massifGround: sky.ground,
    sources: [
      `route and ground: ${title(d.water.source)}`,
      `elevation: ${title(d.elevation.source)}`,
      `climate: ${title(d.climate!.source)}`,
      ...(t.animals?.list.length ? [`wildlife: ${[...new Set(t.animals.list.map((a) => title(a.source)))].join(", ")}`] : []),
    ],
  };
}
