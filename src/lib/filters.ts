// The trail filters, shared by the search page (TrailList) and the guided questions (TrailGuide):
// the slider stops, one filter state, its URL parameters and the test a trail must pass. Sliders
// hold stop indexes; the last stop of days and water means "no limit", and a difficulty range
// from Easy to Hard filters nothing.
import type { SearchTrail } from "./search";

// the SAC grades, for the "easiest first" sort's tie-break (no longer a filter: it is part of terrain)
export const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// 8 and 15 are stops so the guide's day ranges (1–3, 4–7, 8–14, 15+) fall on them
export const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 15, 21, 30, 45, 60];
export const DAYS_ALL = DAYS.length - 1;
export const WATER_KM = [5, 10, 15, 20, 25, 30, 40];
export const NATURAL_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
// difficulty levels (src/lib/difficulty.ts LEVELS); each difficulty filter is a range of them, and
// the whole range (Easy to Hard, LEVEL_TOP) filters nothing, unrated trails included
export const LEVEL_IDS = ["easy", "moderate", "demanding", "hard"];
export const LEVEL_WORDS = ["Easy", "Moderate", "Demanding", "Hard"];
export const LEVEL_TOP = LEVEL_IDS.length - 1;
// landscape groups a trail can be picked by, with their short names; a trail has a landscape when
// at least LANDSCAPE_SHARE of its main route is that group
export const LANDSCAPES = [
  { id: "forest", label: "Forest" },
  { id: "open", label: "Grassland" },
  { id: "moss", label: "Moss" },
  { id: "bare", label: "Rock" },
  { id: "water", label: "Water" },
  { id: "farm", label: "Farmland" },
];
export const LANDSCAPE_SHARE = 0.2;

export interface Filters {
  months: number[];
  dayLo: number;
  dayHi: number;
  where: string[]; // continents and countries, any of them; never a continent and one of its countries
  sleep: string[]; // sleeping category ids, all required
  wild: "" | "some" | "allowed";
  waterMax: number; // WATER_KM.length: any
  naturalMin: number; // 0: any
  // difficulty ranges as level indexes, 0 (Easy) to LEVEL_TOP (Hard); 0 to LEVEL_TOP: any
  terrainMin: number;
  terrainMax: number;
  climateMin: number;
  climateMax: number;
  effortMin: number;
  effortMax: number;
  land: string[]; // landscape group ids, any of them
}

export const noFilters = (): Filters => ({
  months: [],
  dayLo: 0,
  dayHi: DAYS_ALL,
  where: [],
  sleep: [],
  wild: "",
  waterMax: WATER_KM.length,
  naturalMin: 0,
  terrainMin: 0,
  terrainMax: LEVEL_TOP,
  climateMin: 0,
  climateMax: LEVEL_TOP,
  effortMin: 0,
  effortMax: LEVEL_TOP,
  land: [],
});

export const daysOn = (f: Filters) => f.dayLo > 0 || f.dayHi < DAYS_ALL;
export const waterOn = (f: Filters) => f.waterMax < WATER_KM.length;
export const naturalOn = (f: Filters) => f.naturalMin > 0;
export const terrainOn = (f: Filters) => f.terrainMin > 0 || f.terrainMax < LEVEL_TOP;
export const climateOn = (f: Filters) => f.climateMin > 0 || f.climateMax < LEVEL_TOP;
export const effortOn = (f: Filters) => f.effortMin > 0 || f.effortMax < LEVEL_TOP;

// the climate a trail asks for: its hardest month among the months picked that lie in its season,
// or its whole season when no month is picked (levels 1–4; null when it has no climate rating)
export function climateLevel(t: SearchTrail, months: number[]) {
  if (!t.climateByMonth.length) return null;
  const season = t.season?.length ? t.season : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ms = months.length ? season.filter((m) => months.includes(m)) : season;
  return ms.length ? Math.max(...ms.map((m) => t.climateByMonth[m - 1])) : null;
}
// a level filter: once set, trails without that rating drop out
const within = (level: number | null, min: number, max: number) => level !== null && level - 1 >= min && level - 1 <= max;

export function matches(t: SearchTrail, f: Filters) {
  if (f.months.length && !(t.season && f.months.some((m) => t.season!.includes(m)))) return false;
  // days: the trail's range overlaps the chosen one (the top stop has no upper limit)
  if (daysOn(f) && !(t.days && t.days[0] <= (f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : Infinity) && t.days[1] >= DAYS[f.dayLo]))
    return false;
  if (f.where.length && !f.where.some((w) => t.continents.includes(w) || t.countries.includes(w))) return false;
  if (f.sleep.length && !f.sleep.every((s) => t.sleeping.includes(s))) return false;
  if (f.wild === "allowed" && t.wildCamping !== "allowed") return false;
  if (f.wild === "some" && t.wildCamping !== "allowed" && t.wildCamping !== "restricted") return false;
  if (waterOn(f) && !(t.water && t.water.gapKm <= WATER_KM[f.waterMax])) return false;
  if (naturalOn(f) && !(t.surface && t.surface.natural * 100 >= NATURAL_PCT[f.naturalMin])) return false;
  if (terrainOn(f) && !within(t.terrainLevel, f.terrainMin, f.terrainMax)) return false;
  if (climateOn(f) && !within(climateLevel(t, f.months), f.climateMin, f.climateMax)) return false;
  if (effortOn(f) && !within(t.effortLevel, f.effortMin, f.effortMax)) return false;
  if (f.land.length && !f.land.some((g) => (t.landscape?.[g] ?? 0) >= LANDSCAPE_SHARE)) return false;
  return true;
}

// URL parameters: months=4,5 days=4-7 where=Italy sleep=huts wild=some water=20 natural=50
// terrain=moderate-hard climate=moderate effort=moderate land=forest,bare. A difficulty is a range
// "from-to", or one level for "up to" it (the form older links used; an old sac= is ignored)
export function toParams(f: Filters) {
  const p = new URLSearchParams();
  if (f.months.length) p.set("months", [...f.months].sort((a, b) => a - b).join(","));
  if (daysOn(f)) p.set("days", `${DAYS[f.dayLo]}-${f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : ""}`);
  if (f.where.length) p.set("where", f.where.join(","));
  if (f.sleep.length) p.set("sleep", f.sleep.join(","));
  if (f.wild) p.set("wild", f.wild);
  if (waterOn(f)) p.set("water", String(WATER_KM[f.waterMax]));
  if (naturalOn(f)) p.set("natural", String(NATURAL_PCT[f.naturalMin]));
  const level = (min: number, max: number) => (min > 0 ? `${LEVEL_IDS[min]}-${LEVEL_IDS[max]}` : LEVEL_IDS[max]);
  if (terrainOn(f)) p.set("terrain", level(f.terrainMin, f.terrainMax));
  if (climateOn(f)) p.set("climate", level(f.climateMin, f.climateMax));
  if (effortOn(f)) p.set("effort", level(f.effortMin, f.effortMax));
  if (f.land.length) p.set("land", f.land.join(","));
  return p;
}

export function fromParams(p: URLSearchParams, sleepIds: string[]): Filters {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(",") : []);
  const stop = <T>(values: T[], raw: string | null | undefined, fallback: number) => {
    const i = values.findIndex((v) => String(v) === raw);
    return i < 0 ? fallback : i;
  };
  const [lo, hi] = (p.get("days") ?? "").split("-");
  const dayLo = stop(DAYS, lo, 0);
  const wild = p.get("wild");
  // "moderate-hard" is a range, "demanding" means up to it
  const levels = (raw: string | null) => {
    const [a, b] = (raw ?? "").split("-");
    const lo = b === undefined ? 0 : stop(LEVEL_IDS, a, 0);
    return [lo, Math.max(lo, stop(LEVEL_IDS, b ?? a, LEVEL_TOP))];
  };
  const [terrainMin, terrainMax] = levels(p.get("terrain"));
  const [climateMin, climateMax] = levels(p.get("climate"));
  const [effortMin, effortMax] = levels(p.get("effort"));
  return {
    months: list("months").map(Number).filter((m) => m >= 1 && m <= 12),
    dayLo,
    dayHi: Math.max(dayLo, stop(DAYS, hi, DAYS_ALL)),
    where: list("where"),
    sleep: list("sleep").filter((s) => sleepIds.includes(s)),
    wild: wild === "some" || wild === "allowed" ? wild : "",
    waterMax: stop(WATER_KM, p.get("water"), WATER_KM.length),
    naturalMin: stop(NATURAL_PCT, p.get("natural"), 0),
    terrainMin,
    terrainMax,
    climateMin,
    climateMax,
    effortMin,
    effortMax,
    land: list("land").filter((g) => LANDSCAPES.some((l) => l.id === g)),
  };
}

// Pick or unpick a place. A continent stands for all its countries, so choosing one drops its
// countries from the choice, and choosing a country drops the continents it lies in (narrowing
// "Europe" to "Germany"). Places on the same level combine: Germany and Italy, Europe and Asia.
export function toggleWhere(where: string[], value: string, all: ReturnType<typeof places>) {
  if (where.includes(value)) return where.filter((w) => w !== value);
  const continent = all.find((p) => p.continent === value);
  if (continent) return [...where.filter((w) => !continent.countries.includes(w)), value];
  const parents = all.filter((p) => p.countries.includes(value)).map((p) => p.continent);
  return [...where.filter((w) => !parents.includes(w)), value];
}

// continents, each with the countries trails cross there (the "where" choices)
export function places(trails: SearchTrail[]) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return uniq(trails.flatMap((t) => t.continents)).map((c) => ({
    continent: c,
    countries: uniq(trails.filter((t) => t.continents.includes(c)).flatMap((t) => t.countries)),
  }));
}

// what a filter is set to, in words (beside each group's title, on the chips, on the map's buttons)
export const DAY_STOPS = DAYS.map((d, i) => (i === DAYS.length - 1 ? `${d}+` : `${d}`));
export const WATER_STOPS = [...WATER_KM.map((km) => `${km} km`), "Any"];
export const NATURAL_STOPS = NATURAL_PCT.map((n) => (n ? `${n} %` : "Any"));
export const daysText = (f: Filters) =>
  !daysOn(f) ? "Any length" : f.dayLo === f.dayHi ? `${DAY_STOPS[f.dayLo]} days` : `${DAYS[f.dayLo]}–${DAY_STOPS[f.dayHi]} days`;
export const waterText = (f: Filters) => (waterOn(f) ? `Every ${WATER_KM[f.waterMax]} km or less` : "Any");
export const naturalText = (f: Filters) => (naturalOn(f) ? `${NATURAL_PCT[f.naturalMin]} %+ natural` : "Any");
// a difficulty range in words: "Any", "Demanding", "Up to moderate", "Demanding or harder",
// "Moderate to demanding"
export const levelText = (min: number, max: number) =>
  min === 0 && max === LEVEL_TOP
    ? "Any"
    : min === max
      ? LEVEL_WORDS[min]
      : min === 0
        ? `Up to ${LEVEL_WORDS[max].toLowerCase()}`
        : max === LEVEL_TOP
          ? `${LEVEL_WORDS[min]} or harder`
          : `${LEVEL_WORDS[min]} to ${LEVEL_WORDS[max].toLowerCase()}`;
export const monthList = (ms: number[]) => [...ms].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(", ");

// the filters that are set, each with its label and what undoes it (the removable chips)
export function activeFilters(f: Filters, sleeping: { id: string; label: string }[]) {
  const without = <T>(xs: T[], x: T) => xs.filter((y) => y !== x);
  return [
    f.months.length && { label: monthList(f.months), reset: { months: [] } },
    ...f.where.map((w) => ({ label: w, reset: { where: without(f.where, w) } })),
    daysOn(f) && { label: daysText(f), reset: { dayLo: 0, dayHi: DAYS_ALL } },
    terrainOn(f) && { label: `Terrain: ${levelText(f.terrainMin, f.terrainMax).toLowerCase()}`, reset: { terrainMin: 0, terrainMax: LEVEL_TOP } },
    climateOn(f) && { label: `Climate: ${levelText(f.climateMin, f.climateMax).toLowerCase()}`, reset: { climateMin: 0, climateMax: LEVEL_TOP } },
    effortOn(f) && { label: `Effort: ${levelText(f.effortMin, f.effortMax).toLowerCase()}`, reset: { effortMin: 0, effortMax: LEVEL_TOP } },
    ...f.land.map((g) => ({ label: LANDSCAPES.find((l) => l.id === g)!.label, reset: { land: without(f.land, g) } })),
    naturalOn(f) && { label: `At least ${NATURAL_PCT[f.naturalMin]} % natural ground`, reset: { naturalMin: 0 } },
    ...f.sleep.map((id) => ({ label: sleeping.find((c) => c.id === id)?.label ?? id, reset: { sleep: without(f.sleep, id) } })),
    f.wild && { label: f.wild === "allowed" ? "Wild camping allowed" : "Wild camping possible", reset: { wild: "" as const } },
    waterOn(f) && { label: `Water every ${WATER_KM[f.waterMax]} km or less`, reset: { waterMax: WATER_KM.length } },
  ].filter(Boolean) as { label: string; reset: Partial<Filters> }[];
}
