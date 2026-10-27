# Data sources

Sources for a single trail (its official website, stage pages, local rules)
are listed in that trail's record in `data/trails/`, with licence and
retrieval date. This file lists sources used across many trails.

Candidates, not yet verified. Check the current licence and terms of each
source before using it, and record the result here.

## Route geometry

| Source | What | Licence | Notes |
|---|---|---|---|
| OpenStreetMap (Overpass API) | Hiking route relations (`route=hiking`, `network=iwn/nwn`) with stages and waypoints | ODbL, attribution required | Completeness varies by trail; check each relation |
| Waymarked Trails | Rendered OSM hiking routes, relation lookup | Based on OSM (ODbL) | Useful for finding relation IDs |
| Trail associations (PCTA, ATC, CDTC, Te Araroa Trust, …) | Official tracks, mileage, closures | Varies, often copyrighted | Ask for permission or use only facts |
| National park and land agencies (NPS, USFS, DOC NZ, …) | Official trail datasets | Often public domain or open | US federal data is generally public domain |

## Terrain

| Source | What | Licence | Notes |
|---|---|---|---|
| Copernicus DEM GLO-30 | Global 30 m elevation | Free use with attribution | For elevation profiles |
| ESA WorldCover | Global land cover at 10 m | CC BY 4.0 | Terrain along the route |

## Climate

| Source | What | Licence | Notes |
|---|---|---|---|
| Open-Meteo (historical / climate API) | Temperature, precipitation, snow by location | CC BY 4.0 | Monthly climate along the route |
| WorldClim | Gridded monthly climate normals | Free for non-commercial use, check terms | Alternative for climate normals |

## Points of interest and facts

| Source | What | Licence | Notes |
|---|---|---|---|
| OpenStreetMap | Shelters, water, campsites, towns near the route | ODbL | |
| Wikidata | Length, termini, established date, managing body | CC0 | Cross-check against official figures |
| Trail association reports | Completions per year, permits issued | Varies | E.g. PCTA's 2,600 miler list |
