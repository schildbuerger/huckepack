// The animals and plants in the Wildlife section (issue #156) as silhouettes from PhyloPic, public
// domain (CC0 1.0) except the giant hogweed (CC BY 4.0); the makers named in `credit`, which the section
// shows. One SVG a kind in src/assets/animals/, cleaned to its viewBox and one path in the scene's ink,
// served as a file the browser caches (the hogweed alone is 330 KB) and drawn as an <image>. Hand-drawn
// shapes were tried first and fell short of these (2026-11-02). The landscape and the placing are
// ours. Flat colours only.

import { SKYLINES, SKY_W, SKY_H } from "./skylines";
import { SKY } from "./sky";

export type AnimalKind = "bear" | "wolf" | "big-cat" | "boar" | "cattle" | "dog" | "monkey" | "snake" | "scorpion" | "spider" | "tick" | "hogweed";

const FILES = import.meta.glob<string>("../assets/animals/*.svg", { query: "?raw", import: "default", eager: true });
const URLS = import.meta.glob<string>("../assets/animals/*.svg", { query: "?url", import: "default", eager: true });

type Animal = {
  // the height in the scene's units (a 900 × 280 panorama); the width follows the drawing
  h: number;
  // where a label's leader line ends, as fractions of the drawing's box: above the body
  anchor: [number, number];
  // the silhouette's maker, the species drawn and its licence, for the credit line
  credit: string;
  species: string;
  licence?: string;
};

const ANIMALS: Record<AnimalKind, Animal> = {
  bear: { h: 150, anchor: [0.55, 0.3], credit: "Abby Weber", species: "Ursus americanus" },
  wolf: { h: 88, anchor: [0.45, 0.05], credit: "François-Louis Pelissier", species: "Canis lupus italicus" },
  "big-cat": { h: 78, anchor: [0.5, 0.05], credit: "Margot Michaud", species: "Puma concolor" },
  boar: { h: 74, anchor: [0.45, 0.03], credit: "Ferran Sayol", species: "Sus scrofa" },
  cattle: { h: 100, anchor: [0.4, 0.06], credit: "Katy Lawler", species: "Bos taurus" },
  dog: { h: 84, anchor: [0.5, 0.3], credit: "Rachel T. Mason", species: "Canis familiaris dingo" },
  monkey: { h: 58, anchor: [0.4, 0.12], credit: "Ben Murrell", species: "Macaca mulatta" },
  snake: { h: 74, anchor: [0.45, 0.25], credit: "Blair Perry", species: "Crotalus viridis" },
  scorpion: { h: 36, anchor: [0.45, 0.25], credit: "Caleb M. Gordon", species: "Paruroctonus boreus" },
  spider: { h: 36, anchor: [0.55, 0.3], credit: "Sean McCann", species: "Latrodectus hesperus" },
  tick: { h: 36, anchor: [0.5, 0.1], credit: "Guillaume Dera", species: "Ixodes ricinus" },
  // 2–4 m tall, the tallest thing in the scene
  hogweed: { h: 170, anchor: [0.45, 0.12], credit: "Lizzie Harper", species: "Heracleum mantegazzianum", licence: "CC BY 4.0" },
};

// a kind's silhouette: its file's address and its width-to-height ratio
export const silhouette = (kind: AnimalKind) => {
  const file = FILES[`../assets/animals/${kind}.svg`];
  const [, , w, h] = file.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
  return { url: URLS[`../assets/animals/${kind}.svg`], ratio: w / h };
};
export const credit = (kind: AnimalKind) => {
  const a = ANIMALS[kind];
  return `${a.credit} (${a.species}), PhyloPic, ${a.licence ?? "public domain"}`;
};

const SMALL: AnimalKind[] = ["scorpion", "spider", "tick"];

export const SCENE_W = 900;
export const SCENE_H = 280;
// the band runs wall to wall: sky and ground reach this far beyond the scene's sides, and the sky this
// far above it, where the section's heading sits. The band draws the scene cropped to its box
// ("slice"); 2,400 units a side keep the drawing wider than any screen at the band's height (5,700
// units, over 6,000 px at 380 px tall), so it is only ever cropped at the sides, never at the top
// where the labels are
export const BLEED = 2400;
export const TOP = 44;
const BACK_Y = 236; // where the large animals stand
const FRONT_Y = 266; // the small ones, nearer

const fir = (x: number, base: number, h: number) =>
  `M${x} ${base - h} L${x + h * 0.3} ${base - h * 0.45} L${x + h * 0.17} ${base - h * 0.45} L${x + h * 0.36} ${base} L${x - h * 0.36} ${base} L${x - h * 0.17} ${base - h * 0.45} L${x - h * 0.3} ${base - h * 0.45} Z`;
const bush = (x: number, y: number, r: number) =>
  `M${x - r} ${y} C${x - r} ${y - r} ${x - r * 0.3} ${y - r * 1.3} ${x} ${y - r * 0.9} C${x + r * 0.4} ${y - r * 1.4} ${x + r * 1.1} ${y - r} ${x + r} ${y} Z`;

// a landscape for trails without a skyline: sky, far mountains with snow, wooded hills, a meadow, rocks
// and bushes (coloured by the section's CSS classes)
const GENERIC = [
  `<rect class="sky" y="${-TOP}" width="${SCENE_W}" height="${SCENE_H + TOP}"/>`,
  '<path class="far" d="M0 150 L60 96 L100 122 L170 64 L230 118 L290 92 L360 140 L440 84 L500 116 L560 70 L640 128 L700 98 L760 132 L830 76 L900 118 L900 280 L0 280 Z"/>',
  '<path class="snow" d="M170 64 L186 80 L176 78 L166 84 L158 75 Z M440 84 L454 97 L444 95 L436 100 L429 94 Z M560 70 L576 86 L566 83 L556 89 L548 81 Z M830 76 L845 89 L835 87 L826 92 L819 86 Z"/>',
  '<path class="hills" d="M0 196 C80 170 150 178 230 166 C320 152 380 176 470 168 C560 160 640 150 720 164 C800 178 850 168 900 162 L900 280 L0 280 Z"/>',
  `<path class="trees" d="${[
    [24, 196, 42], [48, 192, 54], [74, 196, 40], [130, 182, 44], [154, 186, 34], [596, 166, 40], [620, 162, 52], [646, 168, 38], [800, 178, 46], [826, 176, 56], [854, 172, 42], [880, 170, 50],
  ]
    .map(([x, b, h]) => fir(x, b, h))
    .join(" ")}"/>`,
  '<path class="meadow" d="M0 226 C120 214 240 222 360 216 C480 210 600 222 720 214 C800 210 860 214 900 212 L900 280 L0 280 Z"/>',
  `<path class="rock" d="M12 252 L22 232 L44 226 L62 236 L70 252 Z M820 252 L832 236 L852 230 L874 238 L882 252 Z"/>`,
  `<path class="bush" d="${[bush(96, 250, 16), bush(122, 252, 11), bush(770, 250, 14), bush(744, 252, 10)].join(" ")}"/>`,
  `<rect class="ground" y="252" width="${SCENE_W}" height="${SCENE_H - 252}"/>`,
].join("");

// the scene behind the animals: the trail's own skyline (src/lib/skylines.ts, the landscape of its page
// head, without the trail's profile) in the upper part on the day sky, its ground colour running down to
// the scene's foot, where the animals stand (the nearest strip a shade darker); the generic landscape
// where a trail has no skyline
const SKY_FOOT = 206; // where the skyline's ground lies in the scene
export const backdrop = (slug: string) => {
  const sky = SKYLINES[slug];
  // no skyline: the generic landscape, repeated across the band, every other copy mirrored so the
  // hills meet without a seam
  if (!sky) {
    const n = Math.ceil(BLEED / SCENE_W);
    const tiles = [];
    for (let i = -n; i <= n; i++)
      tiles.push(i % 2 ? `<g transform="translate(${(i + 1) * SCENE_W} 0) scale(-1 1)">${GENERIC}</g>` : `<g transform="translate(${i * SCENE_W} 0)">${GENERIC}</g>`);
    return tiles.join("");
  }
  // drawn larger than the scene's width allows, cropped evenly at both sides (the landmarks stay in)
  const k = 0.66;
  const dx = (SCENE_W - SKY_W * k) / 2;
  const shape = (x: { d: string; c: string }) => `<path d="${x.d}" fill="${x.c}"/>`;
  return [
    `<rect x="${-BLEED}" y="${-TOP}" width="${SCENE_W + 2 * BLEED}" height="${SCENE_H + TOP}" fill="${SKY.day}"/>`,
    `<g transform="translate(${dx} ${SKY_FOOT - SKY_H * k}) scale(${k})">${sky.shapes.map(shape).join("")}${(sky.front ?? []).map(shape).join("")}</g>`,
    `<rect x="${-BLEED}" y="${SKY_FOOT}" width="${SCENE_W + 2 * BLEED}" height="${SCENE_H - SKY_FOOT}" fill="${sky.ground}"/>`,
    `<rect x="${-BLEED}" y="252" width="${SCENE_W + 2 * BLEED}" height="${SCENE_H - 252}" fill="#000" fill-opacity="0.07"/>`,
  ].join("");
};

// where each animal goes: spread across the scene, the large ones on the meadow, the small ones in front
export const place = (kinds: AnimalKind[]) => {
  const n = kinds.length;
  return kinds.map((kind, i) => {
    const { h, anchor } = ANIMALS[kind];
    const w = h * silhouette(kind).ratio;
    const cx = n === 1 ? SCENE_W / 2 : (n > 3 ? 150 : 210) + (i * (n > 3 ? 600 : 480)) / (n - 1);
    const base = SMALL.includes(kind) ? FRONT_Y : BACK_Y;
    const x = cx - w / 2;
    const y = base - h;
    return { kind, cx, x, y, w, h, base, hx: x + anchor[0] * w, hy: y + anchor[1] * h };
  });
};
