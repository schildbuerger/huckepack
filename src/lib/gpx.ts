// Our own GPX of a trail (issue #106, decided 2026-11-05): only where the operator offers none
// (no `officialGpx.url`), built from our OpenStreetMap tracing (data/derived/lines/<slug>.json,
// written by pipeline/routes.py) and published under the ODbL. Stages whose OSM match covers less
// than 95 % of the official track are left out: there OSM differs from the trail or misses a
// path, and a walker navigating by the file could take the wrong way. Detours and transfers (cable
// cars, boats) are never in it. The trail page (src/pages/trails/[slug].astro) and the file
// (src/pages/gpx/[slug].gpx.ts) both decide with ownGpx(), so the link and the file agree.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const MIN_COVERED = 0.95;

type Lines = {
  osmDate: string | null;
  stages: { number: string; kind: string; from: string; to: string; covered: number; lines: [number, number][][] }[];
};

export type OwnGpx = {
  osmDate: string | null;
  stages: Lines["stages"]; // the stages in the file
  leftOut: string[]; // labels of the stages left out ("22", "9 Ost (variant)")
};

const label = (s: { number: string; kind: string }) => (s.kind === "main" ? s.number : `${s.number} (${s.kind})`);

export const linesFor = (slug: string): Lines | null => {
  const path = join(process.cwd(), "data", "derived", "lines", `${slug}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Lines) : null;
};

// the own GPX for a trail, or null where the operator offers one or nothing is well enough matched
export const ownGpx = (slug: string, officialGpx: { url: string } | { none: string } | undefined): OwnGpx | null => {
  if (officialGpx && "url" in officialGpx) return null;
  const lines = linesFor(slug);
  if (!lines) return null;
  const stages = lines.stages.filter((s) => s.covered >= MIN_COVERED);
  if (!stages.length) return null;
  return { osmDate: lines.osmDate, stages, leftOut: lines.stages.filter((s) => s.covered < MIN_COVERED).map(label) };
};

// "22", "5 and 22", "5, 14 and 22"
export const joinLabels = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const gpxDocument = (name: string, pageUrl: string, own: OwnGpx): string => {
  const date = own.osmDate ?? "";
  const desc =
    `Traced by huckepack from OpenStreetMap data${date ? ` of ${date}` : ""}; not the operator's official track. ` +
    `Check the route on the official website and on the ground.` +
    (own.leftOut.length
      ? ` Left out: stage${own.leftOut.length > 1 ? "s" : ""} ${joinLabels(own.leftOut)}, where OpenStreetMap differs from the official route.`
      : "") +
    ` Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).`;
  const trks = own.stages
    .map((s) => {
      const title = `${s.kind === "main" ? "Stage" : s.kind === "variant" ? "Variant" : "Approach"} ${s.number}: ${s.from} – ${s.to}`;
      const segs = s.lines
        .map((l) => `<trkseg>${l.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join("")}</trkseg>`)
        .join("\n");
      return `<trk><name>${esc(title)}</name><type>${s.kind}</type>\n${segs}\n</trk>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="huckepack (https://huckepack.me)" xmlns="http://www.topografix.com/GPX/1/1">
<metadata>
<name>${esc(name)}</name>
<desc>${esc(desc)}</desc>
<author><name>huckepack</name></author>
<copyright author="OpenStreetMap contributors">${date ? `<year>${date.slice(0, 4)}</year>` : ""}<license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>
<link href="${esc(pageUrl)}"><text>${esc(name)} on huckepack</text></link>${date ? `\n<time>${date}T00:00:00Z</time>` : ""}
</metadata>
${trks}
</gpx>
`;
};
