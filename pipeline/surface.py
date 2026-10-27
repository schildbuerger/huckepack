"""Surfaces along a trail, from the OpenStreetMap ways its route uses.

    .venv/bin/python -m pipeline.surface <slug>            # use the cached OSM tags
    .venv/bin/python -m pipeline.surface <slug> --refresh  # download the tags again

Needs `routeWays` in data/derived/<slug>.json and public/routes/<slug>.geojson (both from
pipeline.routes). Downloads the tags of every way the route uses (Overpass, cached in
data/raw/<slug>/osm-way-tags.json), sorts each way into a surface category and writes
data/derived/<slug>.json under `surface`: the main route as runs of one category, with their
position along the map line, and the kilometres and share of each category.

Categories (CATEGORIES): paved, gravel, natural ground. Ways tagged only `unpaved`, or with
no surface at all, are inferred from the way type: footpaths count as natural ground, tracks
and roads as gravel; the share inferred this way is reported. Ways that are neither are
`unknown`.

Positions: way lengths come from the full OSM geometry, and each stage is scaled to its
length on the simplified map line, so the kilometres match the water chart and stage ticks.
"""

import json
import math
import sys
from pathlib import Path

from pipeline import osm
from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent

CATEGORIES = {
    "paved": {"asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "sett",
              "cobblestone", "unhewn_cobblestone", "bricks", "metal", "wood", "chipseal"},
    "gravel": {"gravel", "fine_gravel", "compacted", "pebblestone", "shells"},
    "natural": {"ground", "dirt", "earth", "grass", "mud", "sand", "rock", "stone", "roots", "woodchips",
                "grass_paver", "snow", "ice"},
}
FOOTPATHS = {"path", "footway", "bridleway", "steps", "cycleway", "pedestrian"}
ROADS = {"track", "unclassified", "residential", "service", "tertiary", "secondary", "primary",
         "living_street", "road", "tertiary_link", "secondary_link"}


def classify(tags):
    """(category, inferred) for one way's tags."""
    surface = tags.get("surface", "").split(";")[0]
    for category, values in CATEGORIES.items():
        if surface in values:
            return category, False
    highway = tags.get("highway", "")
    if highway in FOOTPATHS:
        return "natural", True
    if highway in ROADS:
        return "gravel", True
    return "unknown", False


def build(slug, refresh=False):
    derived_path = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(derived_path.read_text())
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    stage_ways = derived["routeWays"]

    ids = sorted({w for s in stage_ways for w, _ in s["ways"]})
    query = f"[out:json][timeout:120];way(id:{','.join(map(str, ids))});out tags;"
    cache = Cache(slug, refresh)
    data, _ = cache.get("osm-way-tags.json", osm.OVERPASS, lambda: json.dumps(osm.fetch(query)).encode())
    tags = {e["id"]: e.get("tags", {}) for e in json.loads(data)["elements"]}

    # simplified stage lengths on the map line, the scale of the water chart
    def line_km(feature):
        coords = feature["geometry"]["coordinates"]
        proj = osm.Projection(sum(lat for _, lat in coords) / len(coords))
        xy = [proj.xy(*c) for c in coords]
        return sum(math.dist(a, b) for a, b in zip(xy, xy[1:])) / 1000

    map_km = {(f["properties"]["number"], f["properties"]["kind"]): line_km(f) for f in route["features"]}
    main = sorted((s for s in stage_ways if s["kind"] == "main"), key=lambda s: float(s["number"]))

    runs, km, totals, inferred = [], 0.0, {c: 0.0 for c in [*CATEGORIES, "unknown"]}, 0.0
    for stage in main:
        full = sum(m for _, m in stage["ways"])
        scale = map_km[(stage["number"], "main")] / (full / 1000)
        for way_id, metres in stage["ways"]:
            category, guessed = classify(tags.get(way_id, {}))
            length = metres / 1000 * scale
            totals[category] += length
            inferred += length if guessed else 0
            if runs and runs[-1]["category"] == category:
                runs[-1]["toKm"] = km + length
            else:
                runs.append({"category": category, "fromKm": km, "toKm": km + length, "stage": stage["number"]})
            km += length

    surface = {
        "source": "osm",
        "retrieved": cache.manifest["osm-way-tags.json"]["retrieved"],
        "routeKm": round(km, 1),
        "totals": {c: {"km": round(v, 1), "share": round(v / km, 3)} for c, v in totals.items()},
        "inferredShare": round(inferred / km, 3),
        "runs": [{**r, "fromKm": round(r["fromKm"], 2), "toKm": round(r["toKm"], 2)} for r in runs],
    }
    derived_path.write_text(json.dumps({**derived, "surface": surface}, indent=2, ensure_ascii=False) + "\n")

    print(f"{derived_path.relative_to(ROOT)}: main route {surface['routeKm']} km in {len(runs)} runs")
    for c, v in surface["totals"].items():
        print(f"  {c:<8} {v['km']:>5} km  {v['share']:>6.1%}")
    print(f"  inferred from the way type: {surface['inferredShare']:.1%}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
