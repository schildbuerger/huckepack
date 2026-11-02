// Every trail's main route in one small file for the world map (issue #33): the main stages of
// public/routes/<slug>.geojson, thinned, one MultiLineString each, with the trail's slug. Built with
// the site. The points are shared out from one budget (issue #93): up to 150 per trail, fewer as
// trails are added (at least 25), so the file stays about the same size; a trail's own page has the
// detailed line.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { existsSync, readFileSync } from "node:fs";

const BUDGET = 6000;
const MOST = 150;
const LEAST = 25;

export const GET: APIRoute = async () => {
  const features = [];
  const trails = await getCollection("trails");
  const POINTS = Math.max(LEAST, Math.min(MOST, Math.floor(BUDGET / Math.max(trails.length, 1))));
  for (const trail of trails) {
    const file = `public/routes/${trail.id}.geojson`;
    if (!existsSync(file)) continue;
    const route = JSON.parse(readFileSync(file, "utf8"));
    const lines: number[][][] = route.features
      .filter((f: any) => f.properties.kind === "main")
      .map((f: any) => f.geometry.coordinates as number[][]);
    const total = lines.reduce((n, l) => n + l.length, 0);
    const step = Math.max(1, Math.floor(total / POINTS));
    const thin = lines.map((l) => l.filter((_, i) => i % step === 0 || i === l.length - 1).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
    features.push({ type: "Feature", properties: { slug: trail.id }, geometry: { type: "MultiLineString", coordinates: thin } });
  }
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { headers: { "Content-Type": "application/json" } });
};
