// Figures derived from a trail record. Nothing here is stored: totals, averages and the SAC
// grade used for filtering are computed from the record, and each result keeps the source
// it was computed from so pages can say where it comes from.
import type { CollectionEntry } from "astro:content";

type Trail = CollectionEntry<"trails">["data"];
type DerivedData = CollectionEntry<"derived">["data"];
type Stage = NonNullable<Trail["stages"]>["list"][number];

export interface Derived<T> {
  value: T;
  source: string;
  how: string; // shown next to the figure, e.g. "sum of the 7 main stages"
}

// Ascent and descent from the terrain model count with a threshold (decided 2026-11-07,
// docs/scope.md): a climb counts only once the height has risen CLIMB_THRESHOLD_M above the last
// reference height, a drop likewise; the reference then moves to that height. Without it every
// metre of the model's noise between the samples adds up (GLO-30's raw sums ran 22 % high in the
// median against 34 official figures; GEDTM30 with 10 m: 0 %). For sums only: gradients, steepness
// and the profile use the raw heights. Same rule as CLIMB_THRESHOLD_M in pipeline/all.py.
export const CLIMB_THRESHOLD_M = 10;
export function climbs(heights: number[], threshold = CLIMB_THRESHOLD_M) {
  let ref = heights[0];
  let up = 0;
  let down = 0;
  for (const h of heights.slice(1)) {
    if (h - ref >= threshold) {
      up += h - ref;
      ref = h;
    } else if (ref - h >= threshold) {
      down += ref - h;
      ref = h;
    }
  }
  return { up, down };
}

export function mainStages(t: Trail): Stage[] {
  return t.stages?.list.filter((s) => s.kind === "main") ?? [];
}

export function stageTotals(t: Trail) {
  const main = mainStages(t);
  if (!t.stages || main.length === 0) return undefined;
  // side trips the trail includes, walked there and back (`outAndBack`, the W Trek's valleys): their
  // km is one way, so they count twice, and their climbs both ways (up out and down back, and the
  // other way round) (2026-11-07)
  const back = t.stages.list.filter((s) => s.outAndBack);
  const sum = (f: (s: Stage) => number) => main.reduce((a, s) => a + f(s), 0);
  const how = `sum of the ${main.length} main stages${back.length ? ` and ${back.length} side trip${back.length > 1 ? "s" : ""} there and back` : ""}`;
  const km = sum((s) => s.km) + back.reduce((a, s) => a + 2 * s.km, 0);
  // ascent and descent only when every stage counted states them (some sources give neither)
  const climbs = [...main, ...back].every((s) => s.ascentM !== undefined && s.descentM !== undefined);
  const backClimb = back.reduce((a, s) => a + (s.ascentM ?? 0) + (s.descentM ?? 0), 0);
  return {
    km: { value: Math.round(km * 10) / 10, source: t.stages.source, how },
    ascentM: climbs ? { value: sum((s) => s.ascentM!) + backClimb, source: t.stages.source, how } : undefined,
    descentM: climbs ? { value: sum((s) => s.descentM!) + backClimb, source: t.stages.source, how } : undefined,
  };
}

// The provider's length: the first stated total where the record has one (stage lists often include
// the paths into the stage towns, e.g. the Moselsteig's 392.8 km against its 365 km), else the sum of
// the main stages (side trips walked there and back counted twice). The trail's length falls back to
// it where our map line doesn't cover the route well enough (trailLength()); the Length popover names
// it as the official figure.
export function providerLength(t: Trail) {
  const stated = t.length[0];
  if (stated) return { value: stated.km, source: stated.source, how: "stated total", approx: stated.approx ?? false, measured: false as const };
  const totals = stageTotals(t);
  return totals ? { ...totals.km, approx: false, measured: false as const } : null;
}

// The provider's ascent and descent: the stated pair where the record states both from one source
// (ascent and descent never from different sources in one tile), else the sums of the main stages
// when every stage states both; undefined when neither exists. The trail's climbs fall back to it
// where our map line doesn't cover the route well enough (trailClimb()); the popover names it as the
// official figure, and pipeline/all.py's check compares it with the terrain model's.
export function providerClimb(t: Trail) {
  const up = t.ascent[0];
  const down = t.descent.find((d) => d.source === up?.source);
  if (up && down) return { up: up.m, down: down.m, source: up.source, how: "stated total" };
  const totals = stageTotals(t);
  return totals?.ascentM && totals.descentM
    ? { up: totals.ascentM.value, down: totals.descentM.value, source: totals.ascentM.source, how: totals.ascentM.how }
    : undefined;
}

// The terrain model's ascent and descent over the main route: each main stage's climbs and drops along
// its own samples with the 10 m threshold, to 10 m, summed (as stageEstimates() has them per stage),
// or over the whole route for a trail without stages (routeEstimate()). Undefined without a profile or
// where a main stage has no samples. The profile samples the main stages only: side trips walked
// there and back are not in it.
export function terrainClimb(t: Trail, d?: DerivedData) {
  const e = d?.elevation;
  if (!e?.points.length) return undefined;
  if (noStages(t) || !t.stages) {
    const r = routeEstimate(d)!;
    return { up: r.ascentM, down: r.descentM, source: r.source };
  }
  const to10 = (m: number) => Math.round(m / 10) * 10;
  const main = mainStages(t);
  let up = 0;
  let down = 0;
  for (const s of main) {
    const i = e.stageStarts.findIndex((x) => x.number === s.number);
    if (i < 0) return undefined;
    const from = e.stageStarts[i].km;
    const to = e.stageStarts[i + 1]?.km ?? Infinity;
    const pts = e.points.filter(([km]) => km >= from && km < to);
    if (!pts.length) return undefined;
    const c = climbs(pts.map((p) => p[1]));
    up += to10(c.up);
    down += to10(c.down);
  }
  return main.length ? { up, down, source: e.source } : undefined;
}

// The trail's total ascent and descent, the one figure every page shows (key figure, search and
// home-page cards, the link preview, the averages per stage or day, the difficulty's climbing per km,
// sorting): the terrain model's estimate along our map line (the user's decision of 2026-11-07,
// docs/scope.md; `estimate`, shown with ≈), used where the route is at least MEASURED_MIN_COVER
// matched (the same gate as the length, measuredCover()); else the provider's figure
// (providerClimb()); else, where no source states one, the estimate all the same.
export const CLIMB_HOW = "estimated from the terrain model along our OpenStreetMap line";
export function trailClimb(t: Trail, d?: DerivedData) {
  const est = terrainClimb(t, d);
  const cover = measuredCover(t, d);
  const covered = cover !== null && cover >= MEASURED_MIN_COVER;
  if (est && covered) return { ...est, how: CLIMB_HOW, estimate: true as const };
  const p = providerClimb(t);
  if (p) return { ...p, estimate: false as const };
  return est ? { ...est, how: CLIMB_HOW, estimate: true as const } : undefined;
}

// What the ascent key figure's popover says, like the Length popover: the trail's figure, the
// provider's as "Official" (the stated total, else the stage sums), whether the two lie more than 10 %
// apart (ascent or descent; "Keep in mind"), and the map line's coverage where it falls short of
// MEASURED_MIN_COVER (why the provider's figure is shown, or why the estimate stands alone).
export function climbFacts(t: Trail, d?: DerivedData) {
  const climb = trailClimb(t, d);
  const official = providerClimb(t);
  const cover = measuredCover(t, d);
  const off = (a: number, b: number) => Math.abs(a - b) > 0.1 * b;
  return {
    climb,
    official,
    short: cover !== null && cover < MEASURED_MIN_COVER ? cover : null,
    apart: Boolean(climb?.estimate && official && (off(climb.up, official.up) || off(climb.down, official.down))),
  };
}

// How much of the measured route our map line matches (pipeline/routes.py): over the stages that count
// in the derived `measured.km` (main stages, plus side trips the record marks `outAndBack`, counted
// twice), each weighted by its length. Null without a measurement.
export function measuredCover(t: Trail, d?: DerivedData) {
  const m = d?.measured;
  if (!m) return null;
  const back = new Set((t.stages?.list ?? []).filter((s) => s.outAndBack).map((s) => `${s.kind} ${s.number}`));
  let km = 0;
  let matched = 0;
  for (const s of m.stages) {
    const w = s.kind === "main" ? 1 : back.has(`${s.kind} ${s.number}`) ? 2 : 0;
    km += w * s.km;
    matched += w * s.km * s.covered;
  }
  return km > 0 ? matched / km : null;
}

// The length measured on our map line (the full OSM match, pipeline/routes.py), to a tenth of a km:
// one method for every trail (the user's decision, 2026-11-07, docs/scope.md), used where the route
// it measures is at least MEASURED_MIN_COVER matched overall (measuredCover(), weighted by stage
// length), since a stretch the match shortcuts would come out short.
export const MEASURED_MIN_COVER = 0.95;
export function measuredLength(t: Trail, d?: DerivedData) {
  const m = d?.measured;
  const cover = measuredCover(t, d);
  return m && cover !== null && cover >= MEASURED_MIN_COVER ? { value: m.km, source: m.source, cover } : null;
}

// The trail's length, the one total every page shows (key figure, title, description, link preview,
// search and home-page cards, the A–Z list, sorting and totals): our measurement in whole kilometres
// (a measurement shouldn't look more precise than it is; `exact` keeps its tenth for the popover),
// else the provider's figure (providerLength()).
export function trailLength(t: Trail, d?: DerivedData) {
  const m = measuredLength(t, d);
  if (m)
    return { value: Math.round(m.value), exact: m.value, source: m.source, how: "measured on our OpenStreetMap line", approx: false, measured: true as const };
  return providerLength(t);
}

// the length to compare trails by: the same total as trailLength() (sorting, climbing per km, totals)
export function compareLength(t: Trail, d?: DerivedData) {
  return trailLength(t, d)?.value ?? null;
}

// The trail's days as the record states them, with where they come from (the user's rule of
// 2026-11-07, docs/scope.md): `operator`, `secondary`, or `stages` (one day per main stage of the
// operator's stage list, recorded as such). Undefined where none fits: nothing is derived here, so a
// trail without days shows none rather than a guess.
export function trailDays(t: Trail) {
  if (!t.days) return undefined;
  const { min, max, basis, source } = t.days;
  return { min, max, basis, source };
}

// Averages per stage (issue #148, decided 2026-11-02): the main stages' totals over their number, so
// they come from one source and every trail with stages has them (before, averages per day showed only
// where the days and the stages shared a source). The ascent is the trail's total (trailClimb(), the
// terrain model's estimate since 2026-11-07, ≈) over the number of main stages, so the averages match
// the key figure.
export function perStage(t: Trail, d?: DerivedData) {
  const totals = stageTotals(t);
  const main = mainStages(t);
  if (!totals || !main.length) return undefined;
  const n = main.length;
  const to10 = (m: number) => Math.round(m / n / 10) * 10;
  const climb = trailClimb(t, d);
  const ascentM = climb ? { value: to10(climb.up), est: climb.estimate, source: climb.source } : undefined;
  return { km: Math.round((totals.km.value / n) * 10) / 10, ascentM, stages: n, source: totals.km.source };
}

// Trails without stages by design (stages.none, issue #204; docs/scope.md "Trails without stages"):
// hikers choose their own camps, so the page has no stages section and names kilometres, not stages.
export const noStages = (t: Trail) => Boolean(t.stages?.none);

// The whole main route's ascent and descent from the terrain model (the climbs and drops along the
// 100 m samples with the 10 m threshold, climbs(), to 10 m), for a trail without stages whose
// source states none.
export function routeEstimate(d?: DerivedData) {
  const pts = d?.elevation?.points;
  if (!pts?.length) return undefined;
  const to10 = (m: number) => Math.round(m / 10) * 10;
  const c = climbs(pts.map((p) => p[1]));
  return {
    ascentM: to10(c.up),
    descentM: to10(c.down),
    source: d!.elevation!.source,
  };
}

// Averages per day for a trail without stages (issue #204): the length, ascent and descent over the
// suggested days. A range of days gives a range (`min` from the most days, `max` from the fewest),
// never a midpoint; the length and the days may come from different sources, both named. Climbs are
// the trail's total (trailClimb(): the terrain model's estimate, `est`, else the provider's).
// Undefined for trails with stages.
export function perDay(t: Trail, d?: DerivedData) {
  if (!noStages(t) || !t.days) return undefined;
  // the trail's length as the page shows it (ours where measured, 2026-11-07), so the averages per day
  // and the key figure are one figure; the unrounded measurement where there is one
  const total = trailLength(t, d);
  const length = total ? { ...total, value: "exact" in total && typeof total.exact === "number" ? total.exact : total.value } : null;
  if (!length) return undefined;
  const { min, max } = t.days;
  const climb = trailClimb(t, d);
  const up = climb?.up;
  const down = climb?.down;
  const to10 = (m: number) => Math.round(m / 10) * 10;
  const range = (total: number, round: (x: number) => number) => ({ min: round(total / max), max: round(total / min) });
  return {
    km: range(length.value, (x) => Math.round(x * 10) / 10),
    ascentM: up !== undefined ? range(up, to10) : undefined,
    descentM: down !== undefined ? range(down, to10) : undefined,
    est: climb?.estimate ?? false,
    days: { min, max },
    lengthSource: length.source,
    climbSource: climb?.source,
    daysSource: t.days.source,
  };
}

// CAI grades mapped to the SAC scale for filtering. The scales overlap rather than match;
// E covers SAC T2 to T3, and the lower bound is used.
const CAI_TO_SAC = { T: "T1", E: "T2", EE: "T3", EEA: "T4" } as const;
const CAI_SPAN = { T: "T1", E: "T2 to T3", EE: "T3 to T4", EEA: "T4 to T5" } as const;

// The SAC grade: stated by a source, converted from the Italian CAI scale, or estimated by us
// from the source's description. `basis` says how a converted or estimated grade was reached.
export function sacGrade(t: Trail): (Derived<string> & { basis?: string }) | undefined {
  const d = t.difficulty;
  if (d?.sac) return { value: d.sac.grade, source: d.sac.source, how: "stated" };
  if (d?.cai)
    return {
      value: CAI_TO_SAC[d.cai.grade],
      source: d.cai.source,
      how: `converted from CAI ${d.cai.grade}`,
      basis: `The trail is graded ${d.cai.grade} on the Italian CAI scale, which spans SAC ${CAI_SPAN[d.cai.grade]}; the lower grade is shown.`,
    };
  if (d?.estimated)
    return { value: d.estimated.sac, source: d.estimated.source, how: "our estimate", basis: d.estimated.basis };
  return undefined;
}

// Said wherever the SAC grade is explained (trail page): SAC_NOTE as fact rows for the info box
export const SAC_FACTS: [string, string][] = [
  ["Scale", "The Swiss Alpine Club's hiking scale, from T1 (easy) to T6 (very hard)"],
  ["Why", "Trails rate difficulty in many local scales, or only in words; we translate each into this one so trails compare"],
  ["Keep in mind", "An estimate: how hard a trail feels depends on your fitness, experience, pack and the weather"],
];
export const SAC_NOTE =
  "Trails rate their difficulty in many local scales, or only describe it in words. We translate each rating into the Swiss Alpine Club's hiking scale, from T1 (easy) to T6 (very hard), so trails can be compared. It stays an estimate: how hard a trail feels depends on your fitness, experience, pack and the weather."

// The compact record lists and filters work on. Lists show the trail's length (trailLength(): measured,
// else the provider's); trail pages show every figure with its source. With the
// trail's derived data (the pipeline's output) it also carries what the search page filters and
// previews: water, surfaces and a coarse elevation profile.
const PROFILE_POINTS = 80;

export function summarize(id: string, t: Trail, d?: DerivedData) {
  const step = d?.elevation ? Math.max(1, Math.floor(d.elevation.points.length / PROFILE_POINTS)) : 1;
  return {
    slug: id,
    name: t.name,
    localName: t.localName ?? null,
    aliases: t.aliases,
    continents: t.continents as string[],
    countries: t.countries.map(countryName),
    regions: t.regions,
    lengthKm: trailLength(t, d)?.value ?? null, // measured, else the provider's (trailLength())
    compareKm: compareLength(t, d), // for sorting and totals: the same figure
    // the terrain model's estimate, else the provider's (trailClimb()); `climbEst` says which
    ascentM: trailClimb(t, d)?.up ?? null,
    climbEst: trailClimb(t, d)?.estimate ?? false,
    // the record's days (trailDays); null where no source gives any, which only a days filter leaves out
    days: ((d) => (d ? ([d.min, d.max] as [number, number]) : null))(trailDays(t)),
    sac: sacGrade(t)?.value ?? null,
    wildCamping: t.wildCamping?.status ?? null,
    sleeping: sleepingCategories(t.sleeping?.types ?? [], d?.along?.beds.byGroup) as string[],
    tags: t.tags,
    season: t.season?.months ?? null,
    start: t.termini.start.name,
    end: t.termini.end.name,
    // clean water as the trail page rates it (drinking water or a refill at a place to sleep,
    // issue #119), and any water (springs too) for the water filter's "any water"
    water: d?.water
      ? (() => {
          const gaps = d.along?.water?.longestGapKm;
          const gapKm = (gaps?.clean ?? d.water.longestGapKm.drinking).km;
          return { level: waterLevel(gapKm).id, gapKm, treatGapKm: (gaps?.refill ?? d.water.longestGapKm.any).km };
        })()
      : null,
    // the longest stretches without a shop and without a bed (pipeline/along.py; issues #96, #97)
    shopGapKm: d?.along?.resupply.longestGapKm.km ?? null,
    bedGapKm: d?.along?.beds.longestGapKm.km ?? null,
    surface: d?.surface
      ? { natural: d.surface.totals.natural?.share ?? 0, gravel: d.surface.totals.gravel?.share ?? 0, paved: d.surface.totals.paved?.share ?? 0 }
      : null,
    // [km, metres], every nth sample, the last one always included
    profile: d?.elevation
      ? d.elevation.points.filter((_, i, all) => i % step === 0 || i === all.length - 1)
      : null,
    highestM: d?.elevation?.highest.m ?? null,
    lowestM: d?.elevation?.lowest.m ?? null,
  };
}

export type TrailSummary = ReturnType<typeof summarize>;

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => countryNames.of(code) ?? code;

export const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" });

// Labels for the sleeping types, in sentence case. Generic on purpose: they cover every
// country, so local names (rifugi, refugios, gîtes) belong in a trail's own text, not here.
export const SLEEPING_LABELS: Record<string, string> = {
  hut: "Mountain huts",
  bivouac: "Bivouac shelters",
  campsite: "Campsites",
  hostel: "Hostels and hiker lodges",
  guesthouse: "B&Bs and guesthouses",
  hotel: "Hotels",
  monastery: "Monastery guesthouses",
  "farm-stay": "Farm stays",
};

// The sleeping types grouped by what they mean for planning: what you carry, what you pay.
// Every type belongs to exactly one category. Wild camping has no types: it comes from the
// trail's `wildCamping` rule.
export const SLEEPING_CATEGORIES = [
  {
    id: "wild-camping",
    label: "Wild camping",
    hint: "Pitching a tent outside campsites. Whether it is allowed, restricted or prohibited depends on the land and the country; the rule for this trail is below the cards.",
    types: [],
  },
  {
    id: "camping",
    label: "Camping",
    hint: "Official campsites along the trail. Bring your own tent.",
    types: ["campsite"],
  },
  {
    id: "huts",
    label: "Huts",
    hint: "Mountain huts (often staffed, with meals) and unstaffed bivouac shelters, usually on the trail itself.",
    types: ["hut", "bivouac"],
  },
  {
    id: "hostels",
    label: "Hostels",
    hint: "Dormitory beds for walkers: hostels, hiker lodges and pilgrim hostels.",
    types: ["hostel"],
  },
  {
    id: "rooms",
    label: "Rooms",
    hint: "Private rooms, usually in villages near the trail: B&Bs, guesthouses, hotels, farm stays and monastery guesthouses.",
    types: ["guesthouse", "hotel", "farm-stay", "monastery"],
  },
] as const;

// A category is available where the trail's source lists one of its types, or where OpenStreetMap
// maps at least OSM_SLEEP_MIN places of it along the route (the derived `along.beds.byGroup`,
// pipeline/along.py; 2026-11-01): official lists often name only rooms. A stray one or two places
// (a lodge at a trailhead) don't count. The trail page, the search filter and the cards share it.
export const OSM_SLEEP_MIN = 3;
export const sleepingCategories = (types: readonly string[], mapped: Partial<Record<string, number>> = {}) =>
  SLEEPING_CATEGORIES.filter((c) => c.types.some((x) => types.includes(x)) || (mapped[c.id] ?? 0) >= OSM_SLEEP_MIN).map(
    (c) => c.id,
  );

// Water along the trail, rated by the longest stretch of the main route without clean water:
// drinking water or a refill at a place to sleep (issue #119, decided 2026-11-01).
export const WATER_LEVELS = [
  { id: "frequent", label: "Frequent", maxGapKm: 10, hint: "Clean water (a tap, or a refill at a place to sleep) at least every 10 km" },
  { id: "regular", label: "Regular", maxGapKm: 20, hint: "Clean water at least every 20 km" },
  { id: "scarce", label: "Scarce", maxGapKm: Infinity, hint: "Stretches of more than 20 km without" },
] as const;

export const waterLevel = (longestGapKm: number) => WATER_LEVELS.find((l) => longestGapKm <= l.maxGapKm)!;

// The SAC hiking scale (Swiss Alpine Club) in plain words.
export const SAC_SCALE: Record<string, { name: string; text: string }> = {
  T1: { name: "Hiking", text: "Well-made paths, mostly flat or gently sloping. No risk of falling; trainers are enough." },
  T2: {
    name: "Mountain hiking",
    text: "A continuous path, steep in places, where a fall can't be ruled out. Be sure-footed; wear hiking boots.",
  },
  T3: {
    name: "Demanding mountain hiking",
    text: "The path is not always visible; exposed spots may have chains or ropes, and you may need your hands for balance.",
  },
  T4: {
    name: "Alpine hiking",
    text: "Often no path. Hands are needed in places, terrain is exposed, and there can be easy snowfields.",
  },
  T5: {
    name: "Demanding alpine hiking",
    text: "Mostly pathless, with easy climbing and exposed, demanding terrain. Needs alpine experience.",
  },
  T6: {
    name: "Difficult alpine hiking",
    text: "Pathless, very exposed, with climbing and glaciers. For experienced mountaineers only.",
  },
};

export const WILD_CAMPING_LABELS: Record<string, string> = {
  allowed: "Allowed",
  restricted: "Restricted",
  prohibited: "Prohibited",
};

// Gradients along the main route, from the elevation profile ([km, metres] every ~100 m), in the
// direction of travel. Measured within each stage only: consecutive stages on the map line don't
// always join (a few hundred metres apart in places), and a gradient across that jump is not real.
// Bars are 200 m long (two samples), which also smooths the terrain model's noise; the steepest
// climb and descent are the steepest 500 m. A terrain model with a 90 m grid flattens and blurs
// short pitches, so real gradients differ in places.
export const STEEP_PERCENT = 15;
// samples per bar and per steepest stretch: 200 m and 500 m at the usual 100 m spacing; trails over
// 1,000 km are sampled every 500 m (pipeline/elevation.py), so their bars are 500 m
const barSamples = (spacingM: number) => Math.max(1, Math.round(200 / spacingM));
const steepestSamples = (spacingM: number) => Math.max(1, Math.round(500 / spacingM));
export const barMetres = (spacingM = 100) => barSamples(spacingM) * spacingM;

type Point = [number, number];
type Stretch = { fromKm: number; toKm: number; grade: number; stage: string };

export function gradients(points: Point[], stageStarts: { number: string; km: number }[], spacingM = 100) {
  const BAR_SAMPLES = barSamples(spacingM);
  const STEEPEST_SAMPLES = steepestSamples(spacingM);
  const grade = (a: Point, b: Point) => ((b[1] - a[1]) / ((b[0] - a[0]) * 1000)) * 100;
  const stageOf = (km: number) => [...stageStarts].reverse().find((s) => km >= s.km)?.number ?? "";
  const byStage = new Map<string, Point[]>();
  for (const p of points) byStage.set(stageOf(p[0]), [...(byStage.get(stageOf(p[0])) ?? []), p]);

  const bars: Stretch[] = [];
  const windows: (Stretch & { changeM: number })[] = [];
  for (const [stage, pts] of byStage) {
    for (let i = 0; i + 1 < pts.length; i += BAR_SAMPLES) {
      const a = pts[i];
      const b = pts[Math.min(i + BAR_SAMPLES, pts.length - 1)];
      bars.push({ fromKm: a[0], toKm: b[0], grade: Math.round(grade(a, b) * 10) / 10, stage });
    }
    for (let i = 0; i + STEEPEST_SAMPLES < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + STEEPEST_SAMPLES]];
      windows.push({ fromKm: a[0], toKm: b[0], grade: Math.round(grade(a, b)), changeM: b[1] - a[1], stage });
    }
  }
  const steepKm = (keep: (g: number) => boolean) =>
    Math.round(bars.filter((b) => keep(b.grade)).reduce((sum, b) => sum + (b.toKm - b.fromKm), 0) * 10) / 10;
  return {
    bars,
    climb: windows.reduce((a, b) => (b.grade > a.grade ? b : a)),
    descent: windows.reduce((a, b) => (b.grade < a.grade ? b : a)),
    steepUpKm: steepKm((g) => g >= STEEP_PERCENT),
    steepDownKm: steepKm((g) => g <= -STEEP_PERCENT),
    maxAbs: Math.max(...bars.map((b) => Math.abs(b.grade))),
  };
}

// Walking time by DIN 33466 (German hiking standard): 4 km/h on the flat, 300 m/h up, 500 m/h
// down; the larger of the flat and the climbing time plus half the smaller. Rounded to 15 min.
export function walkingMinutes(km: number, ascentM: number, descentM: number) {
  const flat = km / 4;
  const climb = ascentM / 300 + descentM / 500;
  return Math.round(((Math.max(flat, climb) + Math.min(flat, climb) / 2) * 60) / 15) * 15;
}

// Estimates for stage figures a trail's source doesn't publish, per stage number, from the
// elevation profile (main stages only, the profile's extent): start and end height, and ascent
// and descent (the climbs and drops along the 100 m samples with the 10 m threshold, climbs()),
// all to 10 m; and the walking
// time from the stage's own stated distance, ascent and descent (walkingMinutes; never from
// estimated climbs, so a time doesn't mix sources). Published figures are never replaced; the
// page marks these as estimates.
type StageEstimate = { startEleM?: number; endEleM?: number; ascentM?: number; descentM?: number; minutes?: number };
export function stageEstimates(t: Trail, d?: DerivedData) {
  const out = new Map<string, StageEstimate>();
  const e = d?.elevation;
  const to10 = (m: number) => Math.round(m / 10) * 10;
  for (const s of t.stages?.list ?? []) {
    const est: StageEstimate = {};
    if (!s.minutes && s.ascentM !== undefined && s.descentM !== undefined)
      est.minutes = walkingMinutes(s.km, s.ascentM, s.descentM);
    const i = e?.stageStarts.findIndex((x) => x.number === s.number) ?? -1;
    if (e && s.kind === "main" && i >= 0) {
      const from = e.stageStarts[i].km;
      const to = e.stageStarts[i + 1]?.km ?? Infinity; // the next stage starts after a gap on the map line
      const pts = e.points.filter(([km]) => km >= from && km < to);
      if (pts.length) {
        // to 10 m: the terrain model is a 30 m grid, so its heights are estimates
        if (s.startEleM === undefined && s.endEleM === undefined) {
          est.startEleM = to10(pts[0][1]);
          est.endEleM = to10(pts.at(-1)![1]);
        }
        if (s.ascentM === undefined && s.descentM === undefined) {
          // along the stage's own samples with the 10 m threshold: each stage starts fresh
          const c = climbs(pts.map((p) => p[1]));
          est.ascentM = to10(c.up);
          est.descentM = to10(c.down);
        }
      }
    }
    if (Object.keys(est).length) out.set(s.number, est);
  }
  return out;
}
