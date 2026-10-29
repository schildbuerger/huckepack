// The record the search page and the guide filter on: summarize() plus the difficulty ratings
// (src/lib/difficulty.ts) and the landscape shares. Kept apart from trails.ts, which difficulty.ts
// imports, so the modules don't import each other.
import type { CollectionEntry } from "astro:content";
import { difficulty } from "./difficulty";
import { summarize } from "./trails";

type Trail = CollectionEntry<"trails">["data"];
type DerivedData = CollectionEntry<"derived">["data"];

export function searchSummary(id: string, t: Trail, d?: DerivedData) {
  const diff = difficulty(t, d);
  const level = (dim: string) => diff.dims.find((x) => x.id === dim)?.level ?? null;
  return {
    ...summarize(id, t, d),
    terrainLevel: level("terrain"), // 1–4, null when not rated
    effortLevel: level("effort"),
    // the climate level of each month (index 0 = January), empty when not rated; the filter takes
    // the hardest of the months asked for, within the season
    climateByMonth: diff.months.map((m) => m.level as number),
    landscape: d?.landcover?.shares ?? null, // share of each landscape group (src/pages/trails/[slug].astro LAND)
  };
}

export type SearchTrail = ReturnType<typeof searchSummary>;
