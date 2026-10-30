# Blueways: evaluation (issue #7)

Evaluated on 2026-10-30. A blueway is an official paddling route for canoe or kayak, the water
counterpart of a long-distance trail: managed by a public body or recognised association, split
into stages, with put-ins, portages, shelters and campsites. This note asks what of huckepack's
trails can be reused, what a blueway needs on top, and whether it fits the mission. It is based on
a real example, tested against the actual data sources.

## The example: Tämnaråns kanotled (Uppland, Sweden)

The issue asks for a popular, official blueway in north-east Sweden within 200 km of Stockholm.
The Stockholm region and Uppland have only short canoe routes (Upplandsstiftelsen's Fyrisån,
Kolarmoraån, Tämnarån and Lilla Färnäset; Långhundraleden, 18.8 km, Vallentuna and Österåker);
none is "popular" on the scale of Dalsland's canal lakes or Nedre Dalälven. The best fit is
**Tämnaråns kanotled**, about 130 km north of Stockholm: official, multi-stage and with the
structure a blueway page needs.

- **Managed by** Upplandsstiftelsen; Tierp municipality maintains it through volunteer
  associations (the official brochure, 2020).
- **"Drygt 50 km"** from lake Tämnaren to the sea at Karlholm, in six sections (the brochure):

  | # | Section | km | Difficulty | Portages ("lyft") |
  |---|---|---|---|---|
  | 1 | Annedal – Ubblixbo | 5 | Easy | Ubblixbo 100 m |
  | 2 | Ubblixbo – Ullfors / Gryttjom | 11 / 12.5 | Medium | Ullfors 200 m; Gryttjom 150 m to the road |
  | 3 | Tierps kyrka – Tierp | 5 | Easy | Fors 200 m |
  | 4 | Tierp – Strömsberg | 9 | Easy | Gillberga 20 m |
  | 5 | Strömsberg – Västland | 6 | Demanding | Tegelbruksströmmen 500 m, Vad 700 m, Västland 2 km |
  | 6 | Västland – Karlholm | 9 | Medium | Näs 50 m |

  The sections add up to 45–46.5 km; between 2 and 3 the route continues by land (signs with a
  canoe-transport symbol lead to the next put-in).
- **Facilities** (the brochure's map): jetties marked with signs, rest areas, wind shelters with
  fireplaces (Tolfta, Västland), swimming places, parking, cafés; canoe rental in Tolfta, Karlholm
  and Strömsberg.
- **Season:** paddleable most of the year, but water plants grow from June and the water is low in
  summer: "minst växtlighet är det på våren och försommaren"; at low water some current stretches
  must be walked.
- **Water level** (new, open data): SMHI's station *NÄS 2 TÄMNARÅN* (2612) sits on section 6 and
  has daily flow since June 2015 (CC BY 4.0). Median flow by month: March and April 10.7 m³/s, May
  2.6, June 1.5, July 1.1, August 1.1, September 2.2, October 2.4, November 4.1. That is the
  brochure's advice in numbers: plenty of water in spring, little from July.
- **Camping:** Sweden's right of public access (allemansrätten): a tent for one or two nights on
  land not used for farming, out of sight of houses; nature reserves can restrict it
  (Naturvårdsverket; to be cited from the official page when a record is built).
- **Track:** no GPX (Naturkartan shows the route but offers no download, and its data terms are
  not open). The route follows the river, so the map line can be built from OpenStreetMap's river
  instead (below).
- **OpenStreetMap** (Geofabrik's Sweden extract, 2026-10-30, scanned around the river):
  - The river is mapped completely: Tämnarån is a waterway relation (6364982) of 7 ways, about
    52.6 km, matching the brochure's "drygt 50 km". The map line can be built by chaining it,
    as the relation-only hiking trails are built today.
  - Canoe tags are sparse: no `route=canoe` relation for Tämnarån, one `canoe=put_in`, no
    tagged portages. Put-ins and portages would come from the brochure, located by their place
    names (Ubblixbo, Ullfors, Fors, Gillberga, Tegelbruksströmmen, Vad, Västland, Näs).
  - Context is well mapped: 22 dams (the reason for the portages), 11 lean-to shelters in the
    area (among them Västland's), slipways, a campsite and a boat rental at Karlholm.
  - Across Sweden, OSM has 29 `route=canoe` relations (Tjust kanotled, Nätraåns kanotled,
    Blekinge's kayak network of about 20 routes, Jougdån): other blueways would come with a map
    line ready to chain.

## What can be reused

Most of huckepack carries over: the record, the sources and data check, and the pipeline's
infrastructure. Reused unchanged:

| Part | Why it fits a blueway |
|---|---|
| Record core: name, managedBy, countries, regions, termini, website, days, length, stages, season, sleeping, wildCamping, access, waymarking, tags, notes, sources, dataCheck, wikidata | The same questions: who runs it, where, how long, which sections, when, where to sleep, the rules |
| Ground rules and working rule 2 | Official routes only; every figure sourced and checked against a second source |
| OSM extracts (`pipeline/osmlocal.py`) | Sweden's extract works like any other region |
| Travel hubs (`pipeline/access.py`, OSRM) | Getting to the put-in is the same question |
| Climate (`pipeline/climate.py`, ERA5) | Even more relevant: the wind (already computed) matters on open water |
| Water points (`pipeline/water.py`) | Drinking water near the route is the same question |
| Page frame: Location and map, key figures strip, stages table, climate, sleeping, sources footer | The same layout language; TrailMap draws any line |
| Search filters: months, where, days, sleeping, wild camping, landscape | The same planning questions |
| Popularity (Wikipedia page views), trails near you | Work for any record with coordinates and a Wikidata item |

## What needs adapting

| Part | Trails today | For a blueway |
|---|---|---|
| Map line (`pipeline/routes.py`) | OSM paths matched to a GPX, or a hiking relation chained | No GPX: chain OSM's `waterway=river` / `canal` ways from put-in to take-out (like the relation-only trails), or a `route=canoe` relation where one exists; lakes and sea have no ways to follow, so straight lines between put-ins there; portages from the footpaths between take-out and put-in |
| Terrain (elevation, steepness) | The profile, climbs, steep stretches | Meaningless on water (Tämnarån drops a few dozen metres over 50 km). Replaced by **current and portages** |
| Surfaces | Natural, gravel, paved | Replaced by the **kind of water**: river, lake, canal, sea (from OSM water polygons along the line) |
| Landscape (WorldCover) | Land cover on the line | The line is water; sample the **banks** (a buffer either side) instead |
| Difficulty | Terrain (SAC), climate, effort (longest day) | **Water** (current, rapids, open-water crossings, wind exposure), **climate** (as now, wind weighted more), **effort** (longest day, total portage distance, longest portage). No SAC; per-section grades from the operator (Lätt / Medel / Krävande here), the international white-water grade (WW I–VI) where one is given |
| Key figures | Length, ascent and descent, difficulty, days, per day, season, landscape | Length, **portages** (count, total), difficulty, days, per day, season, landscape (banks) |

## What a blueway adds

- **Portages:** where you have to carry, how far, and the longest; on the map, the stages table
  (a column) and as a key figure. Source: the operator (lengths), OSM `canoe=portage` ways.
- **Put-ins and take-outs:** jetties and slipways, the points the route connects; OSM
  `canoe=put_in` / `egress`, `leisure=slipway`, and the operator's list.
- **Water level by month:** the national hydrology service's open flow data at the nearest
  station (SMHI in Sweden; similar open services: the UK's NRFA, Germany's Pegelonline, Ireland's
  EPA HydroNet). A chart of the median and the usual range by month answers "when is there enough
  water?", as the elevation profile answers "where are the climbs?".
- **Boat rental:** where to hire a canoe or kayak; a short list from the operator.
- **Hazards:** weirs and dams, current stretches, open crossings; from the operator and OSM
  (`waterway=weir`, `dam`, `whitewater:*`).
- **Water temperature** (later, if a source is found): matters for safety in spring.

## Does it fit the mission?

Partly. The mission is about long-distance *trails* for people who *hike* for days or weeks.
Blueways share almost everything (official routes, stages, nights out, water and beds, climate,
getting there), and the data model and pipeline carry over to a large degree. But they bring a
new audience (paddlers) and need a different difficulty scale and a different "terrain" section,
and they don't compare with hiking trails on ascent or ground underfoot. So blueways would be a
**second kind of route** with their own page type and their own filters, not trails with a
different label. Adding them would widen the mission ("…find the long-distance trail or blueway
that suits them…"), which is the user's decision.

There are enough official blueways to make it worthwhile: Sweden's municipal and regional
*kanotleder* (Dalslands kanotland, Värendsleden 120 km, Nissan, Svartälven), Ireland's Blueways
(Sport Ireland), Scotland's Great Glen Canoe Trail (Scottish Canals, 96 km), Finland's
*melontareitit*, the US National Water Trails System (National Park Service).

## Left to evaluate

The open questions, also kept as a checklist on issue #7:

- **Scope:** the mission decision; a route-type switch in the search and which filters are shared.
- **Water level outside Sweden:** the national hydrology services and their licences (UK NRFA,
  Germany Pegelonline, Ireland EPA HydroNet / OPW waterlevel.ie, Finland SYKE, US USGS); choosing
  the station (on the route, up- or downstream) and what to show where there is none.
- **Water temperature:** SMHI publishes river temperature (176 stations), but those nearest
  Tämnarån (Älvkarleby, Untra) are closed, so only historical data; other sources to check.
- **Ice:** SMHI's freeze-up and break-up dates (752 stations; the nearest, Hedesundafjärden, closed)
  as a historical season limit, or ERA5 frost as a proxy.
- **Portages, put-ins, rental, hazards:** OSM coverage on other blueways, the operators' lists,
  open datasets such as Ireland's Blueways.
- **Open crossings and wind exposure:** a method from OSM water polygons and ERA5 wind.
- **Camping rules:** each country's official access-rights text.
- **Difficulty scale:** white-water grades for rivers, a sea-kayak scale for coasts, the operators'
  own words mapped onto them.
- **Second sources** for the data check: none found for Tämnarån besides the operator.
- **Naturkartan / Outdoormap data:** whether their route geometries could be licensed.
- **Lakes and sea** (no ways to follow), and a popular second example (Dalslands kanotland, Nedre
  Dalälven, the Great Glen Canoe Trail) before building.

## Proposal

1. Decide whether blueways belong in huckepack (mission and scope).
2. If yes, build a preview of the blueway page type (working rule 1: three approaches on real data,
   Tämnaråns kanotled) with the sections above: Location and map with put-ins and portages, key
   figures, difficulty (water, climate, effort), climate, sections, water level, sleeping,
   drinking water.
3. Pipeline: a `kind: blueway` on the record; a route step that chains waterways; a portage and
   put-in step; a water-level step (SMHI first); landscape sampled along the banks.
4. Search: a route-type switch (trails, blueways) with the shared filters, plus portage and
   difficulty filters for blueways.
