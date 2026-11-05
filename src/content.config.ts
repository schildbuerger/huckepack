// The trail database: one YAML file per trail in data/trails/, checked here at build time.
// Every figure names the source it comes from (an id in the trail's `sources`), because
// sources disagree on lengths and similar numbers; the build fails on an unknown id.
// Derived figures (totals from stages, averages, SAC from CAI) are computed in src/lib/trails.ts,
// never stored.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const sourceRef = z.string().min(1);

// an animal or plant that can be dangerous to hikers (issue #156): its kind (the silhouette drawn),
// name ("Black bear", "Snakes (Cape cobra, puff adder, boomslang)"), our level with why, and what to do
// and not to do in the official source's words
const danger = <K extends string>(kinds: [K, ...K[]]) =>
  z.object({
    kind: z.enum(kinds),
    name: z.string(),
    level: z.enum(["low", "moderate", "high"]),
    basis: z.string(),
    do: z.array(z.string()).min(1),
    dont: z.array(z.string()).default([]),
    source: sourceRef,
  });

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

// the simple painted marks src/components/Waymark.astro draws (WAYMARKS there)
const waymark = z.enum(["cai", "yellow-vertical-stripe", "red-diamond", "white-h-on-black", "white-x-on-black", "white-w-on-green", "white-l-on-anthracite", "white-red-stripes", "blue-stripe-on-white"]);

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
  // not for a figure on the trail page, so not listed there: a source used only for our data check
  // (dataCheck), or for a figure shown elsewhere (the page views ranking the home page's popular trails)
  checkOnly: z.boolean().default(false),
});

// fields filled where a source gives them, else explained by a note starting with the label
// (docs/trail-building.md, "What a record needs"); checked in the trail schema's superRefine
type TrailIn = { [k: string]: unknown; length: unknown[]; days?: unknown; season?: unknown; wildCamping?: unknown; waymarking?: unknown; wikidata?: unknown; protectedAreas: unknown[] };
const EXPLAINED: [string, string, (t: TrailIn) => boolean][] = [
  ["season", "Season", (t) => !!t.season],
  ["wildCamping", "Wild camping", (t) => !!t.wildCamping],
  ["waymarking", "Waymarking", (t) => !!t.waymarking],
  ["wikidata", "Wikidata", (t) => !!t.wikidata],
  ["length", "Length", (t) => t.length.length > 0],
  ["days", "Days", (t) => !!t.days],
  ["protectedAreas", "Protected areas", (t) => t.protectedAreas.length > 0],
];

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
  // with `end` on a relation: points the stage passes, where the source's route takes one of the
  // relation's alternative ways (the Alta Via 1's stages 4 and 6); pipeline/routes.py then follows
  // the shortest way over all the relation's ways through them
  via: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
  // or the stage's own OSM hiking relation (a section of a superroute): chained from where the
  // previous stage ended, it guides the matcher like a track
  // (several in a row, e.g. an OSM section and the start of the next, as a list; with `end` the
  // chained line is cut there)
  relation: z.union([z.number().int().positive(), z.array(z.number().int().positive()).min(1)]).optional(),
  // when this stage's figures come from another source than the list's (the page names it)
  source: sourceRef.optional(),
  // the longest gap between OSM ways the matcher may bridge on this stage (default 100 m), where
  // OSM still maps a crossing as under construction; the record's notes say where and why
  maxBridgeM: z.number().int().positive().optional(),
  // how many gaps the matcher may bridge on this stage (default 6), where small unconnected bits of
  // OSM near the track use up the bridges before a long one (the Pieterpad's ferries over the Rhine)
  maxBridges: z.number().int().positive().optional(),
  // a stage that can't be walked in full (the Eifelsteig's stage 14, a bridge lost in a flood):
  // walkable to `at`, then the operator's recommended way on, leg by leg (`detour`, on foot or by
  // train or bus), drawn on the map in their own styles; the stage keeps its stated figures
  closed: z
    .object({
      at: point,
      since: z.number().int(),
      reason: z.string(), // a short clause: "a bridge over the Kyll was destroyed in the 2021 flood"
      source: sourceRef,
      detour: z
        .array(
          z.object({
            by: z.enum(["foot", "train", "bus"]),
            to: point,
            km: z.number().positive().optional(),
            // on foot: points that keep the guide line on the recommended path
            via: z.array(z.object({ lat: z.number(), lon: z.number() })).default([]),
            // by train or bus: the OSM relation of the line it follows (cut from leg start to `to`)
            relation: z.number().int().positive().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

const trail = z
  .object({
    name: z.string(),
    // the day the trail was added to huckepack (the home page's "Recent trails")
    added: z.coerce.date(),
    localName: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    website: z.url(),
    // the trail's Wikidata item (Q…): its Wikipedia articles, whose page views rank the home page's
    // popular trails (pipeline/popularity.py); none where no article exists
    wikidata: z.string().regex(/^Q\d+$/).optional(),
    designation: z.string().optional(),
    managedBy: z.array(z.object({ name: z.string(), url: z.url().optional() })).min(1),
    // the operator's own GPX download (issue #106): `url` the operator's page that offers the file (a
    // whole-route file, else one per stage) for anyone to download without a login, never the file
    // itself, so walkers get it from the operator's site (decided 2026-11-05); it must be the url of
    // its `source`. Shown as a link in Location; `none` a short reason where the operator offers none
    // ("stage tracks only after login"), not shown. huckepack never stores or republishes an official GPX
    officialGpx: z
      .union([z.object({ url: z.url(), source: sourceRef }), z.object({ none: z.string(), source: sourceRef })])
      .optional(),
    trailType: z.enum(["point-to-point", "loop", "network"]),
    continents: z.array(z.enum(CONTINENTS)).min(1),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 code")).min(1),
    regions: z.array(z.string()).default([]), // first-level administrative regions
    protectedAreas: z.array(z.string()).default([]),
    termini: z.object({ start: point, end: point, source: sourceRef }),
    established: z.object({ year: z.number().int(), source: sourceRef }).optional(),
    // `symbol`: the waymark redrawn small on the page (src/components/Waymark.astro): every simple
    // painted mark a source describes (stripes, flags, diamonds), never a trail's logo; `number`: a
    // path number painted on it (the Merano High Mountain Trail's 24); several marks where the
    // trail joins paths with their own (the Hermannshöhen: the Hermannsweg's H, the Eggeweg's X)
    waymarking: z
      .object({
        text: z.string(),
        symbol: z.union([waymark, z.array(waymark).min(1)]).optional(),
        // drawn into the waymark's SVG as text, so letters, digits and dashes only
        number: z.string().regex(/^[A-Za-z0-9-]{1,5}$/).optional(),
        source: sourceRef,
      })
      .optional(),

    // Stated totals, as a source gives them; totals summed from the stages are computed.
    length: z
      .array(z.object({ km: z.number().positive(), approx: z.boolean().default(false), source: sourceRef }))
      .default([]),
    ascent: z.array(z.object({ m: z.number().int().positive(), source: sourceRef })).default([]),
    // the stated total descent; the page uses a stated ascent only together with a descent from the same source
    descent: z.array(z.object({ m: z.number().int().positive(), source: sourceRef })).default([]),
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
    // `transfers`: legs that aren't walked (the W Trek's catamaran over Lago Pehoé), after the
    // stages: drawn on the map through `via` (OSM's ferry way), never in the totals or charts. With
    // `stage`, a ride inside that main stage (the Adlerweg's cable cars, decided 2026-11-03): its
    // official track runs along the lift, which pipeline/routes.py cuts out, so the stage's map line
    // is the walked pieces on either side; the stated figures stay the source's
    stages: z
      .object({
        source: sourceRef,
        timesSource: sourceRef.optional(),
        list: z.array(stage).min(1),
        transfers: z
          .array(
            z.object({
              by: z.enum(["boat", "bus", "train", "cable car", "funicular"]),
              stage: z.string().optional(), // the main stage the ride lies in
              start: point, // named: "Paine Grande"
              end: point,
              via: z.array(z.object({ lat: z.number(), lon: z.number() })).default([]),
              minutes: z.number().int().positive().optional(),
              source: sourceRef,
            }),
          )
          .default([]),
      })
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
        // a relation with side branches (the W Trek's valleys): each stage is the shortest way over
        // its ways from where it begins to its `end`, instead of a piece of one chained line
        branched: z.boolean().default(false),
        // with branched: way ends this close (m) count as joined, where the refuges' spurs stop short
        // of the relation's ways (the Carros de Foc's 7–50 m); the matcher still follows real paths
        joinM: z.number().positive().optional(),
        // no route relation in OSM (the Whale Trail): the name its ways carry, a regular expression for
        // Overpass; each stage is the shortest way over them to its `end`
        wayName: z.string().optional(),
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

    // Animals that can be dangerous to hikers in the trail's region (issue #156, decided 2026-11-02):
    // large animals, venomous snakes, scorpions and spiders, and ticks; no insects. `level` is our own
    // rating (low, moderate, high: how likely a hiker meets it on the trail and how serious an encounter
    // can be), with its `basis`; what to do and what not to do in the source's words, which is official
    // (a park service, a wildlife or health agency). `plants`: the same for plants that harm on touch
    // (giant hogweed), where an official source warns of them in the trail's region. `none`: an official
    // source saying the region has none; neither means nothing is known yet, and the page shows no section
    animals: z
      .object({
        list: z.array(danger(["bear", "wolf", "big-cat", "boar", "cattle", "dog", "monkey", "snake", "scorpion", "spider", "tick"])).default([]),
        plants: z.array(danger(["hogweed"])).default([]),
        none: z.object({ text: z.string(), source: sourceRef }).optional(),
      })
      .optional(),

    // Permits and fees (issue #104, decided 2026-10-31): whether a permit is needed and how to get it,
    // and the trail's or park's own fees with their currency and the year of the price; no hut or
    // campsite prices. Recorded only where an official source says so (an unknown permit is left
    // out, not recorded as "not needed")
    permit: z
      .object({
        required: z.boolean(),
        name: z.string(), // what it is called: "West Coast Trail Backcountry Use Permit"
        issuedBy: z.string(),
        how: z.string(), // how to get it, in a sentence or two
        booking: z.string().optional(), // when it can be booked: "from 5 February for the season"
        url: z.url().optional(), // where to book or buy it
        source: sourceRef,
      })
      .optional(),
    fees: z
      .array(
        z.object({
          name: z.string(), // "Ferry, Gordon River"
          amount: z.number().nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/), // ISO 4217: CAD, CLP, EUR
          per: z.string(), // "per person and trip", "per adult and day"
          year: z.number().int(), // the year the price is for
          note: z.string().optional(),
          source: sourceRef,
        }),
      )
      .default([]),

    // Drinking water a source names that OSM lacks (e.g. the taps in a trail's huts);
    // pipeline/water.py adds them to OSM's points
    waterPoints: z
      .object({
        source: sourceRef,
        list: z.array(z.object({ name: z.string(), lat: z.number(), lon: z.number() })).min(1),
      })
      .optional(),

    // When a source says the water at the trail's places to sleep isn't treated (the Milford Track's
    // DOC huts: "boil before use"), its refills don't count as clean water, only as any water
    // (issue #119; pipeline/along.py water_tiers()). `text`: the source's words, shown on the page
    refillsUntreated: z.object({ text: z.string(), source: sourceRef }).optional(),

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
    // every trail has its Wildlife (2026-11-04): animals or plants from official sources, `none` where
    // an official source says there are none, or a note starting "Wildlife" saying why nothing is listed
    const wildlife = t.animals && (t.animals.list.length || t.animals.plants.length || t.animals.none);
    if (!wildlife && !t.notes.some((n) => n.startsWith("Wildlife"))) {
      ctx.addIssue({ code: "custom", path: ["animals"], message: 'no wildlife: list animals from an official source, set animals.none, or add a note starting "Wildlife" saying why none is listed' });
    }
    // the record's tiers (docs/trail-building.md, "What a record needs", 2026-11-04): required fields,
    // and fields filled where a source gives them, else explained by a note starting with their label
    for (const [field, present] of [
      ["stages", !!t.stages],
      ["route", !!t.route],
      ["difficulty", !!t.difficulty],
      ["sleeping", !!t.sleeping],
      ["access", t.access.length > 0],
      ["dataCheck", !!t.dataCheck],
    ] as const) {
      if (!present) ctx.addIssue({ code: "custom", path: [field], message: `required: ${field} (docs/trail-building.md)` });
    }
    for (const [field, label, present] of EXPLAINED.map(([f, l, has]) => [f, l, has(t)] as const)) {
      if (!present && !t.notes.some((n) => n.startsWith(label))) {
        ctx.addIssue({ code: "custom", path: [field], message: `no ${field}: fill it from a source, or add a note starting "${label}" saying what was searched (docs/trail-building.md)` });
      }
    }
    const ids = new Set(t.sources.map((s) => s.id));
    const refs = [
      t.termini.source,
      ...t.length.map((l) => l.source),
      ...t.ascent.map((a) => a.source),
      ...t.descent.map((a) => a.source),
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
        t.officialGpx,
        ...(t.stages?.timesSource ? [{ source: t.stages.timesSource }] : []),
        ...(t.stages?.list.flatMap((s) => (s.source ? [{ source: s.source }] : [])) ?? []),
        ...(t.stages?.list.flatMap((s) => (s.closed ? [s.closed] : [])) ?? []),
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
    // the official GPX link goes to the operator's page, never to the file (decided 2026-11-05)
    const gpx = t.officialGpx;
    if (gpx && "url" in gpx && t.sources.find((s) => s.id === gpx.source)?.url !== gpx.url) {
      ctx.addIssue({ code: "custom", path: ["officialGpx", "url"], message: "the operator's page that offers the GPX, the same url as its source, never the file" });
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

// pipeline/along.py: one kind of place along the route (shops or beds), with the longest stretch
// of the main route without one
// an OSM object as "node/123", "way/456" or "relation/7" (issue #118: the page links to it)
const osmRef = z.string().regex(/^(node|way|relation)\/\d+$/);
const alongGroup = <K extends [string, ...string[]]>(kinds: K) =>
  z.object({
    points: z.array(
      z.object({
        lat: z.number(),
        lon: z.number(),
        group: z.enum(["resupply", "beds"]),
        kind: z.enum(kinds),
        name: z.string().nullable(),
        stage: z.string(),
        stageKind,
        km: z.number().nullable(), // along the main route; null on approaches and variants
        offM: z.number(),
        drinkingWater: z.string().optional(), // a place's OSM drinking_water tag (issue #119)
        osm: osmRef.optional(), // the OSM object, "node/123" or "way/456", linked on the page (issue #118)
      }),
    ),
    longestGapKm: gap,
  });
// a place to sleep in the water tiers (issue #119)
const tierPoint = z.object({ kind: z.string(), name: z.string().nullable(), stage: z.string(), km: z.number(), osm: osmRef.optional() });

const derived = z.object({
  // pipeline/routes.py: each stage's length on the full matched OSM line and the share of its track
  // the match covers; km is the main route's sum, minCovered the weakest main stage
  measured: z
    .object({
      source: sourceRef,
      km: z.number(),
      minCovered: z.number(),
      stages: z.array(z.object({ number: z.string(), kind: stageKind, km: z.number(), covered: z.number() })),
    })
    .optional(),
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
          osm: osmRef.optional(), // the OSM object (issue #118); none for the record's own waterPoints
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
  // pipeline/popularity.py: views of the trail's Wikipedia articles by people over twelve months
  popularity: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      wikidata: z.string(),
      from: z.string(),
      to: z.string(),
      views: z.number().int().nonnegative(),
      articles: z.array(z.object({ project: z.string(), title: z.string(), views: z.number().int().nonnegative() })),
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
  // pipeline/along.py (issues #96, #97): shops to restock and places to sleep within withinM of the
  // route or stageEndM of a main stage's end, from OpenStreetMap
  along: z
    .object({
      source: sourceRef,
      retrieved: z.coerce.date(),
      withinM: z.number(),
      stageEndM: z.number(),
      routeKm: z.number(),
      resupply: alongGroup(["supermarket", "convenience", "general", "fuel"]),
      beds: alongGroup(["hut", "shelter", "campsite", "hostel", "guesthouse"]).extend({
        byGroup: z.object({ huts: z.number().int(), camping: z.number().int(), hostels: z.number().int(), rooms: z.number().int() }),
      }),
      // water in three tiers (issue #119, pipeline/along.py water_tiers()): drinking water (places
      // to sleep tagged drinking_water=yes added, `promoted`), with treatment (springs too), with
      // refills (other places to sleep within the water reach; shown, never rated)
      water: z
        .object({
          withinM: z.number(),
          promoted: z.array(tierPoint),
          refills: z.array(tierPoint),
          // clean: drinking water or a refill (the rating); refill: without any water at all
          longestGapKm: z.object({ drinking: gap, treatment: gap, clean: gap, refill: gap }),
          refillsUntreated: z.boolean().optional(), // the record's refillsUntreated: refills aren't clean water
        })
        .optional(),
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
