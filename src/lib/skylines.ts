// Handcrafted skylines behind each trail page's head (issue #142): the landscape a trail is known for,
// drawn by hand in flat shapes (public photographs as reference only, nothing traced), in a 1600 × 320
// box with the ground at its foot. Each skyline lists its shapes back to front in flat colours (the far
// ones lighter and bluer, for depth); the page draws the trail's own elevation profile in front of them
// in the skyline's `ridge` colour (TrailSkyline.astro), then the `front` shapes (water, a castle by a
// river), on a strip of `ground` along the band's foot. Every shape meets the ground at both ends, also
// at the box's left and right edges, so the drawing flows into the band instead of ending in a cut. Landmarks are simple flat shapes; nothing
// is labelled, so the drawing adds no figure.
type P = [number, number];
export interface Shape {
  d: string; // an SVG path in the 1600 × 320 box
  c: string; // its colour by day (the night's is mixed from it)
}
export interface Skyline {
  view: string; // what the drawing shows, from where
  ridge: string; // the trail's own profile
  ground: string; // the strip along the band's foot
  shapes: Shape[]; // behind the profile, back to front
  front?: Shape[]; // in front of it
}

const G = 320; // the ground
// what each drawn outline was made from (its helper and points), so src/lib/skyline-detail.ts can add
// flat shading and small details to it without touching the drawings
export type ShapeMeta = { kind: "range" | "hills" | "snow" | "water"; pts?: P[]; line?: number; x0?: number; x1?: number; y?: number };
export const SHAPE_META = new Map<string, ShapeMeta>();
const reg = (d: string, m: ShapeMeta) => (SHAPE_META.set(d, m), d);
const pt = (p: P) => `${p[0]},${p[1]}`;
// No cut-offs (2026-11-03): a broad shape (BROAD units or wider) never meets the ground in a wall.
// Where its end drops steeper than 2 : 1 (run under STEEP × rise; a cliff, a headland), `range` gives
// it a curved foot that sweeps out and meets the ground tangentially, FOOT × the drop away; slender
// shapes (sea stacks, pillars, trunks, towers) keep their steep sides. tests/trails.test.ts checks
// every skyline against it
export const BROAD = 80;
export const STEEP = 0.5;
const FOOT = 1;
// the end at `ground` (x on the ground) rising to `top`: a straight edge, or a curved foot
const foot = (ground: number, top: P, dir: -1 | 1) => {
  const rise = G - top[1];
  if (ground <= 0 || ground >= SKY_W || Math.abs(top[0] - ground) >= STEEP * rise) return { at: ground, curve: "" };
  const at = Math.min(SKY_W, Math.max(0, top[0] + dir * FOOT * rise));
  return { at, curve: `${top[0] + dir * 0.35 * rise},${G} ` };
};
// The box's own edges are no frame: the drawing stands in a band that runs on past them, so a shape
// that reaches an edge above the ground is cut back by TAPER × its height there (at least EASE_MIN) and
// eases down to the ground at the edge in an S-curve, level at the top and level at the foot
export const TAPER = 1.5;
const EASE_MIN = 40;
// the outline's height at x, along its points
const yAt = (pts: P[], x: number) => {
  const i = pts.findIndex((p) => p[0] >= x);
  if (i <= 0) return pts[i === 0 ? 0 : pts.length - 1][1];
  const [a, b] = [pts[i - 1], pts[i]];
  return Math.round(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
};
// the outline (without its ground points) cut back from the edges it reaches: its points, and where the
// eased ends start (undefined: no edge there)
const eased = (top: P[]) => {
  let pts = top;
  let left: P | undefined, right: P | undefined;
  if (pts[0][0] <= 0) {
    const x = Math.round(Math.max(EASE_MIN, TAPER * (G - pts[0][1])));
    left = [x, yAt(pts, x)];
    pts = [left, ...pts.filter((p) => p[0] > x)];
  }
  if (pts[pts.length - 1][0] >= SKY_W) {
    const x = Math.round(SKY_W - Math.max(EASE_MIN, TAPER * (G - pts[pts.length - 1][1])));
    right = [x, yAt(pts, x)];
    pts = [...pts.filter((p) => p[0] < x), right];
  }
  return { pts, left, right };
};
// the S-curves from the ground at the left edge up to `p`, and from `p` down to the ground at the right
const easeIn = (p: P) => `M0,${G}C${p[0] / 2},${G} ${p[0] / 2},${p[1]} ${pt(p)}`;
const easeOut = (p: P) => `C${(p[0] + SKY_W) / 2},${p[1]} ${(p[0] + SKY_W) / 2},${G} ${SKY_W},${G}`;
// a range of mountains through hand-placed points, its ends brought down to the ground
const range = (pts: P[]) => reg(rangeD(pts), { kind: "range", pts });
const rangeD = (pts: P[]) => {
  const { pts: top, left, right } = eased(pts.slice(1, -1));
  const [x0, x1] = [pts[0][0], pts[pts.length - 1][0]];
  if (!left && !right && Math.abs(x1 - x0) < BROAD) return `M${x0},${G}L${top.map(pt).join("L")}L${x1},${G}Z`;
  const a = foot(x0, top[0], -1);
  const b = foot(x1, top[top.length - 1], 1);
  const start = left ? easeIn(left) : a.curve ? `M${a.at},${G}Q${a.curve}${pt(top[0])}` : `M${a.at},${G}L${pt(top[0])}`;
  const rest = top.slice(1).map((p) => `L${pt(p)}`).join("");
  const end = right ? easeOut(right) : b.curve ? `Q${b.curve}${b.at},${G}` : `L${b.at},${G}`;
  return `${start}${rest}${end}Z`;
};
// rounded hills: the same through smooth curves (quadratics through the midpoints)
const hills = (pts: P[]) => reg(hillsD(pts), { kind: "hills", pts });
const hillsD = (pts: P[]) => {
  const { pts: all, left, right } = eased(pts.slice(1, -1));
  // the points the curve bends towards (the eased ends are points it passes through)
  const p = all.slice(left ? 1 : 0, right ? -1 : undefined);
  const mid = (i: number) => `${(p[i][0] + p[i + 1][0]) / 2},${(p[i][1] + p[i + 1][1]) / 2}`;
  let d = left ? easeIn(left) : `M${pts[0][0]},${G}`;
  if (!p.length) return `${d}L${pt(right!)}${easeOut(right!)}Z`;
  d += `Q${pt(p[0])} ${p.length > 1 ? mid(0) : pt(right ?? [pts[pts.length - 1][0], G])}`;
  for (let i = 1; i < p.length - 1; i++) d += `Q${pt(p[i])} ${mid(i)}`;
  if (p.length > 1) d += `Q${pt(p[p.length - 1])} ${right ? pt(right) : `${pts[pts.length - 1][0]},${G}`}`;
  return right ? `${d}${easeOut(right)}Z` : `${d}Z`;
};
// the part of a range above a line: its snowfields and glaciers (a polygon cut by one edge)
const snowOf = (pts: P[], line: number) => {
  const poly: P[] = [[pts[0][0], G], ...pts.slice(1, -1), [pts[pts.length - 1][0], G]];
  const out: P[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (a[1] <= line) out.push(a);
    if (a[1] <= line !== b[1] <= line) out.push([Math.round(a[0] + ((b[0] - a[0]) * (line - a[1])) / (b[1] - a[1])), line]);
  });
  return out.length ? reg(`M${out.map(pt).join("L")}Z`, { kind: "snow", pts, line }) : "";
};
// a lake, a river or the sea: a level band whose ends run down to the ground
const water = (x0: number, x1: number, y: number) => {
  const run = Math.max(30, G - y);
  const a = x0 <= 0 ? easeIn([Math.round(Math.max(EASE_MIN, TAPER * (G - y))), y]) : `M${x0},${G}L${x0 + run},${y}`;
  const b = x1 >= SKY_W ? `L${Math.round(SKY_W - Math.max(EASE_MIN, TAPER * (G - y)))},${y}${easeOut([Math.round(SKY_W - Math.max(EASE_MIN, TAPER * (G - y))), y])}` : `L${x1 - run},${y}L${x1},${G}`;
  return reg(`${a}${b}Z`, { kind: "water", x0, x1, y });
};
// a slim tower (a lookout or transmitter) with its mast
const tower = (x: number, y: number, h: number, w = 6) =>
  `M${x - w / 2},${y}V${y - h}H${x + w / 2}V${y}Z M${x - 1},${y - h}V${y - h - h * 0.4}H${x + 1}V${y - h}Z`;
// a radar dome
const dome = (x: number, y: number, r: number) => `M${x - r},${y}A${r},${r} 0 0 1 ${x + r},${y}Z`;
// a castle: a wall with a keep and two towers (its roofs drawn apart, in their own colour)
const castle = (x: number, y: number, s = 1) =>
  `M${x - 30 * s},${y}V${y - 16 * s}H${x + 30 * s}V${y}Z M${x - 6 * s},${y - 16 * s}V${y - 40 * s}H${x + 6 * s}V${y - 16 * s}Z M${x - 28 * s},${y - 16 * s}V${y - 26 * s}H${x - 20 * s}V${y - 16 * s}Z M${x + 20 * s},${y - 16 * s}V${y - 28 * s}H${x + 28 * s}V${y - 16 * s}Z`;
const castleRoofs = (x: number, y: number, s = 1) =>
  `M${x - 8 * s},${y - 40 * s}L${x},${y - 54 * s}L${x + 8 * s},${y - 40 * s}Z M${x - 30 * s},${y - 26 * s}L${x - 24 * s},${y - 34 * s}L${x - 18 * s},${y - 26 * s}Z M${x + 18 * s},${y - 28 * s}L${x + 24 * s},${y - 37 * s}L${x + 30 * s},${y - 28 * s}Z`;
// a square folly tower with three turrets
const folly = (x: number, y: number) =>
  `M${x - 11},${y}V${y - 26}H${x + 11}V${y}Z M${x - 13},${y - 26}V${y - 34}H${x - 7}V${y - 26}Z M${x - 3},${y - 26}V${y - 36}H${x + 3}V${y - 26}Z M${x + 7},${y - 26}V${y - 34}H${x + 13}V${y - 26}Z`;
// a lighthouse, slightly tapering, with its lantern; its band drawn apart
const lighthouse = (x: number, y: number, h: number) => `M${x - 6},${y}L${x - 4},${y - h}H${x + 4}L${x + 6},${y}Z M${x - 5},${y - h}V${y - h - 6}H${x + 5}V${y - h}Z`;
const lighthouseBand = (x: number, y: number, h: number) => `M${x - 5.4},${y - h * 0.35}L${x - 5},${y - h * 0.55}H${x + 5}L${x + 5.4},${y - h * 0.35}Z`;
// a statue with a raised sword on a domed hall
const statue = (x: number, y: number) =>
  `M${x - 14},${y}V${y - 16}H${x + 14}V${y}Z M${x - 12},${y - 16}A12,8 0 0 1 ${x + 12},${y - 16}Z M${x - 2},${y - 23}V${y - 42}H${x + 2}V${y - 23}Z M${x + 1},${y - 41}L${x + 4},${y - 62}L${x + 6},${y - 62}L${x + 3},${y - 41}Z`;
// a chapel or sanctuary: a hall with a bell tower (its roofs drawn apart)
const sanctuary = (x: number, y: number) => `M${x - 34},${y}V${y - 14}H${x + 20}V${y}Z M${x + 20},${y}V${y - 30}H${x + 30}V${y}Z`;
const sanctuaryRoofs = (x: number, y: number) => `M${x - 36},${y - 14}L${x - 7},${y - 24}L${x + 22},${y - 14}Z M${x + 18},${y - 30}L${x + 25},${y - 38}L${x + 32},${y - 30}Z`;
// a cathedral front: a nave between two towers with pointed tops
const cathedral = (x: number, y: number) =>
  `M${x - 26},${y}V${y - 22}H${x + 26}V${y}Z M${x - 34},${y}V${y - 52}L${x - 27},${y - 66}L${x - 20},${y - 52}V${y}Z M${x + 20},${y}V${y - 52}L${x + 27},${y - 66}L${x + 34},${y - 52}V${y}Z M${x - 6},${y - 22}L${x},${y - 34}L${x + 6},${y - 22}Z`;
// sandstone pillars, each [x, top]
const pillars = (cols: P[], w = 14) => cols.map(([x, top]) => `M${x - w / 2},${G}L${x - w / 2 + 2},${top + 4}L${x},${top}L${x + w / 2 - 2},${top + 5}L${x + w / 2},${G}Z`).join(" ");
// a waterfall: a thin white thread down a cliff
const waterfall = (x: number, y0: number, y1: number, w = 4) => `M${x - w / 2},${y0}H${x + w / 2}L${x + w},${y1}H${x - w}Z`;
// rows of fruit trees (or vines) across a slope
const orchard = (x0: number, x1: number, ys: number[], gap = 18, r = 4) =>
  ys.flatMap((y) => Array.from({ length: Math.floor((x1 - x0) / gap) }, (_, i) => `M${x0 + i * gap - r},${y}A${r},${r} 0 1 0 ${x0 + i * gap + r},${y}A${r},${r} 0 1 0 ${x0 + i * gap - r},${y}Z`)).join(" ");

// colours shared across trails
const SNOW = "#f7f8f4";
const ROCK = "#8e9aa6";
const FAR = "#7d9481"; // far forested hills, blue with distance
const FIR = "#3d5a3a";
const FOREST = "#45663a";
const MEADOW = "#8fb05a";
const LAKE = "#6f9fc0";
const SEA = "#4f8fb8";

// a few shapes reused within one drawing
const glockner: P[] = [[0, G], [60, 262], [130, 205], [180, 160], [215, 118], [232, 96], [246, 112], [270, 140], [320, 170], [380, 196], [440, 214], [500, 232], [560, 250], [620, 270], [680, G]];
const julian: P[] = [[880, G], [930, 262], [980, 214], [1010, 190], [1035, 170], [1050, 182], [1070, 150], [1090, 136], [1105, 124], [1118, 132], [1132, 118], [1150, 138], [1180, 160], [1210, 150], [1240, 174], [1280, 196], [1320, 220], [1360, 248], [1400, 276], [1440, G]];
const kebnekaise: P[] = [[300, G], [380, 256], [460, 214], [520, 170], [560, 140], [590, 128], [620, 140], [660, 152], [700, 176], [760, 200], [840, 230], [920, 262], [1000, G]];
const rainier: P[] = [[300, G], [420, 262], [540, 214], [640, 168], [720, 128], [780, 102], [830, 90], [880, 94], [940, 112], [1020, 146], [1110, 186], [1210, 226], [1320, 262], [1440, G]];
const iceField: P[] = [[0, G], [60, 236], [200, 214], [380, 206], [560, 212], [760, 204], [960, 210], [1160, 202], [1360, 214], [1520, 226], [1600, G]];
const texel: P[] = [[0, G], [60, 262], [140, 212], [200, 170], [230, 150], [250, 138], [270, 152], [300, 140], [330, 124], [352, 116], [372, 130], [410, 150], [460, 176], [520, 160], [560, 146], [590, 158], [640, 180], [720, 206], [820, 232], [920, 262], [1000, G]];
const texelEast: P[] = [[900, G], [1000, 256], [1100, 222], [1180, 200], [1240, 188], [1300, 200], [1380, 220], [1460, 246], [1540, 276], [1600, G]];
const mitre: P[] = [[600, G], [660, 250], [700, 180], [725, 112], [738, 92], [752, 110], [790, 190], [840, 260], [900, G]];
const nevis: P[] = [[1100, G], [1180, 246], [1260, 196], [1320, 172], [1380, 166], [1440, 176], [1500, 206], [1560, 250], [1600, G]];
const montBlanc: P[] = [[0, G], [60, 304], [110, 272], [140, 226], [158, 170], [170, 122], [185, 118], [200, 124], [222, 150], [238, 136], [244, 132], [250, 144], [270, 168], [300, 180], [330, 172], [360, 180], [390, 190], [420, 188], [438, 156], [450, 180], [466, 148], [480, 176], [496, 140], [512, 170], [530, 152], [548, 182], [572, 168], [596, 114], [602, 104], [608, 104], [614, 116], [640, 136], [680, 112], [720, 98], [752, 106], [790, 94], [815, 87], [842, 96], [880, 86], [920, 76], [955, 71], [995, 74], [1040, 82], [1080, 92], [1110, 97], [1150, 92], [1188, 102], [1228, 124], [1250, 122], [1290, 132], [1325, 106], [1340, 97], [1352, 100], [1380, 136], [1430, 168], [1490, 212], [1540, 252], [1580, 292], [1600, G]];

// the drawing's box and the top it is shown from (just above the highest summit)
export const SKY_W = 1600;
export const SKY_H = G;
export const SKY_TOP = 56;

// the trail's own elevation profile ([km, metres]) as the nearest ridge, its height following the
// trail's real relief (a coastal path a low swell, an alpine one a tall ridge: 18 to 78 units for 0
// to 1,800 m between its lowest and highest point), smoothed, so it never hides the landscape behind
// it; near both ends it sinks smoothly to the ground, so it flows into the band's foot. Shared by the
// trail page's head (TrailSkyline.astro) and the link-preview image (og-image.ts)
export function profileRidge(points: [number, number][], routeKm: number) {
  const W = SKY_W;
  const H = SKY_H;
  const lo = Math.min(...points.map((p) => p[1]));
  const hi = Math.max(...points.map((p) => p[1]));
  const amp = 18 + Math.min(1, (hi - lo) / 1800) * 60;
  const step = Math.max(1, Math.floor(points.length / 90));
  const thin = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const EDGE = 0.16 * W;
  const ease = (x: number) => {
    const f = Math.min(1, Math.min(x, W - x) / EDGE);
    return f * f * (3 - 2 * f);
  };
  const rx = (km: number) => (km / routeKm) * W;
  const ry = (x: number, m: number) => H - (H - (300 - ((m - lo) / (hi - lo || 1)) * amp)) * ease(x);
  const xy = thin.map(([km, m]) => [rx(km), ry(rx(km), m)]);
  // a quadratic through each point to the midpoint of the next: a smooth line through the profile
  return (
    `M0,${H}L${xy[0][0].toFixed(0)},${xy[0][1].toFixed(0)}` +
    xy
      .slice(1, -1)
      .map(([x, y], i) => `Q${x.toFixed(0)},${y.toFixed(0)} ${((x + xy[i + 2][0]) / 2).toFixed(0)},${((y + xy[i + 2][1]) / 2).toFixed(0)}`)
      .join("") +
    `L${W},${H}Z`
  );
}

export const SKYLINES: Record<string, Skyline> = {
  "alpe-adria-trail": {
    view: "From the Grossglockner over Carinthia's lakes to the Julian Alps and the Adriatic",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      { d: hills([[420, G], [520, 256], [640, 236], [760, 244], [880, 232], [1000, 248], [1100, 262], [1200, 280], [1300, G]]), c: "#7f9a80" },
      { d: range(glockner), c: ROCK },
      { d: snowOf(glockner, 185), c: SNOW },
      { d: range(julian), c: "#b9b6aa" },
      { d: snowOf(julian, 150), c: SNOW },
    ],
    front: [
      { d: water(560, 980, 292), c: LAKE },
      { d: water(1380, 1600, 298), c: SEA },
    ],
  },
  "baiersbronner-seensteig": {
    view: "The fir-dark ridges of the northern Black Forest, with a cirque lake below",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [120, 236], [300, 214], [480, 226], [650, 206], [820, 220], [1000, 200], [1180, 214], [1360, 206], [1500, 232], [1600, G]]), c: FAR },
      { d: hills([[100, G], [260, 250], [420, 236], [580, 252], [760, 240], [940, 256], [1120, 236], [1300, 252], [1460, 262], [1560, G]]), c: FIR },
    ],
    front: [{ d: water(980, 1300, 296), c: "#5f8fae" }],
  },
  "cami-de-cavalls": {
    view: "Menorca's low coast, a headland with its lighthouse and the sea",
    ridge: "#8d9a5a",
    ground: "#d9c49a",
    shapes: [
      { d: hills([[0, G], [80, 280], [220, 262], [400, 270], [560, 250], [700, 262], [860, 256], [1020, 266], [1180, 252], [1320, 262], [1460, 276], [1600, G]]), c: "#a9b07a" },
      { d: range([[1150, G], [1170, 250], [1290, 246], [1300, 262], [1320, G]]), c: "#c8b28a" },
      { d: lighthouse(1240, 247, 44), c: "#f4f1ea" },
      { d: lighthouseBand(1240, 247, 44), c: "#2a2a2a" },
    ],
    front: [{ d: water(0, 1600, 290), c: SEA }],
  },
  "camino-frances": {
    view: "From the green Pyrenees over the golden Meseta and the hills of the Bierzo and O Cebreiro to the twin towers of Santiago's cathedral",
    ridge: "#8a9a4a",
    ground: "#d8c27a",
    shapes: [
      { d: range([[0, G], [60, 250], [130, 214], [190, 192], [250, 206], [320, 230], [400, 258], [480, G]]), c: "#6f8a6a" },
      { d: hills([[1050, G], [1150, 256], [1250, 236], [1330, 246], [1420, 262], [1500, G]]), c: "#7a8f6a" },
      { d: hills([[300, G], [500, 286], [800, 282], [1100, 286], [1200, G]]), c: "#d8c27a" },
      { d: cathedral(1520, 300), c: "#c9b48a" },
    ],
  },
  "coast-to-coast": {
    view: "From the Irish Sea over the Lake District fells and the Pennines to the North York Moors and the North Sea",
    ridge: "#6f8a4a",
    ground: MEADOW,
    shapes: [
      { d: range([[60, G], [110, 250], [160, 210], [200, 176], [230, 160], [260, 174], [290, 150], [320, 170], [360, 190], [400, 214], [450, 236], [520, 262], [600, G]]), c: "#7c8a7e" },
      { d: hills([[480, G], [600, 250], [720, 232], [860, 226], [980, 236], [1100, 232], [1200, 250], [1300, 276], [1380, G]]), c: "#9a9a6e" },
      { d: hills([[1150, G], [1250, 262], [1380, 248], [1480, 262], [1560, 284], [1600, G]]), c: "#8a6f7c" },
    ],
    front: [
      { d: water(0, 260, 298), c: SEA },
      { d: water(1360, 1600, 298), c: SEA },
    ],
  },
  "cotswold-way": {
    view: "The Cotswold escarpment above the vale, with a folly tower on its edge",
    ridge: MEADOW,
    ground: "#9ab866",
    shapes: [
      { d: hills([[0, G], [150, 262], [350, 246], [560, 258], [760, 240], [960, 252], [1160, 236], [1360, 250], [1500, 266], [1600, G]]), c: "#a7b98a" },
      { d: hills([[200, G], [300, 250], [420, 226], [560, 222], [700, 234], [820, 262], [900, G]]), c: "#7f9a54" },
      { d: folly(520, 224), c: "#c9a86a" },
    ],
  },
  eifelsteig: {
    view: "The Eifel's volcanic cones, with a maar lake in its crater",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      { d: hills([[0, G], [120, 262], [260, 240], [340, 214], [400, 206], [460, 214], [560, 240], [700, 250], [820, 226], [880, 212], [940, 220], [1040, 246], [1200, 236], [1330, 214], [1380, 210], [1430, 220], [1520, 256], [1600, G]]), c: "#7f9a80" },
    ],
    front: [{ d: water(620, 840, 294), c: "#5f8fae" }],
  },
  "forststeig-elbe-sandstone": {
    view: "The Elbe Sandstone's table mountains and rock pillars above the forest, one with its lookout tower",
    ridge: FIR,
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [200, 256], [420, 248], [640, 240], [860, 252], [1100, 244], [1380, 256], [1600, G]]), c: "#6f8a6c" },
      { d: range([[40, G], [80, 270], [96, 206], [104, 198], [250, 196], [258, 206], [272, 268], [320, G]]), c: "#b89a72" },
      { d: range([[980, G], [1030, 262], [1046, 200], [1054, 192], [1240, 190], [1250, 200], [1266, 262], [1320, G]]), c: "#a88c68" },
      { d: tower(1150, 191, 30, 8), c: "#8a7a6a" },
      { d: pillars([[560, 232], [586, 214], [610, 240], [640, 224]]), c: "#c9a77a" },
    ],
  },
  goldsteig: {
    view: "The long ridges of the Bavarian Forest, the Arber with its radar domes",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [150, 240], [330, 220], [520, 196], [600, 186], [680, 192], [800, 214], [980, 206], [1150, 222], [1320, 212], [1480, 236], [1600, G]]), c: "#6f8c84" },
      { d: dome(588, 188, 15), c: "#f2f2ee" },
      { d: dome(618, 189, 11), c: "#f2f2ee" },
      { d: hills([[100, G], [300, 262], [520, 246], [760, 258], [1000, 244], [1240, 256], [1500, 270], [1600, G]]), c: "#3f5c3c" },
    ],
  },
  "gr-20": {
    view: "Corsica's granite spine from the jagged crests of the north over the long central ridge to the rose needles of Bavella above the sea",
    ridge: "#5f6e4a",
    ground: "#8f9a62",
    shapes: [
      {
        d: range([[0, G], [50, 262], [100, 214], [130, 186], [150, 150], [164, 128], [176, 142], [192, 120], [206, 104], [220, 122], [236, 112], [258, 140], [290, 158], [320, 146], [350, 168], [400, 196], [460, 222], [540, 248], [620, G]]),
        c: "#9a9fa6",
      },
      { d: range([[420, G], [500, 250], [580, 222], [660, 206], [740, 194], [800, 182], [860, 190], [930, 204], [1000, 214], [1080, 230], [1160, 252], [1240, G]]), c: "#a7acae" },
      { d: hills([[0, G], [160, 274], [360, 262], [560, 270], [760, 258], [960, 268], [1160, 262], [1300, 276], [1400, G]]), c: "#4f6a44" },
      {
        d: range([[1120, G], [1170, 262], [1200, 228], [1214, 196], [1222, 180], [1232, 198], [1246, 208], [1256, 172], [1264, 158], [1274, 176], [1288, 200], [1300, 186], [1310, 168], [1322, 190], [1340, 214], [1356, 204], [1368, 184], [1380, 210], [1410, 246], [1460, 280], [1500, G]]),
        c: "#c48a66",
      },
    ],
    front: [{ d: water(1420, 1600, 296), c: SEA }],
  },
  "harzer-hexen-stieg": {
    view: "The bald Brocken with its tower over the Harz's spruce forests, and the cliffs of the Bode gorge",
    ridge: "#34522c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[200, G], [360, 250], [500, 212], [600, 196], [700, 200], [820, 226], [980, 262], [1100, G]]), c: "#7d8f80" },
      { d: `M610,198V188H690V198Z ${tower(650, 189, 44, 10)}`, c: "#a8a397" },
      { d: hills([[0, G], [150, 262], [330, 252], [520, 262], [720, 256], [920, 266], [1120, 258], [1300, 270], [1600, G]]), c: "#5d7558" },
      { d: range([[1180, G], [1220, 240], [1250, 232], [1270, 250], [1300, 236], [1330, 260], [1380, G]]), c: "#9a948a" },
    ],
  },
  hermannshoehen: {
    view: "The Teutoburg Forest's long ridge with the Hermann monument, and the Externsteine rocks",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      { d: hills([[0, G], [200, 250], [420, 234], [640, 226], [860, 236], [1080, 228], [1300, 240], [1480, 260], [1600, G]]), c: "#5d7a52" },
      { d: statue(640, 228), c: "#6f8f86" },
      { d: pillars([[1160, 222], [1192, 206], [1222, 226], [1250, 214]], 22), c: "#a99a82" },
    ],
  },
  kungsleden: {
    view: "The Kebnekaise massif over Lapland's wide fells and a valley lake",
    ridge: "#7a8a52",
    ground: "#8f9a6a",
    shapes: [
      { d: hills([[0, G], [100, 262], [240, 246], [380, 252], [480, 270], [560, G]]), c: "#9a9f86" },
      { d: range(kebnekaise), c: "#7f8a96" },
      { d: snowOf(kebnekaise, 200), c: SNOW },
      { d: hills([[900, G], [1040, 250], [1180, 232], [1320, 240], [1460, 262], [1600, G]]), c: "#8f9a7c" },
    ],
    front: [{ d: water(200, 640, 298), c: LAKE }],
  },
  laugavegur: {
    view: "The rhyolite mountains of Landmannalaugar in ochre, red and moss green, an ice cap beyond",
    ridge: "#6d7f5c",
    ground: "#4a4a44",
    shapes: [
      { d: hills([[1100, G], [1200, 240], [1320, 212], [1440, 206], [1540, 230], [1600, G]]), c: "#e9eef0" },
      { d: hills([[0, G], [120, 236], [240, 206], [340, 218], [440, 196], [540, 226], [640, 256], [740, G]]), c: "#d9a35a" },
      { d: hills([[300, G], [420, 250], [520, 226], [620, 238], [720, 214], [840, 236], [960, 262], [1060, G]]), c: "#c97b4a" },
      { d: hills([[700, G], [820, 246], [940, 230], [1040, 244], [1140, 236], [1240, 262], [1340, G]]), c: "#7d9a6a" },
    ],
  },
  "maclehose-trail": {
    view: "Hong Kong's green hills and the crag of Lion Rock, islands in the sea beyond",
    ridge: "#3f6a3a",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[1100, G], [1180, 276], [1260, 270], [1320, 284], [1360, G]]), c: "#7f9a8a" },
      { d: hills([[1380, G], [1440, 284], [1520, 280], [1600, G]]), c: "#7f9a8a" },
      { d: range([[200, G], [300, 250], [400, 214], [460, 190], [500, 176], [530, 186], [580, 206], [660, 232], [760, 262], [860, G]]), c: "#5f8a5a" },
      { d: range([[820, G], [870, 260], [920, 236], [950, 214], [972, 200], [990, 206], [1000, 222], [1030, 226], [1080, 248], [1140, 280], [1180, G]]), c: "#6f8a5f" },
      { d: "M940,232L962,206L980,198L994,204L1002,222L990,230Z", c: "#a8a092" },
    ],
    front: [{ d: water(1000, 1600, 296), c: SEA }],
  },
  "merano-high-mountain-trail": {
    view: "The peaks of the Texel group above the meadows, with orchards in the valley",
    ridge: "#5f7a3c",
    ground: MEADOW,
    shapes: [
      { d: range(texelEast), c: "#9aa3ac" },
      { d: snowOf(texelEast, 196), c: SNOW },
      { d: range(texel), c: "#8a8f96" },
      { d: snowOf(texel, 165), c: SNOW },
    ],
    front: [{ d: orchard(560, 1100, [304, 314]), c: "#5d7a3a" }],
  },
  "milford-track": {
    view: "Fiordland's sheer, rain-forested valley walls, Sutherland Falls, Mitre Peak and the sound",
    ridge: "#2f5a3a",
    ground: "#4f6a42",
    shapes: [
      { d: range(mitre), c: "#6c7a86" },
      { d: snowOf(mitre, 130), c: SNOW },
      { d: hills([[300, G], [420, 256], [540, 236], [660, 244], [780, 232], [900, 248], [1000, 270], [1120, G]]), c: "#7f9a80" },
      { d: range([[40, G], [80, 220], [110, 140], [140, 110], [180, 104], [220, 118], [260, 170], [300, 240], [340, G]]), c: "#4f6a52" },
      { d: waterfall(190, 108, 262), c: "#f4f6f4" },
      { d: range([[1100, G], [1160, 220], [1200, 150], [1240, 112], [1280, 100], [1330, 110], [1380, 150], [1420, 200], [1480, 260], [1540, G]]), c: "#4a6450" },
    ],
    front: [{ d: water(480, 1120, 296), c: "#4f7f9a" }],
  },
  moselsteig: {
    view: "The Moselle's vineyard slopes and Reichsburg Cochem on its hill above the river",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      { d: hills([[0, G], [160, 250], [360, 236], [560, 246], [760, 232], [960, 244], [1160, 230], [1360, 246], [1520, 266], [1600, G]]), c: "#8a9a7a" },
      { d: range([[300, G], [380, 250], [480, 214], [560, 200], [640, 206], [720, 226], [820, 256], [900, G]]), c: "#7f9a4a" },
      { d: orchard(420, 760, [226, 242, 258], 16, 3), c: "#5d7a2f" },
      { d: range([[1000, G], [1060, 262], [1120, 232], [1180, 230], [1240, 250], [1300, G]]), c: "#6f8a4a" },
      { d: castle(1150, 232, 0.9), c: "#d8cbb0" },
      { d: castleRoofs(1150, 232, 0.9), c: "#5a4a4a" },
    ],
    front: [{ d: water(120, 1480, 298), c: LAKE }],
  },
  "offas-dyke-path": {
    view: "The flat-topped scarp of the Black Mountains, the Clwydian hills with their ruined tower, and the dyke's long bank",
    ridge: "#7a9a4a",
    ground: MEADOW,
    shapes: [
      { d: range([[200, G], [280, 256], [360, 220], [420, 206], [560, 204], [600, 214], [660, 236], [760, 262], [860, G]]), c: "#8a8f6e" },
      { d: hills([[900, G], [1000, 256], [1100, 232], [1180, 220], [1260, 232], [1360, 256], [1460, 280], [1560, G]]), c: "#7a8a5a" },
      { d: "M1168,222V210L1172,206H1188L1192,210V222Z", c: "#a59a86" },
    ],
    front: [{ d: hills([[0, G], [200, 300], [600, 296], [1000, 300], [1400, 296], [1600, G]]), c: "#6f8a4a" }],
  },
  "orszagos-kektura": {
    view: "Hungary's blue trail: a basalt butte over Lake Balaton, a castle on the Danube Bend, the Mátra with its TV tower",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      { d: hills([[700, G], [820, 252], [940, 226], [1040, 214], [1140, 222], [1260, 246], [1380, 276], [1460, G]]), c: "#7f9a80" },
      { d: tower(1040, 216, 52, 6), c: "#d8d4cc" },
      { d: range([[60, G], [110, 262], [150, 226], [170, 214], [280, 212], [300, 224], [340, 262], [400, G]]), c: "#7a8a5a" },
      { d: range([[420, G], [480, 256], [540, 232], [600, 228], [660, 246], [720, G]]), c: "#5d7a4a" },
      { d: castle(570, 232, 0.7), c: "#cdbfa2" },
      { d: castleRoofs(570, 232, 0.7), c: "#6b4b3a" },
    ],
    front: [{ d: water(0, 520, 298), c: "#7fb0c8" }],
  },
  "path-of-sacred-forests": {
    view: "The Apennine ridges of the Casentino forests, and La Verna's sanctuary on its cliff",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [200, 236], [420, 214], [640, 206], [860, 214], [1080, 206], [1300, 222], [1480, 246], [1600, G]]), c: "#6f8c84" },
      { d: hills([[0, G], [180, 262], [400, 250], [620, 258], [840, 248], [1060, 262], [1280, 256], [1500, 270], [1600, G]]), c: "#3f5c3c" },
      { d: range([[1150, G], [1180, 236], [1196, 214], [1290, 212], [1306, 232], [1330, G]]), c: "#a89a84" },
      { d: sanctuary(1244, 213), c: "#d8cfbe" },
      { d: sanctuaryRoofs(1244, 213), c: "#8a5a4a" },
    ],
  },
  rothaarsteig: {
    view: "The Rothaar mountains' rounded, forested ridges, the Kahler Asten with its tower",
    ridge: "#34522c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [180, 246], [400, 230], [620, 214], [700, 210], [780, 216], [960, 232], [1160, 222], [1360, 240], [1520, 262], [1600, G]]), c: "#6f8c84" },
      { d: `M692,212V188H708V212Z M690,188L700,180L710,188Z`, c: "#a59a86" },
      { d: hills([[100, G], [320, 262], [560, 250], [800, 262], [1040, 252], [1280, 264], [1500, 272], [1600, G]]), c: "#3f5c3c" },
    ],
  },
  "sauerland-waldroute": {
    view: "The Sauerland's forested hills around a reservoir lake",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [220, 244], [460, 230], [700, 240], [940, 226], [1180, 238], [1420, 250], [1600, G]]), c: FAR },
      { d: hills([[200, G], [400, 262], [640, 252], [880, 262], [1120, 250], [1360, 264], [1600, G]]), c: FIR },
    ],
    front: [{ d: water(300, 920, 296), c: "#5f8fae" }],
  },
  soonwaldsteig: {
    view: "The Soonwald's long, level forest ridge with its quartzite rocks, vineyards above the Nahe at its end",
    ridge: "#34522c",
    ground: MEADOW,
    shapes: [
      { d: hills([[0, G], [150, 250], [400, 232], [700, 228], [1000, 230], [1300, 234], [1500, 256], [1600, G]]), c: "#6f8c84" },
      { d: range([[780, G], [790, 214], [800, 220], [808, 208], [818, 226], [828, G]]), c: "#a8a092" },
      { d: range([[1250, G], [1320, 262], [1400, 246], [1480, 262], [1560, G]]), c: "#8a9a4a" },
      { d: orchard(1300, 1520, [266, 280], 16, 3), c: "#5d7a2f" },
    ],
  },
  "tour-du-mont-blanc": {
    view: "The Mont Blanc massif seen from the Brévent above Chamonix: Aiguille Verte, the Drus, the Aiguilles de Chamonix, the Aiguille du Midi, Mont Blanc du Tacul, Mont Maudit, Mont Blanc with the Bossons glacier, the Dôme du Goûter and the Aiguille de Bionnassay",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      { d: range(montBlanc), c: ROCK },
      {
        d: "M668,120L680,112L720,98L752,106L790,94L815,87L842,96L880,86L920,76L955,71L995,74L1040,82L1080,92L1110,97L1150,92L1188,102L1228,124L1250,122L1290,132L1325,106L1340,97L1352,100L1372,126L1340,132L1300,144L1250,140L1215,138L1180,136L1140,134L1100,142L1060,136L1020,152L990,158L978,200L968,252L958,254L950,200L940,156L905,144L870,140L840,136L810,140L775,136L740,144L705,142L680,136Z",
        c: SNOW,
      },
      { d: "M160,136L170,122L185,118L200,124L214,140L196,144L182,140L170,144Z", c: SNOW },
    ],
  },
  "w-trek": {
    view: "The three granite Torres and the dark-capped Cuernos del Paine over the steppe and the turquoise Lago Pehoé",
    ridge: "#7f8a5a",
    ground: "#b7b07a",
    shapes: [
      { d: range([[0, G], [80, 270], [180, 240], [300, 226], [420, 236], [520, 252], [620, G]]), c: "#a9b2b8" },
      {
        d: range([[160, G], [200, 250], [222, 170], [228, 112], [236, 104], [244, 116], [252, 160], [262, 150], [268, 96], [276, 88], [284, 100], [292, 150], [302, 156], [308, 118], [316, 112], [322, 124], [330, 180], [360, 250], [400, G]]),
        c: "#b4aa9c",
      },
      {
        d: range([[700, G], [760, 252], [820, 210], [850, 172], [866, 150], [880, 160], [900, 142], [916, 132], [934, 148], [960, 138], [978, 128], [996, 146], [1030, 178], [1090, 222], [1160, 260], [1220, G]]),
        c: "#c9bfae",
      },
      // the Cuernos' dark sedimentary caps over their pale granite
      { d: "M850,172L866,150L880,160L900,142L916,132L934,148L960,138L978,128L996,146L1010,160L986,158L964,152L940,160L916,148L900,158L880,172L862,166Z", c: "#4a4440" },
      { d: hills([[0, G], [220, 288], [520, 280], [820, 286], [1100, 278], [1400, 286], [1600, G]]), c: "#a7a26e" },
    ],
    front: [{ d: water(980, 1600, 298), c: "#4fb0b4" }],
  },
  "west-coast-trail": {
    view: "Vancouver Island's rainforest coast: dark conifer headlands, Tsusiat Falls pouring onto the beach and the Carmanah Point lighthouse over the Pacific",
    ridge: "#2f4a34",
    ground: "#cdbf98",
    shapes: [
      { d: hills([[0, G], [140, 250], [320, 232], [520, 246], [700, 230], [900, 248], [1080, 236], [1260, 252], [1440, 262], [1600, G]]), c: "#5f7a6a" },
      // tall spruce and cedar along the headlands, each a narrow spire
      {
        d: [60, 110, 150, 210, 260, 330, 380, 440, 600, 650, 700, 760, 820, 1180, 1230, 1290, 1340].map((x, i) => `M${x - 9},${G}L${x},${200 + (i % 4) * 12}L${x + 9},${G}Z`).join(" "),
        c: "#2c4632",
      },
      // the sandstone cliff of Tsusiat Point with the falls over it
      { d: range([[880, G], [890, 262], [1000, 258], [1010, G]]), c: "#8a7a62" },
      { d: waterfall(950, 262, 298, 8), c: "#f2f4f0" },
      // Carmanah Point: a low headland with its lighthouse
      { d: range([[1380, G], [1400, 270], [1480, 266], [1500, G]]), c: "#3d5a40" },
      { d: lighthouse(1440, 268, 34), c: "#f4f1ea" },
      { d: lighthouseBand(1440, 268, 34), c: "#c0392b" },
    ],
    front: [{ d: water(0, 1600, 300), c: SEA }],
  },
  "west-highland-way": {
    view: "Loch Lomond's hills, the moor, the pyramid of Buachaille Etive Mòr and Ben Nevis's snow-flecked bulk",
    ridge: "#6f7a4a",
    ground: "#8a8a5a",
    shapes: [
      { d: range(nevis), c: "#7a7f8a" },
      { d: snowOf(nevis, 186), c: SNOW },
      { d: hills([[500, G], [700, 286], [1000, 284], [1200, 290], [1300, G]]), c: "#9a8a5a" },
      { d: range([[600, G], [660, 256], [720, 196], [760, 150], [778, 136], [796, 152], [840, 206], [900, 256], [960, G]]), c: "#6f6a6a" },
      { d: hills([[0, G], [100, 256], [220, 240], [340, 248], [460, 236], [560, 262], [640, G]]), c: "#7a8a6a" },
    ],
    front: [{ d: water(40, 540, 298), c: "#5b7f9a" }],
  },
  "whale-trail": {
    view: "De Hoop: Potberg's fynbos ridge, the white limestone dunes of the coast and a southern right whale's tail in the Indian Ocean",
    ridge: "#7d8a52",
    ground: "#e6dcc0",
    shapes: [
      { d: hills([[0, G], [120, 236], [260, 196], [360, 186], [460, 204], [600, 240], [760, 270], [900, G]]), c: "#8a9070" },
      { d: hills([[620, G], [760, 286], [900, 270], [1040, 276], [1180, 262], [1320, 278], [1460, 284], [1600, G]]), c: "#f1ece0" },
      { d: hills([[200, G], [400, 272], [620, 262], [860, 276], [1100, 286], [1300, G]]), c: "#a3a46c" },
    ],
    front: [
      { d: water(1000, 1600, 294), c: SEA },
      // the tail of a southern right whale, rising from the water
      { d: "M1356,294L1360,280L1346,270L1352,266L1366,276L1376,262L1382,266L1370,282L1372,294Z", c: "#2f3a45" },
    ],
  },
  westweg: {
    view: "The Black Forest's heights: the Hornisgrinde's long ridge, the Feldberg with its tower, the bald dome of the Belchen",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [120, 256], [260, 232], [400, 226], [540, 236], [660, 262], [760, G]]), c: "#6f8c84" },
      { d: hills([[700, G], [820, 246], [920, 206], [980, 192], [1040, 190], [1100, 204], [1200, 236], [1300, 262], [1380, G]]), c: FAR },
      { d: tower(1010, 192, 34, 10), c: "#c9c2b4" },
      { d: hills([[1260, G], [1340, 256], [1400, 228], [1440, 222], [1480, 230], [1540, 262], [1600, G]]), c: "#8a9a72" },
      { d: hills([[0, G], [200, 266], [440, 256], [680, 266], [920, 258], [1160, 268], [1400, 262], [1600, G]]), c: FIR },
    ],
  },
  schluchtensteig: {
    view: "The Southern Black Forest: the Wutach gorge's rock walls with a waterfall, dark fir hills round the Schluchsee and the green dome of St. Blasien",
    ridge: "#2f4a2c",
    ground: "#6f8f4a",
    shapes: [
      { d: hills([[0, G], [120, 252], [300, 226], [460, 238], [620, 214], [780, 232], [960, 220], [1120, 240], [1280, 226], [1440, 246], [1600, G]]), c: "#7f9a8e" },
      // the Wutach gorge: two rock walls with a waterfall between them
      { d: range([[40, G], [60, 250], [92, 212], [124, 204], [150, 228], [170, G]]), c: "#8a7f6c" },
      { d: range([[196, G], [212, 226], [238, 198], [276, 206], [302, 240], [320, G]]), c: "#9a8e76" },
      { d: waterfall(184, 232, 300, 5), c: "#f2f4f0" },
      { d: hills([[300, G], [420, 262], [560, 246], [700, 260], [840, G]]), c: FAR },
      // St. Blasien's dome on its drum, with the lantern
      { d: "M1136,272V236H1224V272Z", c: "#e9e4d8" },
      { d: dome(1180, 236, 44), c: "#5e8a86" },
      { d: tower(1180, 192, 14, 9), c: "#5e8a86" },
      { d: hills([[0, G], [200, 272], [460, 264], [720, 274], [980, 266], [1240, 276], [1480, 268], [1600, G]]), c: FIR },
    ],
    front: [{ d: water(780, 1100, 296), c: LAKE }],
  },
  "cleveland-way": {
    view: "The North York Moors and the Yorkshire coast: heather moorland, the cone of Roseberry Topping, a sea cliff with the ruin of Whitby Abbey and the North Sea",
    ridge: "#4f3f47",
    ground: "#7f8f5a",
    shapes: [
      { d: hills([[0, G], [140, 250], [320, 236], [520, 246], [700, 240], [860, 256], [980, G]]), c: "#9a8a96" },
      // Roseberry Topping: a cone with a broken, steep western face
      { d: range([[300, G], [350, 254], [392, 216], [414, 196], [430, 190], [446, 198], [474, 232], [524, 262], [570, G]]), c: "#6f6a5e" },
      { d: hills([[0, G], [200, 272], [420, 260], [640, 270], [860, 264], [1000, G]]), c: "#7a5f6e" },
      // the cliff headland at Whitby with the abbey's ruined east end and walls on top
      { d: range([[900, G], [912, 262], [1000, 252], [1130, 256], [1150, G]]), c: "#8a7a62" },
      { d: "M1010,254V214H1022V254Z M1030,254V196L1046,176L1062,196V254Z M1070,254V206H1080V254Z M1088,254V228H1112V254Z", c: "#a29b8c" },
      { d: range([[1380, G], [1400, 270], [1520, 264], [1544, G]]), c: "#6f7f5a" },
    ],
    front: [{ d: water(920, 1600, 300), c: SEA }],
  },
  "dingle-way": {
    view: "The Dingle Peninsula from Slea Head: the Blasket Islands in the Atlantic, the cliffs and the Three Sisters along the coast, the Brandon massif behind, green fields with a stone beehive hut",
    ridge: "#3f5a3a",
    ground: "#6f9a4a",
    shapes: [
      // the Brandon massif, its long ridge rising to Mount Brandon's summit
      { d: range([[820, G], [900, 236], [1010, 214], [1110, 188], [1180, 172], [1230, 180], [1330, 206], [1440, 222], [1600, 236], [1600, G]]), c: "#93a3ad" },
      // the Three Sisters: three steep humps on the coast
      { d: hills([[700, G], [740, 240], [790, 198], [826, 236], [866, 204], [900, 238], [940, 212], [990, 250], [1040, G]]), c: "#7a8f84" },
      // the Blaskets: Tearaght's peak, the Great Blasket's long back, Inishtooskert low
      { d: range([[40, G], [62, 250], [74, 244], [92, 262], [104, G]]), c: "#6f7f86" },
      { d: hills([[140, G], [200, 252], [290, 234], [380, 244], [450, 262], [490, G]]), c: "#728a7c" },
      { d: hills([[520, G], [560, 264], [610, 258], [670, G]]), c: "#7f9384" },
      { d: water(0, 860, 278), c: SEA },
      // Slea Head's cliff falling to the sea, and the fields behind it
      { d: range([[700, G], [716, 272], [730, 258], [860, 256], [1000, 262], [1120, 254], [1600, 262], [1600, G]]), c: "#6f9050" },
      // a clochán, the corbelled stone hut of the peninsula
      { d: "M1160,266Q1160,240 1178,238Q1196,240 1196,266Z", c: "#a29c8c" },
      { d: "M1174,266V256H1182V266Z", c: "#4f4a40" },
    ],
  },
  "kerry-way": {
    view: "The Iveragh Peninsula: the MacGillycuddy's Reeks up to Carrauntoohil over the Killarney lakes, Ballinskelligs Bay with the Skelligs' twin peaks far out in the Atlantic, green hills and Staigue's round stone fort",
    ridge: "#3f5a3a",
    ground: "#6f9a4a",
    shapes: [
      // the Reeks: a jagged ridge rising to Carrauntoohil, Ireland's highest summit
      { d: range([[160, G], [240, 230], [300, 206], [340, 214], [390, 186], [430, 196], [470, 168], [500, 160], [530, 174], [580, 182], [630, 204], [700, 214], [780, 236], [860, G]]), c: "#93a3ad" },
      // nearer, rounded hills of the peninsula
      { d: hills([[0, G], [90, 238], [200, 252], [330, 240], [470, 252], [560, 266], [620, G]]), c: "#7a8f84" },
      { d: hills([[820, G], [900, 236], [1000, 226], [1080, 240], [1160, 256], [1220, G]]), c: "#7f9384" },
      // a lake of Killarney under the Reeks, and the bay out to the Skelligs
      { d: water(240, 760, 264), c: SEA },
      { d: water(1090, 1600, 262), c: SEA },
      // Skellig Michael's two peaks and Little Skellig, far out
      { d: range([[1330, 262], [1342, 234], [1350, 242], [1360, 222], [1374, 262]]), c: "#6f7f86" },
      { d: range([[1430, 262], [1442, 244], [1454, 262]]), c: "#728a7c" },
      // green fields along the coast road
      { d: range([[0, G], [0, 268], [180, 264], [240, 286], [760, 286], [830, 262], [1000, 256], [1080, 262], [1100, 288], [1600, 288], [1600, G]]), c: "#6f9050" },
      // Staigue Fort: a round dry-stone wall on its green knoll
      { d: "M960,260V244Q960,238 990,238Q1020,238 1020,244V260Z", c: "#a29c8c" },
      { d: "M984,260V250H996V260Z", c: "#4f4a40" },
    ],
  },
  "pieterpad": {
    view: "The Netherlands from north to south in one wide view: Groningen's tall church tower over the flat land, a hunebed of great stones on the Drenthe heath, a windmill by a canal, the woods of the low hills, and the Sint-Pietersberg's flat-topped ridge far to the south",
    ridge: "#4f6a33",
    ground: "#7f9a4a",
    shapes: [
      // the Sint-Pietersberg: a long, flat-topped ridge of marl, far off
      { d: range([[1220, G], [1270, 252], [1320, 244], [1560, 242], [1600, 246], [1600, G]]), c: "#9aa9a0" },
      // the low wooded hills of Salland and the Montferland
      { d: hills([[700, G], [780, 254], [880, 248], [980, 256], [1060, 262], [1120, G]]), c: FAR },
      // Groningen's church tower: a tall square tower with a slender spire, over the town
      { d: "M330,268V246H420V268Z", c: "#a29c8c" },
      { d: "M366,246V176H384V246Z M369,176V160H381V176Z", c: "#b4a48c" },
      { d: "M371,160L375,132L379,160Z", c: "#6a5a4a" },
      // the flat land, the heath of Drenthe and a canal
      { d: range([[0, G], [0, 268], [1600, 266], [1600, G]]), c: "#8aa45a" },
      { d: hills([[440, G], [480, 272], [600, 268], [720, 272], [760, G]]), c: "#9a7f8a" },
      { d: water(840, 1180, 276), c: SEA },
      { d: range([[0, G], [0, 286], [1600, 286], [1600, G]]), c: "#7f9a4a" },
      // a hunebed: three standing boulders under a long capstone on the heath
      { d: "M556,272Q556,260 568,258Q582,260 582,272Z M590,272Q590,258 604,256Q618,258 618,272Z M626,272Q626,260 638,258Q650,260 650,272Z", c: "#8a8478" },
      { d: "M552,260Q560,246 600,244Q644,246 654,260Q600,254 552,260Z", c: "#6f6a60" },
      // a windmill on the canal's dike: the body, the cap and the sails
      { d: "M1192,268L1198,228H1214L1220,268Z", c: "#6f5a48" },
      { d: "M1194,230Q1206,218 1218,230Z", c: "#4f4038" },
      { d: "M1206,226L1178,198L1182,194L1210,222Z M1206,226L1234,254L1230,258L1202,230Z M1206,226L1234,198L1238,202L1210,230Z M1206,226L1178,254L1174,250L1202,222Z", c: "#e3d6bc" },
    ],
  },
  "rennsteig": {
    view: "The Thuringian Forest from the west: the long wooded ridge the Rennsteig follows, the Großer Inselsberg with its masts, the Wartburg on its hill above Eisenach, dark spruce woods, and a historic boundary stone by the path",
    ridge: "#3f5a33",
    ground: "#5f7f3a",
    shapes: [
      // the crest of the Thuringian Forest, rising to the Großer Inselsberg and on to the Beerberg
      { d: hills([[0, G], [160, 232], [360, 214], [520, 196], [600, 176], [660, 182], [820, 206], [1040, 196], [1240, 188], [1420, 204], [1600, 214], [1600, G]]), c: FAR },
      // the Inselsberg's masts
      { d: tower(596, 178, 30, 4), c: "#d8d2c4" },
      { d: tower(624, 178, 20, 6), c: "#c9c2b2" },
      // dark spruce woods on the nearer hills
      { d: hills([[0, G], [120, 252], [280, 240], [420, 250], [520, 262], [600, G]]), c: FOREST },
      { d: hills([[900, G], [1000, 246], [1160, 238], [1320, 248], [1460, 256], [1600, 252], [1600, G]]), c: FOREST },
      // the Wartburg on its wooded hill above Eisenach
      { d: hills([[620, G], [700, 252], [770, 232], [840, 244], [920, 266], [960, G]]), c: "#4f6a3a" },
      { d: castle(772, 234, 0.7), c: "#d6c8a8" },
      { d: castleRoofs(772, 234, 0.7), c: "#6a4a3e" },
      // a meadow along the path, and a Rennsteig boundary stone
      { d: range([[0, G], [0, 274], [600, 270], [1000, 276], [1600, 270], [1600, G]]), c: "#7f9a4a" },
      { d: "M1180,276V258Q1180,252 1186,252H1194Q1200,252 1200,258V276Z", c: "#b8ad98" },
    ],
  },
  "malerweg": {
    view: "The Elbe Sandstone Mountains as the Romantic painters saw them: the Lilienstein and the Königstein's fortress on their flat-topped table mountains over the Elbe, the Schrammsteine's jagged towers, and the Bastei's stone bridge among sandstone pillars in the woods",
    ridge: "#4f6a33",
    ground: "#6f8a3a",
    shapes: [
      // the Lilienstein and the Königstein: table mountains with sheer sandstone sides
      { d: range([[120, G], [150, 250], [170, 206], [182, 196], [300, 196], [314, 208], [336, 252], [370, G]]), c: "#9aa69a" },
      { d: range([[880, G], [910, 250], [926, 214], [938, 206], [1060, 206], [1072, 216], [1090, 252], [1120, G]]), c: "#9aa69a" },
      // the fortress walls along the Königstein's top
      { d: "M944,206V194H984V188H1000V194H1054V206Z", c: "#c9b89a" },
      // the Schrammsteine: a ridge of jagged sandstone towers
      { d: range([[1240, G], [1270, 236], [1284, 216], [1292, 228], [1306, 204], [1318, 222], [1330, 210], [1346, 226], [1362, 214], [1380, 240], [1420, G]]), c: "#a89a84" },
      // wooded slopes down to the Elbe
      { d: hills([[0, G], [140, 256], [420, 246], [700, 258], [980, 248], [1240, 254], [1600, 246], [1600, G]]), c: FOREST },
      { d: water(380, 900, 272), c: SEA },
      // the Bastei: sandstone pillars joined by the arched stone bridge
      { d: "M500,272V214Q500,206 508,206H520Q528,206 528,214V272Z M560,272V198Q560,190 568,190H580Q588,190 588,198V272Z M620,272V222Q620,214 628,214H638Q646,214 646,222V272Z", c: "#b7a68a" },
      { d: "M524,214H564V226Q544,214 528,226Z M584,206H624V218Q604,206 588,218Z", c: "#8a7a62" },
      { d: range([[0, G], [0, 278], [380, 276], [420, 284], [860, 284], [900, 276], [1600, 278], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "wicklow-way": {
    view: "Glendalough in the Wicklow Mountains: the monastic round tower among the trees by the lower lake, the upper lake between steep wooded slopes, the rounded granite mountains and heathery moorland behind",
    ridge: "#4f6a3a",
    ground: "#6f8a4a",
    shapes: [
      // the rounded granite mountains behind the valley
      { d: hills([[0, G], [140, 226], [340, 206], [520, 196], [700, 214], [900, 200], [1100, 186], [1300, 204], [1600, 222], [1600, G]]), c: "#93a39a" },
      // heather on the moorland shoulders
      { d: hills([[0, G], [80, 246], [260, 236], [420, 248], [520, 262], [560, G]]), c: "#8a6f7f" },
      // the steep wooded sides of the glacial valley
      { d: hills([[480, G], [560, 238], [700, 226], [820, 248], [880, 266], [900, G]]), c: FOREST },
      { d: hills([[1120, G], [1180, 250], [1300, 232], [1460, 238], [1600, 250], [1600, G]]), c: FOREST },
      // the upper lake in the valley floor
      { d: water(840, 1180, 266), c: SEA },
      // the round tower with its conical cap, by the trees of the monastic site
      { d: "M330,272V196Q330,192 336,192H344Q350,192 350,196V272Z", c: "#b8ad98" },
      { d: "M328,194L340,166L352,194Z", c: "#6f665a" },
      { d: hills([[200, G], [240, 262], [300, 256], [380, 262], [420, G]]), c: "#4f6a3a" },
      { d: range([[0, G], [0, 276], [600, 272], [840, 280], [1180, 280], [1600, 274], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "pembrokeshire-coast-path": {
    view: "The Pembrokeshire coast: red and grey sea cliffs with the Green Bridge of Wales, a natural arch, and sea stacks in the surf, an island far out, and the green clifftop fields with a Neolithic cromlech",
    ridge: "#4f6a3a",
    ground: "#6f9a4a",
    shapes: [
      // an island far out at sea
      { d: hills([[120, G], [170, 248], [260, 240], [330, 252], [360, G]]), c: "#8a9aa3" },
      { d: water(0, 1600, 262), c: SEA },
      // sea stacks
      { d: range([[520, 266], [526, 230], [544, 226], [550, 266]]), c: "#8a7a6a" },
      { d: range([[600, 266], [606, 244], [618, 242], [622, 266]]), c: "#8a7a6a" },
      // the Green Bridge of Wales: a limestone arch standing in the sea
      { d: "M660,266V226Q660,216 680,214H760Q776,216 776,226V266H756V246Q756,234 718,232Q680,234 680,246V266Z", c: "#a89a84" },
      // the cliffs: a high headland running out to the sea
      { d: range([[780, G], [790, 222], [820, 212], [980, 206], [1160, 214], [1400, 210], [1600, 216], [1600, G]]), c: "#8a6f5a" },
      // the clifftop fields
      { d: range([[800, G], [810, 216], [990, 210], [1170, 218], [1400, 214], [1600, 220], [1600, G]]), c: "#7f9a4a" },
      // a cromlech: a capstone on its uprights
      { d: "M1220,214V196H1228V214Z M1262,214V194H1270V214Z", c: "#6f6a60" },
      { d: "M1210,198Q1240,184 1280,194L1278,200Q1240,192 1212,202Z", c: "#8a8478" },
      { d: range([[0, G], [0, 284], [780, 284], [800, 270], [1600, 272], [1600, G]]), c: "#6f9a4a" },
    ],
  },
  "hadrians-wall-path": {
    view: "Hadrian's Wall in the central sector: the Roman wall riding the crags of the Whin Sill above a lough, a milecastle on the ridge, the wide moorland of Northumberland to the north",
    ridge: "#4f6a3a",
    ground: "#7f9a4a",
    shapes: [
      // the moorland to the north, far off
      { d: hills([[0, G], [200, 232], [500, 222], [800, 230], [1100, 220], [1400, 228], [1600, 224], [1600, G]]), c: "#9aa69a" },
      // the Whin Sill: a ridge with a steep north face, rising and falling
      { d: range([[0, G], [0, 250], [180, 236], [300, 214], [380, 228], [500, 206], [620, 222], [760, 200], [900, 216], [1040, 230], [1200, 212], [1360, 228], [1600, 238], [1600, G]]), c: "#6f8a5a" },
      // the Wall along the crest
      { d: "M105,242L180,236L300,214L380,228L500,206L620,222L760,200L900,216L1040,230L1200,212L1360,228L1477,233V225L1360,220L1200,204L1040,222L900,208L760,192L620,214L500,198L380,220L300,206L180,228L105,234Z", c: "#b8ad98" },
      // a milecastle on the ridge
      { d: "M736,202V188H784V196Z", c: "#a89a84" },
      // a lough below the crags
      { d: water(900, 1300, 262), c: SEA },
      { d: range([[0, G], [0, 272], [880, 270], [920, 278], [1280, 278], [1320, 270], [1600, 272], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "pennine-way": {
    view: "The Yorkshire Dales on the Pennine Way: Pen-y-ghent's stepped gritstone and limestone profile over open moorland, the curved limestone cliff of Malham Cove, a drystone wall running over the fields",
    ridge: "#5f7a3f",
    ground: "#7f9a4a",
    shapes: [
      // far moorland ridges of the Pennines
      { d: hills([[0, G], [160, 232], [420, 218], [700, 228], [980, 214], [1280, 224], [1600, 216], [1600, G]]), c: "#9aa69a" },
      // Pen-y-ghent: a long back rising in two steps to its blunt nose
      { d: range([[900, G], [960, 240], [1040, 230], [1110, 226], [1150, 206], [1180, 202], [1210, 186], [1260, 182], [1290, 196], [1320, 214], [1400, 236], [1480, G]]), c: "#7f8a74" },
      // heather moorland in front
      { d: hills([[0, G], [100, 248], [300, 240], [520, 252], [700, 262], [760, G]]), c: "#8a6f7f" },
      // Malham Cove: a curved white limestone cliff in a green dale
      { d: range([[300, G], [330, 250], [360, 226], [380, 222], [520, 222], [540, 228], [570, 252], [600, G]]), c: "#d6d0c2" },
      { d: range([[330, G], [340, 252], [600, 252], [610, G]]), c: "#6f9050" },
      // the dale's fields and a drystone wall over them
      { d: range([[0, G], [0, 270], [600, 266], [1000, 272], [1600, 266], [1600, G]]), c: "#7f9a4a" },
      { d: "M90,275L400,270L800,274L1200,268L1505,271V274L1200,271L800,277L400,273L90,278Z", c: "#a8a090" },
    ],
  },
  "great-glen-way": {
    view: "The Great Glen: Ben Nevis far to the south-west, the long trough of Loch Ness between steep wooded sides, the ruined tower of Urquhart Castle on its point, and a lock on the Caledonian Canal",
    ridge: "#3f5a3a",
    ground: "#6f8a4a",
    shapes: [
      // Ben Nevis, far off
      { d: range([[60, G], [140, 220], [200, 196], [250, 186], [300, 192], [380, 218], [460, G]]), c: "#a3adb5" },
      // the steep sides of the glen, rising either side of the loch
      { d: hills([[380, G], [480, 222], [640, 208], [820, 220], [940, 248], [980, G]]), c: "#6f8a74" },
      { d: hills([[1100, G], [1200, 230], [1360, 212], [1500, 220], [1600, 226], [1600, G]]), c: "#6f8a74" },
      { d: water(500, 1600, 262), c: SEA },
      // Urquhart Castle: a ruined tower on its point above the loch
      { d: hills([[980, G], [1010, 260], [1060, 254], [1110, 262], [1130, G]]), c: FOREST },
      { d: "M1040,256V226H1062V256Z M1040,226V220H1046V226Z M1056,226V220H1062V226Z", c: "#a89a84" },
      { d: "M1062,256V242H1080V256Z", c: "#a89a84" },
      // the canal with a lock gate, and the towpath fields
      { d: range([[0, G], [0, 270], [500, 268], [520, 284], [1600, 284], [1600, G]]), c: "#7f9a4a" },
      { d: water(80, 380, 280), c: SEA },
      { d: "M226,278V266H232V278Z M240,278V266H246V278Z", c: "#4f4038" },
    ],
  },
  "kumano-kodo-nakahechi": {
    view: "The Kii mountains on the Kumano Kodo: ridge after ridge of forested mountains fading into the haze, a vermilion torii and a shrine roof in the cedars, and the Nachi falls with the three-storied pagoda",
    ridge: "#3f5a3a",
    ground: "#4f6a3a",
    shapes: [
      // ridges of forested mountains, paler with distance
      { d: hills([[0, G], [140, 214], [320, 200], [520, 220], [700, 204], [900, 224], [1100, 206], [1320, 220], [1600, 210], [1600, G]]), c: "#a3b3ad" },
      { d: hills([[0, G], [200, 230], [420, 218], [640, 236], [860, 222], [1080, 240], [1320, 228], [1600, 238], [1600, G]]), c: "#7f9488" },
      { d: hills([[0, G], [160, 252], [380, 242], [600, 256], [820, 246], [1060, 258], [1300, 250], [1600, 256], [1600, G]]), c: FOREST },
      // the Nachi falls on a cliff, and the pagoda before it
      { d: range([[1180, G], [1190, 230], [1230, 218], [1270, 226], [1290, G]]), c: "#6f7f74" },
      { d: waterfall(1232, 222, 270, 6), c: "#e8eef0" },
      { d: "M1300,272V262H1336V272Z M1304,262L1318,254L1332,262Z M1306,254V246H1330V254Z M1302,246L1318,238L1334,246Z M1308,238V232H1328V238Z M1304,232L1318,222L1332,232Z", c: "#c0503a" },
      // a torii in the cedars
      { d: "M420,272V244H426V272Z M454,272V244H460V272Z M412,244V238H468V244Z M416,250V247H464V250Z", c: "#c0503a" },
      { d: range([[0, G], [0, 274], [1600, 272], [1600, G]]), c: "#5f7a3f" },
    ],
  },
  "gr-70-chemin-de-stevenson": {
    view: "Stevenson's way south: the volcanic cones of the Velay, the long bare granite back of the Mont Lozère, the deep wooded valleys of the Cévennes, and the old humpback bridge at Le Pont-de-Montvert",
    ridge: "#5f7a3f",
    ground: "#7f9a4a",
    shapes: [
      // the Mont Lozère: a long, bare granite ridge
      { d: hills([[600, G], [700, 226], [860, 206], [1020, 200], [1180, 210], [1320, 228], [1440, G]]), c: "#a3a89a" },
      // the volcanic cones of the Velay
      { d: range([[0, G], [60, 244], [110, 214], [130, 210], [180, 244], [240, G]]), c: "#8a9a8a" },
      { d: range([[200, G], [250, 240], [300, 222], [320, 220], [370, 246], [430, G]]), c: "#7f9488" },
      // the Cévennes' wooded ridges, falling south
      { d: hills([[1100, G], [1200, 240], [1340, 228], [1480, 244], [1600, 236], [1600, G]]), c: FOREST },
      { d: hills([[380, G], [480, 256], [640, 246], [800, 258], [900, 266], [960, G]]), c: "#4f6a3a" },
      // the stone bridge over the Tarn
      { d: water(840, 1120, 262), c: SEA },
      { d: "M880,270Q980,222 1080,270H1062Q980,238 898,270Z M876,270H898V286H876Z M1062,270H1084V286H1062Z", c: "#a89a84" },
      { d: range([[0, G], [0, 272], [840, 270], [860, 288], [1100, 288], [1120, 270], [1600, 270], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "high-coast-trail": {
    view: "The High Coast of Sweden: the suspension bridge over the Ångermanälven, steep forested hills rising straight from the Gulf of Bothnia, the dome of Skuleberget and islands in the sea",
    ridge: "#3f5a3a",
    ground: "#4f6a3a",
    shapes: [
      // islands far out in the sea
      { d: hills([[1300, G], [1350, 252], [1440, 246], [1520, 256], [1560, G]]), c: "#8a9aa3" },
      { d: water(0, 1600, 262), c: SEA },
      // the High Coast Bridge: two towers and the main cable
      { d: "M120,264V182H130V264Z M400,264V182H410V264Z", c: "#c9ccd0" },
      { d: "M60,244Q125,180 125,182Q265,250 405,182Q405,180 470,244L470,246Q405,184 405,186Q265,254 125,186Q125,184 60,246Z", c: "#c9ccd0" },
      { d: "M40,246H500V250H40Z", c: "#b8bcc0" },
      // the steep forested coast, and Skuleberget's rounded dome
      { d: hills([[560, G], [620, 230], [720, 210], [820, 226], [900, 244], [960, G]]), c: FOREST },
      { d: hills([[880, G], [960, 214], [1040, 186], [1120, 192], [1200, 226], [1280, G]]), c: "#4f6a3a" },
      { d: range([[0, G], [0, 280], [1600, 280], [1600, G]]), c: "#4f6a3a" },
    ],
  },
  "alta-via-dei-parchi": {
    view: "The northern Apennines: the grassy main ridge above the beech line, the forested valleys of the Casentino, and the sanctuary of La Verna on its sheer limestone cliff",
    ridge: "#4f6a3a",
    ground: "#6f8a4a",
    shapes: [
      // the main ridge, grassy above the beech line
      { d: hills([[0, G], [120, 220], [300, 196], [460, 206], [620, 190], [800, 212], [1000, 222], [1200, 210], [1400, 226], [1600, 218], [1600, G]]), c: "#9aa68a" },
      // the beech forests below it
      { d: hills([[0, G], [140, 242], [340, 232], [540, 246], [760, 236], [980, 250], [1200, 242], [1600, 252], [1600, G]]), c: FOREST },
      // La Verna: a wooded cliff with the sanctuary on top
      { d: range([[1060, G], [1080, 236], [1100, 214], [1180, 210], [1200, 230], [1220, G]]), c: "#a89a84" },
      { d: "M1110,214V198H1170V214Z M1136,198V182H1146V198Z", c: "#d6c8a8" },
      { d: "M1106,198L1140,190L1174,198Z M1134,182L1141,172L1148,182Z", c: "#8a5a44" },
      { d: range([[0, G], [0, 270], [1600, 268], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "adlerweg": {
    view: "The Wilder Kaiser from the alpine meadows on its south side, where the Adlerweg begins: the jagged limestone wall of the Ellmauer Halt and its neighbours above forest and pasture",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      // the limestone wall, pale grey, its towers and notches
      { d: range([[80, G], [160, 250], [230, 196], [270, 168], [300, 150], [318, 158], [340, 132], [362, 146], [390, 124], [412, 138], [440, 112], [462, 96], [480, 108], [506, 102], [530, 126], [556, 118], [584, 140], [612, 128], [640, 150], [676, 138], [712, 160], [760, 150], [800, 172], [860, 166], [920, 190], [1000, 214], [1100, 238], [1200, 262], [1320, 288], [1440, G]]), c: "#b3b2ab" },
      // scree below the wall
      { d: hills([[180, G], [260, 262], [380, 236], [500, 230], [620, 238], [760, 252], [900, 270], [1040, 290], [1180, G]]), c: "#cfcbbd" },
      // the forest at its foot
      { d: hills([[0, G], [120, 266], [260, 282], [420, 272], [600, 286], [780, 278], [960, 290], [1140, 280], [1320, 270], [1480, 282], [1600, 276], [1600, G]]), c: FOREST },
    ],
  },
  "el-anillo-de-picos": {
    view: "The central massif of the Picos de Europa from the Vega de Urriellu: the sheer limestone block of the Picu Urriellu (Naranjo de Bulnes) above grey jagged ridges, high pasture in front",
    ridge: "#6f8a4a",
    ground: MEADOW,
    shapes: [
      // the jagged grey ridges of the massif behind
      { d: range([[0, G], [80, 250], [160, 214], [220, 196], [262, 176], [300, 188], [340, 160], [380, 176], [430, 150], [480, 168], [540, 146], [600, 170], [700, 160], [760, 176], [900, 150], [960, 166], [1020, 144], [1080, 160], [1140, 138], [1200, 156], [1270, 148], [1340, 172], [1420, 196], [1520, 236], [1600, 250], [1600, G]]), c: "#a9aca8" },
      // the Picu Urriellu: a steep-walled block with a slanting top
      { d: range([[600, G], [640, 250], [690, 190], [714, 130], [722, 100], [780, 90], [826, 102], [834, 132], [852, 196], [890, 256], [940, G]]), c: "#c9c3b4" },
      // its shaded west face
      { d: "M722,100L714,130L690,190L672,222L702,240L730,170L742,124Z", c: "#b2ab9b" },
      // the high pasture and scree in front
      { d: hills([[0, G], [140, 286], [320, 270], [520, 280], [720, 266], [920, 278], [1120, 272], [1320, 284], [1500, 276], [1600, 282], [1600, G]]), c: "#7f9a4a" },
    ],
  },
  "fishermens-trail": {
    view: "The Costa Vicentina: dark schist cliffs over the Atlantic with a sea stack where storks nest, the lighthouse on Cabo de São Vicente far off, and a sandy cove below the clifftop heath",
    ridge: "#6f7a4a",
    ground: "#cdb27a",
    shapes: [
      // Cabo de São Vicente far off, with its lighthouse
      { d: range([[0, G], [0, 238], [150, 232], [290, 240], [350, 252], [380, G]]), c: "#a3a39c" },
      { d: lighthouse(130, 233, 24), c: "#f4f1ea" },
      { d: water(0, 1600, 254), c: SEA },
      // a sea stack with a stork's nest on top
      { d: range([[560, 270], [566, 216], [592, 210], [602, 270]]), c: "#7a6a5c" },
      { d: "M568,214L572,206H592L596,212Z", c: "#5a4a3a" },
      // the cliffs, their schist face dark and reddish
      { d: range([[700, G], [712, 208], [770, 196], [1000, 190], [1250, 198], [1600, 192], [1600, G]]), c: "#7a6458" },
      // the heath along the clifftop
      { d: range([[750, G], [762, 202], [1000, 195], [1250, 203], [1600, 197], [1600, G]]), c: "#8f9a6a" },
      // a sandy cove below
      { d: range([[0, G], [0, 284], [300, 278], [600, 284], [720, 292], [780, G]]), c: "#e0c99a" },
    ],
  },
  "glyndwrs-way": {
    view: "Mid-Wales on Glyndŵr's Way: rounded moorland hills over dark conifer plantations, and Lake Vyrnwy with the turreted straining tower standing in its water",
    ridge: "#6f8a4a",
    ground: "#8aa858",
    shapes: [
      // the far hills of the Cambrian Mountains
      { d: hills([[0, G], [180, 236], [420, 222], [660, 234], [900, 218], [1160, 230], [1400, 220], [1600, 228], [1600, G]]), c: "#9aa69a" },
      // moorland in front, brown with bracken and heather
      { d: hills([[0, G], [140, 252], [360, 240], [560, 256], [700, G]]), c: "#9a8a6a" },
      // a conifer plantation on the next hill
      { d: hills([[620, G], [720, 250], [900, 238], [1060, 252], [1140, G]]), c: FIR },
      // Lake Vyrnwy and its straining tower with a pointed roof
      { d: water(1100, 1600, 272), c: LAKE },
      { d: tower(1340, 272, 34, 14), c: "#8a8a7a" },
      { d: "M1331,238L1340,220L1349,238Z", c: "#5f6a5a" },
    ],
  },
  "yorkshire-wolds-way": {
    view: "The Yorkshire Wolds: smooth chalk hills folded into a deep dry valley, and Filey Brigg running out as a low rocky finger into the North Sea",
    ridge: MEADOW,
    ground: "#9ab866",
    shapes: [
      // the far wolds
      { d: hills([[0, G], [200, 248], [460, 236], [700, 246], [900, 240], [1040, G]]), c: "#a7b98a" },
      { d: water(960, 1600, 266), c: SEA },
      // Filey Brigg: a long, low headland ending in a rocky reef
      { d: range([[1000, G], [1040, 262], [1200, 258], [1380, 262], [1470, 266], [1500, G]]), c: "#8a7a64" },
      // the two sides of a dry valley in front, its smooth floor between them
      { d: hills([[0, G], [100, 262], [300, 236], [430, 252], [520, G]]), c: "#8fa868" },
      { d: hills([[480, G], [620, 254], [800, 232], [940, 260], [1040, G]]), c: "#7f9a54" },
    ],
  },
  "three-lochs-way": {
    view: "From the Highland Boundary Fault over Loch Lomond and Loch Long to the Arrochar Alps, The Cobbler's three rocky prongs among them",
    ridge: "#7f9a54",
    ground: "#8fa868",
    shapes: [
      // the Arrochar Alps, far and blue-grey
      { d: range([[620, G], [720, 236], [820, 196], [900, 176], [960, 190], [1040, 170], [1120, 186], [1220, 210], [1340, 240], [1440, G]]), c: "#8e98a4" },
      // The Cobbler (Ben Arthur): a ridge with three rocky prongs
      { d: range([[360, G], [440, 250], [520, 210], [560, 186], [580, 166], [592, 176], [612, 158], [626, 150], [640, 162], [666, 156], [680, 170], [720, 190], [800, 226], [900, 262], [980, G]]), c: "#6f6a64" },
      // the lochs, bright between the hills
      { d: water(0, 1600, 282), c: LAKE },
      // the forested slopes above the shore
      { d: hills([[0, G], [120, 270], [300, 256], [460, 272], [560, G]]), c: "#3f5a34" },
      { d: hills([[1100, G], [1240, 266], [1420, 258], [1600, 270], [1600, G]]), c: "#4f6a3a" },
    ],
  },
  "west-island-way": {
    view: "From Bute's south end over the Sound of Bute to Arran's granite peaks, St Blane's roofless chapel on its green knoll, and the island's low moorland hills",
    ridge: "#7f9a54",
    ground: "#8fa868",
    shapes: [
      // Arran's northern peaks, far across the Sound of Bute
      { d: range([[700, G], [780, 242], [860, 204], [920, 190], [950, 178], [980, 186], [1020, 174], [1060, 188], [1120, 204], [1200, 232], [1300, 258], [1400, G]]), c: "#9aa2ae" },
      // the Sound of Bute and the Firth of Clyde
      { d: water(0, 1600, 282), c: SEA },
      // Bute's moorland hills, olive and brown
      { d: hills([[0, G], [120, 252], [300, 234], [460, 250], [620, 272], [720, G]]), c: "#8a8a5a" },
      // the green knoll by Kilchattan Bay with St Blane's Chapel, roofless: its nave's gable and the lower chancel
      { d: hills([[1160, G], [1300, 268], [1440, 262], [1600, 270], [1600, G]]), c: "#6f8a4a" },
      { d: "M1340,268V248L1352,238L1364,248V268Z", c: "#8a8478" },
      { d: "M1364,268V254H1392V268Z", c: "#8a8478" },
      { d: "M1349,268V256A3,3 0 0 1 1355,256V268Z", c: "#6f8a4a" },
    ],
  },
  "three-capes-track": {
    view: "From the Tasman Peninsula's sea cliffs: Cape Pillar's dark dolerite falling sheer into the Tasman Sea, the Totem Pole and other sea stacks below it, Tasman Island with its lighthouse offshore, and eucalypt forest",
    ridge: "#5f7a44",
    ground: "#6f8a4a",
    shapes: [
      // Tasman Island offshore, flat-topped, with its lighthouse
      { d: range([[1020, G], [1060, 252], [1090, 234], [1240, 228], [1270, 246], [1310, G]]), c: "#8e98a4" },
      { d: lighthouse(1170, 231, 24), c: "#f4f1ea" },
      // the Tasman Sea
      { d: water(0, 1600, 282), c: SEA },
      // Cape Pillar: a high dolerite plateau ending in sheer cliffs
      { d: range([[0, G], [160, 196], [300, 180], [420, 172], [520, 180], [548, 236], [566, G]]), c: "#5a5650" },
      // the Totem Pole, slender, and broader sea stacks off the cape
      { d: pillars([[640, 238], [668, 216], [694, 246]], 16), c: "#4f4a44" },
      { d: pillars([[780, 214]], 8), c: "#4f4a44" },
      // eucalypt forest on the slopes towards Fortescue Bay
      { d: hills([[1280, G], [1400, 268], [1500, 258], [1600, 266], [1600, G]]), c: "#3f5a34" },
    ],
  },
  heidschnuckenweg: {
    view: "The Lüneburg Heath in bloom: purple heather rolling to the Wilseder Berg, dark juniper cones, a thatched heath farmhouse among birches, and a flock of Heidschnucken, the moorland sheep that keep the heath open",
    ridge: "#7a5a7a",
    ground: "#8a6a5a",
    shapes: [
      // the Wilseder Berg, the heath's highest hill, far and soft
      { d: hills([[200, G], [420, 250], [640, 236], [860, 252], [1100, G]]), c: "#a8a8b8" },
      // the heather in bloom, rolling
      { d: hills([[0, G], [160, 270], [420, 262], [700, 274], [980, 264], [1260, 276], [1600, 266], [1600, G]]), c: "#9a6a9a" },
      // birches round a thatched heath farmhouse: the steep reed roof over a low brick wall
      { d: hills([[1080, G], [1140, 250], [1200, 244], [1260, 256], [1300, G]]), c: "#6f8a4a" },
      { d: "M1155,320V286H1225V320Z", c: "#8a4a3a" },
      { d: "M1145,288L1190,250L1235,288Z", c: "#a08a5a" },
      // juniper bushes, dark and pointed
      { d: "M293,320C293,291.0 298,270 300,262C302,270 307,291.0 307,320Z M311,320C311,297.0 316,282 318,274C320,282 325,297.0 325,320Z M683,320C683,289.0 688,266 690,258C692,266 697,289.0 697,320Z M705,320C705,295.0 710,278 712,270C714,278 719,295.0 719,320Z M1003,320C1003,293.0 1008,274 1010,266C1012,274 1017,293.0 1017,320Z M1373,320C1373,288.0 1378,264 1380,256C1382,264 1387,288.0 1387,320Z M1395,320C1395,295.0 1400,278 1402,270C1404,278 1409,295.0 1409,320Z M1417,320C1417,291.0 1422,270 1424,262C1426,270 1431,291.0 1431,320Z", c: "#2f4a34" },
      // a flock of Heidschnucken: grey fleece, black heads and legs
      { d: "M836,299V304H837V299Z M843,299V304H844V299Z M862,303V308H863V303Z M869,303V308H870V303Z M888,297V302H889V297Z M895,297V302H896V297Z M910,305V310H911V305Z M917,305V310H918V305Z M940,301V306H941V301Z M947,301V306H948V301Z", c: "#2a2a2a" },
      { d: "M833,296a7,4.5 0 1 0 14,0a7,4.5 0 1 0 -14,0Z M846,293a2.6,2.2 0 1 0 5.2,0a2.6,2.2 0 1 0 -5.2,0Z M859,300a7,4.5 0 1 0 14,0a7,4.5 0 1 0 -14,0Z M872,297a2.6,2.2 0 1 0 5.2,0a2.6,2.2 0 1 0 -5.2,0Z M885,294a7,4.5 0 1 0 14,0a7,4.5 0 1 0 -14,0Z M898,291a2.6,2.2 0 1 0 5.2,0a2.6,2.2 0 1 0 -5.2,0Z M907,302a7,4.5 0 1 0 14,0a7,4.5 0 1 0 -14,0Z M920,299a2.6,2.2 0 1 0 5.2,0a2.6,2.2 0 1 0 -5.2,0Z M937,298a7,4.5 0 1 0 14,0a7,4.5 0 1 0 -14,0Z M950,295a2.6,2.2 0 1 0 5.2,0a2.6,2.2 0 1 0 -5.2,0Z", c: "#b8b0a4" },
    ],
  },
  rheinburgenweg: {
    view: "The Rhine gorge: steep slate slopes on both banks, a castle on its crag, the Loreley's cliff with vineyards in terraces, and in the river the white Pfalzgrafenstein toll castle and a barge",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      // the plateaus above the gorge, far and level
      { d: hills([[0, G], [200, 228], [600, 220], [1000, 224], [1400, 218], [1600, 226], [1600, G]]), c: "#9aa4a0" },
      // the left bank: a wooded slate slope with a castle on its crag
      { d: range([[0, G], [140, 206], [300, 198], [420, 214], [540, 270], [620, G]]), c: "#5f6a4a" },
      { d: castle(300, 199, 0.8), c: "#d8cbb0" },
      { d: castleRoofs(300, 199, 0.8), c: "#5a4a4a" },
      // the right bank: the Loreley's slate cliff, vineyards in terraces on its slope
      { d: range([[880, G], [980, 270], [1060, 222], [1140, 202], [1300, 196], [1460, 206], [1600, 212], [1600, G]]), c: "#6a6658" },
      { d: orchard(1180, 1520, [226, 240, 254], 14, 3), c: "#5d7a2f" },
    ],
    front: [
      // the Rhine, a barge and the Pfalzgrafenstein on its island
      { d: water(440, 1100, 300), c: LAKE },
      { d: "M600,300H676L670,306H606Z M612,300V294H630V300Z", c: "#3a3a40" },
      { d: "M770,304V284H806V304Z M780,284V272H796V284Z", c: "#f0ece0" },
      { d: "M778,272L788,262L798,272Z M768,284L788,276L808,284Z", c: "#5a4a4a" },
    ],
  },
  "tongariro-northern-circuit": {
    view: "Tongariro's volcanoes from the Oturere side: Ngauruhoe's near-perfect cone, Ruapehu's snowy massif behind, the rust-red rim of Red Crater, the Emerald Lakes' bright pools and golden tussock",
    ridge: "#8a7a5a",
    ground: "#b8a26a",
    shapes: [
      // Ruapehu, far, broad and snow-capped
      { d: range([[880, G], [1000, 236], [1120, 196], [1200, 184], [1280, 190], [1380, 214], [1520, 256], [1600, G]]), c: "#9aa2ae" },
      { d: "M1120,196L1200,184L1280,190L1320,200L1290,206L1250,198L1200,204L1160,200Z", c: "#eef0f2" },
      // Ngauruhoe: a steep, near-perfect cone
      { d: range([[420, G], [520, 236], [600, 172], [640, 150], [680, 172], [760, 236], [860, G]]), c: "#5a4e4a" },
      // Tongariro's broad massif with Red Crater's rust-red rim
      { d: range([[0, G], [120, 244], [260, 214], [360, 206], [460, 222], [560, 262], [620, G]]), c: "#6a5e56" },
      { d: "M300,210L330,206L360,206L380,212L350,216L320,216Z", c: "#a64a2e" },
      // the golden tussock of the Oturere and Rangipo side
      { d: hills([[0, G], [200, 282], [520, 276], [860, 286], [1200, 278], [1600, 284], [1600, G]]), c: "#b89a5a" },
    ],
    front: [
      // the Emerald Lakes, bright pools in old explosion pits
      { d: "M240,300a26,6 0 1 0 52,0a26,6 0 1 0 -52,0Z M306,304a18,4 0 1 0 36,0a18,4 0 1 0 -36,0Z M352,300a14,4 0 1 0 28,0a14,4 0 1 0 -28,0Z", c: "#3fa89a" },
    ],
  },
  "hump-ridge-track": {
    view: "Southern Fiordland from Te Waewae Bay: the forested Hump Ridge with its granite tors, Fiordland's peaks far behind, the bay's long beach, and the Percy Burn viaduct, a timber tramway trestle over a forest gorge",
    ridge: "#4f6a3a",
    ground: "#c9b88a",
    shapes: [
      // Fiordland's peaks, far to the west
      { d: range([[0, G], [80, 236], [180, 210], [260, 220], [340, 200], [420, 226], [520, 250], [600, G]]), c: "#9aa4b0" },
      // the sea in Te Waewae Bay
      { d: water(0, 1600, 286), c: SEA },
      // Hump Ridge, forested, with granite tors on its top
      { d: hills([[420, G], [560, 236], [720, 214], [880, 222], [1000, 250], [1080, G]]), c: "#3f5a34" },
      { d: "M690,216L694,204H702L706,214Z M724,214L728,200H738L742,214Z M760,216L763,208H770L772,216Z", c: "#a8a090" },
      // the forest gorge of the Percy Burn and the timber viaduct across it
      { d: hills([[1040, G], [1080, 262], [1110, 260], [1150, 300], [1250, 300], [1290, 262], [1340, 258], [1420, 270], [1600, 266], [1600, G]]), c: "#4f6a3a" },
      { d: "M1110,262L1106,300H1109L1112,262Z M1112,262L1116,300H1119L1115,262Z M1134,262L1130,300H1133L1136,262Z M1136,262L1140,300H1143L1139,262Z M1158,262L1154,300H1157L1160,262Z M1160,262L1164,300H1167L1163,262Z M1182,262L1178,300H1181L1184,262Z M1184,262L1188,300H1191L1187,262Z M1206,262L1202,300H1205L1208,262Z M1208,262L1212,300H1215L1211,262Z M1230,262L1226,300H1229L1232,262Z M1232,262L1236,300H1239L1235,262Z M1254,262L1250,300H1253L1256,262Z M1256,262L1260,300H1263L1259,262Z M1278,262L1274,300H1277L1280,262Z M1280,262L1284,300H1287L1283,262Z", c: "#7a5a3c" },
      { d: "M1108,276L1132,290V293L1108,279Z M1132,276L1156,290V293L1132,279Z M1156,276L1180,290V293L1156,279Z M1180,276L1204,290V293L1180,279Z M1204,276L1228,290V293L1204,279Z M1228,276L1252,290V293L1228,279Z M1252,276L1276,290V293L1252,279Z M1276,276L1300,290V293L1276,279Z", c: "#7a5a3c" },
      { d: "M1104,258H1306V264H1104Z", c: "#6a4a30" },
    ],
  },
  "queen-charlotte-track": {
    view: "The Marlborough Sounds from the ridge: drowned valleys as ridge behind bush-clad ridge, fading blue into the distance, the sound's calm water between, and a water taxi with its wake",
    ridge: "#4f6a3a",
    ground: "#7f9a54",
    shapes: [
      // ridges far out in the sounds, fading blue
      { d: hills([[0, G], [140, 236], [360, 224], [560, 240], [760, 226], [980, 238], [1200, 222], [1420, 236], [1600, 230], [1600, G]]), c: "#a4b0bc" },
      { d: hills([[200, G], [400, 250], [620, 240], [820, 256], [1000, G]]), c: "#7f948a" },
      { d: hills([[900, G], [1080, 252], [1280, 242], [1460, 258], [1600, 254], [1600, G]]), c: "#7f948a" },
      // the sound's calm water
      { d: water(0, 1600, 286), c: SEA },
      // the near bush-clad ridges where the track runs
      { d: hills([[0, G], [120, 262], [300, 252], [460, 270], [560, G]]), c: "#3f5a34" },
      { d: hills([[1160, G], [1300, 266], [1460, 256], [1600, 262], [1600, G]]), c: "#3f5a34" },
    ],
    front: [
      // a water taxi and its wake
      { d: "M820,298H862L856,304H826Z M834,298V292H850V298Z", c: "#f0ece0" },
      { d: "M760,302H818V303.5H760Z M720,304H790V305H720Z", c: "#d8e6ee" },
    ],
  },
  "st-oswalds-way": {
    view: "The Northumberland coast: Bamburgh Castle long on its crag above the dunes, Lindisfarne Castle on its rock across the water, and the Farne Islands low on the sea",
    ridge: "#7f9a54",
    ground: "#d8c89a",
    shapes: [
      // the North Sea
      { d: water(0, 1600, 282), c: SEA },
      // the Farne Islands, low and dark on the sea
      { d: hills([[120, 284], [160, 276], [220, 274], [260, 284]]), c: "#5a5a52" },
      { d: hills([[300, 284], [330, 279], [370, 284]]), c: "#5a5a52" },
      // Lindisfarne Castle on its rock, far across the water
      { d: range([[480, G], [520, 280], [540, 262], [580, 258], [600, 270], [640, 282], [680, G]]), c: "#6a6a5a" },
      { d: "M546,262V248H580V262Z M552,248V240H566V248Z", c: "#b8ab92" },
      // Bamburgh Castle, long on its whinstone crag above the dunes
      { d: range([[880, G], [940, 270], [1000, 250], [1240, 246], [1320, 262], [1400, 286], [1460, G]]), c: "#4a4a44" },
      { d: "M1010,250V230H1040V222H1070V230H1150V236H1190V226H1214V246H1010Z", c: "#c9a77a" },
      { d: "M1050,222V206H1062V222Z", c: "#c9a77a" },
      // the dunes and the long beach below the castle
      { d: hills([[700, G], [820, 290], [1000, 286], [1200, 292], [1400, 296], [1600, 292], [1600, G]]), c: "#d8c89a" },
    ],
  },
  "wye-valley-walk": {
    view: "The lower Wye Valley: wooded limestone gorge sides, the river in its loop below, and Tintern Abbey's roofless Gothic gable with its great empty window by the water",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      // the mid-Wales hills, far upstream
      { d: hills([[0, G], [200, 230], [460, 216], [720, 232], [980, 220], [1240, 236], [1600, 226], [1600, G]]), c: "#a4aab0" },
      // the wooded gorge sides, with a limestone crag (Symonds Yat, the Wyndcliff)
      { d: range([[0, G], [100, 240], [260, 226], [380, 232], [500, 262], [600, G]]), c: "#3f5a34" },
      { d: "M300,228L318,226L326,244L306,248Z", c: "#c9c2b0" },
      { d: range([[1000, G], [1120, 254], [1260, 232], [1420, 226], [1600, 236], [1600, G]]), c: "#3f5a34" },
      // Tintern Abbey: the west gable, roofless, with its tall pointed window open to the sky
      { d: "M720,300V240L760,206L800,240V300H772V236A12,16 0 0 0 748,236V300Z", c: "#b8a48a" },
    ],
    front: [
      // the Wye in its loop
      { d: water(500, 1100, 300), c: LAKE },
    ],
  },
  "two-moors-way": {
    view: "Dartmoor's open moorland under a granite tor, a clapper bridge of stone slabs over a moor stream, and Exmoor's rounded hills beyond",
    ridge: "#8a7a5a",
    ground: "#9a8a5a",
    shapes: [
      // Exmoor's rounded hills, far to the north
      { d: hills([[0, G], [220, 238], [520, 228], [820, 240], [1120, 226], [1400, 238], [1600, 232], [1600, G]]), c: "#a4a8a0" },
      // the moor, tawny with bracken and heather
      { d: hills([[0, G], [160, 262], [420, 250], [700, 258], [980, 246], [1240, 262], [1600, 254], [1600, G]]), c: "#9a8455" },
      // a granite tor: stacked blocks on the moor's top
      { d: "M900,248L904,232L912,230L914,222L926,220L930,212L944,212L946,222L958,224L960,234L968,236L972,248Z", c: "#7a766c" },
      // a clapper bridge over the moor stream: granite slabs on stone piers
      { d: "M300,296H460V300H300Z", c: "#7a766c" },
      { d: "M312,300V312H328V300Z M372,300V312H388V300Z M432,300V312H448V300Z", c: "#6a665e" },
    ],
    front: [
      { d: water(260, 520, 314), c: LAKE },
    ],
  },
  "fife-pilgrim-way": {
    view: "Fife's farmland under the twin Lomond Hills, and the pilgrims' goal: St Andrews Cathedral's ruined east gable with its two slender turrets beside St Rule's square tower",
    ridge: "#7f9a54",
    ground: MEADOW,
    shapes: [
      // the Lomond Hills, East and West Lomond, far to the west
      { d: hills([[0, G], [140, 236], [240, 214], [320, 232], [420, 206], [520, 236], [700, 262], [820, G]]), c: "#9aa4a8" },
      // the farmland, rolling
      { d: hills([[0, G], [200, 272], [520, 264], [860, 276], [1200, 266], [1600, 274], [1600, G]]), c: "#a8b878" },
      // St Rule's Tower, tall and square
      { d: "M1160,300V200H1186V300Z", c: "#b8a48a" },
      // the cathedral's east gable: two turrets with a pointed gable between, a tall window opening
      { d: "M1240,300V214H1250V196L1254,188L1258,196V214H1310V196L1314,188L1318,196V214H1328V300H1296V262A12,18 0 0 0 1272,262V300Z M1250,214L1284,184L1318,214Z", c: "#b8a48a" },
    ],
  },
  camoenoen: {
    view: "Møns Klint: white chalk cliffs falling sheer into the turquoise Baltic under a beech forest, and Nyord's low meadows with their small church across the water",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      // the Baltic, turquoise below the chalk
      { d: water(0, 1600, 282), c: "#5fa8b0" },
      // Nyord's low meadows and church, far across the water
      { d: hills([[80, 284], [200, 276], [400, 274], [520, 284]]), c: "#a8b878" },
      { d: "M300,276V266H318V276Z M302,266L309,258L316,266Z", c: "#f0ece0" },
      // Møns Klint: the white chalk cliff, ribbed, under the beech forest
      { d: range([[760, G], [820, 250], [900, 214], [1100, 206], [1300, 212], [1460, 222], [1600, 226], [1600, G]]), c: "#f2f0e8" },
      { d: "M890,216C930,198 1000,190 1080,190C1180,188 1300,194 1400,204C1450,208 1490,214 1510,220C1400,214 1300,212 1100,208C1000,208 930,212 890,216Z", c: "#3f5a34" },
      { d: "M960,230L966,280H970L964,230Z M1060,224L1068,284H1072L1064,224Z M1180,222L1186,284H1190L1184,222Z M1300,226L1306,282H1310L1304,226Z", c: "#d8d4c8" },
    ],
  },
  escapardenne: {
    view: "The Ardennes' forested slate valleys: Bourscheid's castle ruins on their spur above the Sûre's loop, and Clervaux's white castle with the abbey's towers in the valley beyond",
    ridge: "#3f5a34",
    ground: MEADOW,
    shapes: [
      // the plateaus of the Éislek, far and level
      { d: hills([[0, G], [240, 226], [620, 218], [1000, 224], [1380, 216], [1600, 222], [1600, G]]), c: "#9aa4a0" },
      // the forested valley sides
      { d: hills([[0, G], [140, 250], [320, 236], [460, 248], [560, 280], [640, G]]), c: "#3f5a34" },
      { d: hills([[1020, G], [1120, 264], [1260, 240], [1420, 236], [1600, 246], [1600, G]]), c: "#3f5a34" },
      // Bourscheid: the castle ruins on their spur
      { d: range([[620, G], [700, 270], [780, 246], [860, 250], [940, 278], [1000, G]]), c: "#5a6a48" },
      { d: "M748,248V226H758V232H776V222H788V248Z M800,250V236H816V250Z", c: "#a89a86" },
      // Clervaux: the white castle and a church's twin towers
      { d: "M1180,244V226H1240V244Z M1186,226V214H1198V226Z", c: "#f0ece0" },
      { d: "M1300,240V206L1306,196L1312,206V240Z M1320,240V206L1326,196L1332,206V240Z M1296,240V222H1336V240Z", c: "#d8cbb0" },
    ],
    front: [
      // the Sûre in its loop
      { d: water(500, 1100, 302), c: LAKE },
    ],
  },
  albsteig: {
    view: "The Swabian Jura's escarpment, the Albtrauf: a long wooded edge with white limestone cliffs, and Burg Hohenzollern on its conical hill in front of it",
    ridge: "#3f5a34",
    ground: MEADOW,
    shapes: [
      // the Albtrauf: a long, level-topped wooded escarpment
      { d: range([[0, G], [100, 220], [400, 210], [760, 206], [1100, 212], [1420, 208], [1600, 214], [1600, G]]), c: "#4f6a3a" },
      // white limestone cliffs along its edge
      { d: "M280,214L300,212L306,236L284,240Z M640,208L668,207L672,232L644,234Z M1180,212L1206,211L1210,238L1184,238Z", c: "#e8e4d8" },
      // the foreland's fields
      { d: hills([[0, G], [260, 276], [620, 270], [980, 280], [1300, 272], [1600, 278], [1600, G]]), c: "#a8b878" },
      // the Hohenzollern: a wooded cone with the castle's towers on top
      { d: hills([[680, G], [780, 252], [840, 222], [880, 214], [920, 222], [980, 252], [1080, G]]), c: "#3f5a34" },
      { d: "M846,216V196H858V190H866V196H892V188H900V196H914V216Z M868,190V176L872,170L876,176V190Z", c: "#a89a86" },
    ],
  },
  "altmuehltal-panoramaweg": {
    view: "The Altmühl valley: the river below wooded slopes, the white limestone towers of the Twelve Apostles at Solnhofen, juniper on the dry heath, and Prunn Castle high on its cliff",
    ridge: "#5d7a3a",
    ground: MEADOW,
    shapes: [
      // the valley's far rims, level
      { d: hills([[0, G], [260, 230], [640, 222], [1000, 228], [1360, 220], [1600, 226], [1600, G]]), c: "#9aa4a0" },
      // the wooded slope with Prunn Castle on its limestone cliff
      { d: range([[0, G], [100, 238], [260, 222], [380, 226], [460, 250], [560, G]]), c: "#4f6a3a" },
      { d: "M300,226L318,224L326,262L304,266Z", c: "#e8e4d8" },
      { d: "M296,224V206H314V198H322V206H336V224Z M314,198V188L318,182L322,188V198Z", c: "#c9b8a0" },
      // the Twelve Apostles: slender white limestone towers
      { d: pillars([[680, 250], [704, 236], [728, 252], [752, 240], [776, 256]], 14), c: "#ece8dc" },
      // the dry heath with junipers
      { d: hills([[1060, G], [1160, 270], [1300, 260], [1440, 268], [1600, 264], [1600, G]]), c: "#b8b080" },
      { d: "M1174,320C1174,294.0 1178,276 1180,268C1182,276 1186,294.0 1186,320Z M1194,320C1194,298.0 1198,284 1200,276C1202,284 1206,298.0 1206,320Z M1230,320C1230,293.0 1234,274 1236,266C1238,274 1242,293.0 1242,320Z M1294,320C1294,296.0 1298,280 1300,272C1302,280 1306,296.0 1306,320Z M1324,320C1324,292.0 1328,272 1330,264C1332,272 1336,292.0 1336,320Z", c: "#2f4a34" },
    ],
    front: [
      // the Altmühl
      { d: water(440, 1120, 302), c: LAKE },
    ],
  },
  kammweg: {
    view: "The Ore Mountains' long ridge: the Fichtelberg with its summit tower, spruce forest along the crest, and Seiffen's round baroque church with its lantern dome below",
    ridge: "#3f5a34",
    ground: MEADOW,
    shapes: [
      // the ridge and the Fichtelberg's broad summit
      { d: hills([[0, G], [220, 236], [480, 226], [700, 206], [860, 200], [1020, 212], [1300, 230], [1600, 228], [1600, G]]), c: "#7f948a" },
      { d: "M846,202V180H856V172H868V180H876V202Z M858,172V160H866V172Z", c: "#d8d4c8" },
      // the forested slopes in front
      { d: hills([[0, G], [160, 266], [420, 258], [640, 270], [760, G]]), c: "#3f5a34" },
      { d: hills([[1100, G], [1240, 264], [1440, 256], [1600, 262], [1600, G]]), c: "#3f5a34" },
      { d: "M113,300L115.8,287.0L113,287.0L120,262L127,287.0L124.2,287.0L127,300Z M139,300L141.8,291.0L139,291.0L146,270L153,291.0L150.2,291.0L153,300Z M165,300L167.8,285.0L165,285.0L172,258L179,285.0L176.2,285.0L179,300Z M1273,300L1275.8,288.0L1273,288.0L1280,264L1287,288.0L1284.2,288.0L1287,300Z M1299,300L1301.8,284.0L1299,284.0L1306,256L1313,284.0L1310.2,284.0L1313,300Z M1327,300L1329.8,290.0L1327,290.0L1334,268L1341,290.0L1338.2,290.0L1341,300Z M1355,300L1357.8,286.0L1355,286.0L1362,260L1369,286.0L1366.2,286.0L1369,300Z", c: "#2f4a34" },
      // Seiffen church: a round nave, its roof and lantern
      { d: hills([[860, G], [940, 282], [1060, 280], [1140, G]]), c: "#8fa868" },
      { d: "M968,284V260A32,8 0 0 1 1032,260V284Z", c: "#f0ece0" },
      { d: "M966,262Q1000,232 1034,262Z M994,244V230H1006V244Z M992,230Q1000,218 1008,230Z", c: "#5a6a7a" },
    ],
  },
  "arran-coastal-way": {
    view: "The Isle of Arran from the sea: Goat Fell and the jagged granite ridges of the north, Lochranza Castle on its spit in the bay, and Holy Isle's dome off Lamlash",
    ridge: "#7f9a54",
    ground: "#c9b88a",
    shapes: [
      // the northern granite peaks, Goat Fell the highest, with their jagged ridges
      { d: range([[60, G], [160, 250], [260, 196], [330, 170], [372, 150], [400, 136], [420, 128], [446, 146], [480, 160], [520, 150], [548, 162], [590, 158], [620, 176], [680, 168], [720, 186], [800, 214], [900, 248], [980, G]]), c: "#7a7e82" },
      // the Firth of Clyde all along the shore
      { d: water(0, 1600, 282), c: SEA },
      // Lochranza Castle on its spit
      { d: range([[620, G], [660, 284], [760, 282], [800, G]]), c: "#a8b878" },
      { d: castle(710, 284, 0.6), c: "#8a7a6a" },
      // Holy Isle off Lamlash: a steep green dome in the sea
      { d: hills([[1220, G], [1300, 252], [1380, 236], [1460, 252], [1540, G]]), c: "#5f7a4a" },
      // the green southern shore with the coast path
      { d: hills([[0, G], [140, 288], [420, 286], [560, G]]), c: "#8fa868" },
      { d: hills([[880, G], [980, 286], [1120, 284], [1220, G]]), c: "#8fa868" },
    ],
  },
  "cateran-trail": {
    view: "Glenshee's rounded hills over heather moor, a birch wood in the glen, and a Cateran waymark post",
    ridge: "#7f8a50",
    ground: "#8a9a5a",
    shapes: [
      // the Glenshee hills, far and rounded
      { d: hills([[160, G], [300, 214], [460, 168], [600, 186], [760, 150], [900, 174], [1060, 158], [1220, 196], [1400, 220], [1560, G]]), c: "#9aa0a8" },
      // heather moor, purple-brown, in front of them
      { d: hills([[0, G], [160, 256], [400, 226], [640, 244], [900, 218], [1160, 240], [1400, 230], [1600, 250], [1600, G]]), c: "#8a6a7a" },
      // a birch wood down in the glen
      { d: hills([[600, G], [700, 262], [820, 252], [940, 264], [1010, G]]), c: "#3f5a34" },
      // a Cateran waymark post with its red heart in a green ring
      { d: "M1300,300V258H1310V300Z", c: "#7a5a3c" },
      { d: "M1305,262m-9,0a9,9 0 1 0 18,0a9,9 0 1 0 -18,0", c: "#3f7a3a" },
      { d: "M1305,262m-6.5,0a6.5,6.5 0 1 0 13,0a6.5,6.5 0 1 0 -13,0", c: "#f4f1ea" },
      { d: "M1305,266L1301,261.5A2.3,2.3 0 0 1 1305,259A2.3,2.3 0 0 1 1309,261.5Z", c: "#c0392b" },
    ],
  },
  "fife-coastal-path": {
    view: "The Firth of Forth with the red Forth Bridge, the East Neuk's fishing villages of red-roofed houses round a harbour, and St Andrews' ruined cathedral towers by the sea",
    ridge: "#8fa868",
    ground: "#9ab866",
    shapes: [
      // the Lomond Hills far inland
      { d: hills([[500, G], [640, 254], [760, 238], [860, 250], [980, 240], [1100, 258], [1200, G]]), c: "#a7b4a2" },
      // the Firth of Forth and the North Sea along the whole coast
      { d: water(0, 1600, 280), c: SEA },
      // the Forth Bridge: three red cantilevers, each a triangular frame over an arch, on their piers
      { d: "M74,274L140,234L206,274Z M88,272Q140,249.2 192,272L140,243Z M224,274L290,234L356,274Z M238,272Q290,249.2 342,272L290,243Z M374,274L440,234L506,274Z M388,272Q440,249.2 492,272L440,243Z M60,274H520V278H60Z M134,274V292H146V274Z M284,274V292H296V274Z M434,274V292H446V274Z", c: "#b0412e" },
      // the coast: fields and a low headland
      { d: hills([[480, G], [600, 286], [800, 278], [980, 286], [1080, G]]), c: "#8fa868" },
      // an East Neuk village: white houses with red pantile roofs round the harbour
      { d: "M700,290V276H716V290Z M720,290V272H738V290Z M742,290V278H756V290Z M760,290V274H776V290Z", c: "#f0ebe0" },
      { d: "M698,276L708,266L718,276Z M718,272L729,261L740,272Z M740,278L749,269L758,278Z M758,274L768,264L778,274Z", c: "#b65a3c" },
      // St Andrews: the ruined cathedral's two tall gable towers and St Rule's tower, on its headland
      { d: range([[1180, G], [1240, 280], [1420, 276], [1500, 282], [1560, G]]), c: "#8a8a6a" },
      { d: "M1300,280V232L1308,222L1316,232V280Z M1360,280V230L1368,220L1376,230V280Z M1400,280V238H1414V280Z M1316,280V262H1360V280Z", c: "#b8a48a" },
    ],
  },
  "st-cuthberts-way": {
    view: "From the Eildon Hills' three summits over Melrose Abbey's ruin and the Cheviot foothills to Lindisfarne Castle on its rock above the tidal sands",
    ridge: "#7f9a54",
    ground: "#8fa868",
    shapes: [
      // the Cheviot Hills far behind, rounded and heather-brown
      { d: hills([[380, G], [520, 252], [700, 232], [880, 240], [1040, 230], [1180, 252], [1280, G]]), c: "#a59a8a" },
      // the Eildon Hills: three rounded summits, the middle one highest
      { d: range([[0, G], [60, 268], [130, 218], [170, 196], [200, 206], [240, 186], [276, 170], [312, 186], [350, 204], [384, 194], [420, 206], [470, 238], [540, 270], [600, G]]), c: "#7a8a5a" },
      // Melrose Abbey: the roofless nave with its tall pointed east window, and a gable
      { d: "M560,296V262L572,244L584,262V296Z M596,296V258H660V296Z M666,296V236L682,214L698,236V296Z", c: "#a9785e" },
      { d: "M674,290V250L682,240L690,250V290Z", c: "#d8c8b0" },
      // the foothills and fields of the Borders
      { d: hills([[480, G], [640, 282], [860, 272], [1060, 282], [1200, G]]), c: "#8fa868" },
      // the tidal sands and the sea, the causeway's posts across them
      { d: water(1100, 1600, 286), c: "#c9c08e" },
      { d: water(1300, 1600, 280), c: SEA },
      { d: "M1150,290V280H1153V290Z M1190,290V281H1193V290Z M1230,290V282H1233V290Z M1270,290V283H1273V290Z", c: "#5f4a36" },
      // Lindisfarne Castle on Beblowe Crag
      { d: range([[1360, G], [1400, 270], [1440, 250], [1470, 246], [1510, 256], [1560, 278], [1600, G]]), c: "#6f6a5e" },
      { d: castle(1470, 248, 0.9), c: "#c8b89a" },
    ],
  },
  "peddars-way-and-norfolk-coast-path": {
    view: "North Norfolk's big sky: Thetford Forest's pines in the Brecks by the Roman road, Cley's brick windmill over the saltmarsh, sand dunes, and Happisburgh's striped lighthouse above the low cliffs by the North Sea",
    ridge: "#93a86a",
    ground: "#a3ad72",
    shapes: [
      // the low, wooded Cromer Ridge far behind the coast
      { d: hills([[380, G], [560, 266], [760, 258], [960, 266], [1100, G]]), c: "#a9b7a0" },
      // the North Sea along the right half
      { d: water(820, 1600, 282), c: SEA },
      // the Brecks: Thetford Forest's dark pine belt behind the heath by the Roman road
      { d: hills([[0, G], [90, 270], [260, 262], [420, 270], [520, G]]), c: "#3d5636" },
      { d: hills([[0, G], [140, 288], [320, 284], [470, 290], [560, G]]), c: "#9c9a62" },
      // the saltmarsh, with its creeks
      { d: hills([[480, G], [600, 286], [900, 284], [1080, 288], [1160, G]]), c: "#8f9c5c" },
      { d: "M640,292Q700,288 760,292Q820,296 880,292L884,295Q820,299 760,295Q700,291 644,295Z", c: "#6f9fc0" },
      // Cley windmill: a tapering brick tower, a white cap and four sails
      { d: "M590,286L596,226H616L622,286Z", c: "#8a5a3c" },
      { d: "M592,226A14,11 0 0 1 620,226Z", c: "#eeeae0" },
      { d: "M606,222L640,188L644,192L610,226Z M606,222L572,188L568,192L602,226Z M606,222L572,256L568,252L602,218Z M606,222L640,256L644,252L610,218Z", c: "#e4ded0" },
      // sand dunes along the shore
      { d: hills([[1040, G], [1120, 280], [1200, 276], [1300, 282], [1380, G]]), c: "#d9c48e" },
      // Happisburgh lighthouse: white, with three red bands, on the low cliff
      { d: range([[1380, G], [1420, 278], [1560, 276], [1600, 280], [1600, G]]), c: "#b89a6a" },
      { d: lighthouse(1490, 277, 64), c: "#f2f0ea" },
      { d: "M1485.1,262L1484.6,252H1495.4L1494.9,262Z M1484.1,242L1483.6,232H1496.4L1495.9,242Z M1483.1,222L1482.8,214H1497.2L1496.9,222Z M1485,213V207H1495V213Z", c: "#c0392b" },
    ],
  },
  "overland-track": {
    view: "Cradle Mountain: its jagged dolerite crown of columns over Dove Lake, buttongrass plains and a stand of pencil pines in front",
    ridge: "#8a8a5a",
    ground: "#a89a5a",
    shapes: [
      // the far ranges of the plateau
      { d: hills([[600, G], [800, 236], [1100, 226], [1400, 234], [1600, 228], [1600, G]]), c: "#8e9aa6" },
      // Cradle Mountain: a dark dolerite massif with a toothed, columned crown
      { d: range([[100, G], [180, 250], [260, 214], [300, 196], [320, 188], [336, 196], [352, 176], [372, 186], [392, 170], [414, 182], [440, 178], [470, 192], [520, 206], [600, 226], [700, 254], [780, G]]), c: "#5f6670" },
      { d: water(150, 900, 270), c: "#4f7a90" },
      // buttongrass plains in front, golden
      { d: hills([[0, G], [200, 280], [600, 272], [1000, 280], [1400, 274], [1600, 278], [1600, G]]), c: "#b8a46a" },
      // pencil pines: slender dark cones
      { d: "M1180,282L1190,238L1200,282Z M1206,282L1214,248L1222,282Z M1226,282L1238,232L1250,282Z", c: "#3d5a3a" },
    ],
  },
  "lake-waikaremoana": {
    view: "Lake Waikaremoana in Te Urewera: the sheer sandstone face of Panekire Bluff rising from the forest above the lake, and forested ridges folding away beyond the water",
    ridge: "#6f8a4a",
    ground: "#45663a",
    shapes: [
      // forested ridges beyond the lake
      { d: hills([[600, G], [760, 240], [980, 228], [1200, 238], [1400, 226], [1600, 236], [1600, G]]), c: "#7d9481" },
      // Panekire Bluff: a long range ending in a sheer bluff over the lake
      { d: range([[0, G], [60, 214], [300, 200], [520, 206], [600, 212], [640, 250], [680, G]]), c: "#a89a84" },
      { d: hills([[0, G], [100, 250], [360, 240], [600, 252], [700, G]]), c: FOREST },
      { d: water(560, 1600, 266), c: LAKE },
      // the near shore in forest
      { d: hills([[1100, G], [1260, 276], [1460, 268], [1600, 274], [1600, G]]), c: FOREST },
    ],
  },
  "rakiura-track": {
    view: "Stewart Island/Rakiura: Mount Anglem/Hananui over bush-covered hills, a sandy bay on Foveaux Strait, and a Rakiura tokoeka/kiwi on the beach",
    ridge: "#6f8a4a",
    ground: "#d9c49a",
    shapes: [
      // Mount Anglem/Hananui behind the bush
      { d: hills([[200, G], [420, 222], [560, 206], [700, 218], [900, 240], [1000, G]]), c: "#7d9481" },
      // the bush-covered hills of the island
      { d: hills([[0, G], [160, 248], [420, 236], [700, 246], [960, 238], [1180, 252], [1300, G]]), c: FOREST },
      { d: water(1100, 1600, 270), c: SEA },
      // the sandy bay in front
      { d: hills([[600, G], [800, 288], [1100, 284], [1400, 290], [1600, 288], [1600, G]]), c: "#e3cf9a" },
      // a kiwi: round body, long beak, short legs
      { d: "M1000,282C1000,270 1012,264 1024,266C1034,268 1040,274 1040,280C1040,284 1036,286 1028,286H1008C1002,286 1000,284 1000,282Z M1000,276L982,282L1000,279Z M1014,286V292H1016V286Z M1026,286V292H1028V286Z", c: "#6a5440" },
    ],
  },
  "paparoa-track": {
    view: "The Paparoa Range: the long tussock ridge of the tops above rainforest, and the white limestone bluffs of the Pororari gorge with nīkau below",
    ridge: "#8a9a5a",
    ground: "#45663a",
    shapes: [
      // the Paparoa Range: a long ridge of exposed tops
      { d: range([[0, G], [100, 236], [260, 208], [420, 198], [580, 206], [760, 194], [920, 212], [1080, 230], [1200, G]]), c: "#9aa69a" },
      { d: hills([[0, G], [140, 236], [400, 222], [700, 230], [980, 220], [1140, 240], [1240, G]]), c: "#b8a46a" },
      // rainforest below the tops
      { d: hills([[0, G], [200, 262], [520, 250], [860, 262], [1200, 248], [1600, 258], [1600, G]]), c: FOREST },
      // the limestone bluffs of the Pororari gorge
      { d: range([[1180, G], [1190, 240], [1230, 232], [1260, 236], [1270, G]]), c: "#d6d0c2" },
      { d: range([[1380, G], [1390, 236], [1440, 228], [1480, 234], [1490, G]]), c: "#d6d0c2" },
    ],
  },
  "abel-tasman-coast-track": {
    view: "The Abel Tasman coast: forested granite headlands between golden beaches, and Split Apple Rock in the turquoise bay",
    ridge: "#6f8a4a",
    ground: "#d9c49a",
    shapes: [
      // the bush-clad hills behind the coast
      { d: hills([[0, G], [200, 236], [460, 224], [740, 238], [1000, 226], [1260, 240], [1600, 230], [1600, G]]), c: "#5f7a44" },
      { d: water(0, 1600, 268), c: "#5fa8b8" },
      // two forested headlands reaching into the bay
      { d: hills([[0, G], [60, 262], [240, 248], [380, 262], [440, G]]), c: FOREST },
      { d: hills([[1180, G], [1260, 258], [1440, 246], [1560, 260], [1600, G]]), c: FOREST },
      // Split Apple Rock: a round granite boulder cleft in two
      { d: "M800,282C800,262 812,254 822,254L824,282Z M828,282L830,254C840,254 852,262 852,282Z", c: "#c9b48a" },
      // the golden beach in front
      { d: hills([[300, G], [460, 290], [800, 286], [1120, 290], [1260, G]]), c: "#e3cf9a" },
    ],
  },
  "heaphy-track": {
    view: "The Heaphy Track: golden tussock downs above the beech forest, and nīkau palms on the West Coast where the Tasman Sea breaks on the beach",
    ridge: "#8a9a5a",
    ground: "#45663a",
    shapes: [
      // the Gouland Downs: rolling tussock above the forest
      { d: hills([[0, G], [160, 228], [400, 214], [640, 226], [860, 218], [1000, 238], [1080, G]]), c: "#b8a46a" },
      { d: hills([[0, G], [140, 258], [420, 246], [700, 256], [960, 250], [1060, G]]), c: FOREST },
      // the Tasman Sea
      { d: water(980, 1600, 262), c: SEA },
      // the beach, and nīkau palms on it: slender trunks with a crown of fronds
      { d: hills([[1100, G], [1180, 288], [1400, 284], [1600, 288], [1600, G]]), c: "#d9c49a" },
      { d: "M1210,292L1214,236H1218L1222,292Z M1330,290L1333,244H1337L1340,290Z M1450,292L1453,232H1457L1460,292Z", c: "#6a5a44" },
      { d: "M1216,238C1196,230 1186,226 1176,230C1194,224 1206,222 1216,230C1222,214 1232,208 1246,206C1236,216 1228,224 1218,236C1236,228 1250,230 1258,236C1244,236 1230,236 1216,238Z", c: "#4f6a3a" },
      { d: "M1335,246C1317,240 1308,236 1298,240C1314,234 1326,232 1335,240C1340,226 1350,220 1362,218C1354,228 1346,234 1337,244C1353,238 1366,240 1374,246C1360,246 1348,246 1335,246Z", c: "#4f6a3a" },
      { d: "M1455,234C1435,226 1425,222 1415,226C1433,220 1445,218 1455,226C1461,210 1471,204 1485,202C1475,212 1467,220 1457,232C1475,224 1489,226 1497,232C1483,232 1469,232 1455,234Z", c: "#4f6a3a" },
    ],
  },
  "routeburn-track": {
    view: "From the Hollyford Face on the Routeburn Track: the jagged, snow-streaked Darran Mountains across the valley, and Lake Mackenzie below in its basin of beech forest and tussock",
    ridge: "#8a9a5a",
    ground: "#45663a",
    shapes: [
      // the Darran Mountains: steep, jagged peaks with snow in their gullies
      { d: range([[0, G], [80, 230], [180, 176], [240, 192], [320, 150], [400, 184], [480, 160], [560, 196], [660, 174], [760, 212], [860, 236], [940, G]]), c: ROCK },
      { d: snowOf([[0, G], [80, 230], [180, 176], [240, 192], [320, 150], [400, 184], [480, 160], [560, 196], [660, 174], [760, 212], [860, 236], [940, G]], 182), c: SNOW },
      // tussock slopes of the near side
      { d: hills([[700, G], [860, 236], [1060, 214], [1260, 226], [1460, 216], [1600, 224], [1600, G]]), c: "#b8a46a" },
      // Lake Mackenzie in beech forest
      { d: hills([[0, G], [200, 268], [520, 258], [860, 266], [1200, 254], [1600, 262], [1600, G]]), c: FOREST },
      { d: water(980, 1260, 272), c: LAKE },
    ],
  },
  "kepler-track": {
    view: "Fiordland on the Kepler Track: the tussock ridge rising to Mount Luxmore above the beech forest, with snow on the far Murchison Mountains, and Lake Te Anau below",
    ridge: "#8a9a5a",
    ground: "#45663a",
    shapes: [
      // the far Murchison Mountains, snow on their tops
      { d: range([[0, G], [120, 214], [260, 196], [380, 208], [520, 188], [660, 204], [780, 226], [860, G]]), c: "#8e9aa6" },
      { d: snowOf([[0, G], [120, 214], [260, 196], [380, 208], [520, 188], [660, 204], [780, 226], [860, G]], 206), c: SNOW },
      { d: water(0, 1000, 262), c: LAKE },
      // the tussock ridge to Mount Luxmore, golden above the bushline
      { d: range([[700, G], [820, 230], [980, 196], [1080, 178], [1160, 186], [1300, 206], [1460, 220], [1600, 230], [1600, G]]), c: "#b8a46a" },
      // beech forest below the bushline
      { d: hills([[620, G], [760, 262], [960, 244], [1200, 250], [1420, 244], [1600, 252], [1600, G]]), c: FOREST },
    ],
  },
  "north-downs-way": {
    view: "The North Downs: the wooded chalk scarp with the pilgrims' chapel of St Martha's on its hill, and the White Cliffs of Dover over the sea at the end",
    ridge: MEADOW,
    ground: "#8fb05a",
    shapes: [
      // the long scarp of the Downs, wooded along its brow
      { d: hills([[0, G], [160, 244], [420, 232], [700, 240], [960, 230], [1100, 250], [1180, G]]), c: "#7f9a54" },
      // St Martha's on its hill: a small church with a squat tower
      { d: "M330,236V224H352V216H362V224H372V236Z", c: "#c9b48a" },
      { d: water(1060, 1600, 268), c: SEA },
      // the White Cliffs: a white chalk wall with green turf on top
      { d: range([[1140, G], [1152, 236], [1260, 228], [1400, 232], [1520, 224], [1600, 226], [1600, G]]), c: "#ece8dc" },
      // the near down in front
      { d: hills([[0, G], [200, 268], [480, 256], [760, 270], [900, G]]), c: "#9ab866" },
    ],
  },
  "thames-path": {
    view: "The Thames at Oxford: the dreaming spires and the Radcliffe Camera's dome beyond the water meadows, the river in front with a willow on its bank",
    ridge: MEADOW,
    ground: "#8fb05a",
    shapes: [
      // the low hills round the city
      { d: hills([[0, G], [240, 254], [560, 246], [900, 252], [1240, 244], [1600, 250], [1600, G]]), c: "#a7b98a" },
      // Oxford: college roofs, spires and the Radcliffe Camera's dome
      { d: "M560,268V256H600V250H660V258H720V252H780V262H820V268Z", c: "#c9b48a" },
      { d: "M604,250L612,206L620,250Z", c: "#b8a27a" },
      { d: "M690,258L697,222L704,258Z", c: "#b8a27a" },
      { d: dome(650, 250, 18), c: "#a89270" },
      { d: "M648,232H652V226H648Z", c: "#a89270" },
      // the river in front, and a willow on the near bank
      { d: water(0, 1600, 286), c: LAKE },
      { d: dome(1180, 282, 30), c: "#7f9a54" },
      { d: "M1176,282H1184V292H1176Z", c: "#6a5a44" },
    ],
  },
  "the-ridgeway": {
    view: "The open Berkshire Downs on The Ridgeway: Whitehorse Hill with the Uffington White Horse cut into its chalk, and a clump of beeches by the old track",
    ridge: MEADOW,
    ground: "#9ab866",
    shapes: [
      // the far downs
      { d: hills([[0, G], [220, 250], [520, 240], [820, 252], [1120, 236], [1400, 248], [1600, 242], [1600, G]]), c: "#a7b98a" },
      // Whitehorse Hill, its steep scarp to the left
      { d: hills([[380, G], [470, 262], [600, 226], [780, 220], [940, 236], [1080, G]]), c: "#8fa868" },
      // the White Horse: a slender galloping figure of chalk lines on the scarp
      { d: "M520,252C540,246 566,244 590,246C604,247 612,242 622,236L628,238C620,246 612,252 598,254C578,256 552,256 536,258L540,266L534,266L530,258L522,266L516,266Z", c: "#f4f1ea" },
      // a clump of beeches on the near down
      { d: dome(1250, 262, 26), c: "#4f6a3a" },
      { d: dome(1290, 262, 20), c: "#5f7a44" },
      // the near down in front
      { d: hills([[1000, G], [1120, 270], [1300, 262], [1480, 268], [1600, 264], [1600, G]]), c: "#7f9a54" },
    ],
  },
  "south-downs-way": {
    view: "The bare, rolling chalk downs of the South Downs, ending in the white cliffs of the Seven Sisters over the sea",
    ridge: MEADOW,
    ground: "#8fb05a",
    shapes: [
      // the far downs, smooth and treeless
      { d: hills([[0, G], [200, 252], [450, 238], [700, 248], [930, 234], [1100, 252], [1220, G]]), c: "#a7b98a" },
      { d: water(980, 1600, 264), c: SEA },
      // the Seven Sisters: a white chalk wall over the sea, its top rising and dipping seven times
      { d: range([[1060, G], [1072, 238], [1110, 230], [1150, 240], [1190, 228], [1230, 238], [1270, 226], [1310, 236], [1350, 224], [1390, 234], [1430, 222], [1470, 232], [1510, 220], [1600, 214], [1600, G]]), c: "#ece8dc" },
      // the near down in front
      { d: hills([[0, G], [140, 266], [380, 250], [620, 268], [780, G]]), c: "#7f9a54" },
    ],
  },
  "south-west-coast-path": {
    view: "St Michael's Mount in Mount's Bay: the tidal island with its castle above the woods, the Cornish cliffs of the far shore, and the beach at Marazion in front",
    ridge: "#4f6a3a",
    ground: "#6f9a4a",
    shapes: [
      // the far shore of Mount's Bay
      { d: hills([[700, G], [900, 246], [1200, 238], [1450, 244], [1600, 240], [1600, G]]), c: "#9aa6a0" },
      { d: water(0, 1600, 258), c: SEA },
      // St Michael's Mount: a rocky island, wooded below, with its castle on top
      { d: hills([[470, G], [530, 246], [600, 208], [660, 200], [730, 230], [800, G]]), c: "#8a8070" },
      { d: hills([[480, G], [540, 262], [620, 244], [720, 250], [790, G]]), c: "#6f8a5a" },
      { d: castle(640, 206, 0.8), c: "#cbbd9f" },
      { d: castleRoofs(640, 206, 0.8), c: "#8a7a6a" },
      // the cliffs on the near shore, green fields on top
      { d: range([[1040, G], [1060, 232], [1200, 222], [1400, 228], [1600, 220], [1600, G]]), c: "#8a6f5a" },
      { d: range([[1080, G], [1090, 228], [1200, 226], [1400, 232], [1600, 224], [1600, G]]), c: "#7f9a4a" },
      // the beach at Marazion
      { d: range([[0, G], [0, 282], [500, 280], [900, 286], [1600, 284], [1600, G]]), c: "#d8c49a" },
    ],
  },
  "pfaelzer-weinsteig": {
    view: "The Haardt edge of the Palatinate Forest: the wooded ridge up to the Kalmit with its stone tower, the Trifels on its sandstone rock, the Hambacher Schloss on its hill and vineyards below",
    ridge: "#4f6a33",
    ground: "#8a9a4a",
    shapes: [
      // the Haardt: one long wooded ridge, highest at the Kalmit
      { d: hills([[0, G], [120, 238], [320, 222], [520, 200], [640, 190], [760, 202], [960, 222], [1160, 214], [1360, 230], [1600, 236], [1600, G]]), c: FAR },
      { d: tower(640, 192, 16, 8), c: "#b08a6a" },
      // the Trifels on its red sandstone rock above Annweiler
      { d: range([[1160, G], [1200, 250], [1226, 222], [1236, 214], [1282, 214], [1294, 226], [1330, 256], [1380, G]]), c: FOREST },
      { d: range([[1222, 232], [1230, 214], [1288, 214], [1296, 232]]), c: "#b0644a" },
      { d: castle(1259, 214, 0.75), c: "#c79a7a" },
      { d: castleRoofs(1259, 214, 0.75), c: "#6a4a3e" },
      // the Hambacher Schloss on its wooded hill
      { d: hills([[230, G], [300, 240], [385, 216], [470, 232], [540, 262], [600, G]]), c: FOREST },
      { d: "M352,236V218H418V236Z M362,218V204H374V218Z M396,218V206H408V218Z", c: "#e3d6bc" },
      { d: "M350,218L385,208L420,218Z M360,204L368,196L376,204Z M394,206L402,198L410,206Z", c: "#a05a44" },
      // the vineyard slopes along the Wine Route
      { d: hills([[0, G], [160, 270], [420, 262], [700, 268], [980, 258], [1240, 266], [1460, 262], [1600, 270], [1600, G]]), c: "#9cb35a" },
      { d: orchard(170, 1540, [276, 288, 300], 18, 3), c: "#6f8a34" },
    ],
  },
  "wildnis-trail": {
    view: "The Eifel National Park: rolling wooded hills, the Urft dam holding back its lake, Vogelsang's tower on the Dreiborn plateau, the beech woods of the Kermeter and a meadow of wild narcissi",
    ridge: "#3f5a33",
    ground: "#6f8a4a",
    shapes: [
      { d: hills([[0, G], [140, 246], [360, 232], [560, 242], [780, 226], [1000, 240], [1220, 228], [1420, 244], [1600, 238], [1600, G]]), c: FAR },
      // the Dreiborn plateau with Vogelsang's square tower
      { d: hills([[880, G], [940, 252], [1080, 240], [1240, 244], [1340, 262], [1400, G]]), c: "#9aa86a" },
      { d: "M1104,242V206H1120V242Z M1086,242V228H1138V242Z", c: "#c9c0aa" },
      // the Kermeter's beech woods
      { d: hills([[0, G], [60, 258], [200, 244], [340, 252], [470, 262], [520, G]]), c: FOREST },
      // the lake and the Urft dam's curved wall between its wooded slopes
      { d: range([[400, G], [440, 262], [500, 248], [540, 252], [566, 266], [580, G]]), c: FIR },
      { d: range([[620, G], [636, 266], [700, 248], [780, 240], [860, 256], [920, G]]), c: FIR },
      { d: "M560,268Q600,258 640,268V276H560Z", c: "#c9c3b2" },
      { d: water(380, 960, 276), c: LAKE },
      // a meadow of wild narcissi
      { d: hills([[1300, G], [1360, 276], [1480, 270], [1600, 278], [1600, G]]), c: "#8fb05a" },
      { d: orchard(1380, 1550, [284, 294], 14, 2.5), c: "#f2d24a" },
    ],
  },
  "alta-via-1": {
    view: "The Dolomites from the Cinque Torri: the five pale towers in front of the Tofane, the broad block of the Pelmo and the Civetta's wall to the south",
    ridge: "#6f8a4a",
    ground: MEADOW,
    shapes: [
      // the Tofane behind, to the north
      { d: range([[0, G], [60, 262], [140, 212], [210, 172], [262, 142], [300, 128], [330, 138], [372, 120], [418, 132], [470, 162], [540, 192], [620, 216], [700, 240], [780, G]]), c: "#b7b9b6" },
      // the Civetta's long wall, far to the south
      { d: range([[1220, G], [1290, 248], [1350, 196], [1400, 166], [1432, 152], [1462, 162], [1500, 178], [1550, 210], [1600, 232], [1600, G]]), c: "#b3b1a8" },
      // the Pelmo: a broad pale block with two tops and the saddle between them
      { d: range([[800, G], [860, 262], [912, 206], [952, 158], [984, 118], [1006, 102], [1036, 110], [1066, 128], [1096, 106], [1122, 98], [1150, 112], [1190, 152], [1240, 204], [1292, 254], [1340, G]]), c: "#cdc6b6" },
      // its shaded north face
      { d: "M1006,102L984,118L952,158L930,190L968,196L1000,150L1018,118Z", c: "#b8b09e" },
    ],
    // the Cinque Torri: five slim pale towers on the pasture, in front of the trail's own ridge
    front: [{ d: pillars([[520, 226], [548, 198], [574, 238], [600, 214], [628, 250]], 18), c: "#d8d0bf" }],
  },
  "carros-de-foc": {
    view: "The twin granite towers of Els Encantats above the Estany de Sant Maurici, in the heart of the Aigüestortes national park",
    ridge: "#5f7a46",
    ground: MEADOW,
    shapes: [
      // the far grey granite ranges round the lakes
      { d: range([[0, G], [80, 252], [170, 210], [250, 186], [320, 198], [392, 172], [462, 188], [550, 204], [630, 228], [710, G]]), c: "#a8b1b8" },
      { d: range([[980, G], [1060, 242], [1140, 204], [1220, 184], [1300, 198], [1380, 176], [1460, 198], [1540, 228], [1600, 246], [1600, G]]), c: "#a8b1b8" },
      // Els Encantats: two sharp granite towers with a notch between them
      { d: range([[640, G], [702, 250], [748, 190], [774, 134], [788, 98], [802, 122], [818, 152], [836, 126], [850, 92], [866, 116], [890, 178], [932, 240], [990, G]]), c: "#8f979e" },
      // mountain pines on the lower slopes
      { d: hills([[560, G], [640, 290], [740, 276], [840, 284], [940, 274], [1040, 288], [1120, G]]), c: FIR },
    ],
    // the Estany de Sant Maurici in front
    front: [{ d: water(420, 1180, 300), c: LAKE }],
  },
  "stubaier-hoehenweg": {
    view: "The glaciated head of the Stubai valley from the high route: the Zuckerhütl and the Wilder Freiger with their glaciers, grey ridges and the green high pastures below the huts",
    ridge: "#5f7a3c",
    ground: MEADOW,
    shapes: [
      // the far grey ridges round the valley
      { d: range([[0, G], [70, 250], [150, 214], [230, 186], [300, 196], [370, 170], [440, 186], [520, 204], [600, 228], [680, G]]), c: "#a3abb3" },
      // the Zuckerhütl and the Wilder Freiger, the glaciated main ridge
      { d: range([[560, G], [640, 246], [720, 192], [790, 150], [840, 118], [868, 96], [892, 118], [940, 136], [1000, 128], [1060, 108], [1092, 112], [1140, 140], [1210, 176], [1300, 214], [1400, 246], [1500, 270], [1600, G]]), c: ROCK },
      { d: snowOf([[560, G], [640, 246], [720, 192], [790, 150], [840, 118], [868, 96], [892, 118], [940, 136], [1000, 128], [1060, 108], [1092, 112], [1140, 140], [1210, 176], [1300, 214], [1400, 246], [1500, 270], [1600, G]], 168), c: SNOW },
    ],
  },
  lechweg: {
    view: "The Tyrolean Lech valley: the grey limestone peaks of the Lechtal Alps above forested slopes, the wild Lech braiding over its pale gravel banks",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      // the Lechtal Alps' limestone peaks to the south
      { d: range([[0, G], [60, 250], [130, 204], [190, 168], [226, 146], [252, 160], [300, 150], [340, 132], [372, 142], [420, 170], [480, 196], [560, 224], [640, G]]), c: "#b1b4b2" },
      { d: range([[880, G], [960, 240], [1040, 196], [1100, 166], [1140, 150], [1172, 160], [1220, 142], [1262, 128], [1300, 140], [1360, 168], [1440, 202], [1520, 236], [1600, 254], [1600, G]]), c: "#b1b4b2" },
      // the forested slopes below
      { d: hills([[300, G], [420, 262], [560, 244], [700, 256], [840, 238], [980, 252], [1120, 240], [1260, 258], [1380, G]]), c: FIR },
    ],
    // the river braiding over its gravel banks in front
    front: [
      { d: water(360, 1240, 302), c: "#d9d3c2" },
      { d: water(420, 1180, 306), c: "#7fb3c8" },
    ],
  },
  "berliner-hoehenweg": {
    view: "The head of the Zillertal: the glaciated main ridge of the Zillertal Alps with the Schönbichler Horn's pass, grey side ridges, and the Schlegeis reservoir below",
    ridge: "#5f7a3c",
    ground: MEADOW,
    shapes: [
      // the grey side ridges
      { d: range([[0, G], [80, 248], [160, 206], [230, 178], [290, 188], [350, 160], [410, 176], [490, 200], [570, 226], [650, G]]), c: "#a3abb3" },
      // the glaciated main ridge (Großer Möseler, Turnerkamp, Schönbichler Horn)
      { d: range([[560, G], [640, 240], [720, 186], [790, 146], [836, 116], [862, 98], [890, 120], [940, 132], [990, 114], [1030, 100], [1066, 116], [1120, 142], [1190, 170], [1270, 204], [1360, 236], [1460, 262], [1600, 282], [1600, G]]), c: ROCK },
      { d: snowOf([[560, G], [640, 240], [720, 186], [790, 146], [836, 116], [862, 98], [890, 120], [940, 132], [990, 114], [1030, 100], [1066, 116], [1120, 142], [1190, 170], [1270, 204], [1360, 236], [1460, 262], [1600, 282], [1600, G]], 160), c: SNOW },
    ],
    // the Schlegeis reservoir in the valley
    front: [{ d: water(260, 760, 298), c: "#6fb0c4" }],
  },
  "karwendel-hoehenweg": {
    view: "The Karwendel's grey limestone chains above the Inn valley: the Nordkette's long jagged ridge, the Bettelwurf's massive block, scree fans and mountain pines below",
    ridge: FOREST,
    ground: MEADOW,
    shapes: [
      // the long jagged ridge of the Nordkette
      { d: range([[0, G], [60, 252], [120, 214], [170, 190], [200, 176], [222, 186], [250, 168], [280, 176], [310, 160], [340, 172], [380, 164], [420, 182], [470, 200], [540, 226], [620, G]]), c: "#b9bab6" },
      // the Bettelwurf: a massive pale block with a sharp top
      { d: range([[700, G], [760, 248], [820, 196], [870, 154], [904, 126], [924, 112], [944, 124], [990, 132], [1040, 120], [1070, 128], [1120, 156], [1180, 192], [1250, 226], [1330, 252], [1400, G]]), c: "#c6c3b8" },
      // its shaded north face
      { d: "M924,112L904,126L870,154L846,180L884,186L916,146L934,124Z", c: "#b1ad9f" },
      // mountain pines and scree at the foot
      { d: hills([[600, G], [700, 284], [820, 270], [960, 282], [1100, 268], [1240, 284], [1360, G]]), c: FIR },
    ],
  },
  "wonderland-trail": {
    view: "Mount Rainier from its subalpine meadows: the broad, glaciated volcano filling the sky, the Tatoosh Range's dark ridges in front, conifer forest and a meadow of wildflowers",
    ridge: "#4a5e3e",
    ground: "#a8b878",
    shapes: [
      // Mount Rainier: a broad, glaciated dome, far and pale
      { d: range(rainier), c: "#a9b3c0" },
      { d: snowOf(rainier, 196), c: SNOW },
      // the Tatoosh Range's jagged ridges
      { d: range([[0, G], [80, 262], [160, 236], [210, 222], [250, 232], [300, 214], [350, 228], [420, 250], [520, 274], [600, G]]), c: "#6c7a86" },
      { d: range([[1100, G], [1200, 268], [1290, 246], [1350, 236], [1400, 246], [1470, 232], [1540, 248], [1600, 256], [1600, G]]), c: "#6c7a86" },
      // conifer forest along the valleys
      { d: hills([[0, G], [140, 278], [360, 286], [600, 280], [900, 290], [1200, 278], [1600, 284], [1600, G]]), c: FIR },
      // the subalpine meadow in flower
      { d: hills([[380, G], [560, 296], [800, 292], [1040, 298], [1240, G]]), c: "#8faa5e" },
    ],
  },
  "o-circuit": {
    view: "The back of the Paine massif from the John Gardner pass: the Southern Patagonian Ice Field, the Grey Glacier's broad tongue of white and blue ice flowing down to its lake, dark lenga forest on the slopes below",
    ridge: "#6f7a52",
    ground: "#a9a26a",
    shapes: [
      // the ice field on the horizon, white over pale grey rock
      { d: range(iceField), c: "#c7cdd2" },
      { d: snowOf(iceField, 238), c: SNOW },
      // the Grey Glacier's tongue, broad and flat, coming down towards the lake
      { d: "M560,246L1000,240L1060,262L1020,286L860,292L700,290L600,272Z", c: "#e6eef2" },
      { d: "M640,262L740,258L900,256L1000,262L960,276L820,282L700,280Z", c: "#a9cfe0" },
      // the massif's dark flank on the left, the pass's rock on the right
      { d: range([[0, G], [60, 250], [140, 200], [200, 168], [240, 150], [276, 162], [320, 196], [400, 240], [480, 272], [540, G]]), c: "#5a5450" },
      { d: range([[1180, G], [1260, 262], [1340, 236], [1400, 222], [1460, 234], [1540, 254], [1600, 262], [1600, G]]), c: "#7a7068" },
    ],
    front: [
      // Lago Grey below the ice, with a few bergs
      { d: water(520, 1160, 296), c: "#7fb7c9" },
      { d: "M640,298l14-6l12,6z M760,300l10-5l9,5z M900,297l16-7l13,7z", c: "#eef4f6" },
      // lenga forest on the slopes
      { d: hills([[0, G], [140, 286], [360, 292], [520, 300], [1160, 300], [1320, 288], [1600, 284], [1600, G]]), c: "#3f5a34" },
    ],
  },
  "long-trail": {
    view: "Vermont's Green Mountains: ridge behind forested ridge in fading blues, Mount Mansfield's long bare summit ridge with its Chin, maple and spruce forest, and a three-sided lean-to by the trail",
    ridge: "#3f5a34",
    ground: "#b9b07a",
    shapes: [
      // far ridges, pale blue
      { d: hills([[0, G], [120, 248], [320, 232], [520, 244], [760, 236], [1000, 246], [1240, 232], [1460, 242], [1600, 238], [1600, G]]), c: "#b7c4cf" },
      // Mount Mansfield: a long ridge, bare rock on top, the Chin its high point
      { d: range([[420, G], [520, 252], [620, 220], [700, 206], [760, 196], [800, 200], [860, 192], [900, 184], [930, 188], [980, 204], [1060, 224], [1160, 252], [1260, G]]), c: "#7d8d8a" },
      { d: "M700,206L760,196L800,200L860,192L900,184L930,188L960,198L900,198L860,204L800,208L760,206Z", c: "#a8a49a" },
      // nearer ridges, forested
      { d: hills([[0, G], [160, 262], [360, 254], [520, 268], [700, 258], [900, 272], [1100, 260], [1320, 266], [1600, 256], [1600, G]]), c: "#5f7a5a" },
      { d: hills([[0, G], [220, 280], [480, 286], [760, 278], [1040, 288], [1300, 280], [1600, 286], [1600, G]]), c: FIR },
    ],
    front: [
      // a lean-to: a three-sided shelter with its roof sloping back
      { d: "M1230,300L1236,276L1300,268L1306,300Z", c: "#7a5a3a" },
      { d: "M1226,278L1300,262L1312,270L1238,284Z", c: "#5a4030" },
      { d: "M1242,300L1246,284L1294,278L1296,300Z", c: "#2f2a22" },
    ],
  },
  "la-cloche-silhouette-trail": {
    view: "Killarney's La Cloche range: white quartzite ridges over a clear blue lake, pink granite on the shore and wind-shaped jack pines",
    ridge: "#4a5e3e",
    ground: "#c9a98a",
    shapes: [
      // the La Cloche ridges, white quartzite showing through the forest
      { d: hills([[0, G], [140, 236], [300, 214], [460, 226], [600, 206], [760, 220], [900, 230], [1080, 210], [1240, 224], [1420, 216], [1600, 232], [1600, G]]), c: "#5f7558" },
      { d: "M280,218L300,214L340,216L330,226L300,230Z M580,210L600,206L640,210L630,222L596,224Z M1060,214L1080,210L1120,214L1110,226L1074,228Z M1400,220L1420,216L1452,220L1440,230L1410,232Z", c: "#eeeee6" },
      // a nearer ridge
      { d: hills([[0, G], [200, 262], [440, 252], [700, 264], [940, 250], [1180, 262], [1400, 256], [1600, 266], [1600, G]]), c: FIR },
    ],
    front: [
      // the lake, and pink granite on its shore
      { d: water(0, 1600, 290), c: "#3f86b8" },
      { d: hills([[1040, G], [1160, 288], [1300, 282], [1440, 290], [1600, 286], [1600, G]]), c: "#c48a7a" },
      // a jack pine leaning over the shore: a trunk and flat crown tiers
      { d: "M1290,282L1296,230L1300,230L1298,282Z", c: "#3a2f26" },
      { d: "M1262,240l40-10l30,6l-36,10z M1272,226l34-8l22,6l-30,8z M1280,214l24-6l16,4l-22,6z", c: "#2f4a2c" },
    ],
  },
  "lost-coast-trail": {
    view: "California's Lost Coast: the King Range rising straight out of the Pacific, grassy and forested slopes over a dark sand beach, sea stacks in the surf and the old Punta Gorda lighthouse",
    ridge: "#5a6a4a",
    ground: "#4a463e",
    shapes: [
      // the King Range, steep from the sea
      { d: range([[560, G], [640, 250], [740, 200], [840, 164], [920, 146], [980, 152], [1060, 176], [1180, 198], [1320, 214], [1460, 232], [1600, 240], [1600, G]]), c: "#7b8a6a" },
      // grassy coastal slopes with dark forest in the gullies
      { d: hills([[700, G], [820, 250], [980, 236], [1140, 248], [1320, 242], [1480, 254], [1600, 250], [1600, G]]), c: "#a8a46a" },
      { d: "M900,246L930,236L960,250L940,268Z M1180,248L1206,240L1232,252L1212,270Z M1400,250L1424,244L1448,256L1428,272Z", c: "#3f5a34" },
      // the sea
      { d: water(0, 1600, 286), c: "#3f7898" },
    ],
    front: [
      // sea stacks in the surf
      { d: "M120,300L132,262L150,256L162,270L170,300Z M240,300L248,280L262,276L270,300Z", c: "#3a3a36" },
      // the Punta Gorda lighthouse: a squat white tower
      { d: "M640,296L644,268H662L666,296Z", c: "#eeeee6" },
      { d: "M642,268L653,256L664,268Z", c: "#b8432e" },
      // driftwood on the dark sand
      { d: "M900,304L980,298L984,302L904,308Z M1100,306L1150,302L1152,305L1102,309Z", c: "#b8ab90" },
    ],
  },
  "fundy-footpath": {
    view: "The Bay of Fundy from the footpath: steep spruce-covered headlands ending in red sandstone cliffs, the bay's wide tidal flats at low water, Nova Scotia's low shore across the bay, a flowerpot rock with trees on top and Point Wolfe's red covered bridge at the shore",
    ridge: "#3f5a34",
    ground: "#8a6a58",
    shapes: [
      // Nova Scotia's shore, low and blue across the bay
      { d: hills([[0, G], [140, 268], [460, 262], [800, 270], [1000, G]]), c: "#a6b8c2" },
      // the bay
      { d: water(0, 1600, 280), c: "#5f8ea6" },
      // the far headland: steep to the bay, rolling inland
      { d: range([[560, G], [600, 236], [650, 176], [740, 146], [860, 154], [960, 136], [1080, 152], [1200, 142], [1340, 160], [1480, 150], [1600, 164], [1600, G]]), c: "#55704a" },
      // its red sandstone cliff where it meets the bay
      { d: "M590,320L606,262L630,216L652,186L668,196L664,250L658,320Z", c: "#a3533a" },
      // the near headland, darker spruce
      { d: range([[800, G], [840, 252], [900, 214], [1000, 200], [1120, 214], [1240, 204], [1400, 222], [1600, 216], [1600, G]]), c: FIR },
      { d: "M826,320L838,276L858,240L880,226L888,262L878,320Z", c: "#94482f" },
    ],
    front: [
      // the tidal flats at low water, wet sand in front of the bay
      { d: water(0, 620, 298), c: "#b9a68a" },
      // a flowerpot rock: a sea stack with spruce on its top
      { d: "M280,304L286,262L302,254L318,262L324,304Z", c: "#9a4e36" },
      { d: "M282,262L292,236L300,254L308,232L322,260Z", c: "#2f4a2c" },
      // Point Wolfe's covered bridge at the shore, red with a grey roof
      { d: "M470,304V278H556V304Z", c: "#a33a2a" },
      { d: "M462,280L476,264H550L564,280Z", c: "#5b5650" },
      { d: "M500,304V288H526V304Z", c: "#5a2a20" },
    ],
  },
  "juan-de-fuca-marine-trail": {
    view: "Vancouver Island's south-west coast from the trail: dark spruce headlands, Mystic Beach's waterfall dropping off a sandstone cliff onto the sand, the Strait of Juan de Fuca with the snowy Olympic Mountains across it, and Botanical Beach's sandstone shelves with their tide pools",
    ridge: "#2f4a34",
    ground: "#c9b58c",
    shapes: [
      // the Olympic Mountains across the strait, blue with distance, snow on their tops
      { d: range([[600, G], [680, 262], [760, 236], [830, 212], [880, 196], [910, 176], [930, 162], [950, 172], [980, 190], [1020, 176], [1060, 158], [1085, 146], [1110, 160], [1150, 184], [1190, 170], [1230, 156], [1260, 168], [1300, 192], [1350, 186], [1400, 204], [1470, 220], [1540, 236], [1600, 244], [1600, G]]), c: "#a9b9c6" },
      { d: snowOf([[600, G], [680, 262], [760, 236], [830, 212], [880, 196], [910, 176], [930, 162], [950, 172], [980, 190], [1020, 176], [1060, 158], [1085, 146], [1110, 160], [1150, 184], [1190, 170], [1230, 156], [1260, 168], [1300, 192], [1350, 186], [1400, 204], [1470, 220], [1540, 236], [1600, 244], [1600, G]], 180), c: "#eef1f2" },
      // the strait
      { d: water(0, 1600, 266), c: "#4f86a8" },
      // a far headland down the coast, green-blue with distance
      { d: hills([[480, G], [540, 270], [620, 256], [720, 262], [800, 274], [860, G]]), c: "#5f7c6c" },
      // the near headland: dark spruce and cedar to the sea
      { d: range([[0, G], [0, 176], [80, 166], [170, 172], [250, 186], [310, 204], [345, 214], [365, G]]), c: "#33503a" },
      // tall spruce on it, each a narrow spire
      { d: ([[40, 156], [82, 152], [124, 155], [170, 158], [214, 166], [256, 174], [298, 190]] as P[]).map(([x, y]) => `M${x - 12},${G}L${x},${y}L${x + 12},${G}Z`).join(" "), c: "#2a4430" },
      // its sandstone cliff, with Mystic Beach's waterfall pouring off the top onto the sand
      { d: "M330,320L334,232L352,214L384,218L396,262L400,320Z", c: "#a58c66" },
      { d: waterfall(374, 222, 300, 6), c: "#f2f4f0" },
    ],
    front: [
      // Botanical Beach: flat sandstone shelves running into the sea, dark tide pools on them
      { d: "M940,320L980,306L1120,302L1300,304L1420,300L1500,320Z", c: "#a8946e" },
      { d: "M1040,309a22,3 0 1 0 44,0a22,3 0 1 0 -44,0Z M1180,307a30,3 0 1 0 60,0a30,3 0 1 0 -60,0Z M1330,306a18,2.5 0 1 0 36,0a18,2.5 0 1 0 -36,0Z", c: "#3f7898" },
    ],
  },
  "tahoe-rim-trail": {
    view: "Lake Tahoe from the rim: the deep blue lake below granite ridges and pines, the Sierra's peaks across the water with Mount Tallac's snow, and turquoise shallows round granite boulders on the east shore",
    ridge: "#4a5e3e",
    ground: "#b8ad92",
    shapes: [
      // the Sierra across the lake, pale with distance; Mount Tallac on the left with late snow
      { d: range([[0, G], [60, 232], [200, 218], [340, 222], [460, 206], [540, 186], [600, 166], [630, 158], [660, 166], [720, 190], [800, 208], [900, 214], [1000, 222], [1120, 214], [1260, 224], [1400, 216], [1520, 226], [1600, 230], [1600, G]]), c: "#aab6c4" },
      { d: snowOf([[400, G], [460, 206], [540, 186], [600, 166], [630, 158], [660, 166], [720, 190], [800, 208], [900, G]], 184), c: SNOW },
      // Lake Tahoe, deep blue to the far shore
      { d: water(0, 1600, 238), c: "#2f6f9f" },
      // the rim on the left: a granite ridge with dark forest on its lower slopes
      { d: range([[0, G], [0, 226], [50, 214], [110, 188], [160, 176], [210, 190], [270, 214], [340, 242], [420, 270], [500, G]]), c: "#9a9890" },
      { d: hills([[0, G], [120, 256], [260, 248], [400, 266], [520, 286], [620, G]]), c: FIR },
      // forested slopes of the east shore on the right
      { d: hills([[1200, G], [1320, 262], [1460, 250], [1600, 258], [1600, G]]), c: "#4f6a46" },
    ],
    front: [
      // turquoise shallows over sand, and rounded granite boulders in them
      { d: water(700, 1520, 294), c: "#5fb0b4" },
      { d: "M900,300C904,288 926,284 938,292C946,298 944,302 940,304L902,304Z M1020,302C1026,292 1050,290 1060,298L1062,306L1022,306Z M1150,300C1154,286 1186,284 1196,296L1198,306L1152,306Z", c: "#cfc8b8" },
      // Jeffrey pines on the rim: straight trunks and tiered crowns
      { d: "M218,300L220,226L224,226L226,300Z M330,300L331,246L334,246L335,300Z", c: "#3a2f26" },
      { d: "M222,212L206,244L238,244Z M222,226L200,262L244,262Z M222,244L196,280L248,280Z M332,236L320,260L344,260Z M332,250L316,276L348,276Z", c: "#2f4a2c" },
    ],
  },
  "sunshine-coast-trail": {
    view: "From a bluff above Desolation Sound: Vancouver Island's mountains pale across the Strait of Georgia, low islands in the sea, the forested Coast Mountains rising to Tin Hat Mountain with its hut on the summit, and an arbutus leaning out from the rocks",
    ridge: "#3f5a34",
    ground: "#8a7c66",
    shapes: [
      // Vancouver Island's mountains, pale across the strait
      { d: range([[0, G], [80, 250], [180, 228], [260, 214], [330, 222], [420, 206], [500, 216], [600, 232], [700, 244], [820, 262], [920, G]]), c: "#b7c4cf" },
      // the Coast Mountains behind, a last snowfield on the high peaks
      { d: range([[700, G], [800, 226], [880, 196], [930, 178], [960, 186], [1010, 160], [1050, 176], [1120, 150], [1160, 168], [1230, 156], [1290, 172], [1360, 164], [1430, 190], [1520, 200], [1600, 214], [1600, G]]), c: "#9fb0bc" },
      { d: snowOf([[700, G], [800, 226], [880, 196], [930, 178], [960, 186], [1010, 160], [1050, 176], [1120, 150], [1160, 168], [1230, 156], [1290, 172], [1360, 164], [1430, 190], [1520, 200], [1600, 214], [1600, G]], 168), c: SNOW },
      // Tin Hat Mountain: forested slopes up to its rounded summit
      { d: range([[800, G], [860, 256], [940, 212], [1000, 172], [1024, 152], [1046, 146], [1076, 146], [1096, 156], [1150, 194], [1240, 232], [1340, 256], [1440, G]]), c: "#55704a" },
      // the hut on the summit
      { d: "M1050,147V136L1061,129L1072,136V147Z", c: "#7a5a3a" },
      { d: "M1046,137L1061,126L1076,137L1074,139L1061,130L1048,139Z", c: "#4a3a2c" },
      // the near ridge, dark fir and cedar
      { d: hills([[600, G], [720, 272], [880, 262], [1040, 272], [1220, 258], [1400, 268], [1600, 260], [1600, G]]), c: FIR },
    ],
    front: [
      // the Strait of Georgia, with Savary and Hernando islands low in the sea
      { d: water(0, 820, 290), c: "#5a8fb0" },
      { d: hills([[300, G], [340, 288], [440, 282], [540, 290], [580, G]]), c: FAR },
      { d: hills([[600, G], [630, 290], [690, 286], [740, G]]), c: FAR },
      // a rocky bluff on the shore with an arbutus leaning out over the sea: red bark, a dark crown
      { d: hills([[40, G], [100, 296], [220, 290], [320, 302], [380, G]]), c: "#7d7a70" },
      { d: "M196,296C192,276 182,258 166,244L172,240C190,254 202,274 206,296Z", c: "#a34a2e" },
      { d: "M128,248a24,13 0 1 1 48,0a24,13 0 1 1 -48,0Z M152,232a22,12 0 1 1 44,0a22,12 0 1 1 -44,0Z M110,238a16,9 0 1 1 32,0a16,9 0 1 1 -32,0Z", c: "#2f4a2c" },
    ],
  },
  "rockwall-trail": {
    view: "The Rockwall from the meadows below Numa Pass: one long grey limestone cliff with hanging glaciers on its ledges and a meltwater fall, pale peaks behind, dark firs, alpine meadows and the turquoise water of Floe Lake at its foot",
    ridge: "#6b8a45",
    ground: MEADOW,
    shapes: [
      // the pale peaks of the Vermilion Range behind
      { d: range([[0, G], [60, 252], [130, 214], [190, 190], [236, 176], [270, 186], [320, 200], [400, 222], [480, 246], [560, G]]), c: "#b8c2cc" },
      { d: range([[1240, G], [1320, 236], [1390, 196], [1440, 172], [1476, 162], [1510, 176], [1560, 196], [1600, 210], [1600, G]]), c: "#b8c2cc" },
      // the Rockwall: one long limestone cliff, its crest almost level, its face sheer
      { d: range([[200, G], [290, 250], [340, 180], [366, 130], [384, 104], [400, 96], [420, 108], [470, 112], [520, 100], [548, 86], [572, 104], [640, 108], [700, 96], [730, 80], [752, 96], [820, 102], [880, 92], [916, 76], [940, 92], [1000, 98], [1060, 90], [1090, 78], [1112, 96], [1160, 104], [1200, 124], [1250, 176], [1310, 232], [1400, G]]), c: "#a9a69c" },
      // hanging glaciers on its ledges
      { d: "M582,105L638,108L630,128L608,144L590,126Z M760,97L818,102L808,124L786,140L768,120Z M950,94L1000,98L992,118L974,134L958,114Z", c: SNOW },
      // a meltwater fall from the middle glacier
      { d: waterfall(786, 138, 214, 3), c: "#e6eef2" },
      // the dark firs on the slopes below the wall
      { d: hills([[120, G], [260, 274], [420, 262], [600, 272], [800, 258], [1000, 270], [1200, 260], [1400, 276], [1560, G]]), c: FIR },
      // the alpine meadows of the passes
      { d: hills([[0, G], [140, 292], [340, 284], [560, 296], [700, G]]), c: "#9cbb64" },
      { d: hills([[1000, G], [1160, 290], [1360, 282], [1600, 292], [1600, G]]), c: "#9cbb64" },
    ],
    // Floe Lake's turquoise water at the foot of the wall
    front: [{ d: water(560, 1080, 300), c: "#5fb4b8" }],
  },
  "superior-hiking-trail": {
    view: "Minnesota's North Shore: the Sawtooth ridges above Lake Superior, birch and spruce on the rocky slopes, a waterfall dropping towards the lake and the lake's long horizon",
    ridge: "#3f5a34",
    ground: "#a89878",
    shapes: [
      // Lake Superior, wide to the horizon on the right
      { d: water(700, 1600, 262), c: "#4f86a8" },
      // the Sawtooth ridges: steep on the lake side, gentle behind
      { d: range([[0, G], [80, 250], [200, 216], [260, 206], [330, 230], [420, 214], [490, 206], [560, 232], [660, 222], [740, 246], [820, G]]), c: "#5f7358" },
      { d: hills([[0, G], [160, 264], [380, 256], [600, 268], [780, 276], [900, G]]), c: FIR },
      // a rocky point into the lake
      { d: hills([[1180, G], [1260, 280], [1360, 276], [1440, G]]), c: "#7a7068" },
    ],
    front: [
      // a waterfall over dark rock, and birches beside it
      { d: "M560,300L572,262H612L620,300Z", c: "#4a4440" },
      { d: waterfall(592, 264, 300, 8), c: "#e8f0f2" },
      { d: "M680,300L682,250L686,250L686,300Z M712,300L713,258L717,258L717,300Z", c: "#eeeee6" },
      { d: "M666,262a20,14 0 1 0 40,0a20,14 0 1 0 -40,0Z M700,268a18,12 0 1 0 34,0a18,12 0 1 0 -34,0Z", c: "#8faa5e" },
    ],
  },
};
