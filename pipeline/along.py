"""Resupply and beds along a trail (issues #96 and #97): shops and places to sleep near the route,
with their km along the main route and the longest stretch without one, like pipeline/water.py.

    .venv/bin/python -m pipeline.along <slug>            # use the cached points
    .venv/bin/python -m pipeline.along <slug> --refresh  # read the extracts again

Needs public/routes/<slug>.geojson (pipeline.routes) and the trail's OSM corridor, whose
Geofabrik extracts it reads once more for the tags it needs (the corridor itself reaches only
600 m from the route). A point counts within WITHIN_M of the route, or within STAGE_END_M of a
main stage's end (stage towns often lie off the trail). Decided on the issues:
resupply = supermarkets, convenience and general stores, petrol stations with a shop; beds =
huts (alpine and wilderness huts, shelters for sleeping), campsites, hostels and guesthouses;
no hotels. Writes data/derived/<slug>.json under `along`; cached as data/raw/<slug>/osm-along.json.
"""

import gzip
import json
import math
import sys
from pathlib import Path

import osmium

from pipeline import osm, osmlocal
from pipeline.osmlocal import EXTRACTS_DIR, OSM_DIR
from pipeline.water import along, longest_gap

ROOT = Path(__file__).resolve().parent.parent
WITHIN_M = 1000
STAGE_END_M = 3000
SAME_M = 60  # a shop or hut mapped twice (as a point and as a building) counts once

RESUPPLY = {"supermarket": "supermarket", "convenience": "convenience", "general": "general"}
BED_KIND = {"alpine_hut": "hut", "wilderness_hut": "hut", "camp_site": "campsite", "hostel": "hostel", "guest_house": "guesthouse"}
SLEEP_SHELTERS = {"basic_hut", "lean_to"}
# the bed kinds in the sleeping section's categories (src/lib/trails.ts SLEEPING_CATEGORIES)
BED_GROUP = {"hut": "huts", "shelter": "huts", "campsite": "camping", "hostel": "hostels", "guesthouse": "rooms"}


def classify(tags):
    """('resupply' | 'beds', kind) for an OSM object's tags, or None."""
    shop = tags.get("shop")
    if shop in RESUPPLY:
        return "resupply", RESUPPLY[shop]
    if tags.get("amenity") == "fuel" and shop:
        return "resupply", "fuel"
    tourism = tags.get("tourism")
    if tourism in BED_KIND:
        return "beds", BED_KIND[tourism]
    if tags.get("amenity") == "shelter" and tags.get("shelter_type") in SLEEP_SHELTERS:
        return "beds", "shelter"
    return None


def candidates(slug, box):
    """Every resupply and bed object in the trail's extracts inside box (lon0, lat0, lon1, lat1)."""
    corridor = json.loads(gzip.decompress((OSM_DIR / "corridors" / f"{slug}.json.gz").read_bytes()))
    lon0, lat0, lon1, lat1 = box
    tag_filter = osmium.filter.TagFilter(
        ("shop", "supermarket"), ("shop", "convenience"), ("shop", "general"), ("amenity", "fuel"),
        ("tourism", "alpine_hut"), ("tourism", "wilderness_hut"), ("tourism", "camp_site"),
        ("tourism", "hostel"), ("tourism", "guest_house"), ("amenity", "shelter"),
    )
    out, seen, stamps = [], set(), []
    urls = dict((f["properties"]["id"], f["properties"]["urls"].get("pbf")) for f in osmlocal._index() if f["properties"].get("urls"))
    for ex in corridor["extracts"]:
        path = EXTRACTS_DIR / ex["file"]
        if path.exists():
            stamps.append(ex["timestamp"])
        else:
            # the corridor's extract was cleared away: a fresh one of the same region
            path = osmlocal.extract(ex["region"], urls[ex["region"]])
            stamps.append(osmlocal._timestamp(path))
        for o in osmium.FileProcessor(str(path), osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(tag_filter):
            if o.is_node():
                lon, lat = o.location.lon, o.location.lat
            elif o.is_way():
                pts = [(n.lon, n.lat) for n in o.nodes if n.location.valid()]
                if not pts:
                    continue
                lon, lat = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            else:
                continue
            if not (lon0 <= lon <= lon1 and lat0 <= lat <= lat1):
                continue
            tags = {t.k: t.v for t in o.tags}
            what = classify(tags)
            key = (o.type_str(), o.id)
            if not what or key in seen:
                continue
            seen.add(key)
            out.append({"lon": round(lon, 6), "lat": round(lat, 6), "group": what[0], "kind": what[1], "name": tags.get("name")})
    return out, sorted(stamps)[0]


def build(slug, refresh=False):
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    stages = [f for f in route["features"] if f["properties"]["kind"] != "detour"]
    every = [tuple(c) for f in stages for c in f["geometry"]["coordinates"]]
    proj = osm.Projection(sum(lat for _, lat in every) / len(every))
    lines = [[proj.xy(*c) for c in f["geometry"]["coordinates"]] for f in stages]
    main = sorted((i for i, f in enumerate(stages) if f["properties"]["kind"] == "main"), key=lambda i: osm.stage_order(stages[i]["properties"]["number"]))
    offset, walked = {}, 0.0
    for i in main:
        offset[i] = walked
        walked += sum(math.dist(a, b) for a, b in zip(lines[i], lines[i][1:]))
    total_km = walked / 1000
    ends = [lines[i][-1] for i in main]

    cache_path = ROOT / "data" / "raw" / slug / "osm-along.json"
    if refresh or not cache_path.exists():
        pad = STAGE_END_M / 111_000
        lons, lats = [p[0] for p in every], [p[1] for p in every]
        box = (min(lons) - pad * 2, min(lats) - pad, max(lons) + pad * 2, max(lats) + pad)
        found, retrieved = candidates(slug, box)
        cache_path.write_text(json.dumps({"retrieved": retrieved, "elements": found}, separators=(",", ":")) + "\n")
    cached = json.loads(cache_path.read_text())

    points = []
    for c in cached["elements"]:
        p = proj.xy(c["lon"], c["lat"])
        nearest = min(range(len(stages)), key=lambda i: (round(along(p, lines[i])[0]), i not in offset))
        d, a = along(p, lines[nearest])
        near_end = min(math.dist(p, e) for e in ends) <= STAGE_END_M
        if d > WITHIN_M and not near_end:
            continue
        if any(q["kind"] == c["kind"] and math.dist(p, proj.xy(q["lon"], q["lat"])) < SAME_M for q in points):
            continue
        props = stages[nearest]["properties"]
        points.append({
            **{k: c[k] for k in ("lat", "lon", "group", "kind", "name")},
            "stage": props["number"],
            "stageKind": props["kind"],
            "km": round((offset[nearest] + a) / 1000, 1) if nearest in offset else None,
            "offM": round(d),
        })
    points.sort(key=lambda w: (w["km"] is None, w["km"] or 0))

    def part(group):
        ps = [p for p in points if p["group"] == group]
        on_main = [p["km"] for p in ps if p["km"] is not None]
        return {"points": ps, "longestGapKm": longest_gap(on_main, total_km)}

    beds = part("beds")
    beds["byGroup"] = {g: sum(1 for p in beds["points"] if BED_GROUP[p["kind"]] == g) for g in ("huts", "camping", "hostels", "rooms")}
    result = {
        "source": "osm",
        "retrieved": cached["retrieved"],
        "withinM": WITHIN_M,
        "stageEndM": STAGE_END_M,
        "routeKm": round(total_km, 1),
        "resupply": part("resupply"),
        "beds": beds,
    }
    out = ROOT / "data" / "derived" / f"{slug}.json"
    existing = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**existing, "along": result}, indent=2, ensure_ascii=False) + "\n")
    r, b = result["resupply"], result["beds"]
    print(f"{out.relative_to(ROOT)}: {len(r['points'])} resupply points, longest without {r['longestGapKm']['km']} km "
          f"(km {r['longestGapKm']['fromKm']}–{r['longestGapKm']['toKm']}); {len(b['points'])} beds {b['byGroup']}, "
          f"longest without {b['longestGapKm']['km']} km")
    return True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
