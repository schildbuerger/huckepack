// The trail database: one YAML file per trail in data/trails/, checked here at build time.
// Every figure names the source it comes from (an id in the trail's `sources`), because
// sources disagree on lengths and similar numbers; the build fails on an unknown id.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const sourceRef = z.string().min(1);

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
});

const trail = z
  .object({
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    status: z.enum(["draft", "published"]),
    designation: z.string().optional(),
    managedBy: z.array(z.object({ name: z.string(), url: z.url().optional() })).min(1),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 code")).min(1),
    region: z.string(),
    termini: z.object({ start: point, end: point }),
    established: z.object({ year: z.number().int(), source: sourceRef }).optional(),
    length: z.array(z.object({ km: z.number().positive(), source: sourceRef })).min(1),
    season: z
      .object({ months: z.array(z.number().int().min(1).max(12)).min(1), source: sourceRef })
      .optional(),
    tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    sources: z.array(source).min(1),
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.sources.map((s) => s.id));
    const refs = [
      ...t.length.map((l) => l.source),
      ...(t.established ? [t.established.source] : []),
      ...(t.season ? [t.season.source] : []),
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
