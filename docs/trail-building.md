# Building a trail

The path from picking a trail to its page going live, as one checklist. CLAUDE.md holds the
ground rules and the pipeline's mechanics; docs/scope.md holds the dated decisions this
playbook follows. When a rule here changes, date it.

## 1. Pick

- **Official only:** designated or maintained by a government body or a recognised trail
  association; a hut circuit run by its huts counts when it has its own official website
  (docs/scope.md).
- **Fits the mission:** a long-distance trail people walk end to end, with stages.
- **Unattended runs** (a time-boxed run without the user, decided 2026-11-04):
  - well-known trails only, whose stages are published openly: no bot check, no login, no
    certificate error;
  - up to about 1,000 km;
  - before starting, estimate the build against the time left (stages, Geofabrik extracts to
    download, data check, skyline, wildlife, page check: about half an hour for a short trail
    since 2026-11-06); if it won't finish, do the research and write the issue only;
  - a time box of about 60 minutes per trail: if it isn't through the pipeline's check by then,
    document where it stands on the issue as a blocker and move on.

## 2. Issue

- One issue per trail, in the "Add a trail" form's shape (`.github/ISSUE_TEMPLATE/add-trail.yml`):
  official name and country, website, who runs it, the stage list, track or OSM relation,
  season, sleeping and camping, a second source.
- Look for a blocker before building:
  - a bot check, login or broken certificate on the official source (never worked around, never
    with TLS verification off);
  - no official stage list;
  - neither a track nor an OSM hiking relation;
  - stage pages drawn by JavaScript with no readable track (the Rheinsteig, #217) count until a
    reader exists.
- **Preflight first** (2026-11-06): `~/.venvs/huckepack/bin/python -m pipeline.preflight --url
  <official page> --relation <id> …` (or `pipeline.preflight <slug>` once the record exists)
  checks in seconds what a full pipeline run found only after half an hour: a bot check, login or
  refusal on the links, a failing certificate, and whether the OSM relations chain into one line
  near the stated length (the Bruce Trail: 129 of 876 km in one line, 756 km left over). It
  changes nothing; a BLOCKER line is a reason to stop or to plan the fix (`via`, `joinM`).
- **A blocker goes on the issue:** what was tried, what is missing, the next step. The issue
  stays open; move on to the next trail.

## 3. Sources

- **The operator first:** the managing body's own site or the official trail portal. A tourism
  board's portal counts when it publishes the trail (Tirol Werbung).
- **Order for each figure:** the operator's stated figure, else a second official source, else
  derived (measured on the map line, estimated from the terrain model), marked as such. Never
  mix sources in one figure.
- **Licences:** official GPX tracks are copyrighted: they guide the matcher, stay in the
  git-ignored cache and are never committed or published; only the OSM map line goes out. The
  page may link the operator's page that offers it (`officialGpx`), never the file.
- **Wildlife and tree line:** official sources only (park, health or agriculture authority;
  forest service, `data/reference/tree-lines.yaml`).

## 4. Record

`~/.venvs/huckepack/bin/python -m pipeline.new_trail <slug> "<Official name>"`, then fill every
null.

- **Start and finish are the operator's** (decided 2026-11-04, the Berliner Höhenweg): where the
  operator says the trail starts and ends, even when its GPX or stage pages begin later.
  - A climb from the valley that the operator counts as a stage, by number or as the starting
    point, is a main stage.
  - A way in or out that the operator doesn't count is an `approach`.
  - Never just dropped.
- **Stage numbers are the operator's:** no gap in the main stages' numbers without a stage for
  it or a note why.
- **Stated totals cover the same stretch as the main stages** (decided 2026-11-04): where the
  operator's length, ascent, descent or days cover a different stretch (Tirol's 71 km from the
  Gamshütte, while the trail starts in Finkenberg), leave them out of the record. The page then
  sums the stages, estimating the ascent from the terrain model where stages lack it. Record the
  operator's figures in a note.
- **Distances, always measured where the operator's are missing or broken** (decided 2026-11-04):
  when the operator names the stages but gives no usable distances (none, or broken like Tirol
  Werbung's: the same 15.3 km on three stages, 22.4 km in 2½ hours), take each stage's length
  from the full OSM match (`pipeline.all`'s report) under the `huckepack-measured` source. Say
  why in the stages' comment and the data check. Keep the operator's times, climbs and heights
  where they are usable.
- **Ascent without descent** (2026-11-05, the Three Lochs Way): an `ascent` total or stage
  `ascentM` values without their descents leave the page with no Ascent key figure and no Effort
  rating, since it needs the pair; put such figures in a note ("Ascent: …") and let the page
  estimate both from the terrain model.
- **Broken figures:** a stage figure is broken when the same value repeats across different
  stages, the pace is outside about 1–6 km/h, or it disagrees with the operator's own track by
  more than 25 %. Note it and use the next source in order.
- **`added`:** the day the trail goes live (the home page's logbook and the search's "Newest
  first").

### What a record needs

Three tiers, enforced by the build (decided 2026-11-04; `src/content.config.ts`, the trail
schema's superRefine; the skyline by `tests/trails.test.ts`):

- **Required.** The build fails without these:
  - name, `added`, website, `managedBy`, route type, continents, countries;
  - `termini`;
  - `stages`: every main stage with number, from, to, km, and a `track`, or a `relation`
    and/or `end` (on `route.relation`); or, for a trail with no stages by design (hikers choose
    their own camps, docs/scope.md "Trails without stages"), `stages: { none: true, source }` with
    official `days`, and the whole route guided by `route.relation` or one GPX in `route.track`
    (issue #204, the Wonderland Trail);
  - `route`;
  - `difficulty`: stated, converted from CAI, or our estimate with its `basis`;
  - `sleeping`;
  - `access`: at least one hub;
  - `dataCheck`;
  - wildlife: `animals`, `animals.none`, or a note starting "Wildlife";
  - `sources`;
  - a skyline;
  - `treeLine` when the route goes above 1,500 m (the pipeline's check).
  - `season` (decided 2026-11-05): research it thoroughly: the operator's pages (also rendered
    in a browser where the text comes by script, and FAQs, booking and hut pages), then a second
    source (a park, a tourism board, Wikipedia's infobox in the trail's languages). Where none
    publishes one, record every month for now, text "No season published; every month for now",
    with a `huckepack-season` source whose title names what was searched, and a "Season:" note
    saying the same. Replace it as soon as a source gives a season.
- **Required or explained.** Fill these from a source; where none gives one, add a note that
  starts with the field's label and says what was searched and when:
  - `wildCamping` ("Wild camping: …");
  - `waymarking` ("Waymarking: …");
  - `wikidata` ("Wikidata: …": no article, or an article on something else);
  - `length` ("Length: …", e.g. a total that covers another stretch);
  - `days` ("Days: …"; the page then counts one day per main stage);
  - `protectedAreas` ("Protected areas: …").
- **Only when they apply:**
  - `localName` (when it differs), `aliases`, `designation`, `established`;
  - `permit`, `fees`, `waterPoints`, `refillsUntreated`;
  - `officialGpx`: the operator's page that offers a GPX anyone can download without a login
    (the whole route, else one per stage). The link goes to that page, never to the file, so
    walkers get it from the operator's site (decided 2026-11-05); the page is also its source
    (the build checks they match), and `by`, the provider named in the link's note ("Offered by
    National Trails"). `none` with a reason where the operator plainly offers none ("stage
    tracks only after login"). Never stored. Where there is no `url`, the page offers our own
    GPX instead, traced from OSM (`data/derived/lines/<slug>.json`, from `pipeline.routes`),
    without the stages under 95 % matched;
  - `ascent` and `descent` totals;
  - a stage's `ascentM`, `descentM`, `minutes`, heights (estimated when missing, ≈), and its
    `closed`, `via`, `maxBridgeM`;
  - `stages.transfers`;
  - `tags`.

Protected areas are national parks, nature and regional parks, biosphere reserves, national
nature reserves and national scenic areas the route crosses, from the operator or OSM
(`boundary=national_park`/`protected_area`); not Natura 2000 sites or small local reserves.

## 5. Pipeline

`~/.venvs/huckepack/bin/python -m pipeline.all <slug>` (outside Claude Code's sandbox: it needs
many hosts). It prints each step's time; the photos step runs beside the others. Run it in the
background and research the next trail meanwhile (its sources, stage list, season, wildlife and
second source; its preflight): the run takes a few minutes, most of it downloads. Work through every
flag of its check; each one is either fixed or explained in a note:

- a stage under 95 % matched (missing OSM path, or a turnaround; `via` points, `joinM`; a relation in
  pieces: a stage's own `joinM` and `via` points, so the other stages can't shortcut over the bridge,
  2026-11-06, the West Island Way); where
  the GPX is out of date, the stage can follow the OSM relation (`relation`) instead: its cached
  ways are fetched again for the new guide (2026-11-05);
- a stage more than 10 % off the map line;
- stated against terrain-model ascent;
- a dry stretch, unknown surface, hubs too far away;
- no `treeLine` above 1,500 m, no skyline, no wildlife, no `dataCheck`, climate pending.

Write a "Map line" note: extracts used, coverage, measured against stated length, highest and
lowest point against stated, resupply.

## 6. Data check (working rule 2)

- Compare each figure with a second, independent source: length, ascent and descent, days,
  season, stage distances, times and heights, termini, difficulty, sleeping and camping rules,
  tree line.
- Where no second source exists, check the built page against the original source, figure by
  figure.
- More than 10 % apart: the page keeps the operator's figure; both go in `notes` and
  `dataCheck.deviations`.
- A source used only for the check gets `checkOnly: true`.
- Give the user the comparison as a table.

## 7. Done means

A trail is done only with all of these (decided 2026-11-04):

- the pipeline's check worked through;
- the data check in `notes` and `dataCheck`;
- climate in (not pending);
- a skyline in `src/lib/skylines.ts`, checked on the built page (sun and moon, no cut-off,
  the profile on the ground);
- wildlife: `animals` from official sources, `animals.none`, or a note starting "Wildlife";
- the built page read once: key figures, stages table, map, the sections it should have (while
  drafting, on the running dev server; the full build once, before the commit);
- a line in docs/roadmap.md.

## 8. Publish

1. Work on a branch `trail/<slug>`.
2. Run the checks:
   - `rm -f .astro/data-store.json`
   - `npm run check`
   - `npm run build`
   - `npm test`
   - `~/.venvs/huckepack/bin/python -m unittest discover -s tests`
3. Rewrite the route expectations (`UPDATE_ROUTE_EXPECTATIONS=1 … tests.test_route_regression`)
   and confirm only this trail changed.
4. Remove Proton Drive's " 2" copies, but only where byte-identical to the original (`cmp`).
   Never let one into a commit or the expectations.
5. Commit the record, derived data, `data/raw/<slug>/` (GPX stays ignored: check the staged
   list), the route, the skyline, the expectations and the roadmap line, with `Closes #<issue>`.
6. Fast-forward main, push, delete the branch and watch Deploy, Quality and Pipeline tests until
   they're green. Everything on main goes live. In a run of several trails (2026-11-06), each trail
   is still checked and committed on its own, but main is pushed every three or four trails, and
   the runs are watched in the background while the next trail is built; a red run stops the
   next push until it is fixed.

## 8b. Several trails at once

Tried 2026-11-06 (the Juan de Fuca Marine Trail, the Tahoe Rim Trail and the Sunshine Coast Trail):
one agent per trail, each in its own git worktree, and one integrator.

- **Worktrees outside the synced folder:** `scripts/trail-worktree.sh <slug>` checks out branch
  `trail/<slug>` from main into `~/.cache/huckepack/worktrees/<slug>` (Proton Drive would copy
  files there as they change) and links the project's `node_modules`; `--remove` takes it away.
- **Each agent:** steps 1–7 for its trail in its worktree only, its own dev-server and Chrome
  ports (4331, 4332, … and 9341, 9342, …), and a local commit on its branch; it never pushes,
  merges or stashes, doesn't run the full build and doesn't touch `tests/route_expectations.json`.
  Shared files get one block each: its skyline before `"superior-hiking-trail"` in
  `src/lib/skylines.ts`, its photo exclusions at the end of `data/reference/photo-exclude.yaml`,
  its roadmap paragraph.
- **Shared downloads:** the Geofabrik extracts and terrain tiles in `~/.cache/huckepack/` are
  shared; one region is downloaded by one run at a time (a lock per region in
  `pipeline/osmlocal.py`). Keep to two or three agents: they share one address for Nominatim (one
  request a second) and Wikimedia (one request at a time).
- **The integrator** reads each agent's report (data-check table, the check's flags, screenshots
  of the skyline by day and night, the photos kept), sends back what needs fixing, then merges the
  branches into main (the shared files merge by hand where they meet), rewrites the route
  expectations once, runs the checks and the full build (section 8), pushes the batch and removes
  the worktrees.
- **Lessons from the first batch (2026-11-06):** git splits the conflict badly where several
  branches add a block at the same place (it took the Juan de Fuca skyline's closing lines as shared
  with the next block): rebuild `skylines.ts`, the roadmap and the photo exclusions from main's
  version plus each branch's own block, never by resolving the markers. Brief each agent that
  stages are the operator's (one split the Sunshine Coast Trail by hut kilometres itself and was
  sent back to use the society's sections). A deploy that times out on Pages is fixed by a fresh run
  (`gh workflow run deploy.yml`), not by re-running its failed job, which reuses the upload.

## 9. After

- A later fix to a live trail follows the same checks and the same data check for what changed;
  note the date.
- Lessons that change a rule go into this file, dated.
