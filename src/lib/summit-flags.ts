// Where the home page's summit flags stand (issue #212): on real summits of the hero's three ridges,
// found at build time from their paths. Shared by the poles (src/components/SummitPoles.astro, each
// layered just behind its own ridge, so the ridge hides the pole's foot) and the pennants with their
// numbers (src/components/HeroStats.astro, above all ridges, so no ridge covers the words).

// the ridges as index.astro draws them (.hb-ridge r0, r1, r2: back to front): each path in a
// 1000 × 110 box, stretched from -3 % to 103 % of the band, this tall, drifting by this depth
export const RIDGE_HEIGHTS = [230, 160, 95];
export const RIDGE_DEPTHS = [-0.6, -1.3, -2.2];
// where on the band the five flags stand (a share of its width), and on which ridge: the back ridge
// for the second and fourth, the middle ridge for the third, the front one at the sides, an M; so on a
// phone each pole ends above its neighbour's words and never runs through them
const SPOTS = [0.12, 0.31, 0.5, 0.69, 0.9];
const ON_RIDGE = [2, 0, 1, 0, 2];

export type SummitFlag = { i: number; ridge: number; x: number; y: number; flip: boolean };

const points = (d: string) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
const toRidge = (share: number) => ((share + 0.03) / 1.06) * 1000;

// the summit (the smallest y) of a ridge within a window round a place on the band
export function summit(d: string, share: number, reach = 55): [number, number] {
  const x0 = toRidge(share);
  const near = points(d).filter(([x]) => Math.abs(x - x0) <= reach);
  const top = near.reduce((a, b) => (b[1] < a[1] ? b : a), near[0] ?? [x0, 80]);
  return [top[0], top[1]];
}

// the five flags: x and y in the ridge's 1000 × 110 box; on the band's right half the words go left
export function summitFlags(ridges: string[]): SummitFlag[] {
  return SPOTS.map((share, i) => {
    const ridge = ON_RIDGE[i];
    const [x, y] = summit(ridges[ridge] ?? ridges[0] ?? "", share);
    return { i, ridge, x, y, flip: x > 500 };
  });
}

// a flag's place inside its ridge's layer (CSS left and bottom)
export const flagPlace = (f: SummitFlag) => `left:${f.x / 10}%;bottom:${(1 - f.y / 110) * 100}%`;
