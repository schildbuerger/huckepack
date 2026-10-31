// The sitemap for search engines (issue #38), built with the site: every page plus one URL per
// trail, in the canonical form Base.astro gives each page (absolute, with a trailing slash). Pages
// are found by their files, so a new page is listed without touching this file; left out are
// pages that ask not to be indexed (`personal` on Base adds the noindex meta: a page passes it
// itself or through a layout that does, as the legal notice and the privacy policy do through
// Legal.astro), dynamic routes (the trails are added from the collection), the 404 page and local
// preview pages.
// Each URL carries its last change (lastmod): the date of the last commit to the trail's data (its
// record, derived data and map line) or to the page's own file; none for files not yet committed.
// The deploy checks out the full history for it (.github/workflows/deploy.yml).
// robots.txt points here.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { execFileSync } from "node:child_process";

// the date (YYYY-MM-DD) of the last commit touching any of the files, or null
const lastCommit = (files: string[]): string | null => {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", ...files], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
};

const pages = import.meta.glob<string>("./**/*.astro", { query: "?raw", import: "default", eager: true });
const layouts = import.meta.glob<string>("../layouts/*.astro", { query: "?raw", import: "default", eager: true });
const personal = /<Base\b[^>]*\bpersonal\b/s;
// layouts that pass `personal` to Base, by the name a page imports them under (the file name)
const noindexLayouts = Object.entries(layouts)
  .filter(([, source]) => personal.test(source))
  .map(([file]) => file.replace(/^.*\/(.+)\.astro$/, "$1"));
const noindex = (source: string) => personal.test(source) || noindexLayouts.some((name) => new RegExp(`<${name}\\b`).test(source));

export const GET: APIRoute = async ({ site }) => {
  const paths = new Map(
    Object.entries(pages)
      .filter(([file, source]) => !file.includes("[") && file !== "./404.astro" && !file.startsWith("./preview/") && !noindex(source))
      .map(([file]) => [
        file.replace(/^\.\//, "/").replace(/(index)?\.astro$/, "").replace(/\/?$/, "/"),
        lastCommit([file.replace(/^\.\//, "src/pages/")]),
      ]),
  );
  for (const t of await getCollection("trails")) {
    paths.set(`/trails/${t.id}/`, lastCommit([`data/trails/${t.id}.yaml`, `data/derived/${t.id}.json`, `public/routes/${t.id}.geojson`]));
  }
  const urls = [...paths].sort(([a], [b]) => a.localeCompare(b));
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([p, date]) => `  <url><loc>${new URL(p, site).href}</loc>${date ? `<lastmod>${date}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
