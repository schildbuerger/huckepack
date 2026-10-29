// Difficulty in three dimensions, each rated on the same four levels for every trail, from the
// record and the pipeline's derived data only (docs/difficulty.md).
//
// The rule is the same everywhere: each measure has three fixed thresholds that split it into
// levels 1 to 4, and a dimension takes the level of its hardest measure (so the page can say
// what set it). Nothing is weighted or averaged.
//
//   Terrain  the path grade (SAC), climbing per km, steep stretches, natural ground
//   Climate  heat, cold, wet days, snow, wind, per month; the trail's rating spans its season
//   Effort   the longest day's walking time
import type { CollectionEntry } from "astro:content";
import { gradients, mainStages, sacGrade, stageEstimates, stageTotals, walkingMinutes, STEEP_PERCENT } from "./trails";

type Trail = CollectionEntry<"trails">["data"];
type DerivedData = CollectionEntry<"derived">["data"];

export const LEVELS = ["Easy", "Moderate", "Demanding", "Hard"] as const;
export type Level = 1 | 2 | 3 | 4;

// a measure's scale: three thresholds, and whether higher values are harder ("up") or lower ones
// ("down"); `strict` puts a value on a threshold in the band below; `cap` keeps a measure that
// alone can't make a trail hard below 4. `bands` names the four bands, `from` where it comes from.
type Scale = {
  label: string;
  at: [number, number, number];
  dir: "up" | "down";
  strict?: boolean;
  cap?: Level;
  bands: [string, string, string, string];
  from: string;
};

export const SCALES = {
  sac: { label: "Path grade", at: [2, 3, 4], dir: "up", bands: ["T1", "T2", "T3", "T4 to T6"], from: "the trail's SAC grade, stated, converted or estimated" },
  climb: { label: "Climbing", at: [15, 30, 50], dir: "up", bands: ["under 15 m per km", "15–30 m", "30–50 m", "50 m or more"], from: "ascent of the main stages over their length" },
  steep: {
    label: "Steep stretches",
    at: [5, 15, 30],
    dir: "up",
    bands: ["under 5 %", "5–15 %", "15–30 %", "30 % or more"],
    from: `share of the route steeper than ${STEEP_PERCENT} %, up or down (terrain model)`,
  },
  ground: {
    label: "Natural ground",
    at: [33, 66, 101],
    dir: "up",
    cap: 3,
    bands: ["under a third", "a third to two thirds", "two thirds or more", "–"],
    from: "share on footpaths and trails (OpenStreetMap); never Hard on its own",
  },
  heat: { label: "Heat", at: [22, 27, 32], dir: "up", bands: ["under 22 °C", "22–27 °C", "27–32 °C", "32 °C or more"], from: "mean daily high at the lowest point" },
  cold: { label: "Cold", at: [8, 3, -2], dir: "down", bands: ["8 °C or more", "3–8 °C", "−2 to 3 °C", "below −2 °C"], from: "mean nightly low at the highest point" },
  wet: { label: "Wet days", at: [10, 14, 18], dir: "up", bands: ["under 10", "10–14", "14–18", "18 or more"], from: "days a month with 1 mm of rain or more, the wetter of both points" },
  snow: { label: "Snow", at: [1, 3, 6], dir: "up", bands: ["under 1 day", "1–3 days", "3–6 days", "6 days or more"], from: "days a month with 1 cm of snow or more at the highest point" },
  wind: {
    label: "Wind",
    at: [15, 20, 25],
    dir: "up",
    bands: ["under 15 km/h", "15–20 km/h", "20–25 km/h", "25 km/h or more"],
    from: "mean of the day's strongest wind (hourly mean, 10 m above ground), the windier of both points",
  },
  effort: { label: "Longest day", at: [4, 6, 8], dir: "up", strict: true, bands: ["up to 4 h", "4–6 h", "6–8 h", "more than 8 h"], from: "walking time of the longest main stage, stated or by DIN 33466" },
} satisfies Record<string, Scale>;
export type MeasureId = keyof typeof SCALES;

export function levelOf(value: number, s: Scale): Level {
  const past = s.at.filter((t) => (s.dir === "up" ? (s.strict ? value > t : value >= t) : value < t)).length;
  return Math.min(1 + past, s.cap ?? 4) as Level;
}

export type Measure = {
  id: MeasureId;
  value: number;
  text: string; // the value as shown, e.g. "37 m per km"
  level: Level;
  where?: string; // e.g. "March", "stage 3"
  source: string;
  estimate?: boolean;
};
export type Dimension = {
  id: "terrain" | "climate" | "effort";
  label: string;
  level: Level;
  low?: Level; // climate: the easiest season month, when it differs
  by: Measure; // the measure that set the level
  measures: Measure[];
};

const measure = (id: MeasureId, value: number, text: string, source: string, extra: Partial<Measure> = {}): Measure => ({
  id,
  value,
  text,
  level: levelOf(value, SCALES[id]),
  source,
  ...extra,
});
// the hardest measure; on a tie, the first (the order of SCALES)
const hardest = (xs: Measure[]) => xs.reduce((a, b) => (b.level > a.level ? b : a));
const MONTH = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en", { month: "long" });
const SAC_RANK: Record<string, number> = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5, T6: 6 };
const round = (x: number) => Math.round(x);
const days = (n: number) => `${round(n)} ${round(n) === 1 ? "day" : "days"}`;

export function difficulty(t: Trail, d?: DerivedData) {
  const dims: Dimension[] = [];

  // terrain over the main route: climbs as the key figures have them (stated, else the terrain
  // model's estimate per stage)
  const terrain: Measure[] = [];
  const sac = sacGrade(t);
  if (sac) terrain.push(measure("sac", SAC_RANK[sac.value], sac.value, sac.source, { estimate: sac.how !== "stated" }));
  const totals = stageTotals(t);
  const estimates = stageEstimates(t, d);
  const main = mainStages(t);
  const e = d?.elevation;
  if (e) {
    const km = totals?.km.value ?? e.routeKm;
    const est = main.length > 0 && main.every((s) => estimates.get(s.number)?.ascentM !== undefined);
    const up = totals?.ascentM?.value ?? (est ? main.reduce((a, s) => a + estimates.get(s.number)!.ascentM!, 0) : undefined);
    if (up !== undefined)
      terrain.push(measure("climb", up / km, `${round(up / km)} m per km`, totals?.ascentM?.source ?? e.source, { estimate: !totals?.ascentM }));
    const g = gradients(e.points, e.stageStarts);
    const steep = ((g.steepUpKm + g.steepDownKm) / e.routeKm) * 100;
    terrain.push(measure("steep", steep, `${round(steep)} % of the way`, e.source));
  }
  if (d?.surface) {
    const natural = (d.surface.totals.natural?.share ?? 0) * 100;
    terrain.push(measure("ground", natural, `${round(natural)} %`, d.surface.source));
  }
  if (terrain.length) dims.push({ id: "terrain", label: "Terrain", level: hardest(terrain).level, by: hardest(terrain), measures: terrain });

  // climate per month: heat low down, cold and snow up high, wet days and wind at the worse place
  const climate = d?.climate;
  const season = t.season?.months?.length ? t.season.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const months =
    climate?.months.map((m) => {
      const where = MONTH(m.month);
      const wet = Math.max(m.low.wetDays, m.high.wetDays);
      const wind = Math.max(m.low.windKmh, m.high.windKmh);
      const xs = [
        measure("heat", m.low.tmax, `${round(m.low.tmax)} °C by day`, climate.source, { where }),
        measure("cold", m.high.tmin, `${m.high.tmin < -0.5 ? "−" : ""}${Math.abs(round(m.high.tmin))} °C at night`, climate.source, { where }),
        measure("wet", wet, days(wet), climate.source, { where }),
        measure("snow", m.high.snowDays, days(m.high.snowDays), climate.source, { where }),
        measure("wind", wind, `${round(wind)} km/h`, climate.source, { where }),
      ];
      return { month: m.month, inSeason: season.includes(m.month), level: hardest(xs).level, measures: xs };
    }) ?? [];
  const inSeason = months.filter((m) => m.inSeason);
  if (inSeason.length) {
    // the season's worst month sets the level; each measure shows its own worst season month
    const level = Math.max(...inSeason.map((m) => m.level)) as Level;
    const low = Math.min(...inSeason.map((m) => m.level)) as Level;
    const xs = inSeason[0].measures.map((x) => worstOf(inSeason.map((m) => m.measures.find((y) => y.id === x.id)!)));
    dims.push({ id: "climate", label: "Climate", level, low: low < level ? low : undefined, by: hardest(xs), measures: xs });
  }

  // effort: the longest day; a stated time range counts its upper end, a stage without a time
  // gets one by DIN 33466 from its climbs (stated, else estimated)
  const stageDays = main.flatMap((s) => {
    const est = estimates.get(s.number);
    const stated = Boolean(s.minutes);
    const up = s.ascentM ?? est?.ascentM;
    const down = s.descentM ?? est?.descentM;
    const minutes = s.maxMinutes ?? s.minutes ?? (up !== undefined && down !== undefined ? walkingMinutes(s.km, up, down) : undefined);
    if (minutes === undefined) return [];
    const text = `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, "0")}` : ""}`;
    const source = stated ? (t.stages!.timesSource ?? t.stages!.source) : t.stages!.source;
    return [measure("effort", minutes / 60, text, source, { where: `stage ${s.number}`, estimate: !stated })];
  });
  if (stageDays.length) {
    const top = stageDays.reduce((a, b) => (b.value > a.value ? b : a));
    dims.push({ id: "effort", label: "Effort", level: top.level, by: top, measures: [top] });
  }

  return { dims, months, season };
}

// one measure's hardest month (on a tie of levels, the more extreme value)
function worstOf(xs: Measure[]) {
  const up = SCALES[xs[0].id].dir === "up";
  return xs.reduce((a, b) => (b.level > a.level || (b.level === a.level && (up ? b.value > a.value : b.value < a.value)) ? b : a));
}

export type Difficulty = ReturnType<typeof difficulty>;

// a dimension's level in words; climate as a range over its season ("Moderate to Hard")
export const levelText = (d: Pick<Dimension, "level" | "low">) =>
  d.low ? `${LEVELS[d.low - 1]} to ${LEVELS[d.level - 1]}` : LEVELS[d.level - 1];

export const DIMENSION_TEXT: Record<Dimension["id"], { question: string; how: string }> = {
  terrain: {
    question: "How hard is the ground to walk: the path, the climbing, the steep bits, the ground underfoot?",
    how: "Rated over the whole main route.",
  },
  climate: {
    question: "How hot, cold, wet and windy does it get?",
    how: "Rated for each month of the season from 30 years of weather (ERA5): the rating spans the season's easiest and hardest month, and each measure shows its hardest month.",
  },
  effort: {
    question: "How long are the days?",
    how: "Rated by the longest main stage; a time range counts its upper end.",
  },
};

export const DIFFICULTY_NOTE =
  "How hard a trail is, in three ways: the terrain, the climate in season and the length of the days. Each is rated from Easy to Hard with the same thresholds for every trail, and takes its hardest measure. It describes the trail, not how it will feel to you: that depends on your fitness, experience, pack and the weather you get.";
