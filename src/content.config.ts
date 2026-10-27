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
});

const trail = z
  .object({
    name: z.string(),
    localName: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    status: z.enum(["draft", "published"]),
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
        t.difficulty?.cai,
        t.difficulty?.sac,
        t.season,
        t.sleeping,
        t.wildCamping,
      ].flatMap((x) => (x ? [x.source] : [])),
    ];
    for (const ref of refs) {
      if (!ids.has(ref)) ctx.addIssue({ code: "custom", message: `unknown source id "${ref}"` });
    }
  });

export const collections = {
  trails: defineCollection({
    loader: glob({ pattern: "*.yaml", base: "./data/trails" }),
    schema: trail,
  }),
};
