// Tests for our own GPX (issue #106, src/lib/gpx.ts): only where the operator offers none, without
// stages under 95 % matched, and with the ODbL notice in the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gpxDocument, joinLabels, linesFor, ownGpx, type OwnGpx } from "../src/lib/gpx.ts";

test("no own GPX where the operator offers one", () => {
  assert.equal(ownGpx("westweg", { url: "https://example.org/gpx/" }), null);
});

test("an own GPX where the operator offers none, from the traced lines", () => {
  const own = ownGpx("westweg", undefined);
  assert.ok(own);
  assert.match(own.osmDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(own.stages.every((s) => s.covered >= 0.95));
  assert.equal(own.stages.length + own.leftOut.length, linesFor("westweg")!.stages.length);
  // `none` (the operator plainly offers no GPX) still gets ours
  assert.ok(ownGpx("westweg", { none: "stage tracks only after login" }));
});

test("stage labels read as a list", () => {
  assert.equal(joinLabels(["22"]), "22");
  assert.equal(joinLabels(["5", "22"]), "5 and 22");
  assert.equal(joinLabels(["5", "14 (variant)", "22"]), "5, 14 (variant) and 22");
});

test("the file credits OpenStreetMap under the ODbL, names what is left out and escapes text", () => {
  const own: OwnGpx = {
    osmDate: "2026-10-28",
    stages: [{ number: "1", kind: "main", from: "A & B", to: "C", covered: 1, lines: [[[8.1, 48.2], [8.2, 48.3]]] }],
    leftOut: ["5", "22"],
  };
  const gpx = gpxDocument("Test <Way>", "https://huckepack.me/trails/test/", own);
  assert.match(gpx, /<license>https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/<\/license>/);
  assert.match(gpx, /© OpenStreetMap contributors/);
  assert.match(gpx, /Left out: stages 5 and 22/);
  assert.match(gpx, /<name>Stage 1: A &amp; B – C<\/name>/);
  assert.match(gpx, /<name>Test &lt;Way&gt;<\/name>/);
  assert.match(gpx, /<trkpt lat="48.2" lon="8.1"\/>/);
  assert.match(gpx, /<time>2026-10-28T00:00:00Z<\/time>/);
});
