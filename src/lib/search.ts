// The record the search page and the guide filter on: summarize() plus the difficulty ratings
// (src/lib/difficulty.ts) and the landscape shares. Kept apart from trails.ts, which difficulty.ts
// imports, so the modules don't import each other.
import type { CollectionEntry } from "astro:content";
import { difficulty } from "./difficulty";
import { mainStages, stageEstimates, summarize } from "./trails";

type Trail = CollectionEntry<"trails">["data"];
type DerivedData = CollectionEntry<"derived">["data"];

export function searchSummary(id: string, t: Trail, d?: DerivedData) {
  const diff = difficulty(t, d);
  const level = (dim: string) => diff.dims.find((x) => x.id === dim)?.level ?? null;
  const base = summarize(id, t, d);
  // the ascent as the trail page's key figures have it: the stated stage sum, else the sum of the
  // terrain model's estimates per main stage (shown with ≈)
  const est = stageEstimates(t, d);
  const main = mainStages(t);
  const estUp = main.length && main.every((s) => est.get(s.number)?.ascentM !== undefined)
    ? main.reduce((a, s) => a + est.get(s.number)!.ascentM!, 0)
    : null;
  return {
    ...base,
    climb: base.ascentM !== null ? { m: base.ascentM, est: false } : estUp !== null ? { m: estUp, est: true } : null,
    // each dimension's level for the card's difficulty bars (issue #22); climate's `low` is the
    // gentlest month of the season where it differs
    difficulty: diff.dims.map((x) => ({ id: x.id, label: x.label, level: x.level as number, low: (x.low ?? null) as number | null })),
    terrainLevel: level("terrain"), // 1–4, null when not rated
    effortLevel: level("effort"),
    // the climate level of each month (index 0 = January), empty when not rated; the filter takes
    // the hardest of the months asked for, within the season
    climateByMonth: diff.months.map((m) => m.level as number),
    landscape: d?.landcover?.shares ?? null, // share of each landscape group (src/pages/trails/[slug].astro LAND)
  };
}

export type SearchTrail = ReturnType<typeof searchSummary>;
