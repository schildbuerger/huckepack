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
    continents: t.continents as string[],
    countries: t.countries.map(countryName),
    regions: t.regions,
    lengthKm: totals?.km.value ?? t.length[0]?.km ?? null,
    ascentM: totals?.ascentM.value ?? t.ascent[0]?.m ?? null,
    days: t.days ? ([t.days.min, t.days.max] as [number, number]) : null,
    sac: sacGrade(t)?.value ?? null,
    wildCamping: t.wildCamping?.status ?? null,
    sleeping: t.sleeping?.types ?? [],
    tags: t.tags,
    draft: t.status === "draft",
  };
}

export type TrailSummary = ReturnType<typeof summarize>;

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => countryNames.of(code) ?? code;

export const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" });

export const SLEEPING_LABELS: Record<string, string> = {
  hut: "Huts / rifugi",
  bivouac: "Bivouac shelters",
  campsite: "Campsites",
  hostel: "Hostels",
  guesthouse: "B&Bs and guesthouses",
  hotel: "Hotels",
  monastery: "Monastery guest houses",
  "farm-stay": "Farm stays",
};

export const WILD_CAMPING_LABELS: Record<string, string> = {
  allowed: "Allowed",
  restricted: "Restricted",
  prohibited: "Prohibited",
};
