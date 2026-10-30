"""A new trail record with every field to fill, so none is forgotten.

    .venv/bin/python -m pipeline.new_trail <slug> "<Official name>"

Writes data/trails/<slug>.yaml from the template below: every field the trail pages use, each
`null` with a comment on what belongs there and where it comes from. The build fails on any
`null` left (the schema in src/content.config.ts accepts no null), so a gap can't slip through:
fill each field, or delete an optional one the sources don't give (and say why in `notes`). Then
.venv/bin/python -m pipeline.all <slug>, work through its check, and do the data check (working
rule 2). Never commit a record that doesn't build.
"""

import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TEMPLATE = """\
# {name}: created {today} by pipeline/new_trail.py. Fill every null or delete the field (optional
# ones only, with a note why); every figure names a source id from `sources` below.
name: {name}
added: {today}  # the day the trail goes on the site (the home page's "Recent trails"); update if it goes live later
localName: null  # the name in the local language, if it differs; else delete
aliases: []  # other names people search for
website: null  # the official website (managing body or trail portal)
wikidata: null  # the trail's Wikidata item (Q…, linked from its Wikipedia article); delete if it has none. Then add the `wikimedia` source below
managedBy:
  # who designates or maintains the trail (ground rule: official trails only)
  - name: null
    url: null
trailType: null  # point-to-point, loop or network
continents: [null]  # Europe, Asia, Africa, North America, South America, Oceania
countries: [null]  # ISO codes, e.g. AT, DE, IT
regions: []  # first-level regions (states, provinces), from the official site or OSM
protectedAreas: []  # national parks, nature parks the trail crosses
termini:
  # where the official first stage starts and the last ends (coordinates from the GPX or OSM)
  start:
    name: null
    lat: null
    lon: null
  end:
    name: null
    lat: null
    lon: null
  source: null
established:
  year: null  # opened or designated; delete if no source gives it
  source: null
waymarking:
  text: null  # how it is marked, in the source's words; `symbol` only if Waymark.astro draws it
  source: null
length:
  - km: null  # the stated total; approx: true for "about"
    source: null
days:
  # the suggested days for the whole trail
  min: null
  max: null
  source: null
treeLine:
  # the region's tree line, from a published source (forest service, literature), if the route
  # climbs above about 1,500 m; data/reference/tree-lines.yaml lists the regions done so far.
  # Else delete it and add a note starting "Tree line"
  m: null
  source: null
stages:
  # the official stages; pipeline/readers/outdooractive.py prints them from Outdooractive pages.
  # Each with a GPX `track` (kept local, never committed) or an OSM `relation`
  source: null
  list:
    - {{ number: "1", kind: main, from: null, to: null, km: null }}
route:
  # built by `python -m pipeline.all {slug}`: OSM ways matched to the stages' tracks
  source: osm
  publishable: true
difficulty:
  # a published grade (sac or cai), else our estimate from the official descriptions
  estimated:
    sac: null
    basis: null
    source: null
season:
  months: [null]  # the months the source recommends
  text: null
  source: null
sleeping:
  types: [null]  # hut, guesthouse, hostel, campsite, … (SLEEPING_TYPES in src/content.config.ts)
  source: null
wildCamping:
  status: null  # allowed, restricted or prohibited
  rule: null  # the rule in one or two sentences
  source: null
access:
  # the nearest main railway station (or the main bus station) and international airports,
  # coordinates from OSM; distances by pipeline/access.py
  - kind: null
    name: null
    lat: null
    lon: null
    source: osm
tags: []
notes:
  - >-
    Data check ({today}): to do (working rule 2). Compare every figure with a second, independent
    source, record each difference over 10 % in dataCheck.deviations, and give the comparison as
    a table.
dataCheck: null  # date, against (second sources), pageAgainst, deviations: after the data check
sources:
  - id: null  # the official source of the stages and figures
    title: null
    url: null
    licence: All rights reserved (facts only)
    retrieved: null
  - id: osm
    title: "OpenStreetMap contributors: paths and water along the trail (Geofabrik extract), travel hubs"
    url: https://www.openstreetmap.org/
    licence: ODbL 1.0
    retrieved: {today}
  - id: copdem
    title: "Copernicus DEM GLO-30 (30 m terrain model), tiles from AWS Open Data"
    url: https://registry.opendata.aws/copernicus-dem/
    licence: "Copernicus WorldDEM-30 licence, free; produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
    retrieved: {today}
  - id: worldcover
    title: "ESA WorldCover 2021: 10 m land cover (via AWS Open Data)"
    url: https://esa-worldcover.org/
    licence: "CC BY 4.0; © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium"
    retrieved: {today}
  - id: era5
    title: "Open-Meteo Historical Weather API: ERA5 and ERA5-Land reanalysis, daily 1995–2024"
    url: https://open-meteo.com/en/docs/historical-weather-api
    licence: CC BY 4.0 (Open-Meteo); contains modified Copernicus Climate Change Service information
    retrieved: {today}
  - id: osrm
    title: "OSRM: road routes on OpenStreetMap data (router.project-osrm.org)"
    url: https://project-osrm.org/
    licence: Route data © OpenStreetMap contributors (ODbL)
    retrieved: {today}
"""


def main(args):
    if len(args) != 2:
        raise SystemExit(__doc__)
    slug, name = args
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        raise SystemExit("the slug is the URL name: lowercase letters, digits and hyphens, e.g. west-highland-way")
    path = ROOT / "data" / "trails" / f"{slug}.yaml"
    if path.exists():
        raise SystemExit(f"{path.relative_to(ROOT)} exists already")
    path.write_text(TEMPLATE.format(name=name, slug=slug, today=date.today().isoformat()))
    print(f"wrote {path.relative_to(ROOT)}: fill every null (npm run build lists the ones left)")


if __name__ == "__main__":
    main(sys.argv[1:])
