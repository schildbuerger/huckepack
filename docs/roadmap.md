# Roadmap

Candidate trails, ranked first by how open their data is (a complete
OpenStreetMap relation, official open datasets), then by how widely they are
thru-hiked. The ranking is a starting point: verify data openness per trail
before building it.

## Trails

In progress: **Path of Sacred Forests** (Sentiero delle Foreste Sacre, Italy,
7 stages, about 100 km), the first record, built from the national park's
stage pages (`data/trails/path-of-sacred-forests.yaml`).

Also in progress: **Forststeig Elbe Sandstone** (Forststeig Elbsandstein, Saxony, Germany, and Czechia, 7 stages,
105 km), the second record and a test of the whole setup on a new trail, built from
Sachsenforst's route overview and GPX tracks (`data/trails/forststeig-elbe-sandstone.yaml`).

Also in progress: **Laugavegur** (Iceland, Landmannalaugar – Þórsmörk, 4 stages, 54 km), the third
record, built from Ferðafélag Íslands' trail and hut pages; no official GPX, so the map line follows
the OSM hiking relation (`data/trails/laugavegur.yaml`).

Added on 2026-10-29: **Alpe-Adria-Trail** (Austria, Slovenia, Italy, 37 main stages and the
7-stage circular route, about 750 km; tracks from Kärnten Werbung's stage pages),
**West Highland Way** (Scotland, 8 sections, 154 km; the OSM section relations) and the
**Merano High Mountain Trail** (Meraner Höhenweg, South Tyrol, 9 stages, about 100 km; the official GPX).

Added on 2026-10-30, a German batch (issues #26, #31, #32, #35, #36): the **Westweg** (Black Forest,
12 stages and the eastern variant, 285 km; the OSM section relations), the **Baiersbronner
Seensteig** (5 stages, 89 km; Baiersbronn Touristik's GPX), the **Harzer Hexen-Stieg** (5 stages
and 3 variants, 96 km; the Harz tourism portal's tracks), the **Moselsteig** (24 stages, 365 km;
Mosellandtouristik's stage tours) and the **Soonwaldsteig** (6 stages, 84 km; the Naturpark's
GPX). Deferred: the **Sauerland-Höhenflug** (#27): its GPX download needs a licence key, and the
OSM superroute lacks two sections.

Added on 2026-10-31 (issues #60, #58, #57): the **Rothaarsteig** (8 stages, 158 km; the OSM
section relations, as its GPX needs a licence key), the **Hermannshöhen** (Hermannsweg and
Eggeweg, 13 stages, 225 km; the stage tours' tracks) and the **Goldsteig** (660 km: 7 stages in
the Oberpfälzer Wald, the Nordroute N8–N23 as main route and the Südroute S8–S22 as variant; the
OSM stage relations). Then the **Eifelsteig** (#56, 313 km, 15 stages; stage 14's Kyll bridge
has been gone since the 2021 flood, so the stage ends at the Deimlinger Mühle and the map shows
the operator's detour, on foot to Daufenbach and by train to Kordel: closed stages, see CLAUDE.md).
And the **Sauerland-Waldroute** (#61, 240 km: Iserlohn to Marsberg in 13 stages via the
Nordroute, the Südroute a variant; stage 2's figures from the operator's flyer, its map line from
the OSM relation; the stage pages' map lines guide the rest, their GPX needs a licence key).

| # | Trail | Region | Length (approx.) | Why |
|---|---|---|---|---|
| 1 | Pacific Crest Trail | USA | 4,265 km | Most-hiked long trail; public US agency data; completion lists |
| 2 | Appalachian Trail | USA | 3,500 km | Most-hiked long trail; NPS data |
| 3 | Te Araroa | New Zealand | 3,000 km | Popular abroad; DOC open data |
| 4 | Camino de Santiago (Camino Francés) | Spain | 780 km | Most-walked long route; pilgrim office statistics |
| 5 | GR 20 | Corsica, France | 180 km | Best-known European thru-hike |
| 6 | Continental Divide Trail | USA | 5,000 km | Completes the Triple Crown |
| 7 | Kungsleden | Sweden | 440 km | Well-known Nordic trail |
| 8 | ~~West Highland Way~~ (added) | Scotland | 154 km | Popular, well documented |
| 9 | Lycian Way | Turkey | 540 km | Well-known Mediterranean route |
| 10 | Israel National Trail | Israel | 1,000 km | Popular desert-to-sea route |

Others to consider: John Muir Trail, Colorado Trail, Arizona Trail, Bruce
Trail, Pennine Way, South West Coast Path, GR 10 / GR 11, Via Alpina, Tour du
Mont Blanc, Great Himalaya Trail, Larapinta Trail, Bibbulmun Track, Overland
Track, European long-distance path E1.

## Features

1. Trail page: map, elevation profile, key facts with sources
2. ~~Climate along the route by month~~ (done: climate by month and daylight; steepest sections from the elevation profile)
3. Comparison page across trails (length, ascent, season, duration)
4. Resupply and water along the route
