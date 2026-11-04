// The explainer's suckler cow and her calf (the Tour du Mont Blanc's most serious wildlife entry,
// 2026-11-04): drawn and moved like the hiker (src/lib/explainer/hiker.ts), a rig of flat shapes in a
// Brown Swiss coat (body, head with a pale muzzle, horns and ears, udder, a tail with a tuft, four
// jointed legs with hooves) posed for each frame and held like stop motion at 8 frames a second, every
// part shifting a hair from frame to frame. They walk in slowly (a lateral walk: back left, front left,
// back right, front right), then stand: the cow swishes her tail and flicks an ear, the calf beside her.
// Local frame: between the cow's shoulders and hips at 0,0, the hooves about 42 units below, facing left
// (−x), towards the hiker.

const TAU = Math.PI * 2;
export const COW_WALK = 12; // poses per walk cycle (a slow walk)
export const COW_STAND = 8; // poses per tail swish
export const COW_FEET = 42;

const COW = { coat: "#8c6a4f", shade: "#755740", far: "#5e4536", muzzle: "#dcc9b1", ink: "#2e241c", horn: "#efe6d2", udder: "#e0a596" };
const CALF = { coat: "#b08a6a", shade: "#987456", far: "#7f6049", muzzle: "#eadbc6", ink: "#2e241c", horn: "#efe6d2", udder: "#e0a596" };
type Coat = typeof COW;

const f1 = (a: number) => String(Math.round(a * 100) / 100);
const at = (x: number, y: number, inner: string) => `<g transform="translate(${f1(x)} ${f1(y)})">${inner}</g>`;
const rot = (a: number, inner: string) => `<g transform="rotate(${f1(a)})">${inner}</g>`;
const sc = (k: number, inner: string) => `<g transform="scale(${f1(k)})">${inner}</g>`;
const path = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;

const rand = (seed: number) => {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
};
let seed = 0, part = 0;
const boil = (inner: string, amp = 1) => {
  const s = seed * 131 + ++part * 17;
  return `<g transform="translate(${f1(rand(s) * 0.7 * amp)} ${f1(rand(s + 1) * 0.7 * amp)}) rotate(${f1(rand(s + 2) * 1.6 * amp)})">${inner}</g>`;
};

// one leg from hip or shoulder: upper part, lower part from the knee or hock, the hoof kept flat
const leg = (upper: number, lower: number, fill: string, ink: string, back: boolean) => {
  const top = back
    ? "M-8 -10 C-9 2 -7 12 -5 20 L5 20 C6 12 8 2 7 -10 Z" // the haunch
    : "M-6.4 -8 C-7 2 -6 12 -4.6 20 L4.6 20 C5.6 12 6.6 2 6 -8 Z";
  return rot(upper,
    path(top, fill) +
    at(0, 19, rot(lower,
      `<circle r="4.4" fill="${fill}"/>` + path("M-4 0 L4 0 L3.4 18 L-3.4 18 Z", fill) +
      at(0, 18, rot(-upper - lower, path("M-4.4 0 L4.2 0 L4.8 4.6 L-4.8 4.6 Z", ink))))));
};

// one animal's frame; `calf` draws the calf (no horns or udder, rounder)
function animal(c: Coat, frame: number, walking: boolean, calf: boolean): string {
  const p = walking ? frame / COW_WALK : 0;
  const a = walking ? 1 : 0;
  const pose = (q: number, back: boolean) => {
    const upper = 15 * Math.cos(TAU * q) * a + (walking ? 0 : back ? -2 : 2);
    const lift = Math.max(0, Math.sin(TAU * (q - 0.5)));
    return { upper, lower: (back ? 16 : -24) * lift * a };
  };
  const bl = pose(p, true), fl = pose(p + 0.25, false), br = pose(p + 0.5, true), fr = pose(p + 0.75, false);
  const bob = walking ? -1.2 * Math.abs(Math.sin(TAU * 2 * p)) : 0.5 * Math.sin((TAU * frame) / COW_STAND);
  const swish = walking ? 6 * Math.sin(TAU * p) : 16 * Math.sin((TAU * frame) / COW_STAND);
  const nod = walking ? 3 * Math.sin(TAU * 2 * p) : calf ? -4 : 2 * Math.sin((TAU * frame) / COW_STAND);
  const flick = !walking && !calf && frame % COW_STAND === 5 ? -24 : 0;

  const tail = at(50, -32, rot(8 + swish,
    path("M-1.6 0 C-1 14 -0.6 30 -1.2 44 L1.6 44 C2 30 2 14 1.6 0 Z", c.shade) +
    path("M-3.6 42 C-5 48 -3 56 0 58 C3 56 5 48 3.6 42 Z", c.ink)));
  const body =
    path("M-46 -30 C-40 -40 -10 -42 10 -40 C28 -42 46 -42 54 -32 C60 -22 58 -4 50 4 C40 10 20 8 4 8 C-14 9 -32 8 -42 2 C-52 -6 -52 -22 -46 -30 Z", c.coat) +
    path("M36 -38 C46 -40 54 -34 56 -24 C52 -28 44 -34 36 -38 Z", c.shade) +
    path("M-40 2 C-28 7 -12 8 4 8 C-10 5 -26 4 -40 2 Z", c.shade) +
    (calf ? "" : path("M24 6 C26 14 36 15 38 7 C34 9 28 9 24 6 Z", c.udder));
  const head = at(-46, -26, rot(nod,
    // the neck, then the long face reaching down and forward to the pale muzzle
    path("M12 -12 C2 -16 -10 -15 -16 -10 L-12 16 C-4 18 6 12 14 4 Z", c.coat) +
    path("M-12 -15 C-19 -17 -25 -13 -27 -7 L-37 17 C-39 23 -34 28 -28 27 L-21 26 C-15 22 -11 13 -9 3 C-8 -5 -8 -12 -12 -15 Z", c.coat) +
    path("M-9 3 C-11 13 -15 22 -21 26 L-17 25 C-13 20 -10 12 -9 3 Z", c.shade) +
    path("M-37 15 C-39 22 -35 28 -28 27 C-24 26.4 -22 23.4 -23 19.6 C-28 20.4 -33 18.6 -37 15 Z", c.muzzle) +
    `<ellipse cx="-33.4" cy="22.6" rx="1.4" ry="1" fill="${c.ink}"/>` +
    `<circle cx="-20.6" cy="-3" r="${calf ? 1.8 : 1.6}" fill="${c.ink}"/>` +
    // an ear sideways (it flicks now and then) and, on the cow, short curved horns
    at(-11, -10, rot(18 + flick, path("M0 0 C7 -3 13 -1 15 3 C10 6 4 5 0 2 Z", c.shade) + path("M3 1 C8 0 11 1.4 12.4 3 C9 4 6 3.6 3 2.2 Z", c.udder))) +
    (calf ? "" : path("M-21 -14 C-24 -21 -21 -27 -15 -28 C-17 -25 -18 -20 -16 -15 Z", c.horn) + path("M-15 -28 C-17 -27.6 -18 -26.4 -18.2 -25 L-16.2 -25.6 Z", c.ink))));

  return at(rand(seed * 7) * 0.8, bob + rand(seed * 7 + 3) * 0.6,
    boil(tail) +
    at(38, 0, boil(leg(br.upper, br.lower, c.far, c.ink, true))) +
    at(-34, 0, boil(leg(fr.upper, fr.lower, c.far, c.ink, false))) +
    boil(body, 0.4) +
    boil(head, 0.7) +
    at(42, 0, boil(leg(bl.upper, bl.lower, c.coat, c.ink, true))) +
    at(-30, 0, boil(leg(fl.upper, fl.lower, c.coat, c.ink, false))),
  );
}

// one frame of the cow with her calf at her side (half a step out of time with her), walking frames
// 0 … COW_WALK-1, or standing frames 0 … COW_STAND-1
export function cattleFrame(frame: number, walking: boolean): string {
  seed = (walking ? 0 : 400) + frame;
  part = 0;
  const calf = sc(0.56, animal(CALF, walking ? (frame + COW_WALK / 2) % COW_WALK : (frame + 3) % COW_STAND, walking, true));
  seed = (walking ? 900 : 1300) + frame;
  part = 0;
  const cow = animal(COW, frame, walking, false);
  // the calf just behind her, on the far side, its hooves on the same ground
  return at(96, COW_FEET - 0.56 * COW_FEET, calf) + cow;
}
