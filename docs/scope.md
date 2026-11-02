# Scope

## Decisions

- **Mission:** see [mission.md](mission.md). Every decision below and every new one
  is checked against it.
- **Design changes:** every bigger design change is first built as at least
  three different approaches on the real pages, switched inline with a small
  preview switch (`PreviewSwitch.astro`), on a local branch; only the chosen
  one goes live (CLAUDE.md, "Working rules"; since 2026-11-01, before that a
  separate preview page).
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
- **Hut circuits:** a hut-to-hut route run by its huts (their keepers or
  their association) rather than by a park or a trail association counts as
  official when it has its own official website (Carros de Foc, El Anillo de
  Picos). The record's `managedBy` then says who runs it, e.g. "Carros de Foc
  (the nine refuges of the national park)", so the page doesn't suggest a
  park or government designates it. Without an official website it stays out
  (the Alta Ruta de los Perdidos, 2026-10-30) (decided 2026-10-30).
- **Popular trails** (issue #84): ranked by how often people read the trail's
  Wikipedia articles in twelve months, all languages (Wikimedia, CC0): an
  open, named measure of interest, not of hikers. huckepack keeps no visitor
  analytics. A trail without an article isn't ranked (decided 2026-10-30).
- **Trails near you** (issue #85): by the browser's time zone only (its main
  city from the tz database), worked out in the browser; no location
  permission, no IP lookup, nothing sent or stored (decided 2026-10-30).
- **Waymarks** (issue #82): every simple painted waymark a source describes
  (stripes, flags, diamonds, painted numbers) is redrawn as SVG on the trail
  page. Complex or protected logos are left out: the waymark's text stands
  alone (decided 2026-10-30; Wikimedia Commons was checked: its logo vectors
  carry doubtful licences, and its photos only read when large).
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
    elevation), marked as main, approach or variant. Totals and averages
    per stage are computed from the main stages, never stored, and only from
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
- **Stages where the official source has no day stages (2026-10-31,
  2026-11-01):** without official stage figures, Wikipedia's stage list,
  named as the source; where Wikipedia only lists places, the trail isn't
  built until an open stage source exists (the GR 10, the GR 65, whose
  stages are in FFRandonnée's paid topoguide, and the Cesta hrdinov SNP,
  2026-11-01). Where the official sections are far longer than a day (the
  Országos Kéktúra's 27 sections of 14–74 km), the stages are the operator's
  recommended day stages: figures summed from the official table between
  stamping points where a day ends at one, else estimated (≈) like any
  missing stage figure (2026-11-01). Where an official source names the day
  stages but no source gives their distances (the GR 20's 16 stages, with
  times only), the distances are our own, measured on the OSM map line
  between the stage ends, under their own source (`huckepack-measured`, "no
  source publishes them"), so the page says they are ours (2026-11-02).
- **Sleeping (issue #113, 2026-11-01):** beds have their own lanes in the
  Sleeping section (one per category, approach B of three previews); the
  rest is "Water & Supply". A category counts as available where the
  trail's source lists it or OpenStreetMap maps at least 3 places of it
  along the route, on the page, in the search filter and on the cards
  alike; OSM's shelters (day shelters, whatever their tagged type) don't count
  as beds.
- **Water in tiers (issue #119, 2026-11-01):** the availability rating is for
  clean water, drinking water or a refill at a hut, hostel, guest house or
  campsite within 500 m (first decided as drinking water only, with refills
  unrated; changed the same day). The page shows the longest stretch without
  clean water (rated), without any water (springs too) and without a shop;
  the search filter, the trail map and the guide offer "Clean water" or "Any
  water". In the chart, collapsible groups "Water" and "Shops" over their
  kinds (approach B of three).
- **Difficulty by month (issue #114, 2026-11-01):** without a pick, climate
  is rated for a trail's best run of at least two consecutive season months;
  months picked in the search (its When filter, the URL's `months`) re-rate
  the difficulty. A month pick in every page's header (approach A of three
  previews) did this until 2026-11-01; it was removed when the home page's
  trip search (issue #128) started asking for the months first.
- **Permits and fees (issue #104, 2026-10-31 and 2026-11-02):** a record
  keeps whether a permit is needed (its name, issuer, how and when to get
  it) and the trail's or park's own fees with currency and the year of the
  price, from official sources only; no hut or campsite prices, and no
  "not needed" without a source saying so. The page shows one short row in
  Location, "Permit: Required · fee charged" (approach A2 of the preview's
  compact versions of A): no how-to text, no amounts, no link. The fees stay
  in the record for a later filter.
- **Link previews with the skyline (issue #146, 2026-11-02):** a trail's
  social image keeps its name, countries and four figures and shows the
  trail's skyline (the page head's drawing, with the trail's own profile as
  the nearest ridge) on a band of day sky across the bottom, in place of the
  season and ground row (approach C of three); the ridge is one function
  (`profileRidge`, src/lib/skylines.ts) shared with the page head.
- **Places as layers on the trail map (issue #103, 2026-11-02):** under the
  legend, "Show on the map" switches for drinking water, springs, shops and
  places to sleep (only the kinds a trail has, with their counts), in the
  colours of the Water & Supply and Sleeping charts; a click shows the place,
  its kind and its link (its OSM object, or a record's own source). The
  places come from /places/<slug>.json (src/pages/places/[slug].json.ts,
  built from the derived data), loaded only when a layer is switched on, so
  the page carries none of them.
- **Light by default, the sun and moon as a switch (issue #155, 2026-11-02):**
  the site is light for everyone, whatever the system setting (no
  prefers-color-scheme rules any more); the header has no theme switch.
  An easter egg: a click on the sun, or the moon at night, in a drawing (the
  home page's hero, a trail page's skyline) switches between light and dark
  and remembers it (localStorage "theme"). The hero's text lets clicks
  through to the sun; its links, buttons, fields and the trip search don't.
- **The header (issue #154, 2026-11-02):** the same on every page: the
  logo and a search icon (the theme switch went with #155). The icon opens the trail search
  in the header row, left of it (approach A of three); on phones over the
  logo, across the header bar and clear of the icon, with 16 px text (iPhones
  zoom into smaller fields) and the suggestions across the screen.
- **Full view and reset view on the trail map (issue #152, 2026-11-02):**
  an "Expand" button (top left) grows the map over the whole window inside
  the page, where the wheel zooms without Ctrl; "Close" or Esc returns. Not
  the browser's full screen, which iPhones don't offer for maps. "Reset view"
  appears once the visitor has panned or zoomed and brings back the first
  framing, the whole trail (approach C of three).
- **Start, stages and finish on the trail map (issues #151 and #153,
  2026-11-02):** one kind of marker, after #151's midway number badges and
  boundary rings read as three kinds of circle beside the start and finish:
  a numbered stop where each main stage starts, numbered as in the stages
  table (stop 1, the start, filled dark and larger), and a dark disc with a
  white flag at the finish (approach A of three, following the research in
  #153: hierarchy by size, numbers that match the list, few marks, meaning
  in shape and labels rather than colour). The legend names the start and
  finish and explains the stops; the preview before the map loads shows
  the same start and finish.
- **Minimum figures (issue #148, 2026-11-02):** every trail shows its length,
  ascent and descent, days and averages. The ascent and descent may be the
  terrain model's estimate (≈) where no source states them. Days are the
  ones a source suggests, else one day per main stage (`trailDays()`, said
  so in the tile's popover; no provider published days for the Camí de
  Cavalls, Camino Francés, Goldsteig, Kungsleden, MacLehose Trail or
  Országos Kéktúra). The averages are per stage (`perStage()`: the main
  stages' totals over their number, so one source), the ascent from the
  stages' climbs or else the terrain model's per-stage estimate (≈);
  before, averages per day showed only where days and stages shared a
  source.
- **Link previews for every page (issue #147, 2026-11-02):** every page has a
  1200 × 630 image (approach B of three, a picture per page): the home page
  three trails' skylines, the trail search six trails as cards, the map the
  trails' starts on the world's land, the guide its questions; the legal
  notice, privacy and 404 the home page's picture under "huckepack" (Base's
  default, /og/page/site.png). In every link-preview image the address and
  cairn are small and muted in the top-right corner, clear of the headline.
- **The Location facts' order (issue #145, 2026-11-02):** by priority, in
  one grid (approach A of three previews): country and regions, start and
  finish, route type and permit, travel hubs, then protected areas, the
  managing body and waymarking. A fact alone before a wide one is widened,
  so no cell stays empty.
- **Legs that aren't walked (2026-11-02, the W Trek's catamaran):** treated
  like the Eifelsteig's closed stage and its train detour: drawn on the map in
  their own style (a dashed ink line, "By boat" in the key) and named in the
  note under the stages table and in the record's notes; no row in the table
  and in no figure (`stages.transfers`).
- **A crossing OSM maps as under construction (2026-11-01):** a stage may
  allow the matcher a longer bridge (`maxBridgeM`), noted in the record (the
  Cotswold Way's A417 at the Air Balloon, 133 m), instead of holding the
  trail until OSM opens the crossing.
- **Colour palette (2026-11-01):** the site's base colours turned from
  terracotta on cream to olive moss (accent #5a7526, #b4cb76 in dark mode) on
  a slightly greener cream, to look more outdoors while keeping the warm, calm
  page. Of three previews (forest green on green paper, moss on cream, pine on
  cool stone), moss was chosen: closest to the old warmth, and apart from the
  water blue. Chart, status and map colours are unchanged; every text colour
  passes WCAG AA in both modes.

- **Home page design (2026-11-01):** after several local previews, the home
  page is grouped by space rather than lines (numbered section heads, no
  rules or boxes, flat colours only), pairs a large visual with a list (the
  featured trail beside the popular trails, the map beside the trails near
  you), shows the recent trails as a logbook, and opens on a hero whose sky
  follows the visitor's clock, with ridges drawn from real trails' profiles.
  Gradients and textures were ruled out; the more drastic redesigns are kept
  as ideas in the "design exploration" issues (#129–#141).

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
