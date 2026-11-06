// Lighthouse on five page types in light and dark mode against a built site served locally
// (issue #91): accessibility, best practices and SEO must score 100, and performance at least
// PERFORMANCE_MIN (enforced since 2026-11-06; it varies ±5 between runs, so not 100). Usage:
// node scripts/lighthouse-check.mjs http://localhost:4321
// Needs Chrome (CHROME_PATH) and lighthouse (npx). Exits 1 if a category is below its bar.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:4321";
const PAGES = ["/", "/trails/", "/trails/guide/", "/trails/alpe-adria-trail/", "/trails/map/"];
const SCHEMES = { light: 1, dark: 0 };
const REQUIRED = ["accessibility", "best-practices", "seo"];
const PERFORMANCE_MIN = 90;
const dir = mkdtempSync(join(tmpdir(), "lh-"));
let failed = false;
for (const page of PAGES) {
  for (const [scheme, value] of Object.entries(SCHEMES)) {
    const out = join(dir, `${page.replace(/\W+/g, "_")}-${scheme}.json`);
    execFileSync(
      "npx",
      [
        "--yes", "lighthouse@12.8.2", base + page, "--quiet", "--preset=desktop",
        `--chrome-flags=--headless=new --no-sandbox --blink-settings=preferredColorScheme=${value}`,
        "--output=json", `--output-path=${out}`,
      ],
      { stdio: "inherit" },
    );
    const r = JSON.parse(readFileSync(out, "utf8"));
    const score = (id) => Math.round((r.categories[id]?.score ?? 0) * 100);
    const low = REQUIRED.filter((id) => score(id) < 100);
    const slow = score("performance") < PERFORMANCE_MIN;
    const fails = low.flatMap((id) =>
      r.categories[id].auditRefs
        .map((ref) => r.audits[ref.id])
        .filter((a) => a.score !== null && a.score < 1 && !["informative", "notApplicable", "manual"].includes(a.scoreDisplayMode))
        .map((a) => `${id}: ${a.id}`),
    );
    // what slows a page down: the metrics Lighthouse scores, worst first
    const metrics = ["largest-contentful-paint", "total-blocking-time", "first-contentful-paint", "speed-index", "cumulative-layout-shift"]
      .map((id) => r.audits[id])
      .sort((a, b) => a.score - b.score)
      .map((a) => `${a.id} ${a.displayValue}`);
    const perf = slow ? [`performance below ${PERFORMANCE_MIN}: ${metrics.slice(0, 3).join(", ")}`] : [];
    const all = [...perf, ...fails];
    console.log(`${page} ${scheme}: performance ${score("performance")}, ${REQUIRED.map((id) => `${id} ${score(id)}`).join(", ")}${all.length ? `  FAIL ${all.join("; ")}` : ""}`);
    if (low.length || slow) failed = true;
  }
}
process.exit(failed ? 1 : 0);
