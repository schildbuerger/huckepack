// Tests for the figures the site derives at build time (review of 2026-10-30, #21): lengths and
// climbs by the record's rules, gradients and walking times, and the chart helpers. Run with
// `npm test` (Node's test runner; Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { barMetres, climbs, CLIMB_THRESHOLD_M, gradients, noStages, perDay, routeEstimate, stageEstimates, sleepingCategories, trailClimb, trailLength, providerLength, measuredLength, measuredCover, compareLength, trailDays, walkingMinutes, stageTotals, STEEP_PERCENT } from "../src/lib/trails.ts";
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

test("climb: the stated pair only from one source, else the main stages' sums", () => {
  assert.deepEqual(
    [trailClimb(trail())!.up, trailClimb(trail())!.down],
    [500, 500],
  );
  const stated = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "site" }] });
  assert.equal(trailClimb(stated)!.up, 450);
  // ascent and descent from different sources are never paired: back to the stage sums
  const mixed = trail({ ascent: [{ m: 450, source: "site" }], descent: [{ m: 480, source: "book" }] });
  assert.equal(trailClimb(mixed)!.up, 500);
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
    days: { min: 10, max: 14, source: "planner" },
    ...over,
  });

test("no stages: the stated totals and the suggested days, never stage sums", () => {
  const t = stageless();
  assert.equal(noStages(t), true);
  assert.equal(noStages(trail()), false);
  assert.equal(trailLength(t)!.value, 150);
  assert.equal(trailClimb(t)!.up, 8230);
  assert.deepEqual(trailDays(t), { min: 10, max: 14, source: "planner", perStage: false });
  assert.equal(stageTotals(t), undefined);
});

test("no stages: averages per day as a range from the most and the fewest days", () => {
  const day = perDay(stageless())!;
  assert.deepEqual(day.km, { min: 10.7, max: 15 });
  assert.deepEqual(day.ascentM, { min: 590, max: 820 });
  assert.equal(day.est, false);
  // the length and the days from different sources: both named
  assert.deepEqual([day.lengthSource, day.daysSource], ["nps", "planner"]);
  // one number of days: no range
  assert.deepEqual(perDay(stageless({ days: { min: 12, max: 12, source: "planner" } }))!.km, { min: 12.5, max: 12.5 });
  // trails with stages keep their averages per stage
  assert.equal(perDay(trail()), undefined);
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
