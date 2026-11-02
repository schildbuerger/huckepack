// Handcrafted skylines behind each trail page's head (issue #142): the landscape a trail is known for,
// drawn by hand in flat shapes (public photographs as reference only, nothing traced), in a 1600 × 320
// box with the ground at its foot. Each skyline lists its shapes back to front in flat colours (the far
// ones lighter and bluer, for depth); the page draws the trail's own elevation profile in front of them
// in the skyline's `ridge` colour (TrailSkyline.astro), then the `front` shapes (water, a castle by a
// river), on a strip of `ground` along the band's foot. Every shape meets the ground at both ends, so
// the drawing flows into the band instead of ending in a cut. Landmarks are simple flat shapes; nothing
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
const pt = (p: P) => `${p[0]},${p[1]}`;
// a range of mountains through hand-placed points, its ends brought down to the ground
const range = (pts: P[]) => `M${pts[0][0]},${G}L${pts.slice(1, -1).map(pt).join("L")}L${pts[pts.length - 1][0]},${G}Z`;
// rounded hills: the same through smooth curves (quadratics through the midpoints)
const hills = (pts: P[]) => {
  const p = pts.slice(1, -1);
  let d = `M${pts[0][0]},${G}`;
  d += `Q${pt(p[0])} ${(p[0][0] + p[1][0]) / 2},${(p[0][1] + p[1][1]) / 2}`;
  for (let i = 1; i < p.length - 1; i++) d += `Q${pt(p[i])} ${(p[i][0] + p[i + 1][0]) / 2},${(p[i][1] + p[i + 1][1]) / 2}`;
  return `${d}Q${pt(p[p.length - 1])} ${pts[pts.length - 1][0]},${G}Z`;
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
  return out.length ? `M${out.map(pt).join("L")}Z` : "";
};
// a lake, a river or the sea: a level band whose ends run down to the ground
const water = (x0: number, x1: number, y: number) => `M${x0},${G}L${x0 + 30},${y}L${x1 - 30},${y}L${x1},${G}Z`;
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
const texel: P[] = [[0, G], [60, 262], [140, 212], [200, 170], [230, 150], [250, 138], [270, 152], [300, 140], [330, 124], [352, 116], [372, 130], [410, 150], [460, 176], [520, 160], [560, 146], [590, 158], [640, 180], [720, 206], [820, 232], [920, 262], [1000, G]];
const texelEast: P[] = [[900, G], [1000, 256], [1100, 222], [1180, 200], [1240, 188], [1300, 200], [1380, 220], [1460, 246], [1540, 276], [1600, G]];
const mitre: P[] = [[600, G], [660, 250], [700, 180], [725, 112], [738, 92], [752, 110], [790, 190], [840, 260], [900, G]];
const nevis: P[] = [[1100, G], [1180, 246], [1260, 196], [1320, 172], [1380, 166], [1440, 176], [1500, 206], [1560, 250], [1600, G]];
const montBlanc: P[] = [[0, G], [60, 304], [110, 272], [140, 226], [158, 170], [170, 122], [185, 118], [200, 124], [222, 150], [238, 136], [244, 132], [250, 144], [270, 168], [300, 180], [330, 172], [360, 180], [390, 190], [420, 188], [438, 156], [450, 180], [466, 148], [480, 176], [496, 140], [512, 170], [530, 152], [548, 182], [572, 168], [596, 114], [602, 104], [608, 104], [614, 116], [640, 136], [680, 112], [720, 98], [752, 106], [790, 94], [815, 87], [842, 96], [880, 86], [920, 76], [955, 71], [995, 74], [1040, 82], [1080, 92], [1110, 97], [1150, 92], [1188, 102], [1228, 124], [1250, 122], [1290, 132], [1325, 106], [1340, 97], [1352, 100], [1380, 136], [1430, 168], [1490, 212], [1540, 252], [1580, 292], [1600, G]];

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
      { d: range([[0, G], [40, 220], [70, 140], [100, 110], [140, 104], [180, 118], [220, 170], [260, 240], [300, G]]), c: "#4f6a52" },
      { d: waterfall(150, 108, 262), c: "#f4f6f4" },
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
};
