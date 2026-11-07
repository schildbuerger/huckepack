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
  Shown as a panorama of the ten nearest (decided 2026-11-05, after three
  rounds of previews: five designs, five playful compasses, five panoramas;
  the printed summit panorama was picked, without its degree scale and without
  sideways scrolling, the names linking to the trails and colouring their
  drawing when pointed at). On phones a list under the drawing links them.
- **Every trail has a season** (decided 2026-11-05): the operator's, else a second source's
  (a park, a tourism board, Wikipedia's infobox); where a thorough search finds none, every month
  for now (source `huckepack-season`, naming what was searched), so the trail can be picked in
  every month of the search's When filter until a source gives one. The build requires it.
- **Photos per trail** (decided 2026-11-05, after the research of the same day and five previews:
  the mosaic picked): up to eight photos from Wikimedia Commons, found through the trail's Wikidata
  item (its photo, P18, and its Commons category, P373, with the subcategories named after it), only
  public domain, CC0, CC BY or CC BY-SA, no restriction tagged, a named author; a photo with a camera
  position within 1 km of the map line, placed at its kilometre, and spread along the route. Served
  as our own resized WebP copies (no hotlinking, no new host); each credited in the gallery (author,
  licence, linked to its file page) and the authors under the mosaic and in the Sources. A hand check
  drops a file through data/reference/photo-exclude.yaml. Not Unsplash or Pexels (keyword-tagged,
  nothing proves a photo shows the trail). A trail without usable photos keeps its page as before.
  Commons by location (the user's request of 2026-11-05, "photos close to the trail"): where the
  category leaves fewer than eight, a geosearch along the map line (a point every 2.5 km, 1.5 km
  round each) fills the gaps with photos whose position lies within 500 m of the line (stricter than
  a category photo's 1 km) and whose Commons categories say landscape, view, nature, castle and the
  like, never vehicles, interiors, people, events or a species close up (`scenic()`); quality marks
  and Wiki Loves Earth rank higher, at most two by one author. Same licence rules, credits and hand
  check; data/photos/<slug>.json names how each was found (`found`: category or location).
  Photos placed on the route come first, unplaced ones from the category last (2026-11-06,
  after the hand check found a category of signs and boards); the hand check of the first 22
  trails added rules against animals, ships, hotels, town squares, leaves, space photos and
  360° spheres.
- **Logbook** (issue #80): the recently added trails as hut stamps, grey until
  pointed at, then in their ink, in one band with the heading and the link to
  all trails (decided 2026-11-05, of five previews: hut book, hut stamps,
  postcards, a walk along the trail, an arrivals board).
- **Waymarks** (issue #82): every simple painted waymark a source describes
  (stripes, flags, diamonds, painted numbers) is redrawn as SVG on the trail
  page. Complex or protected logos are left out: the waymark's text stands
  alone (decided 2026-10-30; Wikimedia Commons was checked: its logo vectors
  carry doubtful licences, and its photos only read when large).
- **Trail length:** since 2026-11-07 (the user's decision) the total shown
  anywhere on the site (key figure, page title, description, link-preview
  image, search and home-page cards, the A–Z list, sorting and totals) is our
  measurement on the OSM map line (main route; variants and approaches left
  out; side trips walked there and back counted twice), in whole kilometres,
  where the route it measures is at least 95 % matched overall, weighted by
  stage length; else the provider's figure (stated total, else the stage
  sum), and the popover says why. One method for every trail, so lengths
  compare, and one figure with one source everywhere. Compared on all 131
  trails: 68 within 2 % of the provider's total, 31 within 2–5 %, 29 within
  5–10 %, 3 over 10 % (the Juan de Fuca Marine Trail, the Rakiura Track, the
  Florida Trail, each checked and explained in its record's notes); only the
  West Island Way (94 % matched) falls back. The Length popover names the
  provider's figure as "Official" with its source, and says the provider
  measures differently where they differ by over 10 %. The stage distances
  stay the provider's (stages table, averages per stage or day, difficulty).
  Before (2026-10-30): the operator's stated total, else the stage sum, since
  stage lists often include the paths into the stage towns (the Moselsteig's
  24 stages add up to 392.8 km against its 365 km; we measure 391 km).
- **Ascent and descent:** since 2026-11-07 (the user's decision) the total
  ascent and descent shown anywhere on the site (key figure, search and
  home-page cards, the link-preview image, the averages per stage or day, the
  difficulty's climbing per km, the search's "least climbing per km") is our
  terrain-model estimate: GEDTM30 along our OSM map line, summed per main
  stage with the 10 m threshold (over the whole route for a trail without
  stages), to 10 m, marked ≈ as an estimate. The same gate as the length:
  where our map line covers under 95 % of the route, or there is no elevation
  profile, the provider's figure (the stated pair from one source, else the
  stage sums), and the popover says why; where no source states one, the
  estimate all the same (today only the West Island Way, 94 % matched, with
  no stated climbs). The popover names the provider's figure as "Official"
  with its source and adds "Keep in mind" where they differ by over 10 %.
  The stage table keeps each stage's stated climbs (estimates only where a
  stage has none), and DIN walking times stay on each stage's own figures.
  Evidence: on the 34 trails with an official ascent, GEDTM30 with the 10 m
  threshold came out 0 % in the median against the official figure, mean
  |gap| 8 %, 24 within 10 % (see Terrain model below). Of the 38 trails that
  showed a provider's figure until then (19 stated totals, 19 stage sums),
  the largest changes: the Great Divide Trail 74,273 → 33,980 m, the South
  West Coast Path 35,000 → 23,100 m, the Camí de Cavalls 3,548 → 2,180 m, the
  Rockwall Trail 3,405 → 2,320 m, the New England Trail 10,609 → 7,470 m, the
  Országos Kéktúra 31,915 → 25,650 m, the Pacific Northwest Trail 70,238 →
  60,550 m; coastal paths' short ups and downs stay under the threshold.
  **Climbs from 100 m samples on every trail** (the user's decision,
  2026-11-07): the six trails over 1,000 km keep their 500 m profile for the
  page (page weight), but pipeline/elevation.py samples their main stages a
  second time every 100 m for the climbs alone (`stageClimbs` per main stage
  in the derived elevation, written for every trail, so the site no longer
  sums the chart's samples). With 500 m samples their climbs had come out
  25–58 % under the official figures; with 100 m: the Great Divide Trail
  31,520 → 33,980 m (−54 % against the association's stage sums), the South
  West Coast Path 15,920 → 23,100 m (−34 %), the Kéktúra 22,480 → 25,650 m
  (−20 %), the Pacific Northwest Trail 52,520 → 60,550 m (−14 %), the Arizona
  Trail 22,570 → 25,430 m and the Florida Trail 1,510 → 2,400 m (no official
  figure). Over the 38 trails with a provider's figure: median −0.3 %, mean
  |gap| 11.9 % → 10.7 %, 24 within 10 %; the profiles of the trails up to
  1,000 km are unchanged. **Side trips walked there and back** (the user's
  decision, 2026-11-07; `outAndBack` variants, the W Trek's and the O
  Circuit's valleys) count both ways, as the measured length counts them
  twice: each one's map line is sampled every 100 m, and its climbs one way,
  up plus down, are added to both the total ascent and the total descent
  (the popover's How row says so). The W Trek 760 → 2,990 m up (830 → 3,060
  m down), the O Circuit 2,790 → 4,350 m up (2,820 → 4,380 m down); neither
  operator states a total. Before (2026-10-30 to 2026-11-07): the
  stated pair, else the stage sums, else the estimate (≈), since a terrain
  model's sum was taken as no fair measure (the Copernicus GLO-30 surface
  model read treetops, 15–60 % high in forests).
- **Terrain model: GEDTM30 with a 10 m climb threshold** (the user's decision,
  2026-11-07): every trail's heights come from GEDTM30 v1.2, OpenGeoHub's
  global ensemble digital terrain model (bare earth, 30 m, CC BY 4.0; Ho et al.
  2025, PeerJ 13:e19673; derived from Copernicus GLO-30 and AW3D30), in place of the Copernicus GLO-30
  surface model, which reads the treetops in forests. One model for every
  trail: a profile never mixes models. Ascent and descent summed from it count
  a climb only once the height has risen 10 m above the last reference height,
  a drop likewise (`CLIMB_THRESHOLD_M`, src/lib/trails.ts and pipeline/all.py;
  per stage along the stage's own samples); gradients, steepness and the
  profile keep the raw heights. Tested on the 34 trails with an official
  ascent, sampled every 100 m: GLO-30 raw sums ran +22 % in the median against
  the official figure (mean gap 27 %, 9 trails within 10 %); GEDTM30 with the
  10 m threshold 0 % in the median (mean gap 8.2 %, 24 within 10 %); on the
  forested German trails +1 … +11 % (GLO-30 even with 10 m: +12 … +26 %).
  Lidar models (Saxony DGM1, ČÚZK DMR 5G) stay candidates only: national, so
  not one model for all. The Copernicus DEM's notice and liability disclaimer
  were removed from the records (`copdem` source) and the legal notice
  (2026-11-07, the user's decision): no figure on the site comes from it any
  more; GEDTM30's own CC BY citation covers the heights.
- **Building a trail:** docs/trail-building.md is the one checklist from
  picking a trail to going live; rules for building trails go there, dated
  (decided 2026-11-04).
- **The operator's start and stages:** a trail starts and ends where its
  operator says, even when the operator's GPX or stage pages begin later; a
  climb the operator counts is a main stage, a way in it doesn't count an
  approach, never dropped (decided 2026-11-04, the Berliner Höhenweg's stage 1
  from Finkenberg).
- **Totals for another stretch:** stated totals that cover a different
  stretch than the main stages stay out of the record; the page sums the
  stages and the operator's figures go in a note (decided 2026-11-04).
- **Measured stage distances:** where the operator names the stages but its
  distances are missing or broken, each stage's length is measured on the
  full OSM match under the `huckepack-measured` source, always, noted in the
  record (decided 2026-11-04).
- **What a record needs:** three tiers, enforced by the build: required
  fields; fields filled from a source or explained by a note starting with
  their label ("Season: none stated by …"): season, wild camping, waymarking,
  Wikidata, length, days, protected areas; and fields only where they apply
  (docs/trail-building.md). The 59 gaps on the live trails were researched
  and filled or explained the same day (decided 2026-11-04).
- **Unattended runs:** well-known trails with openly published stages, up to
  about 1,000 km, started only when the build fits the time left, with about
  60 minutes per trail before a blocker is documented and the run moves on
  (decided 2026-11-04).
- **Official GPX:** the trail page links the operator's own GPX download
  (`officialGpx`, issue #106); huckepack never offers a download of its own
  line and never stores an official GPX. Optional: filled where the operator
  offers a public download, `none` with a reason where it plainly doesn't
  (decided 2026-11-05). The link goes to the operator's page that offers the
  file, never to the file itself: we don't route walkers around the
  operator's website (decided 2026-11-05).
- **Our own GPX:** only where the operator offers none, the page offers our
  tracing from OpenStreetMap as a GPX (ODbL, with the notice and the OSM
  data's date in the file), leaving out stages under 95 % matched, where OSM
  differs from the trail. Each GPX link carries a note on its source: the
  provider, or just "Our tracing from OpenStreetMap" (decided 2026-11-05).
- **Measured length:** the length of our map line (the full match) is the
  trail's length everywhere since 2026-11-07 (see Trail length), where the
  route is at least 95 % matched overall, weighted by stage length; below
  that the provider's figure stands in, since a stretch the match shortcuts
  would come out short. Before (2026-10-30 to 2026-11-07) it was only the
  comparable length (search sorting, home-page totals), used where every main
  stage was 95 % matched, while the headline kept the stated figure.

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
- **Repository:** public on GitHub (`schildbuerger/huckepack`); everything on
  `main` goes live.
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
- **Trails without stages (2026-11-03):** where the official source defines no
  stages at all, because hikers choose their own camps or nights (the
  Wonderland Trail's 21 designated camps, the John Muir Trail), the trail is
  still published, without a stages section. This applies only to trails with
  no stages by design. A trail whose official stages exist but aren't openly
  published (the GR 10, the GR 65) keeps the rule above. The rules:
  - **Official days required:** a stage-less trail is published only when an
    official source suggests its days; no guessed days.
  - **Averages per day** come from the length (and the ascent and descent)
    over the suggested days. Where the length and the days come from
    different sources the averages still show, and their popover names both.
    A range of days gives a range ("11–17 km a day", from the most and the
    fewest days), never a midpoint no source states.
  - **Effort** is rated from an average day at the fewest suggested days: the
    length, ascent and descent divided evenly, timed by DIN 33466, marked as
    an estimate (≈). It's the hardest plan a source suggests, so it doesn't
    understate the day.
  - **The page says why:** the Days key figure's popover reads "No official
    stages: hikers choose their own camps", with the days' source.
  - **Kilometres, not stage numbers:** charts and tooltips that name a stage
    elsewhere give the kilometre along the route instead; the chart axes
    show kilometre marks only.
- **Sleeping (issue #113, 2026-11-01):** beds have their own lanes in the
  Sleeping section (one per category, approach B of three previews); the
  rest is "Water & Supply". A category counts as available where the
  trail's source lists it or OpenStreetMap maps at least 3 places of it
  along the route, on the page, in the search filter and on the cards
  alike; OSM's shelters (day shelters, whatever their tagged type) don't count
  as beds.
- **Dangerous animals and plants (issue #156, 2026-11-02):** the trail page's
  Wildlife section shows the animals that can be dangerous to hikers in the
  trail's region (large animals, venomous snakes, scorpions and spiders, ticks;
  no insects) and plants that harm on touch (giant hogweed), only where an
  official source (a park service, a wildlife or health agency) names them;
  what to do and not to do in its words, the level (Low, Moderate, High) our
  own with its basis, by one rule read from the official source (checked for
  every entry 2026-11-02): High where the source calls the species common
  and a bite can be life-threatening within hours or needs antivenom;
  Moderate where it warns of attacks or serious harm (injury, encephalitis,
  severe burns, a dangerous infection, a life-threatening sting) or places
  the trail in an official TBE risk area; Low where the harm is mostly minor
  or treatable (Lyme disease) or avoidable by behaviour alone. Where an official source says the region has none, the
  page says so with the source; otherwise the section is left out. Of three
  previews, approach C, reworked into one wall-to-wall band: the trail's own
  skyline with the animals and plants as PhyloPic silhouettes in front,
  labelled like a panorama board, each opening its advice in a dialog. Hand-drawn
  animals fell short of public silhouettes in a side-by-side check.
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
- **Skylines without cut-offs (2026-11-03, the user's rule):** no skyline
  shape may end in a sharp edge where it meets the foot of the drawing; every
  landform runs smoothly down to the ground. `range()` gives any broad shape
  (80 units or wider) whose end drops steeper than 2 : 1 a curved foot that
  meets the ground tangentially, as far out as the drop is high; slender
  shapes (sea stacks, rock pillars, trunks, towers) keep their steep sides.
  The drawing's left and right edges count too (2026-11-04): the miniature
  stands inside the band, so no shape may reach them above the ground;
  shapes that run to an edge are cut back by 1.5 × their height there and
  ease down to the ground in an S-curve. A test checks every skyline
  (tests/trails.test.ts).
- **Ready for hundreds of trails (issue #93, 2026-11-02):** no page carries
  every trail: one cached file of search summaries for the search, map,
  guide, header search and trails near you; the search page's first 24 cards
  in its HTML, the rest loaded after; seven featured-trail candidates per
  build; a fixed point budget for the map's route file. Measured with 150
  synthetic trails (pages nearly flat, against 1.5–2.2 MB before).
- **Places as layers on the trail map (issue #103, 2026-11-02):** a Layers button inside the map, under the zoom buttons, opens a small
  panel "Show on the map" with drinking water, springs, shops and places to
  sleep (only the kinds a trail has, each with its icon in its colour and its
  count; approach A of three, with C's icons); the dots are in the colours of
  the Water & Supply and Sleeping charts (the legend doesn't list them: the
  panel names them); a click shows the place,
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
  terrain model's estimate (≈) where no source states them. Days: until
  2026-11-07 the ones a source suggests, else one day per main stage
  (`trailDays()`, said so in the tile's popover); since then by the rule
  below (Where days come from), so a trail can have none. The averages are
  per stage (`perStage()`: the main stages' totals over their number, so
  one source), the ascent from the stages' climbs or else the terrain
  model's per-stage estimate (≈); before, averages per day showed only
  where days and stages shared a source.
- **Where days come from (the user's rule of 2026-11-07):** a trail's
  suggested days come, in this order, from (1) the trail's official
  operator or maintainer, searched thoroughly (site, stage, FAQ, planning
  and thru-hike pages, brochures, in the trail's languages); (2) a trusted
  second source (Wikipedia, a government or tourism body, a national park
  service, a national trail portal, a recognised hiking association, a
  guidebook publisher's fact page; not hotels or tour companies); (3) one
  day per main stage, only where the stage list is the operator's. A trail
  that fits none has no days. Every record states its `days.basis`
  (`operator`, `secondary`, `stages`; src/content.config.ts), so nothing
  falls back silently: `trailDays()` returns the record's days only. The
  Days key figure's popover names the source, for `stages` "one per stage
  of <operator>'s stage list", for `secondary` that the operator suggests
  none; a trail without days shows no Days figure, a dash on the search
  cards, nothing in the preview, season planner and link-preview image,
  and the search's How long filter (and the guide's and the trip search's
  day ranges) keep it while no length is picked and leave it out once one
  is. First applied to all 131 trails the same day (docs/trail-building.md,
  "Required"): 89 from the operator, 14 from a second source, 27 one per
  operator stage; the Országos Kéktúra fits none (its days 38–59 are our
  grouping, MTSZ suggests no days, nor does a second source). Las Torres (a
  hotel and tour company) no longer gives the O Circuit's days (Wikipedia's
  7–9 since); the Kerry Way's and Wicklow Way's Sport Ireland days count as
  a second source, the Alpe-Adria-Trail's and Sauerland-Waldroute's as one
  per operator stage.
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
- **A river ferry within a stage (2026-11-03):** where a walking stage
  crosses a river by a small ferry (the Pieterpad's over the Rhine at
  Millingen and over the Maas twice), the matcher bridges it like a missing
  crossing (`maxBridgeM`, and `maxBridges` where small unconnected bits of OSM
  near the track use up the default six first); the record's notes name the
  ferries. A leg between stages that isn't walked stays a transfer.
- **A lift within a stage (2026-11-03, the Adlerweg):** where the operator's
  stage rides a cable car or funicular (the Adlerweg's Rofanseilbahn down to
  Maurach, the Nordkettenbahnen into Innsbruck, the Grubigsteinbahn up from
  Lermoos), the ride is a transfer with the `stage` it lies in: the stage keeps
  its number and stated figures (which leave the ride out), its map line is the
  walked pieces on either side, matched on their own, and the ride is drawn in
  the ink style of a ride (a thin line with ties, "By cable car" in the key)
  and named in the note under the stages table; in no figure. Of three ways
  (a transfer, cutting the stages at the lift stations, a walked variant
  alongside), decided: a transfer, so the stages stay the operator's.
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
  - 2026-11-07: USPs removed; hero fills the first screen, title and search
    centred; eyebrow "Official long-distance trails, in data" (the user's
    request).
  - 2026-11-07, from a review against Baymard's usability findings (the
    user's picks): the sun or moon keeps its hour's arc but never stands on the
    hero's words (#290); tap targets at least 44 px (7 mm) without a change in
    look; small text at least 11–12 px (the summit flags' labels, shown on
    phones too, the eyebrow, the stamps' words; #1085); the popular cards say
    "Wikipedia views, last 12 months" and the (i) links Wikimedia's pageviews;
    the logbook's stamps are inked on touch screens as they scroll into view;
    the sticky bar's and the film's button read "Find a trail".
  - 2026-11-07, the user's decisions on the review's previews: the popular
    trails on phones are row cards (approach A of three: the route small on
    the left, name and figures on the right), and the page views leave the
    cards everywhere (the (i) still says they rank the list, with Wikimedia's
    source); on wide screens the three stand in rank order, 1 2 3 from the
    left, as they always looked (the "first in the middle" rule had never
    applied); the explainer film and "On every trail page" stay two sections
    (three ways of merging them were previewed), the list gaining Photos and
    Wildlife in the trail page's order; the hero's water flag on phones reads
    "water points" on two short lines; the smaller phone sun, low beside the
    flags, stays.

- **Explainer film (2026-11-04, the user's choices):** right after the about
  band (of three places, approach A), whose colour comes down into the film's
  sky as a row of flat clouds; the featured trail's wave rises straight out of
  the film's ground, which runs on a little under it, and the band's sides
  carry the film's grass in step with it. A 25-second film on the home page
  shows what huckepack does on
  one real trail, the most read one (the popular-trails measure): the Tour du
  Mont Blanc. Of three storyboards, "one day on the trail" was chosen, then
  (the same day) told as one panel per kind of information a trail page gives,
  opening on "For every trail you will find…", each fading over to the next:
  route, elevation and ground underfoot, climate month by month (the trail
  page's climate chart simplified: night low to day high at the lowest and
  highest point, the season shaded), drinking water (a village fountain, its
  spout running), wildlife to know about (the record's most serious entry, a
  suckler cow with her calf, drawn and moved in stop motion like the hiker;
  the user asked for an animal more dangerous than the guard dogs, so suckler
  cows were added to the record from Vache mère Suisse's rules for hikers),
  places to sleep (one tent, its lantern lit, the light flickering); then
  find the trail that suits you (with "Explore the
  trails" as the way on; this last title sits in the frame's middle, the
  others, the opening title and play button too, at the top). Each panel has one
  short centred title naming the kind of information, no questions, no time
  of day and no figures; the
  sky still runs from dawn to night in the hero's flat colours. Real data
  throughout for the route, profile, ground and climate; water and places to
  sleep are shown as one fountain and one tent.
  The film plays in the page's column; the band behind it, wall to wall,
  continues the film's flat edge layers (sky, meadow, ground) in the same
  colours, frame by frame, so the film has no visible edge. The Mont Blanc
  massif is the only ridge: the elevation profile is a line in the sky,
  coloured by the ground underfoot, and water and beds stand on the meadow
  at the massif's foot. No sources line in the film (they stay in the
  screen-reader text and on the trail page). The hiker, of three looks the one in
  the yellow rain jacket (chosen as gender neutral), moves in stop motion
  (held frames at 8 a second, a slight jitter between frames, a squash on each
  footfall); the data layers move smoothly. A wall-to-wall band shows a still
  behind a play button and plays only on a click, loading its player and data
  then (under ~150 KB); titles are page text, with pause and replay; with
  reduced motion the still stays and the captions are shown as text. Sound is
  optional and off by default: footsteps, birds and crickets synthesised in
  the browser, no recordings. 16:7 on wide screens, 10:11 on phones.
- **Outgoing links (2026-11-07, the user's decision):** links to other
  websites are followed by default (operators, authorities, science,
  Wikipedia and Commons, data and licences). `nofollow` only for commercial
  businesses cited as sources that aren't the trail's managing or official
  body (hotels, tour and travel companies, ferry and boat companies,
  commercial portals such as Outdooractive), decided per URL in
  `data/reference/commercial-links.yaml` (a park's own booking page and a
  tourism board's own tour portal count as official), and for the per-place
  links the charts and the map make (OpenStreetMap objects, a place's own
  source). Never `sponsored` or `ugc`: nothing is paid and nothing is
  written by visitors. `noopener` without `noreferrer`, so operators see
  huckepack.me (the origin only) as where visitors came from. The new tab and
  rel are written into the HTML at build time, not only by script; the
  footer's Legal notice and Privacy links lost their `nofollow` (the pages
  are noindex already).
- **Feedback (2026-11-07, the user's decision):** visitors give feedback by
  email only, no form, on a page of its own, `/feedback/`, linked from the
  footer. Of three previews (plain, guided, a trail postbox), approach C: a
  band in the hero's flat style with a postbox by a cairn, whose button
  "Open the postbox" shows the address. The address is an alias of its own
  that can be switched off and replaced (`FEEDBACK_EMAIL`, never in the
  repository) and is never readable in the page: it is assembled only on the
  visitor's click, with no plain-text fallback without JavaScript. The page is
  noindex like the legal pages, out of the sitemap, and closed to AI crawlers
  in robots.txt. No entry points on trail pages for now (a "Report a
  correction for this trail" link was previewed and left out), so no
  per-trail subject either. The privacy policy's "Feedback by email" keeps
  messages 12 months after the matter is settled (to be confirmed by the
  user) and names the mail provider, Proton Mail (Proton AG, Switzerland,
  processor under Art. 28 GDPR; Swiss adequacy decision, Art. 45).
- **Travel hubs by rule** (the user's decisions of 2026-11-07, after a study of
  every trail's hubs under four airport and two station definitions): hubs
  were chosen by hand until then, with domestic airports, small local
  stations and one wrong code (the Sentier international des Appalaches'
  "Bathurst Regional Airport (YZT)": YZT is Port Hardy, Bathurst is ZBF, and
  domestic). Now, for the start only (no end hubs):
  - Airports: the nearest by road with year-round scheduled international
    passenger flights (English Wikipedia's "Airlines and destinations"
    tables, destinations' countries from Wikidata, charters and routes that
    only begin later left out), however far, with its road distance (no
    cap), plus a second one within 1.25 × + 20 km of the first; where one
    with seasonal international flights only is much nearer (the year-round
    one beyond 1.25 × + 20 km of it), that one too, labelled "seasonal
    international flights". Domestic-only airports are dropped. Cross-border
    airports count. Corsica keeps its two seasonal airports (Calvi, Bastia)
    and lists no year-round one.
  - Stations: the nearest served by long-distance trains (on at least two
    OSM long-distance, high-speed or night train relations) and, when it
    isn't in a city of 100,000 (GeoNames), the main station of the nearest
    such city, each within 300 km by road (our cap: stations further away
    help no one); hand overrides where OSM's tagging misses a service, each
    with the operator's page. The hand-picked main bus station stays where
    there is no long-distance railway within reach (and on Menorca and
    Tasmania, islands without railways). Small local stations that aren't
    hubs are replaced.
  - Islands: a mainland hub runs by road to the island's ferry port (`via`,
    "then ferry"), hubs on the island straight to the start.
  - The page lists trains and buses first, then airports.
  `pipeline/hubs.py` suggests the hubs by these rules; each record's hubs
  were reviewed by hand. The sources behind the choice are named once in
  docs/data-sources.md ("Travel hubs"). On 2026-11-07, over the 131 trails: 202 airports
  (105 kept, 97 new, 76 dropped; the nearest airport changed on 48 trails, 3
  had none), 15 labelled seasonal, 16 trails whose nearest year-round airport
  is over 300 km by road (up to 877 km, MSP for the Pukaskwa); 180 stations
  (48 kept, 132 new, 65 dropped; the nearest changed on 60 trails, 19 gain
  one), 13 bus stations kept and 6 replaced by a station; 18 trails without
  a station. Known gap: OSM tags few French TGV relations, so French trails
  get the nearest tagged station (Corsica: Marseille Saint-Charles by the
  ferry port).

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

