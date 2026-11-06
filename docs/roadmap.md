# Roadmap

Candidate trails, ranked first by how open their data is (a complete
OpenStreetMap relation, official open datasets), then by how widely they are
thru-hiked. The ranking is a starting point: verify data openness per trail
before building it.

## Trails

The first record: **Path of Sacred Forests** (Sentiero delle Foreste Sacre, Italy,
7 stages, about 100 km), built from the national park's
stage pages (`data/trails/path-of-sacred-forests.yaml`).

The second: **Forststeig Elbe Sandstone** (Forststeig Elbsandstein, Saxony, Germany, and Czechia, 7 stages,
105 km), a test of the whole setup on a new trail, built from
Sachsenforst's route overview and GPX tracks (`data/trails/forststeig-elbe-sandstone.yaml`).

The third: **Laugavegur** (Iceland, Landmannalaugar – Þórsmörk, 4 stages, 54 km), built from Ferðafélag Íslands' trail and hut pages; no official GPX, so the map line follows
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
Added 2026-10-31: the **MacLehose Trail** (#39, 100 km across Hong Kong's New Territories in the
ten AFCD sections, each with its official GPX as the matcher's guide).
And the **Coast to Coast Path** (#50, 306 km from St Bees to Robin Hood's Bay, a National Trail
since 26 March 2026: German Wikipedia's twelve stages along the National Trail route, its one
GPX for the whole trail cut at each stage's end).
And the **Tour du Mont Blanc** (#55, about 170 km around the Mont Blanc massif from Les Houches:
English Wikipedia's eleven legs, the OSM relation's main itinerary cut at their ends).
And the **Kungsleden** (#30, 464 km from Abisko to Hemavan in STF's 28 hut-to-hut legs, each on
its OSM stage relation, the rowing boats over the lakes included).
Added 2026-11-01: the **Camí de Cavalls** (#72, GR 223, 185 km round Menorca in the island
council's 20 sections, each with its own GPX as the matcher's guide; section 11 on the OSM relation).
And the **Milford Track** (#43, 53.5 km in DOC's four hut-to-hut days, Glade Wharf to Sandfly
Point, the OSM relation cut at the huts).
And the **Offa's Dyke Path** (#49, 285 km from Sedbury Cliffs to Prestatyn along the Welsh border
in the National Trail's 12 sections, its one GPX cut at each section's end).
And the **Cotswold Way** (#47, 164 km from Chipping Campden to Bath in the National Trail's 15
sections; its GPX and, for four sections, the OSM relation, bridging the A417's new crossing that OSM
maps as under construction).
And the **Országos Kéktúra** (#64, 1,183 km from Írott-kő to Hollóháza in 59 days: MTSZ's
recommended day stages for sections 1–17, our grouping of the official legs between stamping points
for 18–27, every figure summed from the official table).
And the **Camino Francés** (#122, added on 2026-11-02, 769 km from Saint-Jean-Pied-de-Port to
Santiago in 36 days: Wikipedia's stages, the Xunta de Galicia's for the six Galician days from Sarria;
the map line follows the OSM section relations).
And the **GR 20** (#123, added on 2026-11-02, about 180 km from Calenzana to Conca in the Corsican
regional park's 16 stages with its walking times; no source publishes stage distances, so they are
measured on our OSM map line). The Santa Cruz Trek (#75) was dropped the same day: Peru's park service
requires a licensed agency, so it can't be walked independently.
And the **W Trek** (#74, added on 2026-11-02, Torres del Paine, CONAF's legs from Hotel Las Torres
to Paine Grande with the valleys to Base Torres, the Mirador Británico and Grey as variants, and the
Lago Pehoé catamaran as its way out, the first leg that isn't walked).
And the **West Coast Trail** (#144, added on 2026-11-02, Vancouver Island, 75 km from Pachena Bay to
Gordon River in 8 days: Parks Canada's day plans from the mid-point at Balaats'adt joined end to end,
with the Nitinaht Narrows and Gordon River ferries as transfers).
And the **Whale Trail** (#149, added on 2026-11-02, the first trail in Africa: De Hoop Nature
Reserve, South Africa, 55.7 km from Potberg to Koppie Alleen in CapeNature's 5 days between its huts;
OSM has no route relation, so the map line follows the ways named "Whale Trail", `route.wayName`).
Added on 2026-11-03, a batch from the "Add Trail" issues: the **Schluchtensteig** (#62), the
**Cleveland Way** (#46), the **Dingle Way** (#65), the **Pfälzer Weinsteig** (#59), the
**Wildnis-Trail** (#63), the **Kerry Way** (#173, the shortest way over its branched OSM relation),
the **Pieterpad** (#177, the first trail in the Netherlands; river ferries bridged, `maxBridges`),
the **Rennsteig** (#171), the **Malerweg** (#166), the **Wicklow Way** (#167), the
**Pembrokeshire Coast Path** (#168), **Hadrian's Wall Path** (#161), the **Great Glen Way** (#172),
the **Pennine Way** (#160), the **Kumano Kodo Nakahechi** (#202, the first trail in Japan; to Nachi,
4 days), the **High Coast Trail** (#176), the **GR 70 Chemin de Stevenson** (#175, Le Puy to Alès in
French Wikipedia's stages) and the **Alta Via dei Parchi** (#66, stage distances measured on the
map line), and the **Adlerweg** (#44, its cable cars as rides inside the stages), **El Anillo de Picos** (#77, the site's eight stages, distances measured on the map line), the **Fishermen's Trail** (#13, Rota Vicentina's 13 stages from São Torpes to Lagos, the list copied from the site by hand) and the **South West Coast Path** (#159, the Association's 52-day itinerary, copied by hand, with the South Dorset Ridgeway as a variant). Set aside with their open questions on the issues: among others the Inca Trail
(guide-only), the E5 (#162, no
stage list for Tirol's line), the
Cumbria Way (official status), the Peaks of the Balkans and the Camino Primitivo (waiting), and the
John Muir and Wonderland Trails (waiting for stage-less pages, #204).


Added on 2026-11-04: the **Alta Via 1** (#158, Lago di Braies to Case Bortòt above Belluno in the Province of Belluno's twelve stages from its official guide; stages 3, 4 and 6 follow OSM's excursion and alternative ways through `via` points). And the **Carros de Foc** (#76, the national park's nine-refuge circuit from the Restanca, its legs measured on OSM's line under `huckepack-measured`, decided 2026-11-04). And the **Stubaier Höhenweg** (#213, Tirol Werbung's seven stages from the Starkenburger to the Innsbrucker Hütte). And the **Lechweg** (#214, the classic seven stages from the Formarinsee to the Lech Falls in Füssen, lechweg.com). And the **Berliner Höhenweg** (#215, Tirol's hut-to-hut stages from the Gamshütte to the Edelhütte, their broken distances replaced by our own measured on the map line). And the **Karwendel Höhenweg** (#216, the Karwendel Nature Park's six stages from Reith bei Seefeld to Scharnitz).
Added on 2026-11-05: the **South Downs Way** (#220, 160 km from Winchester to Eastbourne in the National Trail's nine sections, by the Seven Sisters from Alfriston; its one GPX cut at each section's end, the Jevington route in a note).
And **The Ridgeway** (#221, 139 km from Overton Hill near Avebury to Ivinghoe Beacon in the National Trail's six sections; its 2013 GPX guides five, section 5 the OSM relation).
And the **Yorkshire Wolds Way** (#222, 127 km from Hessle on the Humber to Filey Brigg in the National Trail's six sections, by Goodmanham; its one GPX cut at each section's end).
And **Glyndŵr's Way** (#223, 217 km from Knighton to Welshpool through mid-Wales by Machynlleth in the National Trail's nine sections; its 2022 GPX guides eight, section 6 the OSM relation).
And the **Thames Path** (#224, 298 km from Thames Head near Kemble to the Woolwich Foot Tunnel in the National Trail's 15 sections, by the south bank in London; its 2024 GPX guides fourteen, section 9 the OSM relation).
And the **North Downs Way** (#225, Farnham to Dover in the National Trail's 15 sections: 1–13 by Canterbury the main route, 216 km, 14–15 by Folkestone variants; its 2025 GPX and the Canterbury loop's OSM relation).
And the **Kepler Track** (#228, a 60 km loop from Te Anau in Fiordland, DOC's six legs between huts and road ends; each the shortest way over the OSM relation, `branched`).
And the **Routeburn Track** (#229, 33 km from the Routeburn Shelter to The Divide over Harris Saddle, DOC's four legs; each the shortest way over the OSM relation).
And the **Heaphy Track** (#230, 78.4 km from Brown Hut to Kōhaihai through Kahurangi National Park, DOC's six legs; each the shortest way over the OSM relation).
And the **Abel Tasman Coast Track** (#231, 60 km from Mārahau to Wainui, DOC's six legs with the tidal crossings; each the shortest way over the OSM relation).
And the **Paparoa Track** (#232, 55 km over the Paparoa Range from the Smoke-ho car park to the Pororari River, DOC's four walking legs; each the shortest way over the OSM relation).
And the **Rakiura Track** (#233, the 32 km circuit on Stewart Island/Rakiura, DOC's three legs from Lee Bay to Fern Gully; OSM maps it at about 27 km, noted).
And the **Lake Waikaremoana Great Walk** (#234, 46 km from Onepoto to Hopuruahine in Te Urewera, cared for by Ngāi Tūhoe; DOC's seven legs over the OSM relation).
And the **Overland Track** (#235, the first trail in Australia: 65 km from Ronny Creek to Narcissus in Tasmania's six days, each on its OSM section relation, the walk along Lake St Clair as the way out; Overland Track Pass and fees).
And the **Peddars Way and Norfolk Coast Path** (#238, Knettishall Heath north along the Roman road to Holme next the Sea, then east along the coast to Hopton-on-Sea, the National Trail's sections in 13 stages; the official GPX guides the Peddars Way, the OSM relation the coast, and Happisburgh to Sea Palling, which the section lists leave out, is measured on the map line).
And **St Cuthbert's Way** (#240, 100 km from Melrose Abbey over the Eildon and Cheviot Hills to Holy Island across the tidal sands, the site's five sections; its GPX guides the Scottish part, the OSM relation the English one).
And the **Fife Coastal Path** (#241, about 188 km from Kincardine round the Fife coast to Newburgh in the Fife Coast and Countryside Trust's eight sections; no GPX, the OSM relation cut at the sections' ends).
And the **Cateran Trail** (#242, the 103 km loop through Perthshire and the Angus glens from Blairgowrie in the Perth and Kinross Countryside Trust's five stages; each the shortest way over the OSM relation).
And the **Arran Coastal Way** (#243, the 105 km loop round the Isle of Arran from Brodick in the Arran Access Trust's eight sections; each the shortest way over the OSM relation).
And the **Three Lochs Way** (#244, 55 km from Balloch on Loch Lomond over the Highland Boundary Fault to Inveruglas in the Helensburgh & District Access Trust's four stages; each the shortest way over the OSM relation).
Added on 2026-11-06: the **West Island Way** (#245, 48 km on the Isle of Bute from Kilchattan Bay to Port Bannatyne in the Bute Conservation Trust's four stages: a circuit from Kilchattan Bay, then north by Rothesay, round the north end to Rhubodach and back over the high moorland; the shortest way over the OSM relation through `via` points, stages 1 and 4 bridging the relation's gaps with their own `joinM`).
And the **Three Capes Track** (#237, 48 km over four days in Tasman National Park, Tasmania, from Denmans Cove to Fortescue Bay by Cape Pillar and Cape Hauy; no OSM relation, so the ways named for the track guide each day, through `via` points at the capes). And the **Heidschnuckenweg** (#247, 225 km through the Lüneburg Heath from Hamburg-Fischbek to Celle in 13 stages and two variants, each on the operator's own GPX). And the **RheinBurgenWeg** (#248, about 200 km on the Rhine's left bank from the Rolandsbogen to Bingen in 13 stages, each on its OSM stage relation).
And the **Tongariro Northern Circuit** (#249, the Great Walk round Ngauruhoe, walked this season from Mangatepopo Carpark to Whakapapa Village, 35.5 km, while the fire-damaged section is closed; DOC's legs over the OSM relation, the last through `via` Tama Saddle). And the **Hump Ridge Track** (#250, the 61.5 km loop in southern Fiordland, New Zealand's 11th Great Walk, in DOC's three days on their OSM stage relations).
And the **Queen Charlotte Track** (#251, 73.5 km in the Marlborough Sounds from Meretoto / Ship Cove to Anakiwa in the official site's five sections over the OSM relation; a landowners' pass for the private land). And **St Oswald's Way** (#252, 155 km from Holy Island along the Northumberland coast and inland to Heavenfield on Hadrian's Wall in six sections, each on the site's own GPX, offered zipped).
And the **Two Moors Way** (#254, 102 miles from Ivybridge over Dartmoor, Mid Devon and Exmoor to Lynmouth in the Association's one-day sections over the OSM relation). And the **Wye Valley Walk** (#253, 136 miles along the Wye from the Hafren Forest to Chepstow in the Partnership's 17 sections, each with time and ascent, over the OSM relation). And the **Fife Pilgrim Way** (#256, Culross to St Andrews in the Fife Coast and Countryside Trust's sections over the OSM relation).
And **Camønoen** (#257, the first trail in Denmark: the 175 km loop round Møn, Bogø and Nyord from Stege, the stages round the loop over the OSM relation).
And the **Escapardenne** (#258, 159 km from Ettelbruck in Luxembourg by the Lee Trail and the Éislek Trail to La Roche-en-Ardenne in Belgium, eight stages on their OSM relations).
And the **Albsteig (HW1)** (#259, 360 km along the Swabian Jura's escarpment from Donauwörth to Tuttlingen in Schwäbische Alb Tourismus's 16 stages over the OSM relation of the Albverein's HW 1).
And the **Altmühltal-Panoramaweg** (#260, about 200 km along the Altmühl from Gunzenhausen to Kelheim in the Naturpark's 15 stages, their distances measured on the OSM relation, which the site doesn't publish).
And the **Kammweg Erzgebirge–Vogtland** (#246, 287 km along the ridge of the Ore Mountains and the Vogtland from Geising to Blankenstein in Erzgebirge Tourismus's 17 stages over OSM's three relations of the trail).
And the **Wonderland Trail** (#191, the first trail without stages, #204: the National Park Service's 93-mile (150 km) loop round Mount Rainier from Longmire, 10–14 days between designated wilderness camps, over the OSM relation as one segment).
And the **O Circuit** (Torres del Paine, Chile: CONAF's nine legs round the Paine massif from Hotel Las Torres over the John Gardner pass, about 93 km plus the valleys to Base Torres and the Mirador Británico, over OSM's Circuito O and W relations).
And the **Long Trail** (Vermont, USA: the Green Mountain Club's 272 miles from the Massachusetts line to Canada, the second trail without stages, 20–30 days between 70 shelters and campsites, over the OSM relation as one segment).
And the **La Cloche Silhouette Trail** (Killarney Provincial Park, Ontario: Ontario Parks' 80 km loop over the white quartzite ridges, 7–10 days between reserved backcountry campsites, without stages, over the OSM relation).
And the **Lost Coast Trail** (California: the BLM's northern section, 24.6 miles of beach from Mattole to Black Sands Beach in the King Range, at least three days planned round the tides, without stages, over the OSM relation cut at its finish).
And the **Superior Hiking Trail** (Minnesota: the association's about 300 miles along the ridges above Lake Superior from the Wisconsin border to the 270-degree Overlook, 2–4 weeks between 94 campsites, without stages, over the OSM relation).

And the **Fundy Footpath** (New Brunswick: the Fundy Hiking Trails Association's 64.3 km along the Bay of Fundy from Fundy National Park's visitor centre in Alma to Big Salmon River, in its three sections, at least four days between backcountry campsites, tidal crossings; over the footpath's and the Trans Canada Trail's OSM relations; 2026-11-06, the first trail built with the faster pipeline: preflight, parallel climate and photos).

And the **Juan de Fuca Marine Trail** (British Columbia: BC Parks' 47 km along the Strait of Juan de Fuca on Vancouver Island from China Beach to Botanical Beach, in the three sections between its four trailheads, open all year, six backcountry campgrounds with a permit, beaches cut off at high tide; over the OSM relation; 2026-11-06).

And the **Tahoe Rim Trail** (California and Nevada: the Tahoe Rim Trail Association's 165-mile loop round Lake Tahoe from Tahoe City, in its eight segments trailhead to trailhead, over granite ridges, the Desolation Wilderness and the Carson Range up to Relay Peak at 3,151 m; over the OSM relation cut at the trailheads).

And the **Sunshine Coast Trail** (British Columbia: the qathet Parks and Wilderness Society's 180 km from Sarah Point in Desolation Sound to Saltery Bay, in its three sections (12–13 days) between free huts, Canada's longest hut-to-hut trail, over Tin Hat Mountain and Mount Troubridge; over the trail's OSM relation with `via` points on the society's line; 2026-11-06).

And the **Rockwall Trail** (British Columbia: Parks Canada's 54.1 km along the Rockwall in Kootenay National Park from the Paint Pots to Floe Lake, without stages by design (3–5 days between five backcountry campgrounds on a permit), over three alpine passes up to Numa Pass at 2,336 m below the limestone cliff and its hanging glaciers; over the OSM relation; 2026-11-06).

And the **Dobson Trail** (New Brunswick: the Fundy Hiking Trails Association's sister trail to the Fundy Footpath, about 58 km through Albert County's forests and ridges from Riverview's Pine Glen Road to the northern boundary of Fundy National Park, 3–4 days between established campsites, no stages by design; over the OSM relation; 2026-11-06).

And the **Timberline Trail** (Oregon: the Forest Service's 41.5-mile (66.8 km) loop round Mount Hood from Timberline Lodge, Trail #600 with the Pacific Crest Trail on the south-west side, 3–4 days without stages at or near the tree line, through the Mount Hood Wilderness with unbridged glacial river fords, July to October; over the OSM relation as one segment; 2026-11-06).

And the **Laurel Highlands Hiking Trail** (Pennsylvania: Laurel Ridge State Park's 70 miles (112.7 km) along the forested Laurel Ridge from the Youghiogheny River at Ohiopyle to the Conemaugh Gorge near Johnstown, in nine legs between DCNR's eight reserved shelter areas, yellow-blazed with stone mileage posts every mile; over the OSM relation; 2026-11-06).

And the **Northville–Placid Trail** (New York: the Adirondack Mountain Club's first trail, about 136 miles (219 km) through the Adirondack Park from Northville to Lake Placid, overseen by the NYS DEC and kept by ADK's NPT Chapter, in the chapter's ten sections (7–14 days) between lean-tos, past Spruce Lake, the West Canada Lakes, Long Lake and the Cold River; over the trail's OSM relation; 2026-11-06).

And the **Ozark Highlands Trail** (Arkansas: the Ozark Highlands Trail Association's 207 miles (333 km) of continuous built trail from Lake Fort Smith State Park across the Boston Mountains and down the Buffalo River to AR-14 at Dillard's Ferry, with the Forest Service, in 17 legs between the association's major trailheads by its mile markers, white-blazed, best from October into early June; the separate Sylamore and Norfork Lake pieces beyond the unbuilt Lower Buffalo Wilderness gap left out; over the OSM relation; 2026-11-06).

And the **Colorado Trail** (Colorado: the Colorado Trail Foundation's and the Forest Service's 486 miles (782 km) from Waterton Canyon near Denver to Durango in its 28 segments on the Collegiate East route (the Collegiate West alternative noted), 4–6 weeks at an average elevation over 3,100 m, through six wilderness areas and up to 4,045 m below Coney Summit in the San Juans, July to September; over the three OSM relations of its superroute; 2026-11-06).

And the **Ouachita National Recreation Trail** (Arkansas and Oklahoma: the Forest Service's longest trail in the Ouachita National Forest, 223 miles (358.9 km) along the Ouachitas' east–west ridges from Talimena State Park to Pinnacle Mountain State Park near Little Rock, the last 32 miles on Arkansas State Parks' and other lands, kept by the Friends of the Ouachita Trail in their ten sections with 23 shelters, blue-blazed, past Queen Wilhelmina State Park and Lake Sylvia, best from late autumn to early spring; over the OSM relation; 2026-11-06).

| # | Trail | Region | Length (approx.) | Why |
|---|---|---|---|---|
| 1 | Pacific Crest Trail | USA | 4,265 km | Most-hiked long trail; public US agency data; completion lists |
| 2 | Appalachian Trail | USA | 3,500 km | Most-hiked long trail; NPS data |
| 3 | Te Araroa | New Zealand | 3,000 km | Popular abroad; DOC open data |
| 4 | ~~Camino de Santiago (Camino Francés)~~ (added) | Spain | 780 km | Most-walked long route; pilgrim office statistics |
| 5 | ~~GR 20~~ (added) | Corsica, France | 180 km | Best-known European thru-hike |
| 6 | Continental Divide Trail | USA | 5,000 km | Completes the Triple Crown |
| 7 | ~~Kungsleden~~ (added) | Sweden | 440 km | Well-known Nordic trail |
| 8 | ~~West Highland Way~~ (added) | Scotland | 154 km | Popular, well documented |
| 9 | Lycian Way (set aside 2026-11-02, #121) | Turkey | 760 km | Well-known Mediterranean route; no open stage data, and OSM's route measures 441 km |
| 10 | Israel National Trail | Israel | 1,000 km | Popular desert-to-sea route |

Others to consider: John Muir Trail, Colorado Trail, Arizona Trail, Bruce
Trail, ~~Pennine Way~~ (added), ~~South West Coast Path~~ (added), GR 10 / GR 11, Via Alpina, Tour du
Mont Blanc, Great Himalaya Trail, Larapinta Trail, Bibbulmun Track, Overland
Track, European long-distance path E1.

## Features

1. Trail page: map, elevation profile, key facts with sources
2. ~~Climate along the route by month~~ (done: climate by month and daylight; steepest sections from the elevation profile)
3. Comparison page across trails (length, ascent, season, duration)
4. Resupply and water along the route
5. ~~Photos per trail from Wikimedia Commons~~ (done 2026-11-05: the mosaic under the key figures and a gallery)
