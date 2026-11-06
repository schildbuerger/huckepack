// After the build, the trail pages' large chart data (`<script type="application/json"
// class="chart-heavy">`: the terrain profile's samples, every place in the water and sleeping lanes)
// move out of the page into one file beside it, `/trails/<slug>/charts.json`, an array in the
// blocks' order; each block keeps only where its data is (`data-src`, `data-i`). The hover scripts
// fetch it on the first approach to a chart, so the page itself stays small (on the Alpe-Adria page
// about 260 KB of 740). In dev nothing moves and the scripts read the blocks as they are.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK = /<script([^>]*\bclass="chart-heavy"[^>]*)>([\s\S]*?)<\/script>/g;

export default function chartFiles() {
  return {
    name: "chart-files",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const trails = join(fileURLToPath(dir), "trails");
        let pages = 0;
        let moved = 0;
        for (const slug of await readdir(trails)) {
          const file = join(trails, slug, "index.html");
          const html = await readFile(file, "utf8").catch(() => null);
          if (!html || !html.includes("chart-heavy")) continue;
          const parts = [];
          const out = html.replace(BLOCK, (_, attrs, body) => {
            parts.push(body.trim() || "null");
            moved += body.length;
            return `<script${attrs} data-src="/trails/${slug}/charts.json" data-i="${parts.length - 1}"></script>`;
          });
          await writeFile(join(trails, slug, "charts.json"), `[${parts.join(",")}]`);
          await writeFile(file, out);
          pages++;
        }
        logger.info(`${pages} trail pages: ${Math.round(moved / 1024)} KB of chart data moved into charts.json`);
      },
    },
  };
}
