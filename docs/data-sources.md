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
| AWS Terrain Tiles (Mapzen, Terrarium PNGs) | Elevation tiles for the map's hill shading and contour lines | Open data; attribution to Mapzen and the underlying sources ([list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)) | In use: loaded by the browser from s3.amazonaws.com, no key; named in the privacy policy |

## Climate

| Source | What | Licence | Notes |
|---|---|---|---|
| Open-Meteo historical weather API (ERA5, ERA5-Land) | Daily temperature, precipitation, snow by location | CC BY 4.0; contains modified Copernicus Climate Change Service information | In use: `pipeline/climate.py`, 1995–2024 at each trail's lowest and highest point |
| WorldClim | Gridded monthly climate normals | Free for non-commercial use, check terms | Alternative for climate normals |

## Methods

| Method | What | Notes |
|---|---|---|
| DIN 33466 (German hiking standard) | Walking time from distance, ascent and descent: 4 km/h on the flat, 300 m/h up, 500 m/h down; the larger of flat and climbing time plus half the smaller | In use: `walkingMinutes()` in `src/lib/trails.ts`, only for stages whose source gives no time; shown as an estimate (≈), without breaks |

## Points of interest and facts

| Source | What | Licence | Notes |
|---|---|---|---|
| OpenStreetMap | Shelters, water, campsites, towns near the route | ODbL | |
| Wikidata | Length, termini, established date, managing body | CC0 | Cross-check against official figures |
| Trail association reports | Completions per year, permits issued | Varies | E.g. PCTA's 2,600 miler list |
