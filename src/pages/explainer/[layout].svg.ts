// The explainer's still (the evening, the beds lit), as a static SVG per frame shape: wide (16:9) and
// tall (4:5, phones). The home page shows it as an image behind the play button, and alone with reduced
// motion; the same drawing the player animates (src/lib/explainer/film.ts).
import type { APIRoute } from "astro";
import { filmData } from "../../lib/explainer/data";
import { LAYOUTS, POSTER_T, film, state } from "../../lib/explainer/film";

export function getStaticPaths() {
  return [{ params: { layout: "wide" } }, { params: { layout: "tall" } }];
}

export const GET: APIRoute = async ({ params }) => {
  const d = await filmData();
  const L = LAYOUTS[params.layout as "wide" | "tall"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}">${film(d, L, state(d, L, POSTER_T))}</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
