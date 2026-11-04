// The explainer film (2026-11-04; storyboard B, reworked the same day into one panel per feature): 25
// seconds on the Tour du Mont Blanc in seven panels, six showing one kind of information a trail page
// gives, from the trail's real data, each fading over to the next: the route on a map, the climbs and the
// ground underfoot, the climate by month, drinking water, wildlife, places to sleep; and last the
// invitation to explore the trails. The landscape (a sky
// from dawn to night, the Mont Blanc massif as the one ridge, a strip of meadow at its foot, the ground)
// and the walking hiker stay throughout; only the hiker moves in stop motion (src/lib/explainer/hiker.ts). The film's left and right edges are flat
// horizontal layers (sky, meadow, ground), so a full-width band behind it (backdrop()) continues them
// and the film sits in the page's column without a visible edge. Pure functions, shared by the poster
// (a static SVG built at build time, src/pages/explainer/) and the player (src/lib/explainer/player.ts):
//   state(data, layout, t) gives every changing value at second t,
//   film(data, layout, state, live) draws the scene with those values; with `live` every changing
//   attribute is marked (data-d="attr:key|…") so the player can update it frame by frame.

import { hikerFrame, WALK_FRAMES, STAND_FRAMES, FRAMES, STRIDE, LEG } from "./hiker";
import { cattleFrame, COW_WALK, COW_STAND, COW_FEET } from "./cattle";

export const DURATION = 25;
export const SCENES = [0, 3.5, 7, 10.5, 14, 17.5, 21]; // panel starts, seconds
export const WALK_UNTIL = 21; // the hiker stops for the night
export const FPS = 8; // the hiker's frames per second (stop motion)
export const POSTER_T = 20.2; // the still: the places to sleep, lit

export interface FilmData {
  slug: string;
  name: string;
  routeKm: number;
  loop: [number, number][]; // the route's outline, x and y in 0…1 (the longer side 1)
  profile: [number, number][]; // [km, m]
  minM: number;
  maxM: number;
  surface: [number, number, "natural" | "gravel" | "paved" | "unknown"][];
  // the trail page's climate chart, simplified: each month's mean night low and day high at the lowest
  // and the highest point, and the season's months (1–12)
  climate: { low: [number, number][]; high: [number, number][]; season: number[] };
  animals: { name: string; kind: string; level: string }[]; // the record's animals; the film draws cattle (a cow and her calf)
  massif: { d: string; c: string }[]; // the trail's skyline (src/lib/skylines.ts), 1600 × 320
  massifGround: string;
  sources: string[];
}

export interface Layout {
  kind: "wide" | "tall";
  W: number;
  H: number;
  horizon: number; // the meadow's top, where the massif stands
  groundTop: number; // the foreground's top, where the hiker walks and the well, the animals and the tent stand
  massifScale: number;
  massifX: number; // the skyline's x (0…1600) at the frame's centre
  profile: { x0: number; x1: number; top: number; bottom: number }; // the profile line, in the sky
  marks: { x0: number; x1: number }; // where the well, the animals and the tent stand, right of the hiker
  clim: { top: number; bottom: number }; // the climate chart's bars
  hiker: { x: number; scale: number };
  loop: { cx: number; cy: number; size: number };
  mark: number; // scale of the small marks (line widths, the climate's letters)
  sunR: number;
  sunTop: number;
  sunX: number; // the sun rises and sets here, clear of the profile line; the moon too
}
export const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    kind: "wide", W: 1600, H: 700, horizon: 560, groundTop: 592, massifScale: 1, massifX: 800,
    profile: { x0: 440, x1: 1330, top: 232, bottom: 335 }, marks: { x0: 520, x1: 1500 }, clim: { top: 232, bottom: 420 },
    hiker: { x: 250, scale: 2.2 },
    loop: { cx: 1000, cy: 370, size: 250 },
    mark: 3.2, sunR: 34, sunTop: 170, sunX: 1460,
  },
  tall: {
    kind: "tall", W: 800, H: 880, horizon: 760, groundTop: 790, massifScale: 0.8, massifX: 860,
    profile: { x0: 50, x1: 640, top: 330, bottom: 470 }, marks: { x0: 270, x1: 760 }, clim: { top: 330, bottom: 560 },
    hiker: { x: 120, scale: 2 },
    loop: { cx: 450, cy: 490, size: 230 },
    mark: 2.6, sunR: 28, sunTop: 300, sunX: 720,
  },
};

// ---- colours (flat; the night mixes each toward the night sky)
const SKY = { dawn: "#f2d8c2", day: "#d9e8e1", dusk: "#e7c0a2", night: "#1d2733" };
const FRONT = "#4c6420";
const LIGHT = "#ecebdb";
const ROUTE = "#a63d24";
const SURFACE: Record<string, string> = { natural: "#b26232", gravel: "#c9a64d", paved: "#50565c", unknown: "#d6ccbf" };
const NIGHT = "#141c24";
const CLIM_LOW = "#c46a1f"; // the lowest point (--clim-low)
const CLIM_HIGH = "#2a2f6e"; // the highest point (--clim-high)
const SEASON = "#ece7d2"; // the season's months, shaded
const CLIM_TEXT = "#6e6a5e";

// ---- small helpers
const f1 = (a: number) => String(Math.round(a * 10) / 10);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const smooth = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// in over [a, a+d], out over [b, b+d]
const inOut = (t: number, a: number, b: number, d = 0.5) => smooth(seg(t, a, a + d)) * (1 - smooth(seg(t, b, b + d)));
export const mix = (a: string, b: string, k: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  const c = [16, 8, 0].map((s) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp(k))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
};
const skyAt = (t: number) => {
  if (t < 2.9) return SKY.dawn;
  if (t < 4.1) return mix(SKY.dawn, SKY.day, smooth(seg(t, 2.9, 4.1)));
  if (t < 16.9) return SKY.day;
  if (t < 18.1) return mix(SKY.day, SKY.dusk, smooth(seg(t, 16.9, 18.1)));
  if (t < 20.6) return SKY.dusk;
  return mix(SKY.dusk, SKY.night, smooth(seg(t, 20.6, 22)));
};

// ---- geometry
const xAt = (d: FilmData, L: Layout, km: number) => L.profile.x0 + (km / d.routeKm) * (L.profile.x1 - L.profile.x0);
const elevAt = (d: FilmData, km: number) => {
  const p = d.profile;
  let i = 1;
  while (i < p.length - 1 && p[i][0] < km) i++;
  const [k0, m0] = p[i - 1], [k1, m1] = p[i];
  return k1 === k0 ? m0 : lerp(m0, m1, clamp((km - k0) / (k1 - k0)));
};
// the profile line's height for an elevation
const yOf = (d: FilmData, L: Layout, m: number) => L.profile.bottom - ((m - d.minM) / (d.maxM - d.minM)) * (L.profile.bottom - L.profile.top);
const loopLengths = new WeakMap<object, number[]>();
const loopAcc = (d: FilmData) => {
  let acc = loopLengths.get(d.loop);
  if (!acc) {
    acc = [0];
    for (let i = 1; i < d.loop.length; i++) acc.push(acc[i - 1] + Math.hypot(d.loop[i][0] - d.loop[i - 1][0], d.loop[i][1] - d.loop[i - 1][1]));
    loopLengths.set(d.loop, acc);
  }
  return acc;
};
const loopLength = (d: FilmData) => {
  const acc = loopAcc(d);
  return acc[acc.length - 1] + Math.hypot(d.loop[0][0] - d.loop.at(-1)![0], d.loop[0][1] - d.loop.at(-1)![1]);
};
// a point at share f (0…1) along the route's outline
const loopAt = (d: FilmData, f: number): [number, number] => {
  const acc = loopAcc(d);
  const target = clamp(f) * acc[acc.length - 1];
  let i = 1;
  while (i < acc.length - 1 && acc[i] < target) i++;
  const k = acc[i] === acc[i - 1] ? 0 : (target - acc[i - 1]) / (acc[i] - acc[i - 1]);
  return [lerp(d.loop[i - 1][0], d.loop[i][0], k), lerp(d.loop[i - 1][1], d.loop[i][1], k)];
};

export type State = Record<string, string>;

// every value that changes, at second t
export function state(d: FilmData, L: Layout, t: number): State {
  const S: State = {};
  const n = smooth(seg(t, 20.6, 22)); // night
  S.sky = skyAt(t);
  const u = clamp(t / 21);
  S.sun = `translate(${f1(L.sunX)} ${f1(L.horizon + 30 - (L.horizon + 30 - L.sunTop) * Math.sin(Math.PI * u))})`;
  S.sunO = f1(1 - seg(t, 20.8, 21.2));
  S.moonO = f1(smooth(seg(t, 21.2, 22.4)));
  S.starsO = f1(smooth(seg(t, 21.4, 23)));
  d.massif.forEach((m, i) => (S[`m${i}`] = mix(m.c, NIGHT, 0.72 * n)));
  S.meadow = mix(d.massifGround, NIGHT, 0.72 * n);
  S.front = mix(FRONT, NIGHT, 0.7 * n);

  // 1, the route: drawn on a card, then a dot goes round it
  S.pRoute = f1(inOut(t, 0, 3.0, 0.5));
  S.loopDash = (loopLength(d) * (1 - smooth(seg(t, 0.3, 2)))).toFixed(4);
  const [lx, ly] = loopAt(d, smooth(seg(t, 1.9, 3.1)));
  const { cx, cy, size } = L.loop;
  S.loopDot = `translate(${f1(cx - size / 2 + lx * size)} ${f1(cy - size / 2 + ly * size)})`;
  S.loopDotO = f1(seg(t, 1.8, 2));

  // 2, elevation and ground: the profile drawn as a line, left to right, coloured by the ground underfoot
  S.strip = f1(L.profile.x0 - 10 + smooth(seg(t, 3.7, 5.6)) * (L.profile.x1 - L.profile.x0 + 20));
  S.pProf = f1(inOut(t, 3.5, 6.5, 0.5));

  // 3, climate: the months' temperature ranges rise in, one month after another
  d.climate.low.forEach((_, i) => {
    const k = smooth(seg(t, 7.3 + i * 0.09, 7.8 + i * 0.09));
    S[`c${i}`] = `translate(0 ${f1((1 - k) * 24)})`;
    S[`co${i}`] = f1(k);
  });
  S.pClim = f1(inOut(t, 7, 10, 0.5));

  // 4, water: a village fountain rises out of the meadow, its spout starts to run, rings spread on the
  // trough's water
  S.well = `scale(1 ${f1(Math.max(0.001, smooth(seg(t, 10.6, 11.1))))})`;
  const flow = smooth(seg(t, 11.1, 11.5));
  S.streamO = f1(flow);
  S.stream = `M-11.5 -47 C-7 ${f1(-46 + Math.sin(t * 9) * 0.8)} ${f1(-4.6 + Math.sin(t * 7) * 0.7)} -38 -4.6 ${f1(-38 + 14 * flow)}`;
  for (let i = 0; i < 2; i++) {
    const r = ((t * 0.9 + i * 0.5) % 1);
    S[`rip${i}`] = f1(3 + r * 16);
    S[`ripO${i}`] = f1(flow * (1 - r));
  }
  S.pWater = f1(inOut(t, 10.5, 13.5, 0.3));

  // 5, wildlife: a suckler cow and her calf walk in from the right (in stop-motion steps), then stand
  const cowIn = 14.2, cowStop = 15.8;
  const cf = Math.floor(t * FPS);
  S.cattle = t < cowStop ? `w${cf % COW_WALK}` : `s${cf % COW_STAND}`;
  const walked = Math.floor((Math.min(t, cowStop) - cowIn) * FPS) / ((cowStop - cowIn) * FPS);
  S.cattlePos = `translate(${f1((1 - clamp(walked)) * 0.14 * L.W)} 0)`;
  S.cattleO = f1(seg(t, cowIn, cowIn + 0.15));
  S.pWild = f1(inOut(t, 14, 17, 0.4));

  // 6, a place to sleep: a tent pitched on the meadow, its lantern lit as the evening comes, the light
  // flickering a little (in steps, like the hiker)
  S.tent = `scale(1 ${f1(Math.max(0.001, smooth(seg(t, 17.8, 18.3))))})`;
  const lit = seg(t, 18.5, 18.8);
  S.glow = f1(lit * (0.82 + 0.18 * Math.abs(Math.sin(Math.floor(t * FPS) * 2.3))));
  S.pBeds = f1(inOut(t, 17.5, 20.6, 0.3));

  // the hiker: stop-motion frames at 8 a second, walking until the night
  const fr = Math.floor(t * FPS);
  const walking = t < WALK_UNTIL;
  S.hiker = walking ? `w${fr % WALK_FRAMES}` : `s${fr % STAND_FRAMES}`;
  const step = walking ? fr % FRAMES : Math.floor(WALK_UNTIL * FPS) % FRAMES;
  S.ground = `translate(${f1(-(step / FRAMES) * STRIDE * L.hiker.scale)} 0)`;
  return S;
}

// attributes that change: their value now, and with `live` a mark for the player
const dyn = (S: State, live: boolean, ...pairs: [string, string][]) =>
  pairs.map(([a, k]) => `${a}="${S[k]}"`).join(" ") + (live ? ` data-d="${pairs.map(([a, k]) => `${a}:${k}`).join("|")}"` : "");

const hash = (i: number) => Math.abs((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1);
// a village fountain (water from a pipe into a wooden trough), drawn on the ground at 0,0
const well = (S: State, live: boolean) =>
  // the post with its cap and a tin cup, the pipe
  `<rect x="-36" y="-66" width="11" height="66" rx="1.5" fill="#7f5410"/><rect x="-38" y="-70" width="15" height="6" rx="2" fill="#5e3e12"/>` +
  `<path d="M-25 -40 l3 0 l0 6 l-3 0Z" fill="#50565c"/><path d="M-21.5 -40 Q-20 -33 -21.5 -30" fill="none" stroke="#50565c" stroke-width="1"/><path d="M-24 -30 h6 l-0.8 6 h-4.4Z" fill="#c9cdd1"/>` +
  `<rect x="-25" y="-49" width="14" height="4" rx="1.6" fill="#50565c"/>` +
  // the stream, the trough with its water, the rings
  `<path ${dyn(S, live, ["d", "stream"], ["opacity", "streamO"])} fill="none" stroke="#86b6db" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M-20 -26 L40 -26 L37 -2 Q36 0 33 0 L-13 0 Q-16 0 -17 -2 Z" fill="#8a5a32"/>` +
  `<path d="M-20 -26 L40 -26 L39.4 -21 L-19.4 -21 Z" fill="#a8743f"/>` +
  `<rect x="-17.5" y="-24.6" width="54.5" height="3.2" rx="1.4" fill="#5d9cc8"/>` +
  `<path d="M-15 -12 H35 M-14 -6 H34" stroke="#6f4826" stroke-width="1.2"/>` +
  `<rect x="-12" y="0" width="8" height="2" fill="#5e3e12"/><rect x="26" y="0" width="8" height="2" fill="#5e3e12"/>` +
  [0, 1].map((i) => `<ellipse cx="-4.6" cy="-23" ry="1.4" fill="none" stroke="#d9ecf7" stroke-width="1" ${dyn(S, live, ["rx", `rip${i}`], ["opacity", `ripO${i}`])}/>`).join("");

// a tent with its door open and a lantern inside, its light spilling onto the meadow; on the ground at 0,0
const tent = (S: State, live: boolean) =>
  `<path d="M-60 16 L54 16 L92 6 L-30 6 Z" fill="#f3d98a" ${dyn(S, live, ["opacity", "glow"])}/>` +
  // guy lines and pegs
  `<path d="M-50 0 L0 -60 M50 0 L0 -60 M0 -60 L96 -52" stroke="#3b2f25" stroke-width="0.9" fill="none" opacity="0.5"/>` +
  `<path d="M0 -60 L78 -54 L104 0 L48 0 Z" fill="#8f3423"/>` +
  `<path d="M-48 0 L0 -60 L48 0 Z" fill="#b8452e"/>` +
  `<path d="M0 -60 L-2 -66" stroke="#3b2f25" stroke-width="2"/>` +
  // the open door: dark inside, then the lantern's light filling it
  `<path d="M-17 0 L0 -40 L17 0 Z" fill="#3a2a22"/>` +
  `<path d="M-17 0 L0 -40 L17 0 Z" fill="#f6c453" ${dyn(S, live, ["opacity", "glow"])}/>` +
  `<rect x="-3" y="-15" width="6" height="8" rx="1.5" fill="#fff6d8" ${dyn(S, live, ["opacity", "glow"])}/>` +
  // the door flaps tied back, a stripe along the bottom
  `<path d="M-17 0 L0 -40 L-24 -8 L-21 0 Z" fill="#d0613f"/><path d="M17 0 L0 -40 L24 -8 L21 0 Z" fill="#d0613f"/>` +
  `<path d="M-48 0 L48 0 L45 -4 L-45 -4 Z" fill="#8f3423"/>` +
  `<path d="M-52 2 l4 -4 M52 2 l-4 -4 M100 2 l-4 -4" stroke="#3b2f25" stroke-width="2"/>`;

// the foreground's grass, stones and flowers between x0 and x1 (film units), repeating every stride so
// they move on in steps under the hiker; the band behind the film draws the same pattern on its sides
export function tufts(L: Layout, x0: number, x1: number) {
  const tile = STRIDE * L.hiker.scale;
  const gy = L.groundTop;
  const grass = (x: number, y: number) => `<path d="M${f1(x - 9)} ${f1(y)} l3 -12 l3 10 l3 -15 l3 15 l3 -10 l3 12Z" fill="#3b5218"/>`;
  const stone = (x: number, y: number) => `<path d="M${f1(x - 9)} ${f1(y)} q1.5 -8 9 -8 q9 0 9 8Z" fill="#9a9a7e"/>`;
  const flower = (x: number, y: number, c: string) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.2" fill="${c}"/>`;
  const out: string[] = [];
  for (let i = Math.floor(x0 / tile) - 1; i * tile < x1 + tile; i++) {
    const xa = i * tile;
    out.push(grass(xa + 0.12 * tile, gy + 3) + stone(xa + 0.5 * tile, gy + 16) + grass(xa + 0.78 * tile, gy + 3) +
      flower(xa + 0.3 * tile, gy + 34, "#e8a800") + flower(xa + 0.66 * tile, gy + 58, "#f3f1ea"));
  }
  return out.join("");
}

// stop-motion frames for the player: a group the player knows by its state key (data-fs), one child
// per frame (data-f), all but the current one hidden
const frames = (key: string, S: State, list: string[][]) =>
  `<g data-fs="${key}">` + list.map(([id, svg]) => `<g data-f="${id}"${id === S[key] ? "" : ` display="none"`}>${svg}</g>`).join("") + `</g>`;

// the scene, drawn with the values of `S`
export function film(d: FilmData, L: Layout, S: State, live = false): string {
  const { W, H } = L;
  const out: string[] = [];
  // the sky, stars, moon and sun
  out.push(`<rect width="${W}" height="${H}" ${dyn(S, live, ["fill", "sky"])}/>`);
  const stars = Array.from({ length: 40 }, (_, i) =>
    `<circle cx="${f1(hash(i) * W)}" cy="${f1(10 + hash(i + 100) * (L.horizon - 80))}" r="${i % 5 ? 1.6 : 2.6}" fill="${LIGHT}"/>`).join("");
  out.push(`<g ${dyn(S, live, ["opacity", "starsO"])}>${stars}</g>`);
  const mx = L.sunX, my = L.sunTop, mr = L.sunR * 0.8;
  out.push(`<g ${dyn(S, live, ["opacity", "moonO"])}><circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="${LIGHT}"/><circle cx="${f1(mx + mr * 0.45)}" cy="${f1(my - mr * 0.25)}" r="${f1(mr * 0.9)}" fill="${SKY.night}"/></g>`);
  out.push(`<g ${dyn(S, live, ["transform", "sun"], ["opacity", "sunO"])}><circle r="${L.sunR}" fill="#f6c453"/></g>`);
  // the massif on its meadow; both run out flat at the frame's edges
  const ms = L.massifScale, my0 = L.horizon - 320 * ms;
  out.push(`<g transform="translate(${f1(W / 2 - L.massifX * ms)} ${f1(my0)}) scale(${ms})">${d.massif.map((s, i) => `<path d="${s.d}" ${dyn(S, live, ["fill", `m${i}`])}/>`).join("")}</g>`);
  out.push(`<rect y="${L.horizon - 1}" width="${W}" height="${H - L.horizon + 1}" ${dyn(S, live, ["fill", "meadow"])}/>`);

  // panel 1: the route on a card
  const { cx, cy, size } = L.loop;
  const loopD = "M" + d.loop.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(" L") + "Z";
  out.push(
    `<g ${dyn(S, live, ["opacity", "pRoute"])}>` +
      `<g transform="translate(${f1(cx - size / 2)} ${f1(cy - size / 2)}) scale(${f1(size)})">` +
      `<rect x="-0.12" y="-0.12" width="1.24" height="1.24" rx="0.08" fill="#f9f8f0"/>` +
      `<path d="${loopD}" fill="none" stroke="${ROUTE}" stroke-width="${(5 / size).toFixed(4)}" stroke-linejoin="round" stroke-dasharray="${loopLength(d).toFixed(4)}" ${dyn(S, live, ["stroke-dashoffset", "loopDash"])}/>` +
      `<circle cx="${d.loop[0][0].toFixed(4)}" cy="${d.loop[0][1].toFixed(4)}" r="${(9 / size).toFixed(4)}" fill="${ROUTE}"/></g>` +
      `<g ${dyn(S, live, ["transform", "loopDot"], ["opacity", "loopDotO"])}><circle r="11" fill="${LIGHT}"/><circle r="7" fill="${ROUTE}"/></g>` +
      `</g>`,
  );

  // the foreground, flat, its tufts moving on in steps under the hiker (kept clear of the frame's edges)
  out.push(`<rect y="${L.groundTop}" width="${W}" height="${H - L.groundTop}" ${dyn(S, live, ["fill", "front"])}/>`);
  const gy = L.groundTop;
  out.push(`<g ${dyn(S, live, ["transform", "ground"])}>${tufts(L, -2 * STRIDE * L.hiker.scale, W)}</g>`);

  // panel 2: the elevation profile as a line in the sky, each stretch in the colour of its ground
  const line = d.surface.map(([a, b, c]) => {
    const pts = [[a, elevAt(d, a)], ...d.profile.filter(([km]) => km > a && km < b), [b, elevAt(d, b)]];
    return `<path d="M${pts.map(([km, m]) => `${f1(xAt(d, L, km))} ${f1(yOf(d, L, m))}`).join(" L")}" fill="none" stroke="${SURFACE[c]}" stroke-width="${f1(2.2 * L.mark)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("");
  out.push(`<clipPath id="ex-strip-${L.kind}"><rect x="0" y="0" height="${H}" ${dyn(S, live, ["width", "strip"])}/></clipPath>`);
  out.push(`<g ${dyn(S, live, ["opacity", "pProf"])}><g clip-path="url(#ex-strip-${L.kind})">${line}</g></g>`);

  // panel 3: the trail page's climate chart, simplified, on a card: twelve month columns, the season's
  // months shaded, in each a range bar from night low to day high for the lowest point (orange) and the
  // highest point (navy), as the chart draws them; the months' initials beneath
  const { x0, x1 } = L.profile;
  const { top, bottom } = L.clim;
  const all = [...d.climate.low, ...d.climate.high].flat();
  const lo = Math.min(...all) - 2, hi = Math.max(...all) + 2;
  const yT = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const cw = Math.min(x1 - x0, L.kind === "wide" ? 640 : 560), cx0 = (x0 + x1) / 2 - cw / 2;
  const step = cw / 12, bw = step * 0.3, pad = 9 * L.mark;
  out.push(`<g ${dyn(S, live, ["opacity", "pClim"])}>` +
    `<rect x="${f1(cx0 - pad)}" y="${f1(top - pad)}" width="${f1(cw + 2 * pad)}" height="${f1(bottom - top + 2 * pad + 9 * L.mark)}" rx="${f1(4 * L.mark)}" fill="#f9f8f0"/>` +
    d.climate.low.map((_, i) => {
      const mx0 = cx0 + i * step, inSeason = d.climate.season.includes(i + 1);
      const bar = (r: [number, number], x: number, c: string) =>
        `<rect x="${f1(x)}" y="${f1(yT(r[1]))}" width="${f1(bw)}" height="${f1(Math.max(2, yT(r[0]) - yT(r[1])))}" rx="${f1(bw / 2)}" fill="${c}"/>`;
      return (inSeason ? `<rect x="${f1(mx0 + 1)}" y="${f1(top - pad * 0.5)}" width="${f1(step - 2)}" height="${f1(bottom - top + pad)}" rx="${f1(2 * L.mark)}" fill="${SEASON}"/>` : "") +
        `<g ${dyn(S, live, ["transform", `c${i}`], ["opacity", `co${i}`])}>` +
        bar(d.climate.low[i], mx0 + step / 2 - bw - 1.5, CLIM_LOW) + bar(d.climate.high[i], mx0 + step / 2 + 1.5, CLIM_HIGH) + `</g>` +
        `<text x="${f1(mx0 + step / 2)}" y="${f1(bottom + 7.5 * L.mark)}" text-anchor="middle" font-size="${f1(5.4 * L.mark)}" font-weight="600" fill="${CLIM_TEXT}" font-family="system-ui, sans-serif">${"JFMAMJJASOND"[i]}</text>`;
    }).join("") + `</g>`);

  // panel 4: drinking water, a village fountain on the meadow
  const propScale = L.hiker.scale;
  const px = L.marks.x0 + (L.marks.x1 - L.marks.x0) * 0.3;
  out.push(`<g ${dyn(S, live, ["opacity", "pWater"])}><g transform="translate(${f1(px)} ${f1(L.groundTop + 4)}) scale(${f1(propScale)})"><g ${dyn(S, live, ["transform", "well"])}>${well(S, live)}</g></g></g>`);

  // panel 5: wildlife, a suckler cow and her calf in front of the massif, in stop motion like the hiker
  if (d.animals.some((a) => a.kind === "cattle")) {
    const cs = L.hiker.scale * 0.95;
    const cx = L.marks.x0 + (L.marks.x1 - L.marks.x0) * 0.3, cy = L.groundTop + 6 - COW_FEET * cs;
    const cframes = live
      ? frames("cattle", S, [...Array.from({ length: COW_WALK }, (_, i) => [`w${i}`, cattleFrame(i, true)]), ...Array.from({ length: COW_STAND }, (_, i) => [`s${i}`, cattleFrame(i, false)])])
      : cattleFrame(Number(S.cattle.slice(1)), S.cattle[0] === "w");
    out.push(`<g ${dyn(S, live, ["opacity", "pWild"])}><g ${dyn(S, live, ["transform", "cattlePos"], ["opacity", "cattleO"])}><g transform="translate(${f1(cx)} ${f1(cy)}) scale(${f1(cs)})">${cframes}</g></g></g>`);
  }

  // panel 6: a place to sleep, a tent with its lantern lit
  out.push(`<g ${dyn(S, live, ["opacity", "pBeds"])}><g transform="translate(${f1(px)} ${f1(L.groundTop + 4)}) scale(${f1(propScale * 0.95)})"><g ${dyn(S, live, ["transform", "tent"])}>${tent(S, live)}</g></g></g>`);

  // the hiker: every frame for the player, the current one for the poster
  const hy = gy - LEG * L.hiker.scale + 7 * L.hiker.scale;
  const hframes = live
    ? frames("hiker", S, [...Array.from({ length: WALK_FRAMES }, (_, i) => [`w${i}`, hikerFrame(i, true)]), ...Array.from({ length: STAND_FRAMES }, (_, i) => [`s${i}`, hikerFrame(i, false)])])
    : hikerFrame(Number(S.hiker.slice(1)), S.hiker[0] === "w");
  out.push(`<g transform="translate(${f1(L.hiker.x)} ${f1(hy)}) scale(${L.hiker.scale})">${hframes}</g>`);
  return out.join("");
}

// The full-width band behind the film: the film's edge layers (sky, meadow, ground) as flat bands at
// the same heights, in the same colours, the ground's grass, and stars at night. No viewBox: heights in % of the band
// (which is as tall as the film), star radii in px.
export function backdrop(L: Layout, S: State, live = false): string {
  const pc = (y: number) => `${f1((y / L.H) * 100)}%`;
  const stars = Array.from({ length: 70 }, (_, i) =>
    `<circle cx="${f1(hash(i + 300) * 100)}%" cy="${f1(2 + hash(i + 400) * ((L.horizon - 80) / L.H) * 100)}%" r="${i % 5 ? 1.4 : 2.2}" fill="${LIGHT}"/>`).join("");
  return (
    `<rect width="100%" height="100%" ${dyn(S, live, ["fill", "sky"])}/>` +
    `<g ${dyn(S, live, ["opacity", "starsO"])}>${stars}</g>` +
    `<rect y="${pc(L.horizon)}" width="100%" height="${pc(L.H - L.horizon)}" ${dyn(S, live, ["fill", "meadow"])}/>` +
    `<rect y="${pc(L.groundTop)}" width="100%" height="${pc(L.H - L.groundTop)}" ${dyn(S, live, ["fill", "front"])}/>` +
    // the film's grass continued on both sides, in film units; the page's script places this group on
    // the film (its left edge and scale), so the two patterns line up
    `<g class="ex-bd-ground"><g ${dyn(S, live, ["transform", "ground"])}>${tufts(L, -1400, L.W + 1400)}</g></g>`
  );
}

// the opening title, and one title per panel: the kind of information it shows
export const OPENING = "For every trail you will find…";
export function captions(d: FilmData) {
  return {
    scenes: [
      { head: "Route", text: `On a map, from official and open sources; here the ${d.name}.` },
      { head: "Elevation and ground underfoot", text: "Every climb and descent, and whether the path is natural ground, gravel or road." },
      { head: "Climate, month by month", text: "Day highs and night lows at the lowest and the highest point, and the best months to go." },
      { head: "Drinking water", text: "Taps, fountains and springs along the way, and the longest stretch without." },
      { head: "Wildlife to know about", text: `Animals worth knowing about, with what to do in the official source's words${d.animals.length ? `; here ${d.animals.map((a) => a.name.toLowerCase()).join(", ")}` : ""}.` },
      { head: "Places to sleep", text: "Huts, campsites, hostels and rooms along the trail." },
      { head: "Find the trail that suits you", text: "Every figure names its source, so trails compare the same way." },
    ],
    sources: `${d.name}; ${d.sources.join("; ")}.`,
  };
}
