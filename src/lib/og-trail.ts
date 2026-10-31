// What a trail's link-preview image shows (src/lib/og-image.ts), from the same figures the search
// cards use (searchSummary); the difficulty word as the cards and the home page have it.
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { LEVELS } from "./difficulty";
import { climateLevel } from "./filters";
import { searchSummary } from "./search";
import type { OgTrail } from "./og-image";

export function ogTrail(id: string, data: CollectionEntry<"trails">["data"], derived?: CollectionEntry<"derived">["data"]): OgTrail {
  const s = searchSummary(id, data, derived);
  const levels = [s.terrainLevel, s.effortLevel, climateLevel(s, [])].filter((x) => x !== null) as number[];
  return {
    name: s.name,
    countries: s.countries,
    lengthKm: s.lengthKm,
    days: s.days,
    climb: s.climb,
    difficulty: levels.length ? LEVELS[Math.max(...levels) - 1] : null,
    season: s.season,
    surface: s.surface,
  };
}

export async function ogTrails() {
  const entries = await getCollection("trails");
  return Promise.all(entries.map(async ({ id, data }) => ({ slug: id, trail: ogTrail(id, data, (await getEntry("derived", id))?.data) })));
}
