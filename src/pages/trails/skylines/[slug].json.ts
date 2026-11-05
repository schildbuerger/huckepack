// One trail's skyline as data, for the home page's "Trails near you" panorama: the hand-drawn landscape
// (src/lib/skylines.ts) with its detail (src/lib/skyline-detail.ts) and the trail's own profile as the
// nearest ridge, as on the trail page's head, in the drawings' 1600 × 320 box; `top` is the drawing's
// highest point (y), to stand it on the horizon. The page fetches only the trails it shows (about 10 KB
// each). An endpoint, so the sitemap leaves it out.
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, getEntry } from "astro:content";
import { SKYLINES, SKY_H, profileRidge } from "../../../lib/skylines";
import { withDetail, sample } from "../../../lib/skyline-detail";

export const getStaticPaths = (async () =>
  (await getCollection("trails")).filter((t) => SKYLINES[t.id]).map((t) => ({ params: { slug: t.id } }))) satisfies GetStaticPaths;

// whole units are plenty at the size the panorama draws them
const tidy = (d: string) => d.replace(/\d+\.\d+/g, (m) => String(Math.round(Number(m))));

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug!;
  const sky = SKYLINES[slug];
  const el = (await getEntry("derived", slug))?.data.elevation;
  const shapes = withDetail(sky, el ? profileRidge(el.points, el.routeKm) : undefined).filter((s) => s.d);
  const top = Math.max(0, Math.min(...shapes.flatMap((s) => sample(s.d).map((p) => p[1])), SKY_H - 20));
  return new Response(JSON.stringify({ shapes: shapes.map((s) => ({ d: tidy(s.d), c: s.c })), top: Math.round(top) }), {
    headers: { "Content-Type": "application/json" },
  });
};
