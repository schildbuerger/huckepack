// After the build, every link to another website gets its new tab and its rel in the HTML itself
// (the user's decision of 2026-11-07, docs/scope.md), so search engines that don't run scripts read
// them too: target="_blank", rel="noopener" (no noreferrer: operators see huckepack.me as the
// referrer, the origin only, by the browsers' default policy) plus " nofollow" for the commercial
// URL prefixes in data/reference/commercial-links.yaml, and the screen-reader note "(opens in a new
// tab)". Links that already set a target, links within huckepack, mailto: and the like stay as
// they are, and nothing inside <script> or <style> is touched. In dev, Base.astro's script does
// the same in the browser. Links made by scripts later set rel themselves.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const NEW_TAB_NOTE = '<span class="sr-only"> (opens in a new tab)</span>';

// the `prefix:` lines of commercial-links.yaml (a list of { prefix, reason }), without the scheme
export function readPrefixes(yaml) {
  return [...yaml.matchAll(/^-\s+prefix:\s*["']?([^"'\s#]+)/gm)].map((m) => m[1].toLowerCase());
}

const attr = (attrs, name) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs)?.[1];

// rel for a link to `href` from `host`, or null when the link stays as it is
export function relFor(href, host, commercial) {
  let url;
  try {
    url = new URL(href.replaceAll("&amp;", "&"));
  } catch {
    return null; // relative or not a URL: within huckepack
  }
  if (!/^https?:$/.test(url.protocol) || url.host === host) return null;
  const bare = `${url.host}${url.pathname}${url.search}`.toLowerCase();
  return commercial.some((p) => bare.startsWith(p)) ? "noopener nofollow" : "noopener";
}

// the page's HTML with every outgoing link opening in a new tab, with its rel and the note
/** @param {string} html @param {{ host: string, commercial?: string[] }} opts */
export function rewriteLinks(html, { host, commercial = [] }) {
  return html
    .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/i)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, body) => {
            const href = attr(attrs, "href");
            if (!href || attr(attrs, "target") !== undefined) return whole;
            const rel = relFor(href, host, commercial);
            if (!rel) return whole;
            const old = attr(attrs, "rel");
            const tokens = new Set([...(old ?? "").split(/\s+/).filter(Boolean), ...rel.split(" ")]);
            const rest = old === undefined ? attrs : attrs.replace(/\srel\s*=\s*"[^"]*"/i, "");
            return `<a${rest} target="_blank" rel="${[...tokens].join(" ")}">${body}${NEW_TAB_NOTE}</a>`;
          }),
    )
    .join("");
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

export default function externalLinks({ list = "data/reference/commercial-links.yaml" } = {}) {
  let host = "";
  return {
    name: "external-links",
    hooks: {
      "astro:config:done": ({ config }) => {
        host = new URL(config.site).host;
      },
      "astro:build:done": async ({ dir, logger }) => {
        const commercial = readPrefixes(await readFile(list, "utf8"));
        let pages = 0;
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const html = await readFile(file, "utf8");
          const out = rewriteLinks(html, { host, commercial });
          if (out !== html) {
            await writeFile(file, out);
            pages++;
          }
        }
        logger.info(`${pages} pages: links to other websites open in a new tab (${commercial.length} commercial prefixes nofollow)`);
      },
    },
  };
}
