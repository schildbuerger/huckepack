# Scope

## Decisions

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

- **Stack:** follow healthviz (Python build, self-contained static pages,
  vanilla JS) or use a framework? Maps are the main difference: worldwide
  routes need a basemap, which means map tiles from an external source
  (for example MapLibre with OpenFreeMap or Protomaps) instead of
  self-contained SVG.
- **Domain and hosting.**
- **First trail:** see the ranking in [roadmap.md](roadmap.md).
- **Language:** English only?
- **Licence** for the code and for the derived data.
