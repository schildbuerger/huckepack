// Figures derived from a trail record. Nothing here is stored: totals, averages and the SAC
// grade used for filtering are computed from the record, and each result keeps the source
// it was computed from so pages can say where it comes from.
import type { CollectionEntry } from "astro:content";

type Trail = CollectionEntry<"trails">["data"];
type Stage = NonNullable<Trail["stages"]>["list"][number];

export interface Derived<T> {
  value: T;
  source: string;
  how: string; // shown next to the figure, e.g. "sum of the 7 main stages"
}

export function mainStages(t: Trail): Stage[] {
  return t.stages?.list.filter((s) => s.kind === "main") ?? [];
}

export function stageTotals(t: Trail) {
  const main = mainStages(t);
  if (!t.stages || main.length === 0) return undefined;
  const sum = (f: (s: Stage) => number) => main.reduce((a, s) => a + f(s), 0);
  const how = `sum of the ${main.length} main stages`;
  return {
    km: { value: Math.round(sum((s) => s.km) * 10) / 10, source: t.stages.source, how },
    ascentM: { value: sum((s) => s.ascentM), source: t.stages.source, how },
    descentM: { value: sum((s) => s.descentM), source: t.stages.source, how },
  };
}

// Averages per day only when the days and the stage totals come from the same source,
// so figures from different sources are never mixed.
export function perDay(t: Trail) {
  const totals = stageTotals(t);
  if (!totals || !t.days || t.days.source !== totals.km.source) return undefined;
  const days = (t.days.min + t.days.max) / 2;
  const how = `stage totals over ${t.days.min === t.days.max ? t.days.min : `${t.days.min}–${t.days.max}`} days`;
  return {
    km: { value: Math.round((totals.km.value / days) * 10) / 10, source: totals.km.source, how },
    ascentM: { value: Math.round(totals.ascentM.value / days / 10) * 10, source: totals.km.source, how },
  };
}

// CAI grades mapped to the SAC scale for filtering. The scales overlap rather than match;
// E covers SAC T2 to T3, and the lower bound is used.
const CAI_TO_SAC = { T: "T1", E: "T2", EE: "T3", EEA: "T4" } as const;

export function sacGrade(t: Trail): Derived<string> | undefined {
  const d = t.difficulty;
  if (d?.sac) return { value: d.sac.grade, source: d.sac.source, how: "stated" };
  if (d?.cai)
    return { value: CAI_TO_SAC[d.cai.grade], source: d.cai.source, how: `converted from CAI ${d.cai.grade}` };
  return undefined;
}

// The compact record lists and filters work on. Lists show the stage total when there are
// stages, else the first stated length; trail pages show every figure with its source.
export function summarize(id: string, t: Trail) {
  const totals = stageTotals(t);
  return {
    slug: id,
    name: t.name,
    localName: t.localName ?? null,
    aliases: t.aliases,
    continents: t.continents as string[],
    countries: t.countries.map(countryName),
    regions: t.regions,
    lengthKm: totals?.km.value ?? t.length[0]?.km ?? null,
    ascentM: totals?.ascentM.value ?? t.ascent[0]?.m ?? null,
    days: t.days ? ([t.days.min, t.days.max] as [number, number]) : null,
    sac: sacGrade(t)?.value ?? null,
    wildCamping: t.wildCamping?.status ?? null,
    sleeping: sleepingCategories(t.sleeping?.types ?? []) as string[],
    tags: t.tags,
    draft: t.status === "draft",
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

export const sleepingCategories = (types: readonly string[]) =>
  SLEEPING_CATEGORIES.filter((c) => c.types.some((x) => types.includes(x))).map((c) => c.id);

// Water along the trail, rated by the longest stretch of the main route without drinking water.
export const WATER_LEVELS = [
  { id: "frequent", label: "Frequent", maxGapKm: 10, hint: "Drinking water at least every 10 km" },
  { id: "regular", label: "Regular", maxGapKm: 20, hint: "Drinking water at least every 20 km" },
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
const BAR_SAMPLES = 2;
const STEEPEST_SAMPLES = 5;

type Point = [number, number];
type Stretch = { fromKm: number; toKm: number; grade: number; stage: string };

export function gradients(points: Point[], stageStarts: { number: string; km: number }[]) {
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
