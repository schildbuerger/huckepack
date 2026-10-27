# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

huckepack is a website that collects and visualises data about official long-distance hiking trails worldwide, focused on well-known thru-hiking routes: one page per trail plus comparisons across trails. docs/scope.md holds decisions and open questions (record new decisions there), docs/data-sources.md lists sources with their licences, docs/roadmap.md ranks candidate trails and features (update it when one is built).

## Commands

```bash
npm install          # once (inside Claude Code's sandbox: npm_config_cache="$TMPDIR/npm-cache" npm install)
npm run dev          # local site at http://localhost:4321
npm run build        # dist/: the static site; fails if a trail file doesn't match the schema
npm run check        # type check (Astro, Svelte, TypeScript)
```

## Architecture

- `data/trails/<slug>.yaml`: the trail database, one file per trail; the file name is the URL slug. `src/content.config.ts` is its schema (Zod): every figure (`length`, `established`, `season`) names a `source` id from the trail's `sources`, and the build fails on an unknown id. A source's `retrieved: null` means its figures are not yet checked; the page says "not yet verified". `status: draft` trails are built and badged as drafts (no release mechanism yet).
- `pipeline/`: Python, downloads and processes source data into `data/raw/<trail>/` (committed cache) and writes derived figures into `data/trails/`. The site build never downloads.
- `src/pages/index.astro`: builds a compact summary per trail and passes it to `src/components/TrailList.svelte`, which filters in the browser (`client:load`). `src/pages/trails/[slug].astro`: one prerendered page per trail. `src/layouts/Base.astro`: shell and colour tokens, with dark mode overrides.
- Keep pages prerendered: only interactive parts (filters, maps, charts) become Svelte islands.
- Package versions are pinned exactly. TypeScript stays on 6.x until `@astrojs/svelte` and `@astrojs/check` support 7.

## Ground rules

- Only official trails: a route designated or maintained by a government body or a recognised trail association. Unofficial routes (for example the Hayduke Trail) are out of scope unless docs/scope.md says otherwise.
- Every figure on a page must come from a source listed in docs/data-sources.md, with its licence and retrieval date. Check a source's licence before using it: official GPX tracks are often copyrighted, and OpenStreetMap data requires ODbL attribution.
- Trail lengths, elevation gain and similar numbers differ between sources. Show which source a number comes from rather than silently picking one, and never mix them in one figure.
