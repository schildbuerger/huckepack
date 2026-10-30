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
  // used only for our data check (dataCheck), not for a figure on the page: not listed there
  checkOnly: z.boolean().default(false),
});

const stage = z.object({
  number: z.string(), // "1", "2", … as the source numbers them; "0" for an approach
  kind: z.enum(["main", "approach", "variant"]),
  from: z.string(),
  to: z.string(),
  km: z.number().positive(),
  // ascent and descent: optional, some sources give neither (the page then estimates them, ≈)
  ascentM: z.number().int().nonnegative().optional(),
  descentM: z.number().int().nonnegative().optional(),
  minutes: z.number().int().positive().optional(), // walking time in the main direction
  maxMinutes: z.number().int().positive().optional(), // when the source gives a range: minutes to maxMinutes
  startEleM: z.number().int().optional(),
  endEleM: z.number().int().optional(),
  track: z.url().optional(), // the stage's GPX track; pipeline/routes.py builds the map line from it
  // without a track: where the stage ends, to split the route's OSM relation (route.relation)
  end: z.object({ lat: z.number(), lon: z.number() }).optional(),
  // or the stage's own OSM hiking relation (a section of a superroute): chained from where the
  // previous stage ended, it guides the matcher like a track
  relation: z.number().int().positive().optional(),
  // when this stage's figures come from another source than the list's (the page names it)
  source: sourceRef.optional(),
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
    // `symbol`: the waymark redrawn small on the page (src/components/Waymark.astro), only where a
    // source describes it
    waymarking: z
      .object({ text: z.string(), symbol: z.enum(["cai", "yellow-vertical-stripe"]).optional(), source: sourceRef })
      .optional(),

    // Stated totals, as a source gives them; totals summed from the stages are computed.
    length: z
      .array(z.object({ km: z.number().positive(), approx: z.boolean().default(false), source: sourceRef }))
      .default([]),
    ascent: z.array(z.object({ m: z.number().int().positive(), source: sourceRef })).default([]),
    days: z
      .object({ min: z.number().int().positive(), max: z.number().int().positive(), source: sourceRef })
      .refine((d) => d.min <= d.max, "days.min must not exceed days.max")
      .optional(),
    // the height where trees stop growing in the trail's region (issue #20), from a published
    // source: `m` the upper limit, `fromM` the lower end where the source gives a range. The terrain
    // chart draws it only where the route climbs above `m`
    treeLine: z
      .object({ m: z.number().int().positive(), fromM: z.number().int().positive().optional(), source: sourceRef })
      .optional(),
    // `timesSource`: when the stage times come from another source than the rest of the stage
    // figures (e.g. the stage source publishes none); the page names it under the table
    stages: z
      .object({ source: sourceRef, timesSource: sourceRef.optional(), list: z.array(stage).min(1) })
      .optional(),
    // The map line, built by the pipeline into public/routes/<slug>.geojson. `publishable`
    // is false when the geometry's licence doesn't allow republishing it (e.g. official GPX).
    route: z
      .object({
        source: sourceRef,
        publishable: z.boolean(),
        // the trail's OSM hiking relation, to guide the map line when there are no GPX tracks;
        // `alternatives`: ways with role "alternative" to use, where the main members leave a gap
        relation: z.number().int().optional(),
        alternatives: z.array(z.number().int()).default([]),
      })
      .optional(),

    difficulty: z
      .object({
        cai: z.object({ grade: z.enum(["T", "E", "EE", "EEA"]), source: sourceRef }).optional(),
        sac: z
          .object({ grade: z.enum(["T1", "T2", "T3", "T4", "T5", "T6"]), source: sourceRef })
          .optional(),
        // no grade published: our SAC estimate from the source's own description, which `basis`
        // sums up (shown on the page)
        estimated: z
          .object({ sac: z.enum(["T1", "T2", "T3", "T4", "T5", "T6"]), basis: z.string(), source: sourceRef })
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

    // Drinking water a source names that OSM lacks (e.g. the taps in a trail's huts);
    // pipeline/water.py adds them to OSM's points
    waterPoints: z
      .object({
        source: sourceRef,
        list: z.array(z.object({ name: z.string(), lat: z.number(), lon: z.number() })).min(1),
      })
      .optional(),

    // Travel hubs near the start: the nearest railway station (or, without railways, the main bus
    // station the trail's buses leave from) and airport(s). pipeline/access.py
    // derives their distance to the start by road.
    access: z
      .array(
        z.object({
          kind: z.enum(["station", "bus", "airport"]),
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
    // the double check every new trail gets (CLAUDE.md, working rule 2): how and against what, and
    // every figure more than 10 % apart from the second source, with both values. Internal quality
    // assurance: not shown on the page
    dataCheck: z
      .object({
        date: z.coerce.date(),
        against: z.array(sourceRef).default([]), // second sources the figures were compared with
        // where no second source exists: the sources the finished page was checked against
        pageAgainst: z.array(sourceRef).default([]),
        deviations: z
          .array(z.object({ figure: z.string(), ours: z.string(), theirs: z.string(), source: sourceRef }))
          .default([]),
      })
      .optional(),
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
        t.difficulty?.estimated,
        t.waterPoints,
        t.treeLine,
        ...(t.stages?.timesSource ? [{ source: t.stages.timesSource }] : []),
        ...(t.stages?.list.flatMap((s) => (s.source ? [{ source: s.source }] : [])) ?? []),
        ...(t.dataCheck
          ? [...[...t.dataCheck.against, ...t.dataCheck.pageAgainst].map((source) => ({ source })), ...t.dataCheck.deviations]
          : []),
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
// wet days (≥ 1 mm), snow days (≥ 1 cm), frost nights (< 0 °C) and precipitation in mm; the mean
// daily top wind (highest hourly mean) in km/h and stormy days (gusts ≥ 70 km/h)
const climateMonth = z.object({
  tmax: z.number(),
  tmin: z.number(),
  wetDays: z.number(),
  snowDays: z.number(),
  frostNights: z.number(),
  precipMm: z.number(),
  windKmh: z.number(),
  gustDays: z.number(),
});

const derived = z.object({
  // pipeline/water.py: drinking water and springs near the route, from OpenStreetMap
  water: z
    .object({
      source: sourceRef, // an id in the trail's `sources`
      // further sources of points, from the record's `waterPoints` (each point names its own)
      extraSources: z.array(z.string()).default([]),
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
          source: z.string().default("osm"),
        }),
      ),
    })
    .optional(),
  // pipeline/landcover.py: ESA WorldCover land cover at the elevation profile's samples, in six
  // groups (forest, open, moss, bare, water, farm)
  landcover: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      spacingM: z.number(),
      routeKm: z.number(),
      stageStarts: z.array(z.object({ number: z.string(), km: z.number() })),
      shares: z.record(z.string(), z.number()),
      runs: z.array(z.object({ group: z.string(), fromKm: z.number(), toKm: z.number() })),
      highestForest: z.object({ km: z.number(), m: z.number() }).nullable(),
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
