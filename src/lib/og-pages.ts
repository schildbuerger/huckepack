// The link-preview images of the pages that aren't a trail (issue #147; of three previews, approach
// B: a picture per page): the home page (three trails' skylines), the trail search (six trails as
// cards), the map (the trails' starts on the world's land), the guide (its questions), and the home
// page's picture for the rest (legal notice, privacy, 404). 1200 × 630, drawn as SVG in the trail
// images' language (src/lib/og-image.ts: the serif as outlines, flat colours, the cairn and address,
// the skylines) and rasterised at build time, /og/page/<page>.png.
import { getCollection, getEntry } from "astro:content";
import { C, OG, brand, skylineShapes, svgPng, text, type OgTrail } from "./og-image";
import { ogTrail } from "./og-trail";
import { SKYLINES } from "./skylines";
import { SKY } from "./sky";
import { worldOutline } from "./world-outline";

export type OgPage = "home" | "trails" | "map" | "guide" | "site";
export const OG_PAGES: OgPage[] = ["home", "trails", "map", "guide", "site"];

interface Site {
  trails: (OgTrail & { views: number; start: { lat: number; lon: number } })[];
  countries: number;
  km: number;
}

let site: Promise<Site> | undefined;
export function siteData() {
  site ??= (async () => {
    const entries = await getCollection("trails");
    const trails = await Promise.all(
      entries.map(async ({ id, data }) => {
        const derived = (await getEntry("derived", id))?.data;
        return { ...ogTrail(id, data, derived), views: derived?.popularity?.views ?? 0, start: data.termini.start };
      }),
    );
    trails.sort((a, b) => b.views - a.views);
    return {
      trails,
      countries: new Set(entries.flatMap((e) => e.data.countries)).size,
      km: trails.reduce((a, t) => a + (t.lengthKm ?? 0), 0),
    };
  })();
  return site;
}

// what each page is called on its image, and one line under it
const WORDS: Record<OgPage, (s: Site) => [string, string]> = {
  home: (s) => ["Find your trail. Go prepared.", `${s.trails.length} long-distance hiking trails, from official and open sources`],
  trails: (s) => ["Find a long-distance trail", `${s.trails.length} trails to filter by month, region, days and difficulty`],
  map: (s) => ["Trail map", `${s.trails.length} long-distance trails in ${s.countries} countries on one map`],
  guide: () => ["Which trail suits you?", "Eleven short questions lead to the trails that fit"],
  site: () => ["huckepack", "Find your trail. Go prepared."],
};

const doc = (bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`;

// a small card: a trail's skyline on its sky, its name under it
function tile(t: Site["trails"][number], x: number, y: number, w: number, h: number) {
  const sky = SKYLINES[t.slug];
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SKY.day}"/>` +
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" overflow="hidden">${skylineShapes(t.slug, t.profile, 0, w, h - 8)}<rect x="0" y="${h - 8}" width="${w}" height="8" fill="${sky.ground}"/></svg>` +
    text(t.name, x, y + h + 30, 22, { weight: 600, max: w }).svg
  );
}

function picture(page: OgPage, s: Site) {
  const [title, line] = WORDS[page](s);
  const out: string[] = [];
  out.push(brand(OG.width - 72, 50, "end"));
  out.push(text(title, 72, 130, 72, { weight: 700, max: 820 }).svg);
  out.push(text(line, 72, 188, 30, { fill: C.muted, max: 1056 }).svg);
  const sky = s.trails.filter((t) => SKYLINES[t.slug]);
  if (page === "home" || page === "site") {
    // three trails' skylines side by side, wall to wall: the middle half of each drawing, where its
    // landmarks are, with a cream gap between them
    const top = 360;
    const h = OG.height - top;
    ["tour-du-mont-blanc", "w-trek", "gr-20"]
      .map((slug) => sky.find((t) => t.slug === slug)!)
      .forEach((t, i) => {
        out.push(
          `<svg x="${i * 404}" y="${top}" width="396" height="${h}" overflow="hidden"><rect width="396" height="${h}" fill="${SKY.day}"/>` +
            `${skylineShapes(t.slug, t.profile, -202, 800, h - 16)}<rect x="0" y="${h - 16}" width="396" height="16" fill="${SKYLINES[t.slug].ground}"/></svg>`,
        );
      });
  } else if (page === "trails") {
    // six trails as cards, two rows of three
    sky.slice(0, 6).forEach((t, i) => out.push(tile(t, 72 + (i % 3) * 362, 236 + Math.floor(i / 3) * 192, 330, 118)));
  } else if (page === "map") {
    // the land (Natural Earth, src/lib/world-outline.ts, as on the home page's map teaser) with a dot
    // at each trail's start
    const [x0, y0, w, h] = [72, 236, 1056, 360];
    const world = worldOutline(s.trails.map((t) => [t.start.lon, t.start.lat]), { width: 1000 });
    out.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${SKY.day}"/>`);
    out.push(
      `<svg x="${x0}" y="${y0}" width="${w}" height="${h}" viewBox="0 0 ${world.width} ${world.height}" preserveAspectRatio="xMidYMid meet">` +
        `<path d="${world.landPath}" fill="#e9e5cf"/>` +
        world.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(7 * world.width) / w}" fill="${C.accent}" stroke="${C.bg}" stroke-width="${(2 * world.width) / w}"/>`).join("") +
        `</svg>`,
    );
  } else if (page === "guide") {
    // the guide's questions as chips
    const chips = ["When?", "Where?", "How long?", "How hard?", "The weather", "The landscape", "Ground underfoot", "Sleeping", "Water"];
    let x = 72;
    let y = 318;
    chips.forEach((c, i) => {
      const w = text(c, 0, 0, 38, { weight: 600 }).width + 56;
      if (x + w > 1128) {
        x = 72;
        y += 100;
      }
      // the first one answered, as in the guide: a picked answer in the accent colour
      out.push(`<rect x="${x}" y="${y - 50}" width="${r(w)}" height="74" rx="37" fill="${i === 0 ? C.accent : C.surface}"/>`);
      out.push(text(c, x + 28, y, 38, { weight: 600, fill: i === 0 ? C.bg : C.text }).svg);
      x += w + 18;
    });
  }
  return doc(C.bg, out.join(""));
}

const r = (v: number) => Math.round(v * 10) / 10;

export async function ogPagePng(page: OgPage) {
  return svgPng(picture(page, await siteData()));
}

// what each image shows, in words (og:image:alt)
export async function ogPageAlt(page: OgPage) {
  const s = await siteData();
  const [title, line] = WORDS[page](s);
  const what = {
    home: "the skylines of three trails",
    site: "the skylines of three trails",
    trails: "six trails as cards with their skylines",
    map: "a world map with a dot where each trail starts",
    guide: "the guide's questions",
  }[page];
  const end = (str: string) => (/[.?]$/.test(str) ? str : `${str}.`);
  return `${end(title)} ${end(line)} With ${what}.`;
}
