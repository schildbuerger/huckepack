# Scope

## Decisions

- **Name:** huckepack (German for carrying someone piggyback, from Low German
  *Hucke*, a load carried on the back). huckepack.com is taken; the domain
  ending is still open (see below).
- **Subject:** official long-distance hiking trails worldwide, focused on the
  well-known routes commonly thru-hiked. "Official" means designated or
  maintained by a government body or a recognised trail association.
- **Shape of the site:** one page per trail, plus pages that compare trails
  (length, elevation, season, climate, cost and time to complete).
- **Provenance:** every page names its sources, their licences and when the
  data was retrieved. Where sources disagree (length is the usual case), the
  page says so.
- **Repository:** local git repository for now; if it moves to GitHub, a
  private repository like healthviz.
- **Stack:** a static site generated from a trail database; no server.
  - A Python pipeline (`pipeline/`) downloads and processes source data
    (OSM, elevation, climate), cached in `data/raw/`.
  - Trail records are one YAML file per trail in `data/trails/`, committed
    and checked against a schema (`src/content.config.ts`) at build time.
  - Astro builds one prerendered page per trail; Svelte islands handle the
    interactive parts (filters, maps, charts).
  - Filtering runs in the browser on a compact index of all trails.
  - Planned: Pagefind for search, MapLibre GL with a Protomaps or
    OpenFreeMap basemap, trail lines as PMTiles, and hosting on Cloudflare
    Pages with tiles on R2.
  - A backend (Postgres/PostGIS) only once there are accounts, user
    contributions, daily-changing data, or thousands of trails.

- **Trail record** (schema in `src/content.config.ts`):
  - Difficulty: show the trail's own scale (e.g. CAI) and SAC side by side;
    filter on SAC. Where only CAI is known, SAC is converted (T→T1, E→T2,
    EE→T3, EEA→T4, the lower bound where the scales overlap) and labelled as
    converted.
  - Stages are recorded per trail (km, ascent, descent, time, start and end
    elevation), marked as main, approach or variant. Totals and averages per
    day are computed from the main stages, never stored, and only from
    figures of the same source.
  - Sleeping: only which types exist along the trail (huts, campsites,
    hostels, …), not individual places. Wild camping as allowed, restricted
    or prohibited, with the rule in words and its source.
  - Discrepancies between sources go in the record's `notes` and are shown
    on the page as open questions.

## What a trail page could show

- Route on a map, with sections or stages
- Elevation profile and total ascent/descent
- Terrain and surface, land cover along the route
- Climate along the route by month (temperature, precipitation, snow), and the
  resulting hiking season
- Resupply towns, water sources, shelters and campsites
- Permits, fees and regulations
- Trail history and statistics (completions per year where the trail
  association publishes them)

## Open questions

- **Domain and hosting:** candidates are huckepack.org (most trusted for a
  reference site) and huckepack.me ("carry me"; Google treats .me as
  generic), with huckepack.de as a cheap redirect to protect the name. A .eu
  works for search but is less familiar outside Europe. Avoid endings that
  are cheap only in the first year. Check availability and renewal prices
  before deciding.
- **Ads:** possible later. They need a GDPR consent banner and a privacy
  policy.
- **First trail:** see the ranking in [roadmap.md](roadmap.md).
- **Language:** English only?
- **Licence** for the code and for the derived data.
