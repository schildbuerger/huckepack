"""Every pipeline step for a trail, in order, then a check of the results.

    .venv/bin/python -m pipeline.all <slug>                  # run what's due, using the caches
    .venv/bin/python -m pipeline.all <slug> --refresh        # download everything again
    .venv/bin/python -m pipeline.all <slug> --from water     # resume at a step after a failure
    .venv/bin/python -m pipeline.all <slug> --check          # only the check

Steps: routes, water, surface, elevation, landcover, climate, access, popularity (each also runs on its own,
pipeline/<step>.py). The caches in data/raw/<slug>/ make a second run fast. When the map line
changes, the caches that depend on it (water, way tags, heights, land cover) are dropped, so no
step keeps answering for the old route (the climate step checks its own cache against the grid
cells of the route's highest and lowest points). A step that fails stops the run with the command
to resume it; a climate step that hits the weather API's quota leaves the trail pending instead.

The check reads the record and the derived data and flags what a person should look at, mostly
the mechanical half of working rule 2: stages the OSM match covers poorly, map-line lengths more
than 10 % off the stated ones (whole route and per stage), stated against estimated ascent,
long stretches without drinking water, unknown surfaces, far travel hubs, and a missing data
check or tree line.
"""

import hashlib
import importlib
import json
import math
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
STEPS = ["routes", "water", "surface", "elevation", "landcover", "climate", "access", "popularity"]
# caches that depend on the map line, dropped when it changes
# (not the climate downloads: pipeline/climate.py keeps them while the places stay in their grid cells)
ROUTE_CACHES = ["osm-water.json", "osm-way-tags.json", "elevation-glo30.json", "landcover.json"]
OFF = 0.10  # working rule 2: more than 10 % apart needs a look
DRY_KM = 25  # a longer stretch without drinking water: check OSM, or add the record's waterPoints
UNKNOWN_SHARE = 0.10
HUB_KM = 300
TREE_LINE_FROM_M = 1500  # a trail this high may cross a tree line: the record should say


def _hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def run(slug, refresh=False, start="routes"):
    route = ROOT / "public" / "routes" / f"{slug}.geojson"
    for step in STEPS[STEPS.index(start) :]:
        print(f"\n== {step}")
        before = _hash(route) if step == "routes" else None
        try:
            importlib.import_module(f"pipeline.{step}").build(slug, refresh=refresh)
        except (Exception, SystemExit) as error:
            print(f"\n{step} failed: {error}")
            print(f"resume with: .venv/bin/python -m pipeline.all {slug} --from {step}")
            raise SystemExit(1)
        if step == "routes" and before is not None and _hash(route) != before:
            dropped = [n for n in ROUTE_CACHES if (ROOT / "data" / "raw" / slug / n).exists()]
            for name in dropped:
                (ROOT / "data" / "raw" / slug / name).unlink()
            if dropped:
                print(f"  the map line changed: dropped {', '.join(dropped)}")


def _line_km(coords):
    lat0 = sum(c[1] for c in coords) / len(coords)
    k = math.cos(math.radians(lat0)) * 111.32
    return sum(math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 111.32) for a, b in zip(coords, coords[1:]))


def check(slug):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    derived = json.loads((ROOT / "data" / "derived" / f"{slug}.json").read_text())
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    stages = trail.get("stages", {}).get("list", [])
    main = [s for s in stages if s["kind"] == "main"]
    flags, fine = [], []

    def off(a, b):
        return abs(a - b) / b > OFF if b else False

    # the OSM match, per stage
    poor = [f"{f['properties']['number']} ({f['properties']['covered']:.0%})" for f in route["features"] if f["properties"]["covered"] < 0.95]
    (flags if poor else fine).append(f"route: stages under 95 % matched: {', '.join(poor)} (OSM may lack a path; note it)" if poor else "route: every stage at least 95 % matched")

    # lengths: per stage (map line against stated) and the whole main route
    by_stage = {(f["properties"]["number"], f["properties"]["kind"]): _line_km(f["geometry"]["coordinates"]) for f in route["features"]}
    long_off = [
        f"{s['number']} ({by_stage[(s['number'], s['kind'])]:.1f} km against {s['km']} km)"
        for s in stages
        if (s["number"], s["kind"]) in by_stage and off(by_stage[(s["number"], s["kind"])], s["km"])
    ]
    (flags if long_off else fine).append(
        f"stage lengths more than 10 % off the map line: {', '.join(long_off)}" if long_off else "stage lengths within 10 % of the map line"
    )
    stated = sum(s["km"] for s in main) if main else (trail["length"][0]["km"] if trail.get("length") else None)
    map_km = (derived.get("elevation") or derived.get("water") or {}).get("routeKm")
    if stated and map_km:
        msg = f"main route: map line {map_km} km, stated {round(stated, 1)} km"
        (flags if off(map_km, stated) else fine).append(msg + (" (more than 10 % apart: gaps between stages, or a wrong stage?)" if off(map_km, stated) else ""))

    # ascent: stated stage sum against the terrain model's climbs over the main route
    elevation = derived.get("elevation")
    if elevation:
        pts = elevation["points"]
        model = sum(max(0, b[1] - a[1]) for a, b in zip(pts, pts[1:]))
        up = sum(s["ascentM"] for s in main) if main and all("ascentM" in s for s in main) else None
        if up:
            msg = f"ascent: stated {up:,} m, terrain model about {round(model, -1):,.0f} m"
            (flags if off(model, up) else fine).append(msg + (" (the model runs high in forests; check the stated figure)" if off(model, up) else ""))
        else:
            fine.append(f"ascent: none stated; the page estimates about {round(model, -1):,.0f} m from the terrain model")
        noted = any(str(n).startswith("Tree line") for n in trail.get("notes", []))
        if elevation["highest"]["m"] >= TREE_LINE_FROM_M and not trail.get("treeLine") and not noted:
            flags.append(f"tree line: the route climbs to {elevation['highest']['m']:,} m; add the region's tree line (treeLine) or a note why not")

    from pipeline.climate import pending

    if pending(slug):
        flags.append("climate: pending (the weather API's quota was used up); run `.venv/bin/python -m pipeline.climate --pending` later, and don't publish the trail before")
    elif derived.get("climate"):
        fine.append("climate: up to date")

    water = derived.get("water")
    if water:
        gap = water["longestGapKm"]["drinking"]
        msg = f"water: {sum(p['kind'] == 'drinking' for p in water['points'])} drinking water points; longest dry stretch {gap['km']} km (km {gap['fromKm']}–{gap['toKm']})"
        (flags if gap["km"] > DRY_KM else fine).append(msg + (" (check OSM there, or add the record's waterPoints)" if gap["km"] > DRY_KM else ""))

    surface = derived.get("surface")
    if surface:
        unknown = surface["totals"].get("unknown", {}).get("share", 0)
        msg = f"surface: {unknown:.0%} unknown, {surface['inferredShare']:.0%} inferred from the way type"
        (flags if unknown > UNKNOWN_SHARE else fine).append(msg)

    hubs = (derived.get("access") or {}).get("hubs", [])
    far = [f"{h['name']} ({h['roadKm']} km)" for h in hubs if h.get("roadKm", 0) > HUB_KM]
    if hubs:
        (flags if far else fine).append(f"travel hubs far from the start: {', '.join(far)} (coordinates right?)" if far else "travel hubs: all within 300 km of the start")

    for step, key in (("landcover", "landcover"), ("climate", "climate"), ("access", "access")):
        if not derived.get(key):
            flags.append(f"{step}: no derived data yet")

    if not trail.get("dataCheck"):
        flags.append("data check: no dataCheck in the record yet (working rule 2)")

    print(f"\n== check: {trail['name']}")
    for line in flags:
        print(f"  !  {line}")
    for line in fine:
        print(f"  ok {line}")
    return flags


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    slug = args[0]
    if "--check" not in sys.argv:
        start = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "routes"
        if start not in STEPS:
            raise SystemExit(f"--from: one of {', '.join(STEPS)}")
        run(slug, refresh="--refresh" in sys.argv, start=start)
    check(slug)
