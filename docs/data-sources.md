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
| GEDTM30 v1.2 (OpenGeoHub) | Global ensemble digital terrain model at 30 m: bare earth (the ground under the trees), from Copernicus GLO-30 and AW3D30 with machine learning; metres above EGM2008 | CC BY 4.0; cite Ho, Y.-F., Grohmann, C. H., Lindsay, J., Reuter, H. I., Parente, L., Witjes, M., Hengl, T. (2025): "GEDTM30: global ensemble digital terrain model at 30 m and derived multiscale terrain variables", PeerJ 13:e19673; data doi 10.5281/zenodo.18887460 | In use since 2026-11-07 (docs/scope.md): `pipeline/elevation.py` reads the one global COG (`s3.opengeohub.org/global/dtm/v1.2/…`, 432 GB, no account) remotely, only the blocks around the route; source id `gedtm30`; covers 62°S–83.7°N. Ignore the file's `scale=0.1` tag: the values are metres (its cog_list.csv says scale 1) |
| Copernicus DEM GLO-30 | Global 30 m elevation (a surface model: treetops in forests) | Copernicus WorldDEM-30 licence: free, publishing and adapting allowed; notice "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" and a liability disclaimer (in the legal notice) required | No longer used (2026-11-07): read directly (tiles from AWS Open Data, `copernicus-dem-30m`) until GEDTM30 replaced it; since no figure on the site comes from it any more, the `copdem` source left the records and its notice and disclaimer the legal notice (the user's decision, 2026-11-07, docs/scope.md). Kept here for the history; not released for Armenia and Azerbaijan |
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

Researched 2026-11-05, again the same evening (free to use, and as easy to reach as possible). In use:
Wikimedia Commons by Wikidata and category, and by location where the category leaves room
(pipeline/photos.py, docs/scope.md).

| Source | What | Licence | Access | Fit |
|---|---|---|---|---|
| Wikimedia Commons, by category (in use) | Photos in the trail's Commons category (Wikidata P373) and P18 | Per file; we take only public domain, CC0, CC BY, CC BY-SA | Open API, no key; a User-Agent naming us | In use (2026-11-06): with the location search, every trail but those in progress has photos, 83 of 89 a full eight |
| Wikimedia Commons, by location | Every geotagged file near the route (`list=geosearch`, `gsnamespace=6`, radius up to 10 km, up to 500 per call), whatever its category: Geograph's and Panoramio's copies too | As above | Same API, no key | In use since 2026-11-05: fills the gaps the category leaves, only photos within 500 m of the map line whose categories show scenery (the Pfälzer Weinsteig: 4,001 JPEGs within 500 m, eight taken); 39 trails carry photos found by location (2026-11-06), every set checked by hand |
| Flickr | The largest pool; `flickr.photos.search` filters by licence ids and `bbox` or `lat`/`lon`/`radius` (up to 32 km), with owner, geo and size URLs as extras | Per photo; open ones only | API key required (non-commercial or commercial key; Flickr's API terms); photos for commercial use must carry a CC licence that allows it | Good second source for trails Commons leaves short; needs a key and a check of which key fits huckepack |
| Openverse (WordPress) | One search across Flickr, Commons, Geograph, Europeana and others (about 45 sources), filtered by licence | Per item | Anonymous use allowed with tight limits; registering (OAuth, free) unlocks the standard limit | Handy for finding, but no location search: by keyword only, so nothing proves a photo shows the trail |
| Geograph Britain and Ireland | Geolocated photos of every grid square, over 7.9 million | CC BY-SA 2.0, every photo | Free API key; syndicator search by location and radius (up to 20 km); no scraping, bulk use through data.geograph.org.uk dumps | UK and Ireland only; the API gives 640 px (larger sizes only where the photographer allowed them, through the photo page); many are already on Commons, so Commons by location covers much of it |
| Official open photos (e.g. New Zealand's DOC) | Operators that publish photos openly | DOC: CC BY 4.0, "Source: Department of Conservation (NZ)"; images marked © excluded | Per operator (their site, their Flickr account) | Official photos of exactly our trails; check operator by operator |
| Europeana | Cultural heritage collections, `reusability=open` (public domain, CC0, CC BY, CC BY-SA) | Per item's rights statement | Free API key, one per application | Mostly archive and museum images, rarely today's trail; for history at most |
| Panoramax | Street-level imagery, also on paths | Mixed by instance (CC BY-SA 4.0 on most, Etalab 2.0 on IGN's) | Open STAC API, `/api/search` | Shows the path, not the view: a different feature ("the ground here") |
| Mapillary (Meta) | Street-level imagery | CC BY-SA, some datasets otherwise | Access token; terms say images are CC BY-SA, reuse of API downloads less clear | As Panoramax, with a token and less clear terms |
| Unsplash, Pexels, Pixabay | Stock photos | Their own licences (free use) | API keys; Unsplash requires hotlinking and a download call per pick; Pixabay forbids permanent hotlinking and asks to cache 24 hours; Pexels asks for a link back | Not suitable: keyword-tagged, so nothing proves a photo shows the trail |
| Tourism boards' press photos | Official photos | Usually editorial use only, time-limited | By request | Only where a photo carries an explicit open licence |

## Travel hubs

Which hubs a trail lists (the rules of 2026-11-07, docs/scope.md) rests on these, shared by every
trail and named here once rather than in each record: they decide which hubs are chosen, while the
figures on the page (the hub's place, road distance and time) come from the record's `osm` and
`osrm` sources. `pipeline/hubs.py` reads them (cached in `~/.cache/huckepack/hubs/`, not the repo).

| Source | What | Licence | Notes |
|---|---|---|---|
| English Wikipedia, each airport's "Airlines and destinations" table | Which airlines fly where, with "Seasonal:", "Charter:" and "begins" marks: whether an airport has year-round or only seasonal scheduled international passenger flights | CC BY-SA 4.0; "Wikipedia: <airport>, Airlines and destinations", retrieved 2026-11-07 for every airport in the records | In use: fetched again when older than 30 days; a destination is international when its Wikidata country differs from the airport's; charters and routes that only begin later don't count; cargo tables skipped. The page's "seasonal international flights" label comes from it |
| Wikidata | The country (P17, ISO code P297) of each destination airport | CC0 | In use, with the route tables |
| OurAirports | Airports with scheduled service, IATA codes, links to their Wikipedia articles | Public domain | In use: the candidate airports; their coordinates in the record still come from OSM |
| OpenStreetMap, train route relations | `route=train` relations tagged `service=long_distance`, `high_speed` or `night`, with their stops: a station on at least two is a long-distance station | ODbL | In use (Overpass API). Misses some services; `EXTRA_STATIONS` in pipeline/hubs.py adds them with the operator's page (JR West's Kuroshio, KiwiRail's Great Journeys, VIA Rail's Corridor, the MTR's high-speed line), cited as the hub's source in the record |
| GeoNames cities15000 | Towns of 15,000 or more with their population: whether a station lies in a city of 100,000 | CC BY 4.0 (GeoNames) | In use |
| OSRM demo server (router.project-osrm.org) | Road distance and time from each candidate to the start, to pick the nearest by road | OSM data, ODbL | In use: at most one request a second; the record's `osrm` source covers the distances shown |

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
