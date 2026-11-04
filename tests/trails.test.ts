// Tests for the figures the site derives at build time (review of 2026-10-30, #21): lengths and
// climbs by the record's rules, gradients and walking times, and the chart helpers. Run with
// `npm test` (Node's test runner; Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { barMetres, gradients, sleepingCategories, trailClimb, trailLength, walkingMinutes, stageTotals, STEEP_PERCENT } from "../src/lib/trails.ts";
import { mergeRuns, stripPaths, n1 } from "../src/lib/svg.ts";
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

test("length: the stated total first, else the main stages' sum", () => {
  assert.equal(trailLength(trail())!.value, 22.3);
  assert.equal(trailLength(trail({ length: [{ km: 20, source: "site" }] }))!.value, 20);
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

