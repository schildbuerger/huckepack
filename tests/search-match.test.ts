// Tests for the searches' matching (src/lib/search-match.ts, the Baymard review of 2026-11-07):
// places and their other names, continents, typos ranked below exact matches, trails narrowed by
// their places, "Did you mean", the bold parts and the fallback for Enter. Made-up records with the
// real trails' names, countries and regions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { capped, distance, fallbackHref, SUGGEST_MAX, SUGGEST_MAX_PHONE, markHtml, marks, nearest, placeCandidates, search, trailCandidates, wordScore, type TrailLike } from "../src/lib/search-match.ts";
import { PLACE_ALIASES, isCountryName, placesOf } from "../src/lib/place-aliases.ts";
import { matches, noFilters } from "../src/lib/filters.ts";

const t = (slug: string, name: string, countries: string[], regions: string[], more: Partial<TrailLike> = {}): TrailLike => {
  const base = { slug, name, localName: null, aliases: [], continents: [countries[0] === "United States" || countries[0] === "Canada" ? "North America" : countries[0] === "Chile" || countries[0] === "Argentina" ? "South America" : "Europe"], countries, regions, sleeping: [], ...more };
  return { ...base, places: placesOf(base) };
};
const TRAILS = [
  t("west-highland-way", "West Highland Way", ["United Kingdom"], ["East Dunbartonshire", "Stirling", "Argyll and Bute", "Highland"]),
  t("fife-coastal-path", "Fife Coastal Path", ["United Kingdom"], ["Scotland"]),
  t("great-glen-way", "Great Glen Way", ["United Kingdom"], ["Scotland"]),
  t("pennine-way", "Pennine Way", ["United Kingdom"], ["England", "Scotland"]),
  t("offas-dyke-path", "Offa's Dyke Path", ["United Kingdom"], ["Monmouthshire", "Gloucestershire", "Powys"]),
  t("westweg", "Westweg", ["Germany", "Switzerland"], ["Baden-Württemberg", "Basel-Stadt"]),
  t("west-coast-trail", "West Coast Trail", ["Canada"], ["British Columbia"]),
  t("south-west-coast-path", "South West Coast Path", ["United Kingdom"], ["Devon"]),
  t("arizona-trail", "Arizona National Scenic Trail", ["United States"], ["Arizona"], { aliases: ["AZT"] }),
  t("adlerweg", "Adlerweg", ["Austria"], ["Tyrol"], { aliases: ["Eagle Walk"], sleeping: ["huts"] }),
  t("tour-du-mont-blanc", "Tour du Mont Blanc", ["France", "Italy", "Switzerland"], ["Haute-Savoie"], { aliases: ["TMB"], sleeping: ["huts"] }),
  t("alpe-adria-trail", "Alpe-Adria-Trail", ["Austria", "Slovenia", "Italy"], ["Carinthia"]),
  t("alta-via-1", "Alta Via 1", ["Italy"], ["Trentino-South Tyrol", "Veneto"], { localName: "Alta Via delle Dolomiti n. 1" }),
  t("gr-20", "GR 20", ["France"], ["Corsica"]),
  t("gr-70-chemin-de-stevenson", "GR 70 Chemin de Stevenson", ["France"], ["Occitanie"]),
  t("great-divide-trail", "Great Divide Trail", ["Canada"], ["Alberta"]),
  t("greenstone-ridge-trail", "Greenstone Ridge Trail", ["United States"], ["Michigan"]),
  t("goldsteig", "Goldsteig", ["Germany"], ["Bayern"]),
  t("o-circuit", "O Circuit", ["Chile"], ["Magallanes"]),
  t("huemul-circuit", "Huemul Circuit", ["Argentina"], ["Santa Cruz"]),
  t("hermannshoehen", "Hermannshöhen", ["Germany"], ["Niedersachsen"]),
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

test("continents and regions match like countries", () => {
  assert.deepEqual(labels("europe").slice(0, 1), ["Europe"]);
  assert.equal(labels("alps")[0], "Alps");
  assert.equal(labels("scotland")[0], "Scotland");
  assert.equal(labels("patagonia")[0], "Patagonia");
  // other names and languages lead to the same place, accents optional
  assert.equal(labels("bayern")[0], "Bavaria");
  assert.equal(labels("schwarzwald")[0], "Black Forest");
  assert.equal(labels("tirol")[0], "Tyrol");
  assert.equal(labels("dolomiti")[0], "Dolomites");
  assert.equal(labels("uk")[0], "United Kingdom");
  assert.equal(labels("hermannshohen")[0], "Hermannshöhen");
});

test("a region holds the trails its rule names, from the records' regions or by slug", () => {
  const of = (slug: string) => TRAILS.find((x) => x.slug === slug)!.places;
  assert.ok(of("west-highland-way")!.includes("Scotland"));
  assert.ok(of("pennine-way")!.includes("Scotland") && of("pennine-way")!.includes("England"));
  assert.ok(of("offas-dyke-path")!.includes("Wales") && of("offas-dyke-path")!.includes("England"));
  assert.ok(of("goldsteig")!.includes("Bavaria"));
  assert.ok(of("adlerweg")!.includes("Alps") && of("adlerweg")!.includes("Tyrol"));
  assert.ok(!of("gr-20")!.includes("Alps"));
  const alps = PLACES.find((p) => p.label === "Alps")!;
  assert.equal(alps.count, 4);
  assert.equal(alps.href, "/trails/?where=Alps");
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
  assert.deepEqual(labels("west"), ["West Coast Trail", "West Highland Way", "Westweg", "South West Coast Path"]);
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

test("every curated place holds at least one real trail", () => {
  const dir = new URL("../data/trails/", import.meta.url);
  const names = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code)!;
  const records = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const y = readFileSync(new URL(f, dir), "utf8");
      const list = (k: string) => (y.match(new RegExp(`^${k}: \\[(.*)\\]`, "m"))?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return { slug: f.slice(0, -5), countries: list("countries").map(names), regions: list("regions") };
    });
  const slugs = new Set(records.map((r) => r.slug));
  for (const p of PLACE_ALIASES) {
    for (const s of p.trails ?? []) assert.ok(slugs.has(s), `${p.name}: no trail ${s}`);
    if (isCountryName(p)) continue;
    assert.ok(records.some((r) => placesOf(r).includes(p.name)), `${p.name} holds no trail`);
  }
});
