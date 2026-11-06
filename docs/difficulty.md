# Difficulty

How hard a trail is, rated the same way for every trail (issue #16). The rule lives in
`src/lib/difficulty.ts` (`SCALES`); this file explains it. Change both together.

## The rule

- Three **dimensions**: Terrain, Climate, Effort.
- Each is judged by a few **measures**. Each measure has three fixed thresholds that split it
  into four **levels**: Easy, Moderate, Demanding, Hard.
- A dimension takes the level of its **hardest measure**. No weights, no averages: every rating
  can name the measure that set it, and the page does.
- Only data every trail has: the record (stages, SAC grade, season), OpenStreetMap surfaces, the
  Copernicus terrain model, ERA5 weather. A trail without some of it is rated on what it has.
- It describes the trail, not how it will feel: fitness, experience, pack and the actual weather
  decide that. Thresholds are set for hikers walking with a pack, not for runners or day walks.

## Measures and thresholds

| Dimension | Measure | Easy | Moderate | Demanding | Hard | From |
|---|---|---|---|---|---|---|
| Terrain | Path grade | T1 | T2 | T3 | T4–T6 | SAC grade, stated, converted (CAI) or estimated |
| Terrain | Climbing | < 15 m/km | 15–30 | 30–50 | ≥ 50 | ascent of the main stages / their length (stated, else the terrain model's sum) |
| Terrain | Steep stretches | < 5 % | 5–15 % | 15–30 % | ≥ 30 % | share of the route steeper than 15 %, up or down (`gradients()`) |
| Terrain | Natural ground | < ⅓ | ⅓–⅔ | ≥ ⅔ | – | share on natural ground (OSM); capped at Demanding: unmade paths alone don't make a trail hard |
| Climate | Heat | < 22 °C | 22–27 | 27–32 | ≥ 32 | mean daily high at the lowest point |
| Climate | Cold | ≥ 8 °C | 3–8 | −2 to 3 | < −2 | mean nightly low at the highest point |
| Climate | Wet days | < 10 | 10–14 | 14–18 | ≥ 18 | days a month with ≥ 1 mm, the wetter of both points |
| Climate | Snow | < 1 day | 1–3 | 3–6 | ≥ 6 | days a month with ≥ 1 cm of snow at the highest point |
| Climate | Wind | < 15 km/h | 15–20 | 20–25 | ≥ 25 | mean of each day's strongest wind (hourly mean, 10 m), the windier of both points |
| Effort | Longest day | ≤ 4 h | 4–6 h | 6–8 h | > 8 h | walking time of the longest main stage (stated; a range counts its upper end; else DIN 33466) |

**Effort without stages (issue #204, 2026-11-06).** A trail with no stages by design
(`stages.none`, the Wonderland Trail) is rated by an **average day** instead of the longest: its
length, ascent and descent divided evenly over the fewest suggested days, timed by DIN 33466 and
marked ≈. It's the hardest plan a source suggests, so it doesn't understate the day. Its Terrain
climb is the stated ascent over the stated length (else the terrain model's, ≈).

**Climate by month (issue #114, 2026-11-01).** Each month is rated on its own. Without a month
picked, a trail's climate rating is its **best run of at least two consecutive season months**
(the record's `season.months`, all months if none; across the new year too): of every such run,
the one whose hardest month is easiest, on a tie the longest; the run's hardest month sets the
level, "Moderate in Sep–Oct". A one-month season is rated by its month. The season's hardest
month still shows, lighter, above the climate bar. With months picked in the search (the
URL's `months`: the search's When filter or the home page's trip search; nothing is stored), the rating is the
hardest of the picked months, outside the season too, with a note there ("Outside the season").
Each measure shows its own hardest month of the months rated. Before 2026-11-01 the season's
hardest month set the rating, which made 17 of 25 trails read "Hard" overall; a hiker plans for
the months they'll go, not for the worst one. The rules are `src/lib/months.ts`, shared by the
build and the browser.

## Why these choices

- **SAC sits inside Terrain**, not beside it. It is the only measure of exposure, scrambling and
  path visibility, which no open data shows; the other terrain measures cover what SAC doesn't
  (how much and how steeply the trail climbs, and the ground). As its own dimension it repeated
  half of Terrain. The search filter still uses the SAC grade.
- **Worst measure, not an average:** one hard aspect makes a day hard, and averaging hides it.
- **Wind** from ERA5 (about 30 km grid, hourly means at 10 m) understates gusts on ridges and in
  gaps; it ranks trails against each other, it doesn't forecast. Days with a strong breeze
  (≥ 40 km/h) hardly occur in it even on the Laugavegur, so the measure is the mean of each day's
  strongest wind, which does separate windy trails (Laugavegur 18–22 km/h up high) from sheltered
  ones (12–17). Gust days (≥ 70 km/h) are in the derived data for a later climate chart.
  Over land only (issue #120, 2026-11-04): ERA5's 25 km cells can lie mostly over the sea at a
  coastal point, where the wind is much stronger than on the path; a point whose cell is not mostly
  land (half or less, counted on ERA5-Land's 10 km land grid) takes its wind and gusts from the
  nearest mostly-land cell within about 50 km (`wind_cell()` in pipeline/era5_open_data.py; the
  derived place records `windFrom`). Ten of the 104 places moved (2026-11-04). Where no such cell
  is in reach, the point keeps its own: the Camí de Cavalls, Menorca being smaller than half a
  cell, is still rated on its coastal wind.
- **Thresholds** were set to spread the trails we have and stay meaningful for long ones, and are
  round numbers on purpose. Revisit them when trails with very different climates are added
  (desert, high altitude), and record any change in docs/scope.md.

## Candidates, not built

- **River crossings:** fords on the route from OpenStreetMap (`ford=yes`), e.g. on the Laugavegur.
- **Remoteness:** the longest stretch without drinking water (already on the page) and without
  resupply.
- **Altitude:** time above 2,500 m, for high trails.
