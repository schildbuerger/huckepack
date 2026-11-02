// Every trail's search summary in one list (issue #93), built at build time for /trails/search.json,
// which the trail search, the trail map and the guide load once in the browser (src/lib/search-data.ts)
// instead of carrying it in their HTML: with each summary about 4 KB, the pages would grow by that much
// with every trail. Sorted by name; with the start's [lon, lat] and the hardest rating as a word for the
// map's list.
import { getCollection, getEntry } from "astro:content";
import { LEVELS } from "./difficulty";
import { climateLevel } from "./filters";
import { searchSummary, type SearchTrail } from "./search";

// `ends`: start and finish as [lat, lon], for the home page's trails near you
export type ListedTrail = SearchTrail & { startLonLat: [number, number]; ends: [number, number][]; level: string | null };

export async function allSearchTrails(): Promise<ListedTrail[]> {
  const entries = await getCollection("trails");
  const out = await Promise.all(
    entries.map(async (e) => {
      const s = searchSummary(e.id, e.data, (await getEntry("derived", e.id))?.data);
      const xs = [s.terrainLevel, s.effortLevel, climateLevel(s, [])].filter((x) => x !== null) as number[];
      const { start, end } = e.data.termini;
      return {
        ...s,
        startLonLat: [start.lon, start.lat] as [number, number],
        ends: [
          [start.lat, start.lon],
          [end.lat, end.lon],
        ] as [number, number][],
        level: xs.length ? LEVELS[Math.max(...xs) - 1] : null,
      };
    }),
  );
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// one height scale for every search card's elevation profile, so the profiles compare honestly, the
// same for the cards in the page and those loaded with /trails/cards.html
export function eleRangeOf(trails: SearchTrail[]): [number, number] {
  const lows = trails.flatMap((t) => (t.lowestM === null ? [] : [t.lowestM]));
  const highs = trails.flatMap((t) => (t.highestM === null ? [] : [t.highestM]));
  return lows.length
    ? [Math.max(0, Math.floor((Math.min(...lows) - 100) / 100) * 100), Math.ceil((Math.max(...highs) + 100) / 100) * 100]
    : [0, 1000];
}

// the cards the search page carries in its HTML; the rest come with /trails/cards.html
export const CARDS_IN_PAGE = 24;
