# Scope

## Decisions

- **Mission:** see [mission.md](mission.md). Every decision below and every new one
  is checked against it.
- **Design changes:** every bigger design change is first built as a local
  preview page with three different approaches; only the chosen one goes live
  (CLAUDE.md, "Working rules").
- **Data checks:** every new trail's figures are confirmed against a second,
  independent source (at most 10 % apart, larger gaps noted and shown with
  their sources), or, where none exists, checked on the finished trail page
  against the original source (CLAUDE.md, "Working rules").
- **Official figures stay primary:** when a second source disagrees by more
  than 10 %, the page keeps the trail operator's figure, even where it is
  probably the outlier; the other value is recorded in the trail's notes and
  `dataCheck`. The data check is internal quality assurance and not shown on
  the page (decided 2026-10-29) (decided 2026-10-29 for the Forststeig's stages 5–7
  and the Path of Sacred Forests' stage 3).
- **Trail length:** the key figure, page title, search cards and home page show
  the operator's stated total where the record has one, not the sum of the
  stages: stage lists often include the paths into the stage towns (the
  Moselsteig's 24 stages add up to 392.8 km against its 365 km). The stage
  sums stay in the stages table and feed the per-day averages and difficulty,
  which must share a source with the stages (decided 2026-10-30).
- **Ascent and descent:** the same rule as the length: the stated total pair
  (only when ascent and descent come from the same source, so one tile never
  mixes sources), else the stage sums, else the terrain model's estimate (≈).
  No measured ascent for comparing: the terrain model measures treetops and
  reads 15–60 % high in forests (decided 2026-10-30).
- **Measured length:** where every main stage's OSM match covers at least
  95 % of its official track, the length of our map line (the full match) is
  the comparable length: the search sorts by it and the home page sums it, so
  every trail is measured the same way. The page's headline stays the stated
  figure hikers see on signs and bookings; its popover gives the measured one
  (decided 2026-10-30). Below 95 % the stated figure stands in, since a
  stage whose match takes a shortcut would come out short.

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
  - Discrepancies between sources go in the record's `notes`; they are for
    us and are not shown on the page.
- **Maps:** every trail page has a map: an OpenStreetMap basemap from
  OpenFreeMap (free, no key) with the trail drawn on top. The preferred
  trail geometry is OpenStreetMap (ODbL, publishable with attribution): the
  official GPX tracks are matched to OSM paths by the pipeline, so only OSM
  geometry is published. Where OSM lacks a path, the line follows the
  nearest OSM paths and the gap is recorded in the trail's notes. Official
  GPX geometry itself is never published (`route.publishable: false` if a
  route ever has to use it).
- **Operator's personal data:** the legal notice and privacy policy must
  name the operator with a postal address and email, but those details stay
  out of the public repository (build-time Actions secrets). The two pages
  are noindex for search engines, reserve text and data mining, and are
  closed to known AI crawlers in robots.txt; the email address isn't in the
  page as text. None of this stops a scraper that ignores the rules; the
  pages themselves must stay publicly reachable by law.

- **Landscape:** the trail page shows the landscape along the route from
  ESA WorldCover (satellite land cover, 10 m) in six groups, as a sentence and
  one lane per group (issue #3; of three proposals, the lanes were chosen).
  Species or habitat detail would need another source.
- **Terrain:** surfaces, elevation and steepness are one section with one
  chart: the elevation profile coloured by its gradient over a slim strip of
  the ground underfoot, and one row of key figures in pairs (issue #15, four
  previews, 2026-10-29; issue #28 replaced the toggle between two views:
  approach A's chart with approach C's figures, 2026-10-30). The ground
  categories use natural colours (earth, sand, asphalt) everywhere on the
  site.
- **Trails with many stages:** from 12 main stages the stage list is a
  compact table with bars, the first 10 stages shown and the rest behind
  "Show all"; the charts shade every other stage and label every 2nd, 5th or
  10th (issue #25, from three previews, 2026-10-30).
- **Trail page order:** where is it (location and map, side by side since
  2026-10-30), is it for me and when
  (difficulty, climate), what are the days like (stages, terrain,
  landscape), what do I need on the way (sleeping, water), then the sources
  (2026-10-29).
- **Difficulty:** rated in three dimensions, terrain, climate (including
  wind) and effort, each Easy to Hard by fixed thresholds and its hardest
  measure ([difficulty.md](difficulty.md), issue #16). The SAC grade is a
  terrain measure, not a dimension of its own. Of three previews, the key
  figure of B (bars per dimension and the hardest level) and the cards of A
  were chosen (2026-10-29).

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
- **Releasing:** there is no draft status: every trail on `main` is published.
  Routes with `publishable: false` must still stay out of the deployed site.
- **Ads:** possible later. They need a GDPR consent banner and a privacy
  policy.
- **First trail:** see the ranking in [roadmap.md](roadmap.md).
- **Language:** English only?
- **Licence** for the code and for the derived data.
