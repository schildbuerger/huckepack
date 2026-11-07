"""Every pipeline step for a trail, in order, then a check of the results.

    ~/.venvs/huckepack/bin/python -m pipeline.all <slug>                  # run what's due, using the caches
    ~/.venvs/huckepack/bin/python -m pipeline.all <slug> --refresh        # download everything again
    ~/.venvs/huckepack/bin/python -m pipeline.all <slug> --from water     # resume at a step after a failure
    ~/.venvs/huckepack/bin/python -m pipeline.all <slug> --check          # only the check

Steps: routes, water, along, surface, elevation, landcover, regions, climate, access, popularity, photos (each also runs on its own,
pipeline/<step>.py). The caches in data/raw/<slug>/ make a second run fast. When the map line
changes, the caches that depend on it (water, shops and beds, way tags, heights, land cover) are dropped, so no
step keeps answering for the old route (the climate step checks its own cache against the grid
cells of the route's highest and lowest points). A step that fails stops the run with the command
to resume it; a climate step that fails leaves the trail pending instead. The photos step runs as its
own process beside the others once the map line is there (it waits minutes on Wikimedia Commons and
shares only the cache manifest, written under a lock); each step's time is printed.

The check reads the record and the derived data and flags what a person should look at, mostly
the mechanical half of working rule 2: stages the OSM match covers poorly, map-line lengths more
than 10 % off the stated ones (whole route and per stage), stated against estimated ascent,
long stretches without drinking water, shops or beds, unknown surfaces, far travel hubs, and a missing data
check, tree line, skyline (src/lib/skylines.ts) or wildlife (the record's animals, or a note why none),
and days without a basis or a missing "Days" note (days_check).
"""

import importlib
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
STEPS = ["routes", "water", "along", "surface", "elevation", "landcover", "regions", "climate", "access", "popularity", "photos"]
OFF = 0.10  # working rule 2: more than 10 % apart needs a look
DRY_KM = 25  # a longer stretch without drinking water: check OSM, or add the record's waterPoints
NO_SHOP_KM = 60  # a longer stretch without a shop: check OSM, and say so in the notes (carry food)
NO_BED_KM = 30  # a longer stretch without a bed: check OSM (huts, campsites), and say so in the notes
UNKNOWN_SHARE = 0.10
HUB_KM = 300
TREE_LINE_FROM_M = 1500  # a trail this high may cross a tree line: the record should say
# climbs and drops from the terrain model count once they reach 10 m (decided 2026-11-07,
# docs/scope.md): the same rule as CLIMB_THRESHOLD_M and climbs() in src/lib/trails.ts
CLIMB_THRESHOLD_M = 10


def climbs(heights, threshold=CLIMB_THRESHOLD_M):
    """Ascent and descent along a height series: a climb counts only once the height has risen
    `threshold` above the last reference height, a drop likewise; the reference then moves there."""
    up = down = 0
    ref = heights[0] if heights else 0
    for h in heights[1:]:
        if h - ref >= threshold:
            up, ref = up + h - ref, h
        elif ref - h >= threshold:
            down, ref = down + ref - h, h
    return up, down


def model_ascent(elevation):
    """The terrain model's ascent as the page shows it (terrainClimb() in src/lib/trails.ts): each
    main stage's climbs from 100 m samples (pipeline/elevation.py's `stageClimbs`), plus each side
    trip walked there and back both ways (`sideTrips`: its up and its down both climbed), each to
    10 m (half up, as JavaScript rounds); from the profile's samples over the whole route where the
    derived file predates them."""
    to10 = lambda m: math.floor(m / 10 + 0.5) * 10
    if elevation.get("stageClimbs"):
        trips = sum(to10(s["up"]) + to10(s["down"]) for s in elevation.get("sideTrips", []))
        return sum(to10(s["up"]) for s in elevation["stageClimbs"]) + trips
    return climbs([p[1] for p in elevation["points"]])[0]


def _photos(slug, refresh):
    """The photos step as its own process, started once the map line is there: it reads only the
    line (data/derived/lines/) and the record and writes only its own files (data/photos/,
    public/photos/), and spends minutes waiting on Wikimedia Commons, so it runs beside the other
    steps (2026-11-06); its output is printed when it is done. The cache manifest the steps share is
    written under a lock (Cache._save)."""
    cmd = [sys.executable, "-m", "pipeline.photos", slug] + (["--refresh"] if refresh else [])
    return subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True), time.monotonic()


def run(slug, refresh=False, start="routes"):
    steps = STEPS[STEPS.index(start) :]
    photos = None
    times = []

    def finish_photos(failed=False):
        proc, t0 = photos
        out, _ = proc.communicate()
        took = time.monotonic() - t0
        print(f"\n== photos (beside the other steps, {took:.0f} s)")
        print(out.rstrip())
        times.append(("photos", took))
        if proc.returncode and not failed:
            print(f"\nphotos failed (exit {proc.returncode})")
            print(f"resume with: ~/.venvs/huckepack/bin/python -m pipeline.all {slug} --from photos")
            raise SystemExit(1)

    for step in steps:
        if step == "photos":
            break
        print(f"\n== {step}")
        t0 = time.monotonic()
        try:
            importlib.import_module(f"pipeline.{step}").build(slug, refresh=refresh)
        except (Exception, SystemExit) as error:
            print(f"\n{step} failed: {error}")
            if photos:
                finish_photos(failed=True)
            print(f"resume with: ~/.venvs/huckepack/bin/python -m pipeline.all {slug} --from {step}")
            raise SystemExit(1)
        times.append((step, time.monotonic() - t0))
        print(f"   ({times[-1][1]:.0f} s)")
        if step == "routes" and "photos" in steps:
            photos = _photos(slug, refresh)
    if "photos" in steps:
        if not photos:
            photos = _photos(slug, refresh)
        finish_photos()
    print("\n== time: " + ", ".join(f"{name} {t:.0f} s" for name, t in times))


def _line_km(coords):
    lat0 = sum(c[1] for c in coords) / len(coords)
    k = math.cos(math.radians(lat0)) * 111.32
    return sum(math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 111.32) for a, b in zip(coords, coords[1:]))


DAYS_BASES = ("operator", "secondary", "stages")


def days_check(trail):
    """The record's days by the user's rule of 2026-11-07 (docs/trail-building.md): (ok, message).

    Days come from the operator, else a trusted second source, else one per main stage of the
    operator's stage list, each recorded with its `basis`; a trail that fits none has no days and a
    note starting "Days" saying what was searched.
    """
    days = trail.get("days")
    if not days:
        if any(str(n).startswith("Days") for n in trail.get("notes", [])):
            return True, "days: none published, with a note saying what was searched"
        return False, "days: none and no note starting \"Days\" (search the operator, then a second source; else one per main stage of the operator's stage list)"
    basis = days.get("basis")
    if basis not in DAYS_BASES:
        return False, f"days: no basis (one of {', '.join(DAYS_BASES)}: where the days come from)"
    span = f"{days['min']}" if days["min"] == days["max"] else f"{days['min']}–{days['max']}"
    if basis == "stages":
        main = [s for s in (trail.get("stages") or {}).get("list", []) if s.get("kind") == "main"]
        if days["min"] != len(main) or days["max"] != len(main):
            return False, f"days: basis stages, but {span} days against {len(main)} main stages"
        return True, f"days: {span}, one per main stage of {days['source']}'s list (check the list is the operator's)"
    return True, f"days: {span}, from the {'operator' if basis == 'operator' else 'second source'} {days['source']}"


def check(slug):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    derived = json.loads((ROOT / "data" / "derived" / f"{slug}.json").read_text())
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    from pipeline import osm

    # a trail without stages (stages.none, issue #204): its one internal segment over the whole
    # route, checked against the stated length instead of stage lengths
    stages = [s for s in osm.stage_list(trail) if not s.get("whole")]
    main = [s for s in stages if s["kind"] == "main"]
    whole = bool((trail.get("stages") or {}).get("none"))
    flags, fine = [], []

    def off(a, b):
        return abs(a - b) / b > OFF if b else False

    # the OSM match, per stage
    poor = [f"{f['properties']['number']} ({f['properties']['covered']:.0%})" for f in route["features"] if f["properties"].get("covered", 1) < 0.95 and "part" not in f["properties"]]
    if whole:
        (flags if poor else fine).append("route: the whole route under 95 % matched (OSM may lack a path; note it)" if poor else "route: the whole route at least 95 % matched")
    else:
        (flags if poor else fine).append(f"route: stages under 95 % matched: {', '.join(poor)} (OSM may lack a path; note it)" if poor else "route: every stage at least 95 % matched")

    # lengths: per stage (map line against stated) and the whole main route
    by_stage = {}  # a stage in parts (rides between them) adds them up
    for f in route["features"]:
        if "number" in f["properties"] and f["properties"]["kind"] != "transfer":
            key = (f["properties"]["number"], f["properties"]["kind"])
            by_stage[key] = by_stage.get(key, 0) + _line_km(f["geometry"]["coordinates"])
    long_off = [
        f"{s['number']} ({by_stage[(s['number'], s['kind'])]:.1f} km against {s['km']} km)"
        for s in stages
        if (s["number"], s["kind"]) in by_stage and off(by_stage[(s["number"], s["kind"])], s["km"])
    ]
    if not whole:
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
        model = model_ascent(elevation)
        up = sum(s["ascentM"] for s in main) if main and all("ascentM" in s for s in main) else None
        if (whole or not up) and trail.get("ascent"):
            # the stated total: a trail without stages, or stages that state no climbs of their own
            # (the Benton MacKaye Trail's total from its association, 2026-11-07)
            up = trail["ascent"][0]["m"]
        if up:
            msg = f"ascent: stated {up:,} m, terrain model about {round(model, -1):,.0f} m"
            (flags if off(model, up) else fine).append(msg + (" (check the stated figure and the map line)" if off(model, up) else ""))
        else:
            fine.append(f"ascent: none stated; the page estimates about {round(model, -1):,.0f} m from the terrain model")
        noted = any(str(n).startswith("Tree line") for n in trail.get("notes", []))
        if elevation["highest"]["m"] >= TREE_LINE_FROM_M and not trail.get("treeLine") and not noted:
            flags.append(f"tree line: the route climbs to {elevation['highest']['m']:,} m; add the region's tree line (treeLine) or a note why not")

    from pipeline.climate import pending

    if pending(slug):
        flags.append("climate: pending (built by an older method, or its places moved); run `~/.venvs/huckepack/bin/python -m pipeline.climate --pending`, and don't publish the trail before")
    elif derived.get("climate"):
        fine.append("climate: up to date")

    water = derived.get("water")
    if water:
        # as the page rates it: clean water, drinking water or a refill at a place to sleep (issue #119)
        tiers = derived.get("along", {}).get("water")
        gap = tiers["longestGapKm"]["clean"] if tiers else water["longestGapKm"]["drinking"]
        msg = f"water: {sum(p['kind'] == 'drinking' for p in water['points'])} drinking water points; longest dry stretch {gap['km']} km (km {gap['fromKm']}–{gap['toKm']})"
        (flags if gap["km"] > DRY_KM else fine).append(msg + (" (check OSM there, or add the record's waterPoints)" if gap["km"] > DRY_KM else ""))

    along_ = derived.get("along")
    if along_:
        for key, limit, word in (("resupply", NO_SHOP_KM, "resupply"), ("beds", NO_BED_KM, "a bed")):
            gap = along_[key]["longestGapKm"]
            msg = f"{key}: {len(along_[key]['points'])} points; longest without {word} {gap['km']} km (km {gap['fromKm']}–{gap['toKm']})"
            (flags if gap["km"] > limit else fine).append(msg + (" (check OSM there; note it)" if gap["km"] > limit else ""))

    surface = derived.get("surface")
    if surface:
        unknown = surface["totals"].get("unknown", {}).get("share", 0)
        msg = f"surface: {unknown:.0%} unknown, {surface['inferredShare']:.0%} inferred from the way type"
        (flags if unknown > UNKNOWN_SHARE else fine).append(msg)

    # stations and bus stations over 300 km away; airports may be (the nearest with international
    # flights, however far, 2026-11-07), so theirs are checked against the straight line instead
    hubs = (derived.get("access") or {}).get("hubs", [])
    kinds = {h["name"]: h["kind"] for h in trail.get("access") or []}
    far = [f"{h['name']} ({h['roadKm']} km)" for h in hubs
           if (h.get("roadKm", 0) > HUB_KM if kinds.get(h["name"]) != "airport" else h.get("roadKm", 0) > 3 * h.get("straightKm", 0) + 50)]
    if hubs:
        (flags if far else fine).append(f"travel hubs far from the start or a long way round: {', '.join(far)} (coordinates right?)" if far
                                        else "travel hubs: stations within 300 km of the start, airports' roads not far round")

    for step, key in (("landcover", "landcover"), ("climate", "climate"), ("access", "access")):
        if not derived.get(key):
            flags.append(f"{step}: no derived data yet")

    if not trail.get("dataCheck"):
        flags.append("data check: no dataCheck in the record yet (working rule 2)")

    days_ok, days_msg = days_check(trail)
    (fine if days_ok else flags).append(days_msg)

    # the page head's skyline and the Wildlife section are part of every trail (2026-11-04)
    skylines = (ROOT / "src" / "lib" / "skylines.ts").read_text()
    if not re.search(rf'^\s{{2}}"?{re.escape(slug)}"?: \{{', skylines, re.M):
        flags.append("skyline: none in src/lib/skylines.ts yet (draw the trail's landscape, keyed by its slug)")
    else:
        fine.append("skyline: drawn")
    animals = trail.get("animals") or {}
    if animals.get("list") or animals.get("plants") or animals.get("none"):
        fine.append(f"wildlife: {len(animals.get('list', []))} animals, {len(animals.get('plants', []))} plants" + (" (none, by an official source)" if animals.get("none") else ""))
    elif any(str(n).startswith("Wildlife") for n in trail.get("notes", [])):
        fine.append("wildlife: none listed, with a note why")
    else:
        flags.append("wildlife: no animals, `none` or note starting \"Wildlife\" (look for official sources: parks, health and agriculture authorities)")

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
