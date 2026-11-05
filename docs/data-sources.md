# Data sources

Sources for a single trail (its official website, stage pages, local rules)
are listed in that trail's record in `data/trails/`, with licence and
retrieval date. This file lists sources used across many trails.

Candidates, not yet verified. Check the current licence and terms of each
source before using it, and record the result here.

## Route geometry

| Source | What | Licence | Notes |
|---|---|---|---|
| OpenStreetMap (Geofabrik extracts, read locally by pipeline/osmlocal.py; the Overpass API as a fallback) | Hiking route relations (`route=hiking`, `network=iwn/nwn`) with stages and waypoints | ODbL, attribution required | Completeness varies by trail; check each relation |
| Waymarked Trails | Rendered OSM hiking routes, relation lookup | Based on OSM (ODbL) | Useful for finding relation IDs |
| Trail associations (PCTA, ATC, CDTC, Te Araroa Trust, …) | Official tracks, mileage, closures | Varies, often copyrighted | Ask for permission or use only facts |
| National park and land agencies (NPS, USFS, DOC NZ, …) | Official trail datasets | Often public domain or open | US federal data is generally public domain |

## Terrain

| Source | What | Licence | Notes |
|---|---|---|---|
| Copernicus DEM GLO-30 | Global 30 m elevation (a surface model: treetops in forests) | Copernicus WorldDEM-30 licence: free, publishing and adapting allowed; notice "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" and a liability disclaimer (in the legal notice) required | In use: `pipeline/elevation.py`, tiles from AWS Open Data (`copernicus-dem-30m`, no account); not released for Armenia and Azerbaijan |
| Saxony DGM1 (GeoSN) | 1 m bare-earth lidar terrain model of Saxony | Datenlizenz Deutschland – Namensnennung 2.0, "Geodaten Sachsen" | Candidate for the Forststeig; text grid tiles in EPSG:25833 |
| ČÚZK DMR 5G | Czech bare-earth lidar terrain model | CC BY 4.0 (ČÚZK open data) | Candidate; LAZ point clouds, would need gridding |
| ESA WorldCover 2021 | Global land cover at 10 m (11 classes) | CC BY 4.0; "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium" | In use: `pipeline/landcover.py` reads the COG tiles on AWS Open Data (`esa-worldcover`, no account, only the blocks near the route) at the elevation profile's samples; the trail page's Landscape section |
| AWS Terrain Tiles (Mapzen, Terrarium PNGs) | Elevation tiles for the map's hill shading and contour lines | Open data; attribution to Mapzen and the underlying sources ([list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)) | In use: loaded by the browser from s3.amazonaws.com, no key; named in the privacy policy |

## Climate

| Source | What | Licence | Notes |
|---|---|---|---|
| Open-Meteo historical weather API (ERA5, ERA5-Land) | Daily temperature, precipitation, snow, wind and gusts by location | CC BY 4.0; contains modified Copernicus Climate Change Service information | In use: `pipeline/climate.py`, 1995–2024 at each trail's lowest and highest point |
| WorldClim | Gridded monthly climate normals | Free for non-commercial use, check terms | Alternative for climate normals |

## Drawings

| Source | What | Licence | Notes |
|---|---|---|---|
| PhyloPic | Silhouettes of the animals and plants in the Wildlife section (issue #156), one a kind in `src/assets/animals/` | CC0 1.0, except the giant hogweed (Lizzie Harper, CC BY 4.0) | Each maker and licence named in the section (`credit()` in `src/lib/animal-art.ts`); check a new silhouette's licence and species on PhyloPic before adding it (a "wolf" there was a coyote) |

## Photos

Researched 2026-11-05; Wikimedia Commons in use since the same day (pipeline/photos.py, docs/scope.md).

| Source | What | Licence | Notes |
|---|---|---|---|
| Wikimedia Commons (via Wikidata P18 and P373) | Photos of a trail, found through its Wikidata item | Per file: take only public domain, CC0, CC BY, CC BY-SA | Best candidate. Self-host a resized copy (hotlinking is allowed but discouraged); credit author and licence with a link to the file page; Wikimedia doesn't warrant licences, check each file ([reuse guide](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)) |
| Geograph Britain and Ireland | Geolocated photos of every grid square | CC BY-SA 2.0, every photo | Good for UK and Irish trails; has an image API; many photos are already on Commons ([re-use](https://www.geograph.org.uk/faq3.php?q=re-use)) |
| Panoramax | Street-level imagery, also along paths | CC BY-SA 4.0 on most instances, Etalab 2.0 on IGN's | Shows the path itself, not a hero view; STAC API, metacatalogue api.panoramax.xyz ([OSM wiki](https://wiki.openstreetmap.org/wiki/Panoramax)) |
| Unsplash | Stock photos | Unsplash License; API terms require hotlinking, a download call per pick and credit links | Not suitable: keyword-tagged (no proof a photo shows the trail), adds a third-party host ([API guidelines](https://help.unsplash.com/api-guidelines/unsplash-api-guidelines)) |
| Pexels | Stock photos | Pexels License, no credit required | Not suitable: keyword-tagged, as Unsplash |
| Tourism boards' press photos | Official photos | Usually editorial use only, time-limited | Only where a photo carries an explicit open licence |

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
