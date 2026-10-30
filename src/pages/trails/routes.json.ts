// Every trail's main route in one small file for the world map (issue #33): the main stages of
// public/routes/<slug>.geojson, thinned to about 150 points per trail, one MultiLineString each,
// with the trail's slug. Built with the site.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { existsSync, readFileSync } from "node:fs";

const POINTS = 150;

export const GET: APIRoute = async () => {
  const features = [];
  for (const trail of await getCollection("trails")) {
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
