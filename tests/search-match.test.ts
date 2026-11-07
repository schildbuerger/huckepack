// Tests for the searches' matching (src/lib/search-match.ts, the Baymard review of 2026-11-07):
// places and their other names, continents, regions from the derived data (pipeline/regions.py),
// typos only when nothing matches as typed, trails narrowed by their places, "Did you mean", the
// bold parts and the fallback for Enter. Made-up records with the real trails' names, countries and
// derived regions; one test reads the real derived data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { capped, distance, fallbackHref, SUGGEST_MAX, SUGGEST_MAX_PHONE, markHtml, marks, nearest, placeCandidates, search, trailCandidates, wordScore, type TrailLike } from "../src/lib/search-match.ts";
import { PLACE_ALIASES } from "../src/lib/place-aliases.ts";
import { matches, noFilters } from "../src/lib/filters.ts";

// `places`: the trail's derived regions (data/derived/<slug>.json `regions`), as the search record has them
const t = (slug: string, name: string, countries: string[], places: string[], more: Partial<TrailLike> = {}): TrailLike => ({
  slug,
  name,
  localName: null,
  aliases: [],
  continents: [countries[0] === "United States" || countries[0] === "Canada" ? "North America" : countries[0] === "Chile" || countries[0] === "Argentina" ? "South America" : "Europe"],
  countries,
  regions: [],
  places,
  sleeping: [],
  ...more,
});
const TRAILS = [
  t("west-highland-way", "West Highland Way", ["United Kingdom"], ["Scotland", "Grampian Mountains"]),
  t("fife-coastal-path", "Fife Coastal Path", ["United Kingdom"], ["Scotland"]),
  t("great-glen-way", "Great Glen Way", ["United Kingdom"], ["Scotland"]),
  t("pennine-way", "Pennine Way", ["United Kingdom"], ["England"]),
  t("offas-dyke-path", "Offa's Dyke Path", ["United Kingdom"], ["Wales", "England", "Cambrian Mountains"]),
  t("westweg", "Westweg", ["Germany", "Switzerland"], ["Baden-Württemberg"]),
  t("west-coast-trail", "West Coast Trail", ["Canada"], ["British Columbia", "Vancouver Island"]),
  t("south-west-coast-path", "South West Coast Path", ["United Kingdom"], ["England"]),
  t("arizona-trail", "Arizona National Scenic Trail", ["United States"], ["Arizona"], { aliases: ["AZT"] }),
  t("adlerweg", "Adlerweg", ["Austria"], ["Tyrol", "Alps"], { aliases: ["Eagle Walk"], sleeping: ["huts"] }),
  t("tour-du-mont-blanc", "Tour du Mont Blanc", ["France", "Italy", "Switzerland"], ["Alps", "Auvergne-Rhône-Alpes", "Valais"], { aliases: ["TMB"], sleeping: ["huts"] }),
  t("alpe-adria-trail", "Alpe-Adria-Trail", ["Austria", "Slovenia", "Italy"], ["Alps", "Carinthia"]),
  t("alta-via-1", "Alta Via 1", ["Italy"], ["Alps", "Veneto", "Trentino-Alto Adige"], { localName: "Alta Via delle Dolomiti n. 1" }),
  t("gr-20", "GR 20", ["France"], ["Corsica"], { placeAlso: { Corsica: ["Corse"] } }),
  t("carros-de-foc", "Carros de Foc", ["Spain"], ["Catalonia", "Pyrenees"], { placeAlso: { Catalonia: ["Cataluña"] } }),
  t("gr-70-chemin-de-stevenson", "GR 70 Chemin de Stevenson", ["France"], ["Occitanie", "Massif Central"]),
  t("great-divide-trail", "Great Divide Trail", ["Canada"], ["Rocky Mountains", "Alberta"]),
  t("greenstone-ridge-trail", "Greenstone Ridge Trail", ["United States"], ["Michigan"]),
  t("goldsteig", "Goldsteig", ["Germany"], ["Bavaria", "Böhmerwald"]),
  t("o-circuit", "O Circuit", ["Chile"], ["Andes", "Patagonia"]),
  t("huemul-circuit", "Huemul Circuit", ["Argentina"], ["Andes", "Patagonia", "Santa Cruz"]),
  t("hermannshoehen", "Hermannshöhen", ["Germany"], ["North Rhine-Westphalia"]),
];
const PLACES = placeCandidates(TRAILS, { topics: true });
const ALL = [...PLACES, ...trailCandidates(TRAILS)];
const labels = (q: string) => search(ALL, q).map((h) => h.c.label);

test("Damerau–Levenshtein counts a swap as one edit", () => {
  assert.equal(distance("wset", "west"), 1);
  assert.equal(distance("alsp", "alps"), 1);
  assert.equal(distance("scotlnd", "scotland"), 1);
  assert.equal(distance("kitten", "sitting"), 3);
  assert.ok(distance("abcdef", "uvwxyz", 1) > 1);
});

test("a word matches at its start, with one typo only from four letters", () => {
  assert.equal(wordScore("west", "west"), 0);
  assert.equal(wordScore("wes", "westweg"), 1);
  assert.equal(wordScore("wset", "west"), 2);
  assert.equal(wordScore("highlnd", "highland"), 2);
  assert.equal(wordScore("hut", "hat"), -1); // three letters: exact only
  assert.equal(wordScore("gr", "great"), 1);
});

test("continents and the trails' derived regions match like countries", () => {
  assert.deepEqual(labels("europe").slice(0, 1), ["Europe"]);
  assert.deepEqual(labels("alps"), ["Alps"]);
  assert.equal(labels("scotland")[0], "Scotland");
  assert.equal(labels("patagonia")[0], "Patagonia");
  // other names and languages lead to the same place, accents optional
  assert.equal(labels("bayern")[0], "Bavaria");
  assert.equal(labels("tirol")[0], "Tyrol");
  assert.equal(labels("alpen")[0], "Alps");
  assert.equal(labels("nordrhein")[0], "North Rhine-Westphalia");
  assert.equal(labels("uk")[0], "United Kingdom");
  assert.equal(labels("hermannshohen")[0], "Hermannshöhen");
  // the derived data's other names: the local name finds the English one
  assert.equal(labels("cataluna")[0], "Catalonia");
  assert.equal(labels("corse")[0], "Corsica");
  assert.equal(PLACES.filter((p) => p.label === "Corsica").length, 1);
  // an alias for a region no trail lies in suggests nothing
  assert.ok(!labels("schwarzwald").includes("Black Forest"));
});

test("a region holds the trails whose derived regions name it", () => {
  const alps = PLACES.find((p) => p.label === "Alps")!;
  assert.equal(alps.kind, "region");
  assert.equal(alps.count, 4);
  assert.equal(alps.href, "/trails/?where=Alps");
  assert.equal(PLACES.find((p) => p.label === "Scotland")!.count, 3);
  // a region named like a country or continent isn't listed twice
  assert.equal(PLACES.filter((p) => p.label === "Europe").length, 1);
  // the search page's Where filter takes a region
  const f = { ...noFilters(), where: ["Alps"] };
  assert.deepEqual(TRAILS.filter((x) => matches(x as any, f)).map((x) => x.slug).sort(), ["adlerweg", "alpe-adria-trail", "alta-via-1", "tour-du-mont-blanc"]);
});

test("a typo finds a name only when nothing matches as typed", () => {
  assert.deepEqual(labels("wset highland"), ["West Highland Way"]);
  assert.deepEqual(labels("scotlnd"), ["Scotland"]);
  assert.deepEqual(search(ALL, "alsp").map((h) => [h.c.label, h.typos]), [["Alps", 1]]);
  // "alps" matches the Alps as typed: the Albsteig and the Alpe-Adria-Trail, one letter off, stay out
  const withAlb = [...ALL, ...trailCandidates([t("albsteig", "Albsteig (HW1)", ["Germany"], ["Bavaria"])])];
  assert.deepEqual(search(withAlb, "alps").map((h) => h.c.label), ["Alps"]);
  // an exact trail keeps a place that is only a typo away out
  const mixed = search([...PLACES, ...trailCandidates([t("x", "Tirl Path", ["Austria"], [])])], "tirl");
  assert.deepEqual(mixed.map((h) => h.c.label), ["Tirl Path"]);
  // no typo matches beside exact ones
  assert.ok(search(ALL, "west").every((h) => h.typos === 0));
});

test("whole words rank above starts: GR finds GR 20 and GR 70 before Great …", () => {
  const l = labels("GR").filter((x) => !["Great Divide Trail", "Great Glen Way", "Greenstone Ridge Trail"].includes(x));
  assert.deepEqual(labels("GR").slice(0, 2), ["GR 20", "GR 70 Chemin de Stevenson"]);
  assert.ok(l.length >= 2);
  // a name starting with the word before one with it inside, then a word's start
  const west = search(ALL, "west");
  assert.deepEqual(west.filter((h) => h.c.kind === "trail").map((h) => h.c.label), ["West Coast Trail", "West Highland Way", "Westweg", "South West Coast Path"]);
  // the trails lead: their names start with the word, the place North Rhine-Westphalia only has it inside
  assert.equal(west[0].c.kind, "trail");
});

test("a trail's places narrow it only with a word of its name", () => {
  // "scotland" alone: the place, no trail by its region
  assert.ok(!search(ALL, "scotland").some((h) => h.c.kind === "trail"));
  assert.deepEqual(search(ALL, "scotland coast").map((h) => h.c.label), ["Fife Coastal Path"]);
  assert.deepEqual(search(ALL, "west canada").map((h) => h.c.label), ["West Coast Trail"]);
});

test("topics: huts lead to the sleeping filter", () => {
  const hit = search(ALL, "hut")[0];
  assert.equal(hit.c.kind, "topic");
  assert.equal(hit.c.href, "/trails/?sleep=huts");
  assert.equal(hit.c.count, 2);
});

test("nothing matched: the nearest names, or none for gibberish", () => {
  assert.equal(search(ALL, "pennnine wy").length, 0);
  assert.equal(nearest(ALL, "pennnine wy")[0].label, "Pennine Way");
  assert.equal(nearest(ALL, "adlrwg")[0].label, "Adlerweg");
  assert.deepEqual(nearest(ALL, "qqqqzzzz"), []);
  assert.deepEqual(nearest(ALL, "xqzt"), []); // not "AZT", two letters off in four
});

test("Enter without suggestions keeps a place the words name", () => {
  assert.equal(fallbackHref(PLACES, "alps zzzz"), "/trails/?where=Alps");
  assert.equal(fallbackHref(PLACES, "qqqq"), "/trails/");
});

test("the typed part is bold, in the label's own letters", () => {
  assert.deepEqual(marks("West Highland Way", "high we"), [
    [0, 2],
    [5, 9],
  ]);
  assert.equal(markHtml("Hermannshöhen", "hermannsho"), "<b>Hermannshö</b>hen");
  assert.equal(markHtml("Offa's <Dyke>", "dy"), "Offa's &lt;<b>Dy</b>ke&gt;");
});

test("the caps: at most 8 suggestions (6 on phones), the rest counted for Show all", () => {
  const all = [...search(ALL, "e"), ...search(ALL, "w")];
  assert.ok(all.length > 8);
  const c = capped(all);
  assert.equal(c.shown.length, SUGGEST_MAX);
  assert.equal(c.hidden, all.length - 8);
  assert.equal(capped(all, SUGGEST_MAX_PHONE).shown.length, 6);
  assert.deepEqual(capped(all.slice(0, 3)), { shown: all.slice(0, 3), hidden: 0 });
});

test("the real derived regions: each trail's list is valid, and the examples hold", () => {
  const dir = new URL("../data/derived/", import.meta.url);
  const regions = new Map<string, { name: string; kind: string; share: number }[]>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    if (d.regions) regions.set(f.slice(0, -5), d.regions);
  }
  for (const [slug, list] of regions)
    for (const r of list) {
      assert.ok(r.share >= 0.2 && r.share <= 1, `${slug}: ${r.name} ${r.share}`);
      assert.ok(r.kind === "admin" || r.kind === "natural");
    }
  const names = (slug: string) => (regions.get(slug) ?? []).map((r) => r.name);
  assert.ok(names("tour-du-mont-blanc").includes("Alps"));
  assert.ok(names("west-highland-way").includes("Scotland"));
  assert.ok(names("o-circuit").includes("Patagonia"));
  assert.ok(names("colorado-trail").includes("Rocky Mountains"));
  assert.ok(names("carros-de-foc").includes("Pyrenees"));
  // English names from Wikidata, the local ones kept as other names; one place once
  assert.ok(names("carros-de-foc").includes("Catalonia"));
  assert.ok(names("camino-frances").includes("Castile and León"));
  assert.deepEqual(names("gr-20"), ["Corsica"]);
  // natural regions in English too, Natural Earth's names kept as other names
  const all = [...regions.values()].flat();
  for (const [en, local] of [["Ore Mountains", "Erzgebirge"], ["Apennines", "Appennino Ligure"], ["Bohemian Forest", "Böhmerwald"]]) {
    const r = all.find((x) => x.name === en) as { also?: string[] } | undefined;
    assert.ok(r?.also?.includes(local), en);
  }
  assert.ok(!all.some((x) => ["Erzgebirge", "Appennino Ligure", "Cruach nam Miseag"].includes(x.name)));
  assert.ok((regions.get("gr-20")![0] as { also?: string[] }).also!.includes("Corse"));
  for (const [slug, list] of regions) assert.equal(new Set(list.map((r) => r.name)).size, list.length, slug);
  // the Camino Francés crosses the Pyrenees on its first day only: under 20 % of its route
  assert.ok(!names("camino-frances").includes("Pyrenees"));
  // every alias's other names are unique to it
  const seen = new Set<string>();
  for (const p of PLACE_ALIASES)
    for (const a of p.also) {
      assert.ok(!seen.has(a.toLowerCase()), a);
      seen.add(a.toLowerCase());
    }
});
