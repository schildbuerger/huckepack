// The trail filters, shared by the search page (TrailList) and the guided questions (TrailGuide):
// the slider stops, one filter state, its URL parameters and the test a trail must pass. Sliders
// hold stop indexes; the last stop of days, difficulty and water means "no limit".
import type { TrailSummary } from "./trails";

export const SAC = ["T1", "T2", "T3", "T4", "T5", "T6"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// 8 and 15 are stops so the guide's day ranges (1–3, 4–7, 8–14, 15+) fall on them
export const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 15, 21, 30, 45, 60];
export const DAYS_ALL = DAYS.length - 1;
export const WATER_KM = [5, 10, 15, 20, 25, 30, 40];
export const NATURAL_PCT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

export interface Filters {
  months: number[];
  dayLo: number;
  dayHi: number;
  sacMax: number; // SAC.length: any grade, ungraded trails included
  where: string; // continent or country name
  sleep: string[]; // sleeping category ids, all required
  wild: "" | "some" | "allowed";
  waterMax: number; // WATER_KM.length: any
  naturalMin: number; // 0: any
}

export const noFilters = (): Filters => ({
  months: [],
  dayLo: 0,
  dayHi: DAYS_ALL,
  sacMax: SAC.length,
  where: "",
  sleep: [],
  wild: "",
  waterMax: WATER_KM.length,
  naturalMin: 0,
});

export const daysOn = (f: Filters) => f.dayLo > 0 || f.dayHi < DAYS_ALL;
export const sacOn = (f: Filters) => f.sacMax < SAC.length;
export const waterOn = (f: Filters) => f.waterMax < WATER_KM.length;
export const naturalOn = (f: Filters) => f.naturalMin > 0;

export function matches(t: TrailSummary, f: Filters) {
  if (f.months.length && !(t.season && f.months.some((m) => t.season!.includes(m)))) return false;
  // days: the trail's range overlaps the chosen one (the top stop has no upper limit)
  if (daysOn(f) && !(t.days && t.days[0] <= (f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : Infinity) && t.days[1] >= DAYS[f.dayLo]))
    return false;
  if (sacOn(f) && (t.sac === null || SAC.indexOf(t.sac) > f.sacMax)) return false;
  if (f.where && !t.continents.includes(f.where) && !t.countries.includes(f.where)) return false;
  if (f.sleep.length && !f.sleep.every((s) => t.sleeping.includes(s))) return false;
  if (f.wild === "allowed" && t.wildCamping !== "allowed") return false;
  if (f.wild === "some" && t.wildCamping !== "allowed" && t.wildCamping !== "restricted") return false;
  if (waterOn(f) && !(t.water && t.water.gapKm <= WATER_KM[f.waterMax])) return false;
  if (naturalOn(f) && !(t.surface && t.surface.natural * 100 >= NATURAL_PCT[f.naturalMin])) return false;
  return true;
}

// URL parameters: months=4,5 days=4-7 sac=T3 where=Italy sleep=huts wild=some water=20 natural=50
export function toParams(f: Filters) {
  const p = new URLSearchParams();
  if (f.months.length) p.set("months", [...f.months].sort((a, b) => a - b).join(","));
  if (daysOn(f)) p.set("days", `${DAYS[f.dayLo]}-${f.dayHi < DAYS_ALL ? DAYS[f.dayHi] : ""}`);
  if (sacOn(f)) p.set("sac", SAC[f.sacMax]);
  if (f.where) p.set("where", f.where);
  if (f.sleep.length) p.set("sleep", f.sleep.join(","));
  if (f.wild) p.set("wild", f.wild);
  if (waterOn(f)) p.set("water", String(WATER_KM[f.waterMax]));
  if (naturalOn(f)) p.set("natural", String(NATURAL_PCT[f.naturalMin]));
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
    where: p.get("where") ?? "",
    sleep: list("sleep").filter((s) => sleepIds.includes(s)),
    wild: wild === "some" || wild === "allowed" ? wild : "",
    waterMax: stop(WATER_KM, p.get("water"), WATER_KM.length),
    naturalMin: stop(NATURAL_PCT, p.get("natural"), 0),
  };
}

// continents, each with the countries trails cross there (the "where" choices)
export function places(trails: TrailSummary[]) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return uniq(trails.flatMap((t) => t.continents)).map((c) => ({
    continent: c,
    countries: uniq(trails.filter((t) => t.continents.includes(c)).flatMap((t) => t.countries)),
  }));
}
