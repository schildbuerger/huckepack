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
  const base = summarize(id, t, d);
  return {
    ...base,
    // the ascent as the trail page's key figure has it (trailClimb()): the terrain model's estimate
    // (shown with ≈), else the provider's figure
    climb: base.ascentM !== null ? { m: base.ascentM, est: base.climbEst } : null,
    // each dimension's level for the card's difficulty bars (issue #22); climate's for its best run
    // of season months (issue #114), re-rated for a month pick by ratedDims() (src/lib/filters.ts)
    difficulty: diff.dims.map((x) => ({ id: x.id, label: x.label, level: x.level as number })),
    terrainLevel: level("terrain"), // 1–4, null when not rated
    effortLevel: level("effort"),
    // the climate level of each month (index 0 = January), empty when not rated; a month pick and
    // the climate filter read it (climateLevel())
    climateByMonth: diff.months.map((m) => m.level as number),
    // the day the trail was added (YYYY-MM-DD), for the search's "Newest first" sort (issue #218)
    added: t.added.toISOString().slice(0, 10),
    // the regions holding at least 20 % of the main route ("Alps", "Bavaria"; pipeline/regions.py,
    // Natural Earth), for the searches and the Where filter (`where=Alps`); the record's own
    // `regions` stay the trail page's words
    places: (d?.regions ?? []).map((r) => r.name),
    landscape: d?.landcover?.shares ?? null, // share of each landscape group (src/pages/trails/[slug].astro LAND)
  };
}

export type SearchTrail = ReturnType<typeof searchSummary>;
