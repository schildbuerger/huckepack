// The trail database: one YAML file per trail in data/trails/, checked here at build time.
// Every figure names the source it comes from (an id in the trail's `sources`), because
// sources disagree on lengths and similar numbers; the build fails on an unknown id.
// Derived figures (totals from stages, averages, SAC from CAI) are computed in src/lib/trails.ts,
// never stored.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const sourceRef = z.string().min(1);

const CONTINENTS = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
] as const;

// What kinds of places to sleep exist along the trail (not individual places).
export const SLEEPING_TYPES = [
  "hut", // staffed hut or rifugio
  "bivouac", // unstaffed shelter
  "campsite",
  "hostel",
  "guesthouse", // B&B, rooms, holiday flats
  "hotel",
  "monastery", // monastery or sanctuary guest house
  "farm-stay", // agriturismo and similar
] as const;

const point = z.object({
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const source = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  url: z.url(),
  licence: z.string(),
  // null until someone has checked the figures against the source
  retrieved: z.coerce.date().nullable(),
  note: z.string().optional(),
});

const stage = z.object({
  number: z.string(), // "1", "2", … as the source numbers them; "0" for an approach
  kind: z.enum(["main", "approach", "variant"]),
  from: z.string(),
  to: z.string(),
  km: z.number().positive(),
  ascentM: z.number().int().nonnegative(),
  descentM: z.number().int().nonnegative(),
  minutes: z.number().int().positive().optional(), // walking time in the main direction
  startEleM: z.number().int().optional(),
  endEleM: z.number().int().optional(),
  track: z.url().optional(), // the stage's GPX track; pipeline/routes.py builds the map line from it
});

const trail = z
  .object({
    name: z.string(),
    localName: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    website: z.url(),
    designation: z.string().optional(),
    managedBy: z.array(z.object({ name: z.string(), url: z.url().optional() })).min(1),
    trailType: z.enum(["point-to-point", "loop", "network"]),
    continents: z.array(z.enum(CONTINENTS)).min(1),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 code")).min(1),
    regions: z.array(z.string()).default([]), // first-level administrative regions
    protectedAreas: z.array(z.string()).default([]),
    termini: z.object({ start: point, end: point, source: sourceRef }),
    established: z.object({ year: z.number().int(), source: sourceRef }).optional(),
    waymarking: z.object({ text: z.string(), source: sourceRef }).optional(),

    // Stated totals, as a source gives them; totals summed from the stages are computed.
    length: z
      .array(z.object({ km: z.number().positive(), approx: z.boolean().default(false), source: sourceRef }))
      .default([]),
    ascent: z.array(z.object({ m: z.number().int().positive(), source: sourceRef })).default([]),
    days: z
      .object({ min: z.number().int().positive(), max: z.number().int().positive(), source: sourceRef })
      .refine((d) => d.min <= d.max, "days.min must not exceed days.max")
      .optional(),
    stages: z.object({ source: sourceRef, list: z.array(stage).min(1) }).optional(),
    // The map line, built by the pipeline into public/routes/<slug>.geojson. `publishable`
    // is false when the geometry's licence doesn't allow republishing it (e.g. official GPX).
    route: z.object({ source: sourceRef, publishable: z.boolean() }).optional(),

    difficulty: z
      .object({
        cai: z.object({ grade: z.enum(["T", "E", "EE", "EEA"]), source: sourceRef }).optional(),
        sac: z
          .object({ grade: z.enum(["T1", "T2", "T3", "T4", "T5", "T6"]), source: sourceRef })
          .optional(),
      })
      .optional(),

    season: z
      .object({
        months: z.array(z.number().int().min(1).max(12)).min(1),
        text: z.string().optional(), // the source's own wording, e.g. "spring and autumn"
        source: sourceRef,
      })
      .optional(),

    sleeping: z
      .object({
        types: z.array(z.enum(SLEEPING_TYPES)).min(1),
        source: sourceRef,
      })
      .optional(),
    wildCamping: z
      .object({
        status: z.enum(["allowed", "restricted", "prohibited"]),
        rule: z.string(),
        source: sourceRef,
      })
      .optional(),

    // Travel hubs near the start: the nearest railway station and airport(s). pipeline/access.py
    // derives their distance to the start by road.
    access: z
      .array(
        z.object({
          kind: z.enum(["station", "airport"]),
          name: z.string(),
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
          note: z.string().optional(),
          source: sourceRef,
        }),
      )
      .default([]),

    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    notes: z.array(z.string()).default([]), // open questions and discrepancies between sources
    sources: z.array(source).min(1),
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.sources.map((s) => s.id));
    const refs = [
      t.termini.source,
      ...t.length.map((l) => l.source),
      ...t.ascent.map((a) => a.source),
      ...[
        t.established,
        t.waymarking,
        t.days,
        t.stages,
        t.route,
        t.difficulty?.cai,
        t.difficulty?.sac,
        t.season,
        t.sleeping,
        t.wildCamping,
        ...t.access,
      ].flatMap((x) => (x ? [x.source] : [])),
    ];
    for (const ref of refs) {
      if (!ids.has(ref)) ctx.addIssue({ code: "custom", message: `unknown source id "${ref}"` });
    }
  });

// Data the pipeline derives for a trail (data/derived/<slug>.json, never edited by hand).
const gap = z.object({ km: z.number(), fromKm: z.number(), toKm: z.number() });
const stageKind = z.enum(["main", "approach", "variant"]);
// one month at one place (pipeline/climate.py): mean day high and night low in °C; per year:
// wet days (≥ 1 mm), snow days (≥ 1 cm), frost nights (< 0 °C) and precipitation in mm
const climateMonth = z.object({
  tmax: z.number(),
  tmin: z.number(),
  wetDays: z.number(),
  snowDays: z.number(),
  frostNights: z.number(),
  precipMm: z.number(),
});

const derived = z.object({
  // pipeline/water.py: drinking water and springs near the route, from OpenStreetMap
  water: z
    .object({
      source: sourceRef, // an id in the trail's `sources`
      retrieved: z.coerce.date(),
      withinM: z.number(),
      routeKm: z.number(), // the main route measured along the map line
      stageStarts: z.array(z.object({ number: z.string(), km: z.number() })).default([]),
      longestGapKm: z.object({ drinking: gap, any: gap }),
      stages: z.array(
        z.object({ number: z.string(), kind: stageKind, drinking: z.number().int(), springs: z.number().int() }),
      ),
      points: z.array(
        z.object({
          lat: z.number(),
          lon: z.number(),
          kind: z.enum(["drinking", "spring"]),
          name: z.string().nullable(),
          stage: z.string(),
          stageKind,
          km: z.number().nullable(), // along the main route; null on approaches and variants
          offM: z.number(),
        }),
      ),
    })
    .optional(),
  // pipeline/elevation.py: heights along the main route, sampled on the map line
  elevation: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      spacingM: z.number(),
      routeKm: z.number(),
      stageStarts: z.array(z.object({ number: z.string(), km: z.number() })),
      highest: z.object({ km: z.number(), m: z.number() }),
      lowest: z.object({ km: z.number(), m: z.number() }),
      points: z.array(z.tuple([z.number(), z.number()])), // [km, metres]
    })
    .optional(),
  // pipeline/climate.py: monthly averages at the trail's lowest and highest points, and daylight
  climate: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      years: z.tuple([z.number(), z.number()]),
      places: z.array(
        z.object({ id: z.enum(["low", "high"]), label: z.string(), km: z.number(), m: z.number(), lat: z.number(), lon: z.number() }),
      ),
      months: z.array(
        z.object({
          month: z.number(),
          low: climateMonth,
          high: climateMonth,
          daylightH: z.number(),
        }),
      ),
    })
    .optional(),
  // pipeline/surface.py: surface categories along the main route, from OpenStreetMap
  surface: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      routeKm: z.number(), // the main route on the map line, the same scale as water
      totals: z.record(
        z.enum(["paved", "gravel", "natural", "unknown"]),
        z.object({ km: z.number(), share: z.number() }),
      ),
      inferredShare: z.number(), // share whose category comes from the way type, not a surface tag
      runs: z.array(
        z.object({
          category: z.enum(["paved", "gravel", "natural", "unknown"]),
          fromKm: z.number(),
          toKm: z.number(),
          stage: z.string(),
        }),
      ),
    })
    .optional(),
  // pipeline/access.py: from each travel hub in the trail's `access` to the start
  access: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      hubs: z.array(
        z.object({
          name: z.string(), // matches the hub's name in the trail record
          roadKm: z.number(),
          driveMin: z.number(),
          straightKm: z.number(),
        }),
      ),
    })
    .optional(),
});

export const collections = {
  trails: defineCollection({
    loader: glob({ pattern: "*.yaml", base: "./data/trails" }),
    schema: trail,
  }),
  derived: defineCollection({
    loader: glob({ pattern: "*.json", base: "./data/derived" }),
    schema: derived,
  }),
};
