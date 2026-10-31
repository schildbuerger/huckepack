// Tests for the figures the site derives at build time (review of 2026-10-30, #21): lengths and
// climbs by the record's rules, gradients and walking times, and the chart helpers. Run with
// `npm test` (Node's test runner; Node strips the types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradients, trailClimb, trailLength, walkingMinutes, stageTotals, STEEP_PERCENT } from "../src/lib/trails.ts";
import { mergeRuns, stripPaths, n1 } from "../src/lib/svg.ts";
import { kmBetween, roundDistance } from "../src/lib/geo.ts";

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
