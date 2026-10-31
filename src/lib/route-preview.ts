// A trail's route as a light SVG, drawn at build time, shown in the map box until the interactive
// map starts (on the first scroll, pointer move, tap or key press: PageSpeed, issue #86). Web
// Mercator, framed like the map's fitBounds, so the route stays put when the map takes over.
// Colours are the theme tokens (classes styled by TrailMap), so it follows the theme switch. Of three
// previews (the line; with numbered stage starts; with named termini over a grid), approach A: only
// the line, start and finish, the calmest while the map is moments away.
import { readFileSync, existsSync } from "node:fs";
import { n1 } from "./svg";

type Feature = { properties: { kind: string; number: string; by?: string }; geometry: { coordinates: [number, number][] } };

const W = 1000; // viewBox width; the height follows the route's shape
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const toRad = Math.PI / 180;

export function routePreview(
  slug: string,
  termini: { start: { name: string; lat: number; lon: number }; end: { name: string; lat: number; lon: number } },
) {
  const file = `public/routes/${slug}.geojson`;
  const features: Feature[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).features : [];
  const pts = [[termini.start.lon, termini.start.lat], [termini.end.lon, termini.end.lat], ...features.flatMap((f) => f.geometry.coordinates)];
  const xs = pts.map((p) => p[0] * toRad);
  const ys = pts.map((p) => mercY(p[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // the route's box plus a margin, like fitBounds' 32 px padding on a map about 600 px wide
  const pad = 0.06 * Math.max(x1 - x0, y1 - y0, 1e-4);
  const [bx0, bx1, by0, by1] = [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
  const scale = W / (bx1 - bx0);
  const H = Math.max(200, Math.round((by1 - by0) * scale));
  const oy = (H - (by1 - by0) * scale) / 2;
  const px = (lon: number) => n1((lon * toRad - bx0) * scale);
  const py = (lat: number) => n1(oy + (by1 - mercY(lat)) * scale);
  // thinned to what the drawing can show: a point closer than about 2 px of the box (0.4 % of the
  // drawing's longer side) to the last one kept is left out, so long routes' previews stay small
  const near = 0.004 * Math.max(W, H);
  const path = (c: [number, number][]) => {
    let d = "";
    let last: [number, number] | null = null;
    c.forEach(([lon, lat], i) => {
      const [x, y] = [px(lon), py(lat)];
      if (last && i < c.length - 1 && Math.hypot(x - last[0], y - last[1]) < near) return;
      d += `${last ? "L" : "M"}${x} ${y}`;
      last = [x, y];
    });
    return d;
  };

  const main = features.filter((f) => f.properties.kind === "main");
  const others = features.filter((f) => f.properties.kind !== "main");
  const out: string[] = [];

  if (others.length) out.push(`<path class="rp-other" d="${others.map((f) => path(f.geometry.coordinates)).join("")}"/>`);
  if (main.length) {
    const d = main.map((f) => path(f.geometry.coordinates)).join("");
    out.push(`<path class="rp-casing" d="${d}"/><path class="rp-main" d="${d}"/>`);
  }

  // the dots sized to the drawing, so they come out about as large as the map's on any route shape
  const { start, end } = termini;
  const r = n1(0.009 * Math.max(W, H));
  out.push(`<circle class="rp-start" cx="${px(start.lon)}" cy="${py(start.lat)}" r="${r}"/>`);
  out.push(`<circle class="rp-end" cx="${px(end.lon)}" cy="${py(end.lat)}" r="${r}"/>`);

  return { viewBox: `0 0 ${W} ${H}`, body: out.join("") };
}

// the preview as one svg element, for the map's box (TrailMap's children)
export function routePreviewSvg(slug: string, termini: Parameters<typeof routePreview>[1], label: string) {
  const { viewBox, body } = routePreview(slug, termini);
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg class="route-preview" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label)}">${body}</svg>`;
}
