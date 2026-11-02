// A trail's link-preview image (Open Graph, 1200 × 630; review of 2026-10-30, #16; of three
// previews, approach C: the trail page's key-figure strip with the season months and the ground
// underfoot; since issue #146, 2026-11-02, the trail's skyline in place of that last row where it has
// one), drawn as SVG and rasterised to PNG with sharp at build time (src/pages/og/[slug].png.ts). The text is drawn as outlines from Source Serif 4
// (SIL Open Font License, @fontsource/source-serif-4), so the image looks the same on any machine
// that builds it; the site's own serif stack is system fonts, which a build server doesn't have.
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import sharp from "sharp";
import { SKYLINES, SKY_W, SKY_H, profileRidge } from "./skylines";
import { SKY } from "./sky";

export const OG = { width: 1200, height: 630 };

// the light theme's tokens (src/layouts/Base.astro): link previews show on any background, and the
// cream page is the site's face
export const C = {
  bg: "#f9f8f0",
  surface: "#efeee0",
  text: "#25261c",
  muted: "#61624c",
  line: "#e0dfcc",
  accent: "#5a7526",
  natural: "#b26232",
  gravel: "#c9a64d",
  paved: "#50565c",
};

export interface OgTrail {
  slug: string;
  profile: { points: [number, number][]; routeKm: number } | null; // the elevation profile, for the skyline
  name: string;
  countries: string[];
  lengthKm: number | null;
  days: [number, number] | null;
  climb: { m: number; est: boolean } | null;
  difficulty: string | null; // the hardest level as a word, as on the cards
  season: number[] | null;
  surface: { natural: number; gravel: number; paved: number } | null;
}

type Font = ReturnType<typeof opentype.parse>;
const fonts = new Map<string, Font>();
const font = (weight: 400 | 600 | 700, subset: "latin" | "latin-ext" = "latin") => {
  const key = `${subset}-${weight}`;
  if (!fonts.has(key)) {
    const buf = readFileSync(`node_modules/@fontsource/source-serif-4/files/source-serif-4-${key}-normal.woff`);
    fonts.set(key, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return fonts.get(key)!;
};

// a glyph outline as SVG path data, written here: opentype.js 2.0's toPathData() sometimes writes
// NaN for a coordinate (its path optimiser), which stops librsvg drawing the rest of the path
type Command = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const pathData = (commands: Command[]) =>
  commands
    .map((c) =>
      c.type === "Z"
        ? "Z"
        : c.type === "Q"
          ? `Q${r1(c.x1!)} ${r1(c.y1!)} ${r1(c.x!)} ${r1(c.y!)}`
          : c.type === "C"
            ? `C${r1(c.x1!)} ${r1(c.y1!)} ${r1(c.x2!)} ${r1(c.y2!)} ${r1(c.x!)} ${r1(c.y!)}`
            : `${c.type}${r1(c.x!)} ${r1(c.y!)}`,
    )
    .join("");

// text as one path; characters the latin subset lacks come from latin-ext; anchor: start, middle, end
export function text(str: string, x: number, y: number, size: number, opts: { weight?: 400 | 600 | 700; fill?: string; anchor?: string; max?: number } = {}) {
  const weight = opts.weight ?? 400;
  const glyphFont = (ch: string) => (font(weight).charToGlyph(ch).index ? font(weight) : font(weight, "latin-ext"));
  // shrink to fit `max` width
  const widthAt = (s: number) =>
    [...str].reduce((w, ch) => w + glyphFont(ch === "≈" ? "~" : ch).getAdvanceWidth(ch === "≈" ? "~" : ch, s), 0);
  if (opts.max) while (size > 20 && widthAt(size) > opts.max) size -= 2;
  const width = widthAt(size);
  let cx = opts.anchor === "middle" ? x - width / 2 : opts.anchor === "end" ? x - width : x;
  let d = "";
  for (const ch of str) {
    const f = glyphFont(ch === "≈" ? "~" : ch);
    if (ch === "≈") {
      // the font has no ≈ (the site's mark for an estimate): two tildes, one above the other
      d += pathData(f.getPath("~", cx, y - size * 0.11, size).commands as Command[]);
      d += pathData(f.getPath("~", cx, y + size * 0.11, size).commands as Command[]);
      cx += f.getAdvanceWidth("~", size);
      continue;
    }
    d += pathData(f.getPath(ch, cx, y, size).commands as Command[]);
    cx += f.getAdvanceWidth(ch, size);
  }
  return { svg: `<path d="${d}" fill="${opts.fill ?? C.text}"/>`, width };
}

export const fmt = (n: number) => n.toLocaleString("en");
const days = (d: [number, number]) => (d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
// the cairn logo (src/assets/logo.svg, 8 × 8 pixels) at `size`, in the accent colour, and the address
// small, in the muted text colour (issue #147): it marks the image without competing with the headline
export function brand(x: number, y: number, anchor: "start" | "end" = "start") {
  const size = 20;
  const label = text("huckepack.me", 0, 0, 20, { weight: 600, fill: C.muted });
  const total = size + 10 + label.width;
  const x0 = anchor === "end" ? x - total : x;
  const px = size / 8;
  const cairn = [
    [3, 0, 2],
    [2, 2, 4],
    [1, 4, 5],
    [0, 6, 8],
  ]
    .map(([cx, cy, w]) => `<rect x="${x0 + cx * px}" y="${y - size + cy * px}" width="${w * px}" height="${px}" fill="${C.accent}"/>`)
    .join("");
  const word = text("huckepack.me", x0 + size + 10, y - 2, 20, { weight: 600, fill: C.muted });
  return cairn + word.svg;
}

// the figures as label-over-value pairs: [value, unit, label]
function figures(t: OgTrail): [string, string, string][] {
  return [
    t.lengthKm !== null ? [fmt(t.lengthKm), "km", "Length"] : null,
    t.days ? [days(t.days), "", "Days"] : null,
    t.climb ? [`${t.climb.est ? "≈ " : ""}${fmt(t.climb.m)}`, "m", t.climb.est ? "Ascent, estimated" : "Ascent"] : null,
    t.difficulty ? [t.difficulty, "", "Difficulty"] : null,
  ].filter(Boolean) as [string, string, string][];
}

const MONTHS = "JFMAMJJASOND";

// the trail page's key-figure strip: name and countries, a rule, four figures, the season months
// and the ground underfoot
function content(t: OgTrail) {
  const out: string[] = [];
  out.push(text(t.name, 72, 150, 80, { weight: 700, max: 1056 }).svg);
  out.push(text(t.countries.join(" · "), 72, 210, 32, { fill: C.muted }).svg);
  out.push(`<rect x="72" y="262" width="1056" height="3" fill="${C.text}"/>`);
  const figs = figures(t);
  const colW = 1056 / Math.max(figs.length, 1);
  figs.forEach(([v, u, label], i) => {
    const x = 72 + i * colW;
    if (i) out.push(`<rect x="${x - 24}" y="290" width="1.5" height="110" fill="${C.line}"/>`);
    const value = text(v, x, 360, 60, { weight: 600, max: colW - 40 });
    out.push(value.svg);
    if (u) out.push(text(u, x + value.width + 8, 360, 28, { fill: C.muted }).svg);
    out.push(text(label, x, 398, 24, { fill: C.muted }).svg);
  });
  // season: twelve month cells, the season's in accent
  if (t.season) {
    [...MONTHS].forEach((m, i) => {
      const x = 72 + i * 44;
      const on = t.season!.includes(i + 1);
      out.push(`<rect x="${x}" y="456" width="38" height="38" rx="4" fill="${on ? C.accent : C.surface}"/>`);
      out.push(text(m, x + 19, 484, 22, { weight: 600, fill: on ? C.bg : C.muted, anchor: "middle" }).svg);
    });
    out.push(text("Season", 72, 530, 24, { fill: C.muted }).svg);
  }
  // ground underfoot: one bar of the surface shares
  if (t.surface) {
    const total = t.surface.natural + t.surface.gravel + t.surface.paved || 1;
    let x = 700;
    for (const k of ["natural", "gravel", "paved"] as const) {
      const w = (t.surface[k] / total) * 428;
      if (w > 0) out.push(`<rect x="${x.toFixed(1)}" y="456" width="${Math.max(w - 3, 1).toFixed(1)}" height="38" fill="${C[k]}"/>`);
      x += w;
    }
    out.push(text(`Natural ground ${Math.round((t.surface.natural / total) * 100)}%`, 700, 530, 24, { fill: C.muted }).svg);
  }
  out.push(brand(OG.width - 72, 590, "end"));
  return out.join("");
}

// the trail's skyline (src/lib/skylines.ts, the trail page's head) with its own profile as the nearest
// ridge, scaled to `width` and standing on y `foot`, a strip of its
// ground under it, `ground` high
// a trail's skyline (its hand-drawn shapes and its own profile as the nearest ridge) drawn `width`
// wide from x `x0`, standing on y `foot`
export function skylineShapes(slug: string, profile: OgTrail["profile"], x0: number, width: number, foot: number) {
  const sky = SKYLINES[slug];
  if (!sky || !profile) return "";
  const s = width / SKY_W;
  const shapes = [...sky.shapes, { d: profileRidge(profile.points, profile.routeKm), c: sky.ridge }, ...(sky.front ?? [])];
  return `<g transform="translate(${r1(x0)} ${r1(foot - SKY_H * s)}) scale(${s})">${shapes.map((p) => `<path d="${p.d}" fill="${p.c}"/>`).join("")}</g>`;
}

function skyline(t: OgTrail, width: number, foot: number, ground: number) {
  const sky = SKYLINES[t.slug];
  if (!sky || !t.profile) return "";
  return skylineShapes(t.slug, t.profile, (OG.width - width) / 2, width, foot) + `<rect x="0" y="${foot}" width="${OG.width}" height="${ground}" fill="${sky.ground}"/>`;
}

// with a skyline (issue #146; of three previews, approach C): the name, countries, rule and figures as
// before, and instead of the season and ground row the trail's skyline across the bottom
function stripWithSkyline(t: OgTrail) {
  const out: string[] = [];
  out.push(text(t.name, 72, 130, 80, { weight: 700, max: 1056 }).svg);
  out.push(text(t.countries.join(" · "), 72, 188, 32, { fill: C.muted }).svg);
  out.push(`<rect x="72" y="234" width="1056" height="3" fill="${C.text}"/>`);
  const figs = figures(t);
  const colW = 1056 / Math.max(figs.length, 1);
  figs.forEach(([v, u, label], i) => {
    const x = 72 + i * colW;
    if (i) out.push(`<rect x="${x - 24}" y="258" width="1.5" height="100" fill="${C.line}"/>`);
    // the value shrinks so it and its unit fit the column ("≈ 12,420 m")
    const unitW = u ? text(u, 0, 0, 26).width + 8 : 0;
    const value = text(v, x, 322, 56, { weight: 600, max: colW - 48 - unitW });
    out.push(value.svg);
    if (u) out.push(text(u, x + value.width + 8, 322, 26, { fill: C.muted }).svg);
    out.push(text(label, x, 356, 22, { fill: C.muted }).svg);
  });
  // the skyline on a band of the page head's day sky, so its snow shows against it
  out.push(`<rect x="0" y="388" width="${OG.width}" height="${OG.height - 388}" fill="${SKY.day}"/>`);
  out.push(skyline(t, OG.width, OG.height - 18, 18));
  out.push(brand(OG.width - 72, 50, "end"));
  return out.join("");
}

export function ogSvg(t: OgTrail) {
  const body = SKYLINES[t.slug] && t.profile ? stripWithSkyline(t) : content(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}"><rect width="100%" height="100%" fill="${C.bg}"/>${body}</svg>`;
}

export async function ogPng(t: OgTrail) {
  return svgPng(ogSvg(t));
}

// an image's SVG as the PNG the link previews use
export const svgPng = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();

// what the image shows, in words (og:image:alt)
export function ogAlt(t: OgTrail) {
  const figs = figures(t).map(([v, u, label]) => `${label.toLowerCase()} ${v.replace("≈ ", "about ")}${u ? ` ${u}` : ""}`);
  return `${t.name}, ${t.countries.join(", ")}: ${figs.join(", ")}`;
}
