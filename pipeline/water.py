"""Water sources along a trail, from OpenStreetMap.

    .venv/bin/python -m pipeline.water <slug>            # use the cached OSM download
    .venv/bin/python -m pipeline.water <slug> --refresh  # download again

Needs public/routes/<slug>.geojson (run pipeline.routes first). Finds drinking water and
springs within WITHIN_M of the route (Overpass, cached in data/raw/<slug>/osm-water.json) and
writes data/derived/<slug>.json: each point with its stage and its position along the main
route (km from the start, measured along the OSM line), counts per stage, and the longest
stretches of the main route without drinking water and without any water.

Drinking water: amenity=drinking_water or water_point, man_made=water_tap, or a spring tagged
drinking_water=yes. Springs: other natural=spring; whether they are drinkable is unknown.

Plus the record's `waterPoints` (drinking water a source names that OSM lacks, such as the taps
in a trail's huts), each point keeping its source; OSM drinking water within SAME_M of one of
them is the same tap and is left out.
"""

import json
import math
import time
import sys
from pathlib import Path

import yaml

from pipeline import osm
from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent
WITHIN_M = 250
QUERY_M = 400  # wider than WITHIN_M: the query line is thinned (see osm.around)
CHUNK = 150  # map-line points per Overpass query (about 10 km), so each bounding box stays small
SAME_M = 100  # an OSM tap this close to a record's water point is the same one


def kind(tags):
    if tags.get("drinking_water") == "no":
        return None
    if tags.get("amenity") in ("drinking_water", "water_point") or tags.get("man_made") == "water_tap":
        return "drinking"
    if tags.get("natural") == "spring":
        return "drinking" if tags.get("drinking_water") == "yes" else "spring"
    return None


def along(p, line):
    """(distance from p to the polyline, distance along the polyline to the closest point)."""
    best, best_along, walked = math.inf, 0.0, 0.0
    for a, b in zip(line, line[1:]):
        seg = math.dist(a, b)
        d = osm.point_segment(p, a, b)
        if d < best:
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = 0 if seg == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (seg * seg)))
            best, best_along = d, walked + t * seg
        walked += seg
    return best, best_along


def longest_gap(kms, total):
    """The longest stretch between water points, start and end included: {km, fromKm, toKm}."""
    stops = [0.0, *sorted(kms), total]
    a, b = max(zip(stops, stops[1:]), key=lambda ab: ab[1] - ab[0])
    return {"km": round(b - a, 1), "fromKm": round(a, 1), "toKm": round(b, 1)}


def build(slug, refresh=False):
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    # the trail's stages; a closed stage's detour (kind "detour", by train or along a road) isn't the trail
    stages = [f for f in route["features"] if f["properties"]["kind"] != "detour"]
    every = [tuple(c) for f in stages for c in f["geometry"]["coordinates"]]
    proj = osm.Projection(sum(lat for _, lat in every) / len(every))
    lines = [[proj.xy(*c) for c in f["geometry"]["coordinates"]] for f in stages]

    # the main route, stage after stage; where each main stage starts along it
    main = sorted(
        (i for i, f in enumerate(stages) if f["properties"]["kind"] == "main"),
        key=lambda i: osm.stage_order(stages[i]["properties"]["number"]),
    )
    offset, walked = {}, 0.0
    for i in main:
        offset[i] = walked
        walked += sum(math.dist(a, b) for a, b in zip(lines[i], lines[i][1:]))
    total_km = walked / 1000

    def box(points):
        # the bounding box of a piece of the route (plus QUERY_M); the precise WITHIN_M filter
        # below keeps only points near the line. Boxes rather than Overpass's polyline `around`,
        # which sometimes silently matches nothing
        lons, lats = [p[0] for p in points], [p[1] for p in points]
        pad = QUERY_M / 111_000
        return (min(lats) - pad, min(lons) - pad * 1.5, max(lats) + pad, max(lons) + pad * 1.5)

    def download():
        # in pieces of about CHUNK points, so each box stays small and no query runs out of time;
        # the OSM source is the trail's local corridor (or Overpass), pipeline/osm.py source
        src = osm.source(slug, every, refresh=refresh)
        elements, last = {}, None
        for i in range(0, len(every), CHUNK):
            last = src.water(box(every[i : i + CHUNK + 1]))
            elements.update({e["id"]: e for e in last["elements"]})
            if len(every) > CHUNK and osm.SOURCE == "overpass":
                time.sleep(3)
        return json.dumps({**last, "elements": list(elements.values())}).encode()

    cache = Cache(slug, refresh)
    data, _ = cache.get("osm-water.json", osm.source_label(), download)
    data = json.loads(data)

    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    extra = trail.get("waterPoints")
    candidates = [
        {"lat": w["lat"], "lon": w["lon"], "kind": "drinking", "name": w["name"], "source": extra["source"]}
        for w in (extra["list"] if extra else [])
    ]
    for node in data["elements"]:
        k = kind(node.get("tags", {}))
        if k is None:
            continue
        p = proj.xy(node["lon"], node["lat"])
        if k == "drinking" and any(math.dist(p, proj.xy(c["lon"], c["lat"])) < SAME_M for c in candidates if c["source"] != "osm"):
            continue
        candidates.append({"lat": node["lat"], "lon": node["lon"], "kind": k, "name": node.get("tags", {}).get("name"), "source": "osm"})

    points = []
    for node in candidates:
        k = node["kind"]
        p = proj.xy(node["lon"], node["lat"])
        # the nearest stage line; main stages win ties, so a shared point counts on the main route
        nearest = min(range(len(stages)), key=lambda i: (round(along(p, lines[i])[0]), i not in offset))
        d, a = along(p, lines[nearest])
        if d > WITHIN_M:
            continue
        props = stages[nearest]["properties"]
        points.append(
            {
                "lat": round(node["lat"], 5),
                "lon": round(node["lon"], 5),
                "kind": k,
                "name": node["name"],
                "stage": props["number"],
                "stageKind": props["kind"],
                "km": round((offset[nearest] + a) / 1000, 1) if nearest in offset else None,
                "offM": round(d),
                "source": node["source"],
            }
        )
    points.sort(key=lambda w: (w["km"] is None, w["km"] or 0))

    per_stage = [
        {
            "number": f["properties"]["number"],
            "kind": f["properties"]["kind"],
            "drinking": sum(1 for w in points if w["stage"] == f["properties"]["number"] and w["stageKind"] == f["properties"]["kind"] and w["kind"] == "drinking"),
            "springs": sum(1 for w in points if w["stage"] == f["properties"]["number"] and w["stageKind"] == f["properties"]["kind"] and w["kind"] == "spring"),
        }
        for f in stages
    ]
    on_main = [w for w in points if w["km"] is not None]
    water = {
        "source": "osm",
        "extraSources": sorted({w["source"] for w in points} - {"osm"}),
        "retrieved": cache.manifest["osm-water.json"]["retrieved"],
        "withinM": WITHIN_M,
        "routeKm": round(total_km, 1),
        # where each main stage starts along the main route, on the same map line as `km`
        "stageStarts": [
            {"number": stages[i]["properties"]["number"], "km": round(offset[i] / 1000, 1)} for i in main
        ],
        "longestGapKm": {
            "drinking": longest_gap([w["km"] for w in on_main if w["kind"] == "drinking"], total_km),
            "any": longest_gap([w["km"] for w in on_main], total_km),
        },
        "stages": per_stage,
        "points": points,
    }

    out = ROOT / "data" / "derived" / f"{slug}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**existing, "water": water}, indent=2, ensure_ascii=False) + "\n")

    print(f"{out.relative_to(ROOT)}: {sum(w['kind'] == 'drinking' for w in points)} drinking water, "
          f"{sum(w['kind'] == 'spring' for w in points)} springs within {WITHIN_M} m")
    for s in per_stage:
        print(f"  stage {s['number']:>2} {s['kind']:<9} drinking {s['drinking']:>2}  springs {s['springs']:>2}")
    gap = water["longestGapKm"]
    print(f"  main route {water['routeKm']} km; longest without drinking water {gap['drinking']['km']} km "
          f"(km {gap['drinking']['fromKm']}–{gap['drinking']['toKm']}), without any water {gap['any']['km']} km")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
