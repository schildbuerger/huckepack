// The trail filters, shared by the search page (TrailList) and the guided questions (TrailGuide):
// the slider stops, one filter state, its URL parameters and the test a trail must pass. Sliders
// hold stop indexes; the last stop of days, difficulty and water means "no limit".
import type { SearchTrail } from "./search";

export const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// 8 and 15 are stops so the guide's day ranges (1–3, 4–7, 8–14, 15+) fall on them
export const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 15, 21, 30, 45, 60];
export const DAYS_ALL = DAYS.length - 1;
export const WATER_KM = [5, 10, 15, 20, 25, 30, 40];
export const NATURAL_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
// difficulty levels (src/lib/difficulty.ts LEVELS), the last stop "Any"
export const LEVEL_IDS = ["easy", "moderate", "demanding", "hard"];
export const LEVEL_WORDS = ["Easy", "Moderate", "Demanding", "Hard"];
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
  sacMax: number; // SAC.length: any grade, ungraded trails included
  where: string[]; // continents and countries, any of them; never a continent and one of its countries
  sleep: string[]; // sleeping category ids, all required
  wild: "" | "some" | "allowed";
  waterMax: number; // WATER_KM.length: any
  naturalMin: number; // 0: any
  terrainMax: number; // difficulty level index; LEVEL_IDS.length: any
  climateMax: number;
  effortMax: number;
  land: string[]; // landscape group ids, any of them
}

export const noFilters = (): Filters => ({
  months: [],
  dayLo: 0,
  dayHi: DAYS_ALL,
  sacMax: SAC.length,
  where: [],
  sleep: [],
  wild: "",
  waterMax: WATER_KM.length,
  naturalMin: 0,
  terrainMax: LEVEL_IDS.length,
  climateMax: LEVEL_IDS.length,
  effortMax: LEVEL_IDS.length,
  land: [],
});

export const daysOn = (f: Filters) => f.dayLo > 0 || f.dayHi < DAYS_ALL;
export const sacOn = (f: Filters) => f.sacMax < SAC.length;
export const waterOn = (f: Filters) => f.waterMax < WATER_KM.length;
export const naturalOn = (f: Filters) => f.naturalMin > 0;
export const terrainOn = (f: Filters) => f.terrainMax < LEVEL_IDS.length;
export const climateOn = (f: Filters) => f.climateMax < LEVEL_IDS.length;
export const effortOn = (f: Filters) => f.effortMax < LEVEL_IDS.length;

// the climate a trail asks for: its hardest month among the months picked that lie in its season,
// or its whole season when no month is picked (levels 1–4; null when it has no climate rating)
export function climateLevel(t: SearchTrail, months: number[]) {
  if (!t.climateByMonth.length) return null;
  const season = t.season?.length ? t.season : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ms = months.length ? season.filter((m) => months.includes(m)) : season;
  return ms.length ? Math.max(...ms.map((m) => t.climateByMonth[m - 1])) : null;
}
// a level filter: once set, trails without that rating drop out
const within = (level: number | null, max: number) => level !== null && level - 1 <= max;

export function matches(t: SearchTrail, f: Filters) {
  if (f.months.length && !(t.season && f.months.some((m) => t.season!.includes(m)))) return false;
  // days: the trail's range overlaps the chosen one (the top stop has no upper limit)
  if (daysOn(f) && !(t.days && t.days[0] <= (f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : Infinity) && t.days[1] >= DAYS[f.dayLo]))
    return false;
  if (sacOn(f) && (t.sac === null || SAC.indexOf(t.sac) > f.sacMax)) return false;
  if (f.where.length && !f.where.some((w) => t.continents.includes(w) || t.countries.includes(w))) return false;
  if (f.sleep.length && !f.sleep.every((s) => t.sleeping.includes(s))) return false;
  if (f.wild === "allowed" && t.wildCamping !== "allowed") return false;
  if (f.wild === "some" && t.wildCamping !== "allowed" && t.wildCamping !== "restricted") return false;
  if (waterOn(f) && !(t.water && t.water.gapKm <= WATER_KM[f.waterMax])) return false;
  if (naturalOn(f) && !(t.surface && t.surface.natural * 100 >= NATURAL_PCT[f.naturalMin])) return false;
  if (terrainOn(f) && !within(t.terrainLevel, f.terrainMax)) return false;
  if (climateOn(f) && !within(climateLevel(t, f.months), f.climateMax)) return false;
  if (effortOn(f) && !within(t.effortLevel, f.effortMax)) return false;
  if (f.land.length && !f.land.some((g) => (t.landscape?.[g] ?? 0) >= LANDSCAPE_SHARE)) return false;
  return true;
}

// URL parameters: months=4,5 days=4-7 sac=T3 where=Italy sleep=huts wild=some water=20 natural=50
// terrain=demanding climate=moderate effort=moderate land=forest,bare
export function toParams(f: Filters) {
  const p = new URLSearchParams();
  if (f.months.length) p.set("months", [...f.months].sort((a, b) => a - b).join(","));
  if (daysOn(f)) p.set("days", `${DAYS[f.dayLo]}-${f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : ""}`);
  if (sacOn(f)) p.set("sac", SAC[f.sacMax]);
  if (f.where.length) p.set("where", f.where.join(","));
  if (f.sleep.length) p.set("sleep", f.sleep.join(","));
  if (f.wild) p.set("wild", f.wild);
  if (waterOn(f)) p.set("water", String(WATER_KM[f.waterMax]));
  if (naturalOn(f)) p.set("natural", String(NATURAL_PCT[f.naturalMin]));
  if (terrainOn(f)) p.set("terrain", LEVEL_IDS[f.terrainMax]);
  if (climateOn(f)) p.set("climate", LEVEL_IDS[f.climateMax]);
  if (effortOn(f)) p.set("effort", LEVEL_IDS[f.effortMax]);
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
  return {
    months: list("months").map(Number).filter((m) => m >= 1 && m <= 12),
    dayLo,
    dayHi: Math.max(dayLo, stop(DAYS, hi, DAYS_ALL)),
    sacMax: stop(SAC, p.get("sac"), SAC.length),
    where: list("where"),
    sleep: list("sleep").filter((s) => sleepIds.includes(s)),
    wild: wild === "some" || wild === "allowed" ? wild : "",
    waterMax: stop(WATER_KM, p.get("water"), WATER_KM.length),
    naturalMin: stop(NATURAL_PCT, p.get("natural"), 0),
    terrainMax: stop(LEVEL_IDS, p.get("terrain"), LEVEL_IDS.length),
    climateMax: stop(LEVEL_IDS, p.get("climate"), LEVEL_IDS.length),
    effortMax: stop(LEVEL_IDS, p.get("effort"), LEVEL_IDS.length),
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
