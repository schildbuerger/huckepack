// Tests for the figures the site derives at build time (review of 2026-10-30, #21): lengths and
// climbs by the record's rules, gradients and walking times, and the chart helpers. Run with
// `npm test` (Node's test runner; Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { barMetres, climbFacts, climbs, CLIMB_HOW, CLIMB_THRESHOLD_M, gradients, noStages, perDay, providerClimb, terrainClimb, routeEstimate, stageEstimates, sleepingCategories, summarize, trailClimb, trailLength, providerLength, measuredLength, measuredCover, compareLength, trailDays, walkingMinutes, stageTotals, STEEP_PERCENT } from "../src/lib/trails.ts";
import { DAYS, matches, noFilters } from "../src/lib/filters.ts";
import { difficulty } from "../src/lib/difficulty.ts";
import { mergeRuns, rectsPath, simplify, stripPaths, n1 } from "../src/lib/svg.ts";
import { kmBetween, roundDistance } from "../src/lib/geo.ts";
import { bestRun, climateFor, monthsText, readPick, runBetween } from "../src/lib/months.ts";
import { SKYLINES, SKY_W, SKY_H, BROAD, STEEP } from "../src/lib/skylines.ts";

// a record with only what these functions read
const trail = (over: Record<string, unknown> = {}) =>
  ({
    length: [],
    ascent: [],
    descent: [],
    stages: {
      source: "site",
      list: [
        { number: "1", kind: "main", from: "A", to: "B", km: 10.25, ascentM: 300, descentM: 100 },
        { number: "2", kind: "main", from: "B", to: "C", km: 12, ascentM: 200, descentM: 400 },
        { number: "2a", kind: "variant", from: "B", to: "C", km: 30, ascentM: 900, descentM: 900 },
      ],
    },
    ...over,
  }) as any;

test("provider's length: the stated total first, else the main stages' sum", () => {
  assert.equal(providerLength(trail())!.value, 22.3);
  assert.equal(providerLength(trail({ length: [{ km: 20, source: "site" }] }))!.value, 20);
});

// derived data with only `measured`: the main stages (and a variant) with their coverage
const measuredData = (covered: [number, number, number], km = 23.4) =>
  ({
    measured: {
      source: "osm",
      km,
      minCovered: Math.min(covered[0], covered[1]),
      stages: [
        { number: "1", kind: "main", km: 10.4, covered: covered[0] },
        { number: "2", kind: "main", km: 13, covered: covered[1] },
        { number: "2a", kind: "variant", km: 30, covered: covered[2] },
      ],
    },
  }) as any;

test("length: our measurement first, in whole km, with its tenth kept for the popover", () => {
  const l = trailLength(trail({ length: [{ km: 20, source: "site", approx: true }] }), measuredData([1, 1, 1]))!;
  assert.equal(l.value, 23);
  assert.equal(l.measured, true);
  assert.equal(l.measured && l.exact, 23.4);
  assert.equal(l.source, "osm");
  assert.equal(l.approx, false); // "about" only for a provider's figure flagged approx
  assert.equal(compareLength(trail(), measuredData([1, 1, 1])), 23);
});

test("length: measured where the route is 95 % matched overall, weighted by stage length", () => {
  // stage 1 only 90 % matched, but over both stages (10.4 × 0.9 + 13 × 1) / 23.4 = 95.6 %
  assert.equal(trailLength(trail(), measuredData([0.9, 1, 1]))!.value, 23);
  assert.ok(Math.abs(measuredCover(trail(), measuredData([0.9, 1, 1]))! - 0.9556) < 0.001);
  // a variant never counts, however poorly matched
  assert.equal(trailLength(trail(), measuredData([1, 1, 0]))!.measured, true);
  // under 95 % overall: the provider's figure, the stated total, else the stage sum
  assert.equal(trailLength(trail({ length: [{ km: 20, source: "site" }] }), measuredData([0.9, 0.95, 1]))!.value, 20);
  assert.equal(trailLength(trail(), measuredData([0.9, 0.95, 1]))!.value, 22.3);
  assert.equal(measuredLength(trail(), measuredData([0.9, 0.95, 1])), null);
  // no measurement at all
  assert.equal(trailLength(trail())!.value, 22.3);
  assert.equal(trailLength(trail())!.measured, false);
  assert.equal(measuredCover(trail()), null);
});

test("length: a side trip walked there and back weighs twice in the coverage", () => {
  const t = trail({
    stages: {
      source: "site",
      list: [
        { number: "1", kind: "main", from: "A", to: "B", km: 10 },
        { number: "V1", kind: "variant", from: "B", to: "V", km: 5, outAndBack: true },
      ],
    },
  });
  const d = {
    measured: {
      source: "osm",
      km: 20,
      minCovered: 1,
      stages: [
        { number: "1", kind: "main", km: 10, covered: 1 },
        { number: "V1", kind: "variant", km: 5, covered: 0.8 },
      ],
    },
  } as any;
  // (10 × 1 + 2 × 5 × 0.8) / 20 = 90 %: our map line misses too much of the side trip
  assert.ok(Math.abs(measuredCover(t, d)! - 0.9) < 1e-9);
  assert.equal(trailLength(t, d)!.value, 20); // the stage sum, the side trip counted twice
  assert.equal(trailLength(t, d)!.measured, false);
});

test("provider's climb: the stated pair only from one source, else the main stages' sums", () => {
  assert.deepEqual(
    [providerClimb(trail())!.up, providerClimb(trail())!.down],
    [500, 500],
  );
  assert.equal(providerClimb(trail())!.how, "sum of the 2 main stages");
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  assert.deepEqual(providerClimb(stated), { up: 450, down: 480, source: "site", how: "stated total" });
  // ascent and descent from different sources are never paired: back to the stage sums
  const mixed = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "book" }] });
  assert.equal(providerClimb(mixed)!.up, 500);
  // a main stage without climbs: no stage sums, so nothing
  const t = trail();
  delete t.stages.list[1].ascentM;
  assert.equal(providerClimb(t), undefined);
  // without our profile the trail's climb is the provider's
  assert.deepEqual(trailClimb(stated), { up: 450, down: 480, source: "site", how: "stated total", estimate: false });
});

// derived data with the map line's coverage and a profile over both main stages: stage 1 climbs
// 100 → 160 and drops to 130, stage 2 climbs to 250 with a wobble under the threshold
const profiled = (covered: [number, number, number]) =>
  ({
    ...measuredData(covered),
    elevation: {
      source: "gedtm30",
      spacingM: 100,
      highest: { m: 252, km: 0.7 },
      lowest: { m: 100, km: 0 },
      stageStarts: [{ number: "1", km: 0 }, { number: "2", km: 0.4 }],
      points: [[0, 100], [0.1, 134], [0.2, 160], [0.3, 130], [0.4, 130], [0.5, 205], [0.6, 199], [0.7, 252]],
    },
  }) as any;

test("climb: the terrain model's estimate first, summed per main stage to 10 m (2026-11-07)", () => {
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  const c = trailClimb(stated, profiled([1, 1, 1]))!;
  // stage 1: 60 up, 30 down; stage 2: 75 + 47 = 122 up (the 6 m dip uncounted), to 10 m: 120
  assert.deepEqual(terrainClimb(stated, profiled([1, 1, 1])), { up: 180, down: 30, source: "gedtm30", sideTrips: 0 });
  assert.deepEqual(c, { up: 180, down: 30, source: "gedtm30", sideTrips: 0, how: CLIMB_HOW, estimate: true });
  // the same as the stage table's estimates where the stages state none
  const bare = trail({ stages: { source: "site", list: trail().stages.list.map(({ ascentM, descentM, ...s }: any) => s) } });
  const est = stageEstimates(bare, profiled([1, 1, 1]));
  assert.equal(est.get("1")!.ascentM! + est.get("2")!.ascentM!, c.up);
  // a main stage the profile doesn't reach: no estimate, the provider's figure
  const short = profiled([1, 1, 1]);
  short.elevation.stageStarts = [{ number: "1", km: 0 }];
  short.elevation.points = short.elevation.points.slice(0, 4);
  assert.equal(terrainClimb(stated, short), undefined);
  assert.equal(trailClimb(stated, short)!.estimate, false);
});

test("climb: the pipeline's stage climbs from 100 m samples win over the profile's own samples", () => {
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  const d = profiled([1, 1, 1]);
  // a 500 m profile would miss climbs; the pipeline's 100 m samples found these (unrounded)
  d.elevation.stageClimbs = [{ number: "1", up: 214, down: 96 }, { number: "2", up: 305, down: 12 }];
  assert.deepEqual(terrainClimb(stated, d), { up: 210 + 310, down: 100 + 10, source: "gedtm30", sideTrips: 0 });
  // the stage table's estimates take them too, where a stage states none
  const bare = trail({ stages: { source: "site", list: trail().stages.list.map(({ ascentM, descentM, ...s }: any) => s) } });
  const est = stageEstimates(bare, d);
  assert.deepEqual([est.get("1")!.ascentM, est.get("1")!.descentM, est.get("2")!.ascentM], [210, 100, 310]);
  // a stage missing from them: no estimate (never mixed with the profile's sums)
  d.elevation.stageClimbs = [{ number: "1", up: 214, down: 96 }];
  assert.equal(terrainClimb(stated, d), undefined);
  // a trail without stages: the one segment's climbs
  const whole = { elevation: { source: "gedtm30", points: [[0, 100], [0.5, 120]], stageClimbs: [{ number: "1", up: 344, down: 336 }] } } as any;
  assert.deepEqual(routeEstimate(whole), { ascentM: 340, descentM: 340, source: "gedtm30" });
});

test("climb: a side trip walked there and back climbs both ways, its up and down in each total", () => {
  const t = trail();
  t.stages.list.push({ number: "V1", kind: "variant", outAndBack: true, from: "C", to: "Peak", km: 4 });
  const d = profiled([1, 1, 1]);
  d.elevation.stageClimbs = [{ number: "1", up: 60, down: 30 }, { number: "2", up: 122, down: 0 }];
  // up to the viewpoint 604 m, down 38 m on the way (one way): 600 + 40 more each way
  d.elevation.sideTrips = [{ number: "V1", up: 604, down: 38 }];
  assert.deepEqual(terrainClimb(t, d), { up: 180 + 640, down: 30 + 640, source: "gedtm30", sideTrips: 1 });
  // a derived file from before: the side trip left out, as until 2026-11-07
  delete d.elevation.sideTrips;
  assert.deepEqual(terrainClimb(t, d), { up: 180, down: 30, source: "gedtm30", sideTrips: 0 });
});

test("climb: the provider's figure where our map line covers under 95 % of the route", () => {
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  // (10.4 × 0.9 + 13 × 0.95) / 23.4 = 92.8 %, the same gate as the length
  const c = trailClimb(stated, profiled([0.9, 0.95, 1]))!;
  assert.equal(c.estimate, false);
  assert.deepEqual([c.up, c.down, c.how], [450, 480, "stated total"]);
  // the stage sums where no total is stated
  assert.equal(trailClimb(trail(), profiled([0.9, 0.95, 1]))!.up, 500);
  // no provider's figure at all: the estimate all the same
  const bare = trail({ stages: { source: "site", list: trail().stages.list.map(({ ascentM, descentM, ...s }: any) => s) } });
  assert.equal(trailClimb(bare, profiled([0.9, 0.95, 1]))!.estimate, true);
});

test("climb popover: ours, the provider's as Official, more than 10 % apart, coverage when short", () => {
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  const f = climbFacts(stated, profiled([1, 1, 1]));
  assert.equal(f.climb!.estimate, true);
  assert.deepEqual(f.official, { up: 450, down: 480, source: "site", how: "stated total" });
  assert.equal(f.apart, true); // 180 against 450
  assert.equal(f.short, null);
  // within 10 % on both: no Keep in mind
  const close = trail({ ascent: [{ m: 190, source: "site" }], descent: [{ m: 32, source: "site" }] });
  assert.equal(climbFacts(close, profiled([1, 1, 1])).apart, false);
  // falling back: the provider's figure, never "apart", and the coverage that says why
  const back = climbFacts(stated, profiled([0.9, 0.95, 1]));
  assert.equal(back.climb!.estimate, false);
  assert.equal(back.apart, false);
  assert.ok(Math.abs(back.short! - 0.928) < 0.001);
  // no official figure: no Official row
  const bare = trail({ stages: { source: "site", list: trail().stages.list.map(({ ascentM, descentM, ...s }: any) => s) } });
  assert.equal(climbFacts(bare, profiled([1, 1, 1])).official, undefined);
});

test("climb: the averages per day and the climbing per km take the trail's figure", () => {
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  const d = profiled([1, 1, 1]);
  const two = trail({ ascent: stated.ascent, descent: stated.descent, days: { min: 2, max: 2, basis: "stages", source: "site" } });
  // 180 m over 2 days, not the stage sums' 500
  assert.deepEqual(perDay(two, d)!.ascentM, { min: 90, max: 90 });
  assert.equal(perDay(two, d)!.est, true);
  // falling back: the provider's 450 m
  assert.deepEqual(perDay(two)!.ascentM, { min: 230, max: 230 });
  assert.equal(perDay(two)!.est, false);
  // (the gradients need 500 m windows: the made-up profile is short, so read it as 500 m samples)
  const climb = difficulty(stated, { ...d, elevation: { ...d.elevation, spacingM: 500 } }).dims.find((x) => x.id === "terrain")!.measures.find((m) => m.id === "climb")!;
  assert.equal(climb.text, "8 m per km"); // 180 m over the stages' 22.3 km
  assert.equal(climb.estimate, true);
  // the search record carries the same figure, marked as an estimate
  const s = summarize("x", { ...stated, name: "X", aliases: [], continents: [], countries: [], regions: [], tags: [], termini: { start: { name: "A" }, end: { name: "C" } } }, d);
  assert.deepEqual([s.ascentM, s.climbEst], [180, true]);
});

test("stage sums leave out the climbs when a main stage lacks them", () => {
  const t = trail();
  delete t.stages.list[1].ascentM;
  assert.equal(stageTotals(t)!.ascentM, undefined);
  assert.equal(stageTotals(t)!.km.value, 22.3);
});

test("stage sums count a side trip walked there and back twice, other variants never", () => {
  const t = trail();
  t.stages.list.push({ number: "V1", kind: "variant", outAndBack: true, from: "C", to: "Peak", km: 4, ascentM: 300, descentM: 0 });
  const totals = stageTotals(t)!;
  assert.equal(totals.km.value, 30.3); // 22.3 + 2 × 4; the 30 km variant left out
  assert.equal(totals.ascentM!.value, 800); // 500 + 300 up out + 0 up back
  assert.equal(totals.descentM!.value, 800);
  assert.match(totals.km.how, /1 side trip there and back/);
});

test("walking time by DIN 33466, to 15 minutes", () => {
  assert.equal(walkingMinutes(12, 0, 0), 180); // 3 h on the flat
  assert.equal(walkingMinutes(8, 600, 0), 180); // 2 h flat, 2 h up: 2 + 1 h
  assert.equal(walkingMinutes(10, 300, 500), 210); // 2.5 h flat, 2 h climbing: 2.5 + 1 h
});

test("gradients stay within each stage and find the steepest 500 m", () => {
  // stage 1 flat for 1 km, then stage 2 climbs 20 % for 1 km, 100 m samples
  const points: [number, number][] = [];
  for (let i = 0; i <= 10; i++) points.push([i / 10, 500]);
  for (let i = 11; i <= 20; i++) points.push([i / 10, 500 + (i - 10) * 20]);
  const g = gradients(points, [
    { number: "1", km: 0 },
    { number: "2", km: 1.05 },
  ]);
  assert.ok(g.bars.every((b) => b.stage === "1" ? b.grade === 0 : b.grade === 20));
  assert.equal(g.climb.grade, 20);
  assert.equal(g.climb.stage, "2");
  assert.ok(g.steepUpKm > 0.5 && 20 >= STEEP_PERCENT);
  assert.equal(g.steepDownKm, 0);
});

test("long trails sampled every 500 m get 500 m bars", () => {
  // 5 km climbing 10 %, samples every 500 m
  const points: [number, number][] = [];
  for (let i = 0; i <= 10; i++) points.push([i / 2, 500 + i * 50]);
  const g = gradients(points, [{ number: "1", km: 0 }], 500);
  assert.equal(barMetres(500), 500);
  assert.equal(barMetres(), 200);
  assert.equal(g.bars.length, 10);
  assert.ok(g.bars.every((b) => b.grade === 10));
  assert.equal(g.climb.grade, 10);
});

test("sleeping: the source's types, or at least three places in OpenStreetMap", () => {
  assert.deepEqual(sleepingCategories(["guesthouse"]), ["rooms"]);
  assert.deepEqual(sleepingCategories(["guesthouse"], { camping: 48, huts: 2, hostels: 10, rooms: 476 }), ["camping", "hostels", "rooms"]);
});

test("strip paths: one path per category, neighbouring runs joined", () => {
  const runs = [
    { category: "paved", fromKm: 0, toKm: 1 },
    { category: "paved", fromKm: 1, toKm: 2 },
    { category: "natural", fromKm: 2, toKm: 3 },
  ];
  assert.equal(mergeRuns(runs).length, 2);
  const paths = stripPaths(runs, (km) => km * 100, 0, 10);
  assert.deepEqual(
    paths.map((p) => p.category),
    ["paved", "natural"],
  );
  assert.equal(paths[0].d, "M0 0h200v10h-200z");
  assert.equal(n1(1.26), 1.3);
  // later rectangles move from the one before, without leading zeros
  assert.equal(rectsPath([[10, 0.6], [12.5, 2], [11.2, 0.4]], 5, 10), "M10 5h.6v10h-.6zm2.5 0h2v10h-2zm-1.3 0h.4v10h-.4z");
});

test("simplify keeps the shape and drops what doesn't show", () => {
  const line: [number, number][] = Array.from({ length: 101 }, (_, i) => [i, i === 50 ? 20 : 0.05 * (i % 2)]);
  const out = simplify(line, 0.2);
  assert.deepEqual(out, [[0, 0], [49, 0.05], [50, 20], [51, 0.05], [100, 0]]);
});

test("distances on the globe", () => {
  // Berlin to Munich, about 504 km
  assert.ok(Math.abs(kmBetween([13.405, 52.52], [11.582, 48.135]) - 504) < 5);
  assert.equal(typeof roundDistance(237), "number");
});

test("months: the best run of at least two season months, and a pick", () => {
  // Rothaarsteig-like: all year, hard in winter, moderate in Sep–Oct
  const levels = [4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 3, 4];
  assert.deepEqual(bestRun(levels, []), [9, 10]);
  // a season across the new year (Nov–Apr) stays in calendar order
  assert.deepEqual(bestRun([3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4], [11, 12, 1, 2, 3, 4]), [1, 2, 3, 4]);
  // one easy month alone doesn't make the run: the pair around it decides
  assert.deepEqual(bestRun([4, 4, 4, 4, 4, 4, 4, 4, 2, 4, 4, 4], [6, 7, 8, 9, 10]), [6, 7, 8, 9, 10]);
  const c = climateFor(levels, [], [12, 1, 2]);
  assert.deepEqual([c.level, c.worst, c.picked, c.out], [4, 4, true, []]);
  assert.deepEqual(climateFor(levels, [5, 6, 7, 8, 9, 10], [1]).out, [1]);
  assert.equal(monthsText([9, 10]), "Sep–Oct");
  assert.equal(monthsText([11, 12, 1, 2]), "Nov–Feb");
  assert.equal(monthsText([1, 5]), "Jan, May");
  assert.equal(monthsText([2, 3, 4, 5, 9, 10, 11]), "Feb–May, Sep–Nov");
  assert.equal(monthsText([12, 1, 2, 6, 7]), "Jun, Jul, Dec–Feb");
  assert.deepEqual(runBetween(11, 2), [11, 12, 1, 2]);
  assert.deepEqual(readPick("?months=7,8&where=Italy"), [7, 8]);
});


// trail page titles: at most 60 characters, shortened step by step (issue #181)
import { trailTitle, TITLE_MAX } from "../src/lib/page-title.ts";
test("trail titles keep the full pattern when it fits", () => {
  assert.equal(trailTitle("Dingle Way", "176", false, ["Ireland"]), "Dingle Way: 176 km hike in Ireland · huckepack");
});
test("trail titles drop about, then the site's name, then shorten the countries", () => {
  assert.equal(trailTitle("Alpe-Adria-Trail", "750", true, ["Austria", "Slovenia", "Italy"]), "Alpe-Adria-Trail: 750 km hike in Austria, Slovenia and Italy");
  assert.equal(trailTitle("Forststeig Elbe Sandstone", "105", false, ["Germany", "Czechia"]), "Forststeig Elbe Sandstone: 105 km hike in Germany & Czechia");
  assert.equal(trailTitle("Tour du Mont Blanc", "170", false, ["France", "Italy", "Switzerland"]), "Tour du Mont Blanc: 170 km hike in France +2");
  assert.equal(trailTitle("GR 20", "180", true, ["France"]), "GR 20: about 180 km hike in France · huckepack");
});
test("trail titles stay within the limit", () => {
  for (const [name, countries] of [["Merano High Mountain Trail", ["Italy"]], ["Coast to Coast Path", ["the United Kingdom"]], ["Path of Sacred Forests", ["Italy"]]] as const)
    assert.ok(trailTitle(name, "1,183", true, [...countries]).length <= TITLE_MAX, name);
});

// No cut-offs (2026-11-03): every broad skyline shape meets the ground gently, never in a wall, also at
// the box's left and right edges, which stand inside the band (TrailSkyline.astro), so no shape may reach
// them above the ground either
test("every trail has a skyline", async () => {
  const { readdirSync } = await import("node:fs");
  const slugs = readdirSync(new URL("../data/trails/", import.meta.url)).filter((f) => f.endsWith(".yaml") && !f.includes(" ")).map((f) => f.replace(/\.yaml$/, ""));
  const missing = slugs.filter((slug) => !SKYLINES[slug]);
  assert.deepEqual(missing, [], `trails without a skyline in src/lib/skylines.ts: ${missing.join(", ")}`);
});

test("skyline shapes meet the ground without a cut-off", () => {
  const walls: string[] = [];
  for (const [slug, sky] of Object.entries(SKYLINES)) {
    for (const [layer, shapes] of [["shapes", sky.shapes], ["front", sky.front ?? []]] as const) {
      shapes.forEach((shape, i) => {
        for (const sub of shape.d.split(/(?=M)/)) {
          // the subpath's points (curves by their end points)
          const pts: [number, number][] = [];
          let cur: [number, number] = [0, 0];
          for (const [, cmd, args] of sub.matchAll(/([MLHVQCZA])([^MLHVQCZA]*)/g)) {
            const a = args.split(/[ ,]+/).filter(Boolean).map(Number);
            if (cmd === "M" || cmd === "L") cur = [a[0], a[1]];
            else if (cmd === "H") cur = [a[0], cur[1]];
            else if (cmd === "V") cur = [cur[0], a[0]];
            else if (cmd === "Q") cur = [a[2], a[3]];
            else if (cmd === "C") cur = [a[4], a[5]];
            else if (cmd === "A") cur = [a[5], a[6]];
            else continue;
            pts.push(cur);
          }
          for (const p of pts) if ((p[0] <= 0 || p[0] >= SKY_W) && p[1] < SKY_H - 4) walls.push(`${slug} ${layer}[${i}] reaches the edge at y=${p[1]}`);
          if (pts.length < 3 || pts[0][1] !== SKY_H) continue;
          const xs = pts.map((p) => p[0]);
          if (Math.max(...xs) - Math.min(...xs) < BROAD) continue; // slender: a stack, a pillar, a trunk
          for (const [g, p] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
            if (g[1] !== SKY_H) continue;
            const rise = SKY_H - p[1];
            if (rise > 12 && Math.abs(p[0] - g[0]) < STEEP * rise) walls.push(`${slug} ${layer}[${i}] at x=${g[0]}`);
          }
        }
      });
    }
  }
  assert.deepEqual(walls, []);
});


// a trail without stages by design (issue #204): the Wonderland Trail's shape, 150 km over 10–14 days
const stageless = (over: Record<string, unknown> = {}) =>
  trail({
    stages: { source: "nps", none: true, list: [] },
    length: [{ km: 150, source: "nps" }],
    ascent: [{ m: 8230, source: "nps" }],
    descent: [{ m: 8230, source: "nps" }],
    days: { min: 10, max: 14, basis: "operator", source: "planner" },
    ...over,
  });

test("no stages: the stated totals and the suggested days, never stage sums", () => {
  const t = stageless();
  assert.equal(noStages(t), true);
  assert.equal(noStages(trail()), false);
  assert.equal(trailLength(t)!.value, 150);
  assert.equal(trailClimb(t)!.up, 8230);
  assert.deepEqual(trailDays(t), { min: 10, max: 14, basis: "operator", source: "planner" });
  assert.equal(stageTotals(t), undefined);
});

// where the days come from (the user's rule of 2026-11-07): the record says, nothing is derived
test("days: the record's days with their basis, and none where the record has none", () => {
  for (const basis of ["operator", "secondary"] as const)
    assert.deepEqual(trailDays(trail({ days: { min: 3, max: 5, basis, source: "site" } })), { min: 3, max: 5, basis, source: "site" });
  // one per main stage only as the record states it, with the stage list's source
  assert.deepEqual(trailDays(trail({ days: { min: 2, max: 2, basis: "stages", source: "site" } })), { min: 2, max: 2, basis: "stages", source: "site" });
  // stages but no days: no silent one-per-stage fallback
  assert.equal(trailDays(trail()), undefined);
  // the search record: null, which only a days filter leaves out
  const listed = (over: Record<string, unknown> = {}) =>
    summarize("x", trail({ name: "X", aliases: [], continents: [], countries: [], regions: [], tags: [], termini: { start: { name: "A" }, end: { name: "C" } }, ...over }));
  assert.equal(listed().days, null);
  assert.deepEqual(listed({ days: { min: 3, max: 5, basis: "operator", source: "site" } }).days, [3, 5]);
});

test("days filter: a trail without days stays while no length is picked, and leaves once one is", () => {
  const none = { season: null, days: null, continents: [], countries: [] } as any;
  const five = { ...none, days: [5, 5] } as any;
  const f = noFilters();
  assert.equal(matches(none, f), true);
  const week = { ...f, dayLo: DAYS.indexOf(4), dayHi: DAYS.indexOf(7) };
  assert.equal(matches(none, week), false);
  assert.equal(matches(five, week), true);
});

// Per day (the user's rule 4, 2026-11-07): the length the page shows over the days, the ascent
// likewise, for every trail with days
test("per day: a range from the most and the fewest days", () => {
  const day = perDay(stageless())!;
  // 150 km over 14 to 10 days, 8,230 m likewise
  assert.deepEqual(day.km, { min: 11, max: 15 });
  assert.deepEqual(day.ascentM, { min: 590, max: 820 });
  assert.equal(day.est, false);
  assert.deepEqual(day.days, { min: 10, max: 14, basis: "operator", source: "planner" });
  assert.deepEqual([day.length, day.lengthSource, day.measured], [150, "nps", false]);
});

test("per day: one value where the days are one number", () => {
  const day = perDay(stageless({ days: { min: 12, max: 12, basis: "operator", source: "planner" } }))!;
  assert.deepEqual(day.km, { min: 13, max: 13 }); // 12.5
  assert.deepEqual(day.ascentM, { min: 690, max: 690 }); // 685.8
});

test("per day: none without days", () => {
  assert.equal(perDay(trail()), undefined);
  assert.equal(perDay(stageless({ days: undefined })), undefined);
});

test("per day: km whole, a tenth under 10 km; metres to 10 m", () => {
  // 150 km over 20 to 16 days: 7.5 and 9.375
  assert.deepEqual(perDay(stageless({ days: { min: 16, max: 20, basis: "secondary", source: "planner" } }))!.km, { min: 7.5, max: 9.4 });
  // 9.96 rounds to 10
  assert.deepEqual(perDay(stageless({ length: [{ km: 99.6, source: "nps" }], days: { min: 10, max: 10, basis: "operator", source: "planner" } }))!.km, { min: 10, max: 10 });
  // 10.5 and up: whole km
  assert.deepEqual(perDay(stageless({ length: [{ km: 105, source: "nps" }], days: { min: 10, max: 10, basis: "operator", source: "planner" } }))!.km, { min: 11, max: 11 });
});

test("per day: trails with stages divide the trail's length by the days, not the stage average", () => {
  // 22.3 km of stages over 4 to 3 days
  const t = trail({ days: { min: 3, max: 4, basis: "operator", source: "site" } });
  assert.deepEqual(perDay(t)!.km, { min: 5.6, max: 7.4 });
  // our measurement where there is one, as the page shows it (23 km)
  const two = trail({ days: { min: 2, max: 2, basis: "stages", source: "site" } });
  const d = perDay(two, measuredData([1, 1, 1]))!;
  assert.deepEqual([d.length, d.measured, d.km.min], [23, true, 12]);
  // the hardest day for difficulty keeps the unrounded length: 23.4 / 2
  assert.equal(d.hardest.km, 11.7);
});

test("no stages: climbs from the terrain model where none are stated", () => {
  const d = { elevation: { source: "gedtm30", points: [[0, 100], [0.1, 150], [0.2, 120], [0.3, 200]] } } as any;
  assert.deepEqual(routeEstimate(d), { ascentM: 130, descentM: 30, source: "gedtm30" });
  const day = perDay(stageless({ ascent: [], descent: [] }), d)!;
  assert.equal(day.est, true);
  assert.deepEqual(day.ascentM, { min: 10, max: 10 });
});

test("no stages: Effort from an average day at the fewest days, an estimate", () => {
  const effort = difficulty(stageless()).dims.find((x) => x.id === "effort")!;
  // 15 km, 823 m up and down: 3.75 h flat, 4.39 h climbing, so 4.39 + 1.875 h, to 15 minutes
  assert.equal(effort.by.text, "6 h 15");
  assert.equal(effort.by.estimate, true);
  assert.equal(effort.by.where, "an average day over 10 days");
  assert.equal(effort.by.source, "planner");
});

test("climbs: a rise or drop counts only once it reaches the 10 m threshold (2026-11-07)", () => {
  assert.equal(CLIMB_THRESHOLD_M, 10);
  // wobbles under 10 m add nothing, however many
  assert.deepEqual(climbs([100, 104, 99, 105, 100, 106, 101]), { up: 0, down: 0 });
  // a steady climb counts in steps of at least 10 m from the last reference: 100 → 112 → 124
  assert.deepEqual(climbs([100, 106, 112, 118, 124, 127]), { up: 24, down: 0 });
  // a drop of exactly 10 m counts, then the climb from the new low
  assert.deepEqual(climbs([200, 190, 215]), { up: 25, down: 10 });
  // without the threshold, every step: the raw sums
  assert.deepEqual(climbs([100, 104, 99, 105], 0), { up: 10, down: 5 });
  assert.deepEqual(climbs([]), { up: 0, down: 0 });
});

test("stage estimates: climbs along each stage's own samples, each stage starting fresh", () => {
  const t = trail({
    stages: {
      source: "site",
      list: [
        { number: "1", kind: "main", from: "A", to: "B", km: 0.3 },
        { number: "2", kind: "main", from: "B", to: "C", km: 0.3 },
      ],
    },
  });
  // stage 1 climbs 8 m (under the threshold) and stage 2 another 8 m: as one route the climb
  // reaches 10 m (12 m counted at km 0.4), but each stage alone stays under it
  const d = {
    elevation: {
      source: "gedtm30",
      stageStarts: [{ number: "1", km: 0 }, { number: "2", km: 0.3 }],
      points: [[0, 100], [0.1, 104], [0.2, 108], [0.3, 108], [0.4, 112], [0.5, 116]],
    },
  } as any;
  const est = stageEstimates(t, d);
  assert.deepEqual([est.get("1")!.ascentM, est.get("2")!.ascentM], [0, 0]);
  assert.equal(routeEstimate(d)!.ascentM, 10); // 12 m, to 10 m
});
