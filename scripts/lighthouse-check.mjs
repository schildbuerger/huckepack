// Lighthouse on five page types in light and dark mode against a built site served locally
// (issue #91): accessibility, best practices and SEO must score 100, performance is only reported
// (it varies ±5 between runs). Usage: node scripts/lighthouse-check.mjs http://localhost:4321
// Needs Chrome (CHROME_PATH) and lighthouse (npx). Exits 1 if a required category is below 100.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:4321";
const PAGES = ["/", "/trails/", "/trails/guide/", "/trails/alpe-adria-trail/", "/trails/map/"];
const SCHEMES = { light: 1, dark: 0 };
const REQUIRED = ["accessibility", "best-practices", "seo"];
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
    const fails = low.flatMap((id) =>
      r.categories[id].auditRefs
        .map((ref) => r.audits[ref.id])
        .filter((a) => a.score !== null && a.score < 1 && !["informative", "notApplicable", "manual"].includes(a.scoreDisplayMode))
        .map((a) => `${id}: ${a.id}`),
    );
    console.log(`${page} ${scheme}: performance ${score("performance")}, ${REQUIRED.map((id) => `${id} ${score(id)}`).join(", ")}${fails.length ? `  FAIL ${fails.join("; ")}` : ""}`);
    if (low.length) failed = true;
  }
}
process.exit(failed ? 1 : 0);
