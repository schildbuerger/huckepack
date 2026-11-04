// The explainer's hiker (2026-11-04; of three looks, C "Rain or shine", chosen as gender neutral): a rig
// of flat shapes (hip, knee, ankle, shoulder, elbow, head) posed for each frame of a walk cycle and held
// like stop-motion photographs: 10 poses per cycle of two steps at 8 frames a second, every part shifting
// a hair from frame to frame ("boil", repeating every LOOP cycles), a squash on each footfall, the pack
// bouncing a beat after the body. Pure string building, shared by the poster (built at build time) and
// the player (in the browser). Local frame: the hip at 0,0, the feet about 50 units below, facing +x.

const TAU = Math.PI * 2;
export const FRAMES = 10; // poses per walk cycle
export const CYCLE = 1.25; // seconds per walk cycle: 8 frames a second
export const LOOP = 3; // cycles before the boil and the blink repeat
export const WALK_FRAMES = FRAMES * LOOP;
export const STAND_FRAMES = 8;
export const LEG = 50; // hip to sole, in figure units
export const STRIDE = 4 * LEG * Math.sin((24 * Math.PI) / 180); // ground covered per cycle, figure units
const LEAN = 10;

const C = {
  skin: "#f0c4a0",
  cheek: "#ec9c86",
  hair: "#b2582a",
  coat: "#f2c230",
  legs: "#2a3a5a",
  shoe: "#5a3d26",
  sole: "#2a1f17",
  cover: "#c0392b",
  pole: "#50565c",
  ink: "#25261c",
};

const f1 = (a: number) => String(Math.round(a * 100) / 100);
const at = (x: number, y: number, inner: string) => `<g transform="translate(${f1(x)} ${f1(y)})">${inner}</g>`;
const rot = (a: number, inner: string) => `<g transform="rotate(${f1(a)})">${inner}</g>`;
const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d: string, stroke: string, w: number) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
// a flat shade: the colour mixed toward black (far limbs, seams); still one flat colour per shape
export const shade = (hex: string, k = 0.22) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
};

// ---- the walk cycle (degrees) at phase p, scaled by a (1 walking, 0 standing)
const leg = (p: number, a: number) => {
  const thigh = -24 * Math.cos(TAU * p) * a;
  const knee = 5 + 46 * Math.max(0, Math.sin(TAU * (p - 0.5))) * a;
  const foot = (16 * Math.max(0, Math.sin(TAU * (p - 0.33))) ** 2 - 10 * Math.max(0, Math.cos(TAU * p)) ** 6) * a;
  return { thigh, knee, ankle: foot - thigh - knee };
};
const arm = (p: number, a: number) => ({
  shoulder: 22 * Math.cos(TAU * p) * a,
  elbow: -24 - 14 * Math.max(0, -Math.cos(TAU * p)) * a,
});

// deterministic jitter per frame and part
const rand = (seed: number) => {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
};
let boilFrame = 0;
let boilPart = 0;
const boil = (inner: string, amp = 1) => {
  const s = boilFrame * 97 + ++boilPart * 13;
  return `<g transform="translate(${f1(rand(s) * 0.7 * amp)} ${f1(rand(s + 1) * 0.7 * amp)}) rotate(${f1(rand(s + 2) * 2.2 * amp)})">${inner}</g>`;
};

const boot = (far: boolean) => {
  const c = far ? shade(C.shoe) : C.shoe;
  return (
    path("M-5.2 -7 L3.8 -7 Q5.6 -7 6.2 -3.6 Q11.8 -2.6 13.2 1.4 L13.2 3 L-5.8 3 Q-6.6 -2 -5.2 -7Z", c) +
    path("M6.2 -3.6 Q11.8 -2.6 13.2 1.4 L13.2 3 L8.4 3 Q8.6 -1.4 6.2 -3.6Z", shade(c, 0.18)) +
    rr(-6.4, 2.6, 20, 3, 1, C.sole) +
    rr(-6.4, 2.6, 5.4, 4, 1, C.sole) +
    [0, 1, 2].map((i) => rr(0.6 + i * 1.8, -5.8 + i * 1.3, 2.6, 0.9, 0.4, far ? "#8a7a66" : "#d9c9a8")).join("")
  );
};
const legShape = (a: { thigh: number; knee: number; ankle: number }, far: boolean) => {
  const legs = far ? shade(C.legs) : C.legs;
  const thigh = path("M-6.4 -3 Q0 -6.5 6.6 -3 L5.2 24.6 Q0 27.6 -5.2 24.6Z", legs) + line("M1.5 -1 L1 23", shade(legs, 0.3), 0.9);
  const shin =
    `<circle cx="0" cy="0" r="5.2" fill="${legs}"/>` +
    path("M-4.8 -1.4 C-6.8 5 -6 13 -4 21.6 L3.8 21.6 C4.6 13 5.2 5 4.8 -1.4Z", legs) +
    path("M-4.6 17 L4.2 17 L4.6 22.4 L-4.8 22.4Z", shade(legs, 0.2));
  return boil(rot(a.thigh, thigh + at(0, 24, rot(a.knee, shin + at(0, 22, rot(a.ankle, boot(far)))))));
};
const pole = (far: boolean) =>
  rr(-1.1, -4, 2.2, 62, 1, far ? shade(C.pole) : C.pole) +
  rr(-2, -6, 4, 11, 1.8, C.ink) +
  `<ellipse cx="0" cy="52" rx="3.6" ry="1.2" fill="${C.ink}"/>` +
  line("M-1.5 -5 Q-6 2 -2 7", C.ink, 0.9);
const armShape = (a: { shoulder: number; elbow: number }, far: boolean) => {
  const sleeve = far ? shade(C.coat) : C.coat;
  const poleA = a.shoulder * 0.7 - a.shoulder - a.elbow - LEAN;
  const lower = at(0, 17.5, rot(a.elbow,
    at(0, 16, rot(poleA, pole(far))) +
    path("M-4 -1.2 L4 -1.2 L3.3 14 L-3.3 14Z", sleeve) +
    rr(-3.8, 10.6, 7.6, 3, 1.2, shade(sleeve, 0.18)) +
    path("M-3.6 12.6 Q-5 18 -1.2 19.8 Q4.2 20.2 4 15 Q3.8 12.2 0 12.4Z", far ? shade(C.skin) : C.skin)));
  return boil(rot(a.shoulder, path("M-4.8 -2.4 Q0 -4.6 4.8 -2.4 L4 18.6 Q0 20.6 -4 18.6Z", sleeve) + `<circle cx="0" cy="17.5" r="4" fill="${sleeve}"/>` + lower));
};
// the pack under its red rain cover, with two reflective stripes
const pack = () =>
  path("M-7.6 -40 Q-24 -43 -27 -30 Q-29 -14 -25 -2 Q-16 2 -7.6 -1Z", C.cover) +
  line("M-26.6 -30 Q-28.6 -14 -25 -2", shade(C.cover, 0.25), 1.6) +
  rr(-24, -24, 9, 2, 1, "#f3f1ea") +
  rr(-24, -21, 9, 2, 1, "#f3f1ea");
const torso = () =>
  path("M-8.6 -7 L8.6 -7 L7.6 4.2 Q0 6.4 -7.6 4.2Z", C.legs) +
  path("M-9 -39 Q-11 -20 -10.4 6 L10.2 6 Q11 -20 9.2 -39 Q0 -43 -9 -39Z", C.coat) +
  line("M8.2 -36 L8.8 5", shade(C.coat, 0.28), 1.2) +
  rr(1, -17, 8, 3, 1, shade(C.coat, 0.16)) +
  rr(-10.4, 3, 20.6, 3, 1.4, shade(C.coat, 0.12)) +
  line("M-7 -39 Q1 -36.5 5.6 -21", shade(C.cover, 0.3), 2.6);
const head = (frame: number) => {
  const face = "M-6.6 -5.4 Q-9 -14 -4.2 -19.4 Q2 -22.6 6.8 -17.6 Q8.4 -15 8.2 -12.4 L10.2 -10 Q10.4 -9 8.4 -8.4 Q8.4 -5.2 6 -3.6 Q2 -1.8 -1.2 -2.8 Q-5.2 -2.6 -6.6 -5.4Z";
  // a blink: the eye closes on one frame in thirty
  const eye = frame % 30 === 21 ? rr(4.4, -12.7, 2.6, 0.7, 0.3, C.ink) : `<ellipse cx="5.6" cy="-12.6" rx="1" ry="1.3" fill="${C.ink}"/>`;
  return (
    rr(-3.2, -6, 6.4, 7, 2, shade(C.skin, 0.1)) +
    path(face, C.skin) +
    `<ellipse cx="-0.6" cy="-11" rx="1.9" ry="2.6" fill="${shade(C.skin, 0.12)}"/>` +
    `<circle cx="4.4" cy="-8.2" r="1.9" fill="${C.cheek}"/>` +
    eye +
    line("M3.6 -15.4 L7 -15.8", shade(C.hair, 0.2), 0.9) +
    path("M2 -17 Q4 -15.6 6.8 -16.4 Q4.4 -13.8 1.6 -14.6Z", C.hair) +
    [[2.6, -9.8], [4.2, -10.4], [6.6, -9.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.45" fill="${shade(C.skin, 0.35)}"/>`).join("") +
    // the hood, up
    path("M8.2 -17.4 Q6 -23.6 -0.6 -24.4 Q-9.6 -24 -10.6 -14 Q-11 -4 -6 1 L-2 -2 Q-6.4 -6 -6.2 -12 Q-5.6 -18.6 1 -18.4 Q5 -18.6 8.2 -17.4Z", C.coat) +
    line("M8.2 -17.4 Q5 -18.6 1 -18.4 Q-5.6 -18.6 -6.2 -12 Q-6.4 -6 -2 -2", shade(C.coat, 0.3), 1.4) +
    `<circle cx="-2.6" cy="-1.8" r="0.9" fill="${shade(C.coat, 0.4)}"/>`
  );
};

// One frame: walking frames 0 … WALK_FRAMES-1 (the pose is frame % FRAMES), or standing (the boil
// only, a little breath), frames 0 … STAND_FRAMES-1.
export function hikerFrame(frame: number, walking: boolean): string {
  boilFrame = walking ? frame : 500 + frame;
  boilPart = 0;
  const p = walking ? (frame % FRAMES) / FRAMES : 0.25;
  const a = walking ? 1 : 0;
  const n = leg(p, a), f = leg(p + 0.5, a), na = arm(p, a), fa = arm(p + 0.5, a);
  if (!walking) {
    n.thigh = -5; n.ankle = -n.thigh - n.knee;
    f.thigh = 4; f.ankle = -f.thigh - f.knee;
  }
  const contact = walking ? Math.abs(Math.cos(TAU * p)) ** 4 : 0;
  const sq = walking ? 0.04 * contact - 0.015 * (1 - contact) : 0.012 * Math.sin((TAU * frame) / STAND_FRAMES);
  const bob = walking ? -3.4 * (1 - Math.abs(Math.cos(TAU * p))) : 0;
  const lean = walking ? LEAN : 4;
  const torsoFrame = (inner: string) => `<g transform="rotate(${lean}) scale(${f1(1 + sq / 2)} ${f1(1 - sq)})">${inner}</g>`;
  const packLag = walking ? 3 * Math.sin(TAU * 2 * (p - 0.12)) : 0;
  const nod = walking ? 2 * Math.sin(TAU * 2 * (p - 0.05)) : -6; // standing: looking up a little
  return at(
    rand(boilFrame * 7) * 1.2,
    bob + rand(boilFrame * 7 + 3) * 0.8,
    torsoFrame(at(0, -35, armShape(fa, true))) +
      legShape(f, true) +
      torsoFrame(boil(at(-8, -8, rot(packLag, at(8, 8, pack())))) + boil(torso(), 0.6) + boil(at(2, -45, rot(nod, head(frame))), 0.8)) +
      legShape(n, false) +
      torsoFrame(at(0, -35, armShape(na, false))),
  );
}
