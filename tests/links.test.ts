// Tests for the links to other websites (src/integrations/external-links.mjs, the user's decision of
// 2026-11-07): followed by default, nofollow for the commercial prefixes, noopener without
// noreferrer, a new tab with the screen-reader note; everything else untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEW_TAB_NOTE, readPrefixes, rewriteLinks } from "../src/integrations/external-links.mjs";

const opts = { host: "huckepack.me", commercial: ["www.outdooractive.com/", "lastorres.com/"] };
const run = (html: string) => rewriteLinks(html, opts);

test("a link to an operator opens in a new tab and is followed", () => {
  assert.equal(
    run('<p><a href="https://www.nps.gov/isro/">NPS</a></p>'),
    `<p><a href="https://www.nps.gov/isro/" target="_blank" rel="noopener">NPS${NEW_TAB_NOTE}</a></p>`,
  );
});

test("a commercial prefix gets nofollow, also over http and with other attributes", () => {
  assert.equal(
    run('<a class="x" href="http://www.outdooractive.com/de/r/2809168">OA</a>'),
    `<a class="x" href="http://www.outdooractive.com/de/r/2809168" target="_blank" rel="noopener nofollow">OA${NEW_TAB_NOTE}</a>`,
  );
  // per URL, not per domain: another path on a listed host's neighbour stays followed
  assert.match(run('<a href="https://www.lastorres.com/x">x</a>'), /rel="noopener"/);
  assert.match(run('<a href="https://lastorres.com/en/o-circuit/">x</a>'), /rel="noopener nofollow"/);
});

test("a link that already sets its target is left alone", () => {
  const html = '<a href="https://example.org/" target="_self">x</a>';
  assert.equal(run(html), html);
});

test("links within huckepack, relative links and mailto stay as they are", () => {
  for (const html of [
    '<a href="/privacy/">Privacy</a>',
    '<a href="https://huckepack.me/trails/">Trails</a>',
    '<a href="#map">Map</a>',
    '<a href="mailto:someone@example.org">Mail</a>',
  ])
    assert.equal(run(html), html);
});

test("an existing rel keeps its tokens; scripts are not touched", () => {
  assert.match(run('<a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>'), /rel="license noopener"/);
  const script = '<script>const t = `<a href="https://example.org/">x</a>`;</script>';
  assert.equal(run(script), script);
});

test("the commercial list reads its prefixes", () => {
  const prefixes = readPrefixes(readFileSync("data/reference/commercial-links.yaml", "utf8"));
  assert.ok(prefixes.includes("www.outdooractive.com/"));
  assert.ok(prefixes.every((p) => !p.startsWith("http") && p.includes("/")));
});
