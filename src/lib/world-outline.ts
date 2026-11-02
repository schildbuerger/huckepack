// The land (Natural Earth 1:110m, public domain) around the trails with a dot at each start, drawn at
// build time, so a page needs no map library for it: the trail map until its interactive map starts
// (issue #86), and with `world`, the whole world (without Antarctica) for the home page's map section. Equirectangular, longitudes
// scaled by the cosine of the middle latitude; land is drawn well past the frame, so a box of
// another shape (preserveAspectRatio meet, overflow visible) still shows land at its edges.
import { readFileSync } from "node:fs";

export function worldOutline(
  starts: [number, number][],
  { width = 600, padLon = 14, padSouth = 6, padNorth = 5, world = false }: { width?: number; padLon?: number; padSouth?: number; padNorth?: number; world?: boolean } = {},
) {
  const lon0 = world ? -180 : Math.min(...starts.map((p) => p[0])) - padLon;
  const lon1 = world ? 180 : Math.max(...starts.map((p) => p[0])) + padLon;
  const lat0 = world ? -57 : Math.min(...starts.map((p) => p[1])) - padSouth;
  const lat1 = world ? 84 : Math.max(...starts.map((p) => p[1])) + padNorth;
  const kx = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const scale = width / ((lon1 - lon0) * kx);
  const height = Math.round((lat1 - lat0) * scale);
  const project = ([lon, lat]: number[]) => [((lon - lon0) * kx * scale).toFixed(1), ((lat1 - lat) * scale).toFixed(1)];
  const land = JSON.parse(readFileSync("data/reference/ne_110m_land.geojson", "utf8"));
  const landPath = land.features
    .flatMap((f: any) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates))
    .filter((poly: number[][][]) => poly[0].some(([lon, lat]) => lon > lon0 - 30 && lon < lon1 + 30 && lat > lat0 - 20 && lat < lat1 + 20))
    // the whole world leaves out Antarctica, which lies below its frame
    .filter((poly: number[][][]) => !world || poly[0].some(([, lat]) => lat > lat0))
    .flatMap((poly: number[][][]) => poly.map((ring) => `M${ring.map((pt) => project(pt).join(",")).join("L")}Z`))
    .join("");
  return { width, height, landPath, dots: starts.map((pt) => project(pt)) };
}
