# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

huckepack is a website that collects and visualises data about official long-distance hiking trails worldwide, focused on well-known thru-hiking routes: one page per trail plus comparisons across trails. docs/scope.md holds decisions and open questions (record new decisions there), docs/data-sources.md lists sources with their licences, docs/roadmap.md ranks candidate trails and features (update it when one is built).

## Commands

```bash
npm install          # once (inside Claude Code's sandbox: npm_config_cache="$TMPDIR/npm-cache" npm install)
npm run dev          # local site at http://localhost:4321; runs detached (npx astro dev status | logs | stop)
                     # before starting: lsof -nP -iTCP:4321 -sTCP:LISTEN; if one is running, reuse it (it reloads
                     # on file changes). Claude Code's sandbox can't stop a detached server; the user has to.
                     # After adding an npm dependency, the server must be restarted: a running server serves
                     # the new package as "504 outdated dependency" and the page breaks.
npm run build        # dist/: the static site; fails if a trail file doesn't match the schema
npm run check        # type check (Astro, Svelte, TypeScript)

python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once (PyYAML, truststore)
.venv/bin/python -m pipeline.routes <slug>             # map line: OSM ways matched to the stages' tracks (cached in data/raw/<slug>/)
.venv/bin/python -m pipeline.routes <slug> --refresh   # download tracks and OSM ways again
```

Inside Claude Code's sandbox, pip needs `PIP_CACHE_DIR="$TMPDIR/pip-cache"`. Python downloads verify certificates through the OS trust store (`truststore`); never disable verification.

## Architecture

- `data/trails/<slug>.yaml`: the trail database, one file per trail; the file name is the URL slug. `src/content.config.ts` is its schema (Zod): every figure names a `source` id from the trail's `sources`, and the build fails on an unknown id. A source's `retrieved: null` means its figures are not yet checked; the page says "not yet verified". `status: draft` trails are built and badged as drafts (no release mechanism yet). `notes` holds discrepancies between sources and open questions; they are for us, not shown on the page.
- `src/lib/trails.ts`: derived figures, never stored: totals from the main stages (`kind: main`; approaches and variants are excluded), averages per day (only when days and stages share a source), and the SAC grade for filtering (stated, or converted from CAI with `CAI_TO_SAC`). Each result carries its source.
- `pipeline/`: Python, downloads and processes source data into `data/raw/<trail>/` (committed cache, with `manifest.json` retrieval times) and writes derived data. The site build never downloads. `pipeline/routes.py` builds `public/routes/<slug>.geojson`: one simplified LineString per stage (number, kind, coverage) of OpenStreetMap geometry, matched by `pipeline/osm.py` to the stage's `track` (GPX). The matcher fetches OSM ways within 200 m of the track (Overpass, cached as `osm-stage-*.json`) and takes the cheapest path from start to end, where a way costs its length × (1 + (distance from track / 15 m)²). The GPX only guides the choice; none of its geometry is published. The printed report flags stages where less than 95% of the track is within 30 m of the result: usually OSM is missing a path there; record it in the trail's `notes`.
- Maps: `src/components/TrailMap.svelte` (MapLibre GL, `client:visible`) draws the route over the OpenFreeMap "liberty" basemap (OpenStreetMap data, no API key); main stages solid, approaches and variants dashed, start and end as dots. The trail page passes the route only if `route` is set and the file exists; otherwise the map shows just the termini. The attribution names the route's source.
- `route.publishable: false` means the geometry's licence doesn't allow republishing it (official GPX tracks usually don't). Such routes are fine for local drafts but must not be deployed: replace them with OSM-derived geometry first. `data/raw/` may hold such files too; never copy them into `public/` other than through the pipeline.
- `src/pages/index.astro`: builds a compact summary per trail and passes it to `src/components/TrailList.svelte`, which filters in the browser (`client:load`). `src/pages/trails/[slug].astro`: one prerendered page per trail. `src/layouts/Base.astro`: shell and colour tokens, with dark mode overrides.
- Keep pages prerendered: only interactive parts (filters, maps, charts) become Svelte islands.
- Package versions are pinned exactly. TypeScript stays on 6.x until `@astrojs/svelte` and `@astrojs/check` support 7.

## Ground rules

- Only official trails: a route designated or maintained by a government body or a recognised trail association. Unofficial routes (for example the Hayduke Trail) are out of scope unless docs/scope.md says otherwise.
- Every figure on a page must come from a source listed in the trail's record (or, for sources used across trails, in docs/data-sources.md), with its licence and retrieval date. Check a source's licence before using it: official GPX tracks are often copyrighted, and OpenStreetMap data requires ODbL attribution.
- Trail lengths, elevation gain and similar numbers differ between sources. Show which source a number comes from rather than silently picking one, and never mix them in one figure.
