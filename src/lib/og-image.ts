// A trail's link-preview image (Open Graph, 1200 × 630; review of 2026-10-30, #16; of three
// previews, approach C: the trail page's key-figure strip with the season months and the ground
// underfoot), drawn as SVG and rasterised to PNG with sharp at build time (src/pages/og/[slug].png.ts). The text is drawn as outlines from Source Serif 4
// (SIL Open Font License, @fontsource/source-serif-4), so the image looks the same on any machine
// that builds it; the site's own serif stack is system fonts, which a build server doesn't have.
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import sharp from "sharp";

export const OG = { width: 1200, height: 630 };

// the light theme's tokens (src/layouts/Base.astro): link previews show on any background, and the
// cream page is the site's face
const C = {
  bg: "#fbf7f1",
  surface: "#f4ece1",
  text: "#2a221d",
  muted: "#75685d",
  line: "#e6dccf",
  accent: "#b0502a",
  natural: "#b26232",
  gravel: "#c9a64d",
  paved: "#50565c",
};

export interface OgTrail {
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
function text(str: string, x: number, y: number, size: number, opts: { weight?: 400 | 600 | 700; fill?: string; anchor?: string; max?: number } = {}) {
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

const fmt = (n: number) => n.toLocaleString("en");
const days = (d: [number, number]) => (d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);
// the cairn logo (src/assets/logo.svg, 8 × 8 pixels) at `size`, in the accent colour, and the address
function brand(x: number, y: number, anchor: "start" | "end" = "start") {
  const size = 32;
  const label = text("huckepack.me", 0, 0, 30, { weight: 600, fill: C.text });
  const total = size + 14 + label.width;
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
  const word = text("huckepack.me", x0 + size + 14, y - 3, 30, { weight: 600, fill: C.text });
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

export function ogSvg(t: OgTrail) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}"><rect width="100%" height="100%" fill="${C.bg}"/>${content(t)}</svg>`;
}

export async function ogPng(t: OgTrail) {
  return sharp(Buffer.from(ogSvg(t))).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

// what the image shows, in words (og:image:alt)
export function ogAlt(t: OgTrail) {
  const figs = figures(t).map(([v, u, label]) => `${label.toLowerCase()} ${v.replace("≈ ", "about ")}${u ? ` ${u}` : ""}`);
  return `${t.name}, ${t.countries.join(", ")}: ${figs.join(", ")}`;
}
