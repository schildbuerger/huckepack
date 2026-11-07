// The matching behind both searches with suggestions (the Baymard review of 2026-11-07): the header
// search (TrailSearch.astro) and the trip search's Where field (TripSearch.astro). Pure, so it runs
// in the browser and in the tests (tests/search-match.test.ts).
//
// - Words match at a word's start, in any order ("west high"), accents and case aside ("tubingen").
// - A word of 4 letters or more also matches with one typo (Damerau–Levenshtein: a letter added,
//   dropped, changed or two swapped, "wset" → West), only when no name matches as typed.
// - Places (continents, countries, the regions of src/lib/place-aliases.ts with their other names)
//   come before trails, unless only typos found them and a trail matches exactly.
// - Trails match by name, local name and aliases; their countries and places count as extra words
//   only with a word of the name ("scotland coast" finds the Fife Coastal Path, "scotland" alone the
//   place Scotland, not 13 trails).
// - Nothing matched: `nearest()` gives the closest names for a "Did you mean".
import { PLACE_ALIASES, isCountryName } from "./place-aliases.ts";

export type Kind = "continent" | "country" | "region" | "topic" | "trail";
export const PLACE_KINDS: Kind[] = ["continent", "country", "region", "topic"];

export interface Candidate {
  id: string;
  kind: Kind;
  label: string; // what the suggestion shows
  names: string[]; // label first, then other names (local name, aliases, other languages)
  extra?: string[]; // words that only narrow (a trail's countries and places)
  count?: number; // trails it holds, to rank places of the same match
  href: string;
  note?: string;
}

export interface Hit {
  c: Candidate;
  typos: number; // words matched only with a typo
  rank: number[]; // sort key, lower first
}

// lower case without accents; ß, ø, æ, ł spelt out; apostrophes dropped ("Hadrian's" → "hadrians")
export function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[øœ]/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/['’]/g, "");
}
export const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// Damerau–Levenshtein distance (optimal string alignment), stopping early beyond `max`
export function distance(a: string, b: string, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

export const TYPO_MIN = 4; // shorter words match exactly only

// how a typed word matches a word of a name: 0 the whole word, 1 its start, 2 its start with one
// typo (the word itself or its first letters, as one types: "highlnd", "wset"), -1 not at all
export function wordScore(q: string, t: string) {
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (q.length < TYPO_MIN || t.length < TYPO_MIN - 1) return -1;
  for (let n = q.length - 1; n <= q.length + 1; n++) {
    if (n > t.length) break;
    // a cut-off start must keep its last letter typed (otherwise "alps" would be "alp…" plus a typo)
    if (n < t.length && n < q.length) continue;
    if (distance(q, t.slice(0, n), 1) <= 1) return 2;
  }
  return -1;
}
const best = (q: string, tokens: string[]) => tokens.reduce((b, t) => {
  const s = wordScore(q, t);
  return s < 0 ? b : b < 0 ? s : Math.min(b, s);
}, -1);

const KIND_ORDER: Record<Kind, number> = { continent: 0, country: 1, region: 2, topic: 3, trail: 4 };

// one candidate against the typed words: null when a word finds nothing
export function score(c: Candidate, qs: string[]): Hit | null {
  const label = words(c.label);
  const all = c.names.flatMap(words);
  const extra = (c.extra ?? []).flatMap(words);
  let typos = 0;
  let starts = 0;
  let byName = 0;
  let byExtra = 0;
  let notLabel = 0;
  for (const q of qs) {
    const s = best(q, all);
    if (s >= 0) {
      byName++;
      if (s === 2) typos++;
      if (s === 1) starts++;
      if (best(q, label) < 0) notLabel++;
      continue;
    }
    const e = best(q, extra);
    if (e < 0) return null;
    byExtra++;
    if (e === 2) typos++;
  }
  // extra words only narrow a match by name
  if (!byName) return null;
  // a name that starts with a typed word first ("west": West Coast Trail before South West Coast Path)
  const leading = label.length && qs.some((q) => wordScore(q, label[0]) === 0 || wordScore(q, label[0]) === 1) ? 0 : 1;
  return { c, typos, rank: [typos ? 1 : 0, typos, byExtra, notLabel ? 1 : 0, leading, starts, -(c.count ?? 0), KIND_ORDER[c.kind]] };
}

const compare = (a: Hit, b: Hit) => {
  for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
  return a.c.label.localeCompare(b.c.label);
};

// every candidate that matches, in two groups, places and trails, each best first; places lead
// unless the trails' best match is clearly better (a typo place after an exact trail, "Great
// Britain" for "gr" after GR 20)
export function search(cands: Candidate[], query: string): Hit[] {
  const qs = words(query);
  if (!qs.length) return [];
  const found = cands.map((c) => score(c, qs)).filter((h): h is Hit => h !== null).sort(compare);
  // typos only count when nothing matches as typed (the user's decision of 2026-11-07: "alps" is
  // the Alps alone, not the Albsteig one letter off)
  const hits = found.some((h) => !h.typos) ? found.filter((h) => !h.typos) : found;
  const places = hits.filter((h) => h.c.kind !== "trail");
  const trails = hits.filter((h) => h.c.kind === "trail");
  // the group whose best match is clearly better goes first: an exact match before a typo, a name
  // before another name, a whole word before a word's start
  const head = (g: Hit[]) => g[0]?.rank.slice(0, 6) ?? [Infinity];
  const a = head(places);
  const b = head(trails);
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && b[i] < a[i] ? [...trails, ...places] : [...places, ...trails];
}

// at most this many suggestions at once (6 on phones narrower than 640 px), then "Show all n"
export const SUGGEST_MAX = 8;
export const SUGGEST_MAX_PHONE = 6;
export const capped = (hits: Hit[], max = SUGGEST_MAX) => ({ shown: hits.slice(0, max), hidden: Math.max(0, hits.length - max) });

// the closest names when nothing matched ("Did you mean"): by the summed distance of each typed
// word to its nearest word, within about a third of what was typed
export function nearest(cands: Candidate[], query: string, n = 3): Candidate[] {
  const qs = words(query).filter((q) => q.length >= 3);
  if (!qs.length) return [];
  const typed = qs.join("").length;
  const limit = Math.max(1, Math.floor(typed / 3));
  return cands
    .map((c) => {
      const tokens = c.names.flatMap(words);
      const d = qs.reduce((sum, q) => sum + Math.min(...tokens.map((t) => Math.min(distance(q, t, limit + 1), distance(q, t.slice(0, q.length), limit + 1)))), 0);
      return { c, d };
    })
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d || KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind] || (b.c.count ?? 0) - (a.c.count ?? 0) || a.c.label.localeCompare(b.c.label))
    .slice(0, n)
    .map((x) => x.c);
}

// the parts of `label` to show bold: each word's start as typed, [from, to) in the label's own
// characters (accents and all: "tub" bolds "Tüb" in Tübingen)
export function marks(label: string, query: string): [number, number][] {
  const qs = words(query);
  if (!qs.length) return [];
  // each character's folded form, to map folded positions back to the label
  const out: [number, number][] = [];
  const re = /[\p{L}\p{N}'’]+/gu;
  for (let m; (m = re.exec(label)); ) {
    const raw = m[0];
    const folded: string[] = [...raw].map((ch) => fold(ch));
    const joined = folded.join("");
    const q = qs.filter((w) => joined.startsWith(w)).sort((a, b) => b.length - a.length)[0];
    if (!q) continue;
    let len = 0;
    let i = 0;
    const chars = [...raw];
    while (i < chars.length && len < q.length) len += folded[i++].length;
    // back to UTF-16 offsets
    const end = m.index + chars.slice(0, i).join("").length;
    out.push([m.index, end]);
  }
  return out;
}

// the label as HTML with the typed parts in <b>, everything escaped
export function markHtml(label: string, query: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  let at = 0;
  for (const [a, b] of marks(label, query)) {
    html += esc(label.slice(at, a)) + "<b>" + esc(label.slice(a, b)) + "</b>";
    at = b;
  }
  return html + esc(label.slice(at));
}

// ——— the candidates, from the trails' search records ———

export interface TrailLike {
  slug: string;
  name: string;
  localName: string | null;
  aliases: string[];
  continents: string[];
  countries: string[];
  regions: string[];
  places?: string[];
  sleeping?: string[];
}

const n = (k: number) => `${k} ${k === 1 ? "trail" : "trails"}`;
const whereHref = (w: string) => `/trails/?where=${encodeURIComponent(w)}`;

// topics a hiker may type that are a search filter, not a place ("hut")
export const TOPICS = [
  { id: "huts", label: "Trails with huts", names: ["huts", "hut", "hütte", "hütten", "rifugio", "rifugi", "refuge", "refugio", "mountain huts"], sleep: "huts" },
  { id: "camping", label: "Trails with campsites", names: ["camping", "campsites", "campsite", "tent"], sleep: "camping" },
  { id: "hostels", label: "Trails with hostels", names: ["hostels", "hostel", "bunkhouse"], sleep: "hostels" },
];

// the other names of each place (from the alias list), folded: "Bayern" for Bavaria
const ALSO = new Map(PLACE_ALIASES.map((p) => [p.name, p.also ?? []]));

export function placeCandidates(trails: TrailLike[], opts: { topics?: boolean } = {}): Candidate[] {
  const count = (test: (t: TrailLike) => boolean) => trails.filter(test).length;
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  const out: Candidate[] = [];
  for (const c of uniq(trails.flatMap((t) => t.continents))) {
    const k = count((t) => t.continents.includes(c));
    out.push({ id: `c-${c}`, kind: "continent", label: c, names: [c, ...(ALSO.get(c) ?? [])], count: k, href: whereHref(c), note: n(k) });
  }
  for (const c of uniq(trails.flatMap((t) => t.countries))) {
    const k = count((t) => t.countries.includes(c));
    out.push({ id: `n-${c}`, kind: "country", label: c, names: [c, ...(ALSO.get(c) ?? [])], count: k, href: whereHref(c), note: n(k) });
  }
  for (const p of PLACE_ALIASES.filter((p) => !isCountryName(p))) {
    const k = count((t) => (t.places ?? []).includes(p.name));
    if (!k) continue;
    out.push({ id: `r-${p.name}`, kind: "region", label: p.name, names: [p.name, ...(p.also ?? [])], count: k, href: whereHref(p.name), note: n(k) });
  }
  if (opts.topics)
    for (const tp of TOPICS) {
      const k = count((t) => (t.sleeping ?? []).includes(tp.sleep));
      if (k) out.push({ id: `s-${tp.id}`, kind: "topic", label: tp.label, names: [tp.label, ...tp.names], count: k, href: `/trails/?sleep=${tp.sleep}`, note: n(k) });
    }
  return out;
}

export function trailCandidates(trails: TrailLike[]): Candidate[] {
  return trails.map((t) => ({
    id: `t-${t.slug}`,
    kind: "trail" as const,
    label: t.name,
    names: [t.name, ...(t.localName ? [t.localName] : []), ...t.aliases],
    extra: [...t.countries, ...t.continents, ...(t.places ?? []).flatMap((p) => [p, ...(ALSO.get(p) ?? [])])],
    href: `/trails/${t.slug}/`,
    note: t.countries.join(", "),
  }));
}

// where Enter goes when nothing is suggested: the search page, filtered to a place one of the words
// names exactly, if any ("alps xyz" → the Alps), else unfiltered
export function fallbackHref(places: Candidate[], query: string) {
  const qs = words(query);
  const hit = places.find((p) => p.kind !== "topic" && p.names.some((name) => words(name).length > 0 && words(name).every((w) => qs.includes(w))));
  return hit ? hit.href : "/trails/";
}
