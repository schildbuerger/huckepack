"""Elevation profile of a trail's main route.

    .venv/bin/python -m pipeline.elevation <slug>            # use cached elevations
    .venv/bin/python -m pipeline.elevation <slug> --refresh  # ask the elevation API again

Needs public/routes/<slug>.geojson (pipeline.routes). Samples the main stages every SPACING_M
along the map line (the same kilometres as the water and surface charts), looks up each
sample's height with the Open-Meteo elevation API (Copernicus DEM GLO-90, CC BY 4.0; at most
100 points per request, cached in data/raw/<slug>/elevation.json) and writes
data/derived/<slug>.json under `elevation`: [km, metres] per sample, stage starts, and the
highest and lowest points.
"""

import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from pipeline import osm
from pipeline.routes import USER_AGENT, Cache

ROOT = Path(__file__).resolve().parent.parent
SPACING_M = 100
API = "https://api.open-meteo.com/v1/elevation"
BATCH = 100
PAUSE_S = 15  # the free API counts every coordinate and limits them per minute


def build(slug, refresh=False):
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    stages = sorted(
        (f for f in route["features"] if f["properties"]["kind"] == "main"),
        key=lambda f: float(f["properties"]["number"]),
    )
    every = [c for f in stages for c in f["geometry"]["coordinates"]]
    proj = osm.Projection(sum(lat for _, lat in every) / len(every))

    # samples every SPACING_M along the main stages, with their km and stage
    samples, starts, walked = [], [], 0.0
    for f in stages:
        line = f["geometry"]["coordinates"]
        xy = [proj.xy(*c) for c in line]
        starts.append({"number": f["properties"]["number"], "km": round(walked / 1000, 2)})
        next_at = math.ceil(walked / SPACING_M) * SPACING_M
        for (a, b), (la, lb) in zip(zip(xy, xy[1:]), zip(line, line[1:])):
            seg = math.dist(a, b)
            while seg > 0 and next_at <= walked + seg:
                t = (next_at - walked) / seg
                samples.append((next_at / 1000, la[0] + t * (lb[0] - la[0]), la[1] + t * (lb[1] - la[1])))
                next_at += SPACING_M
            walked += seg
    end = stages[-1]["geometry"]["coordinates"][-1]
    samples.append((walked / 1000, end[0], end[1]))

    def download():
        heights = []
        for i in range(0, len(samples), BATCH):
            chunk = samples[i : i + BATCH]
            url = (
                f"{API}?latitude={','.join(f'{s[2]:.5f}' for s in chunk)}"
                f"&longitude={','.join(f'{s[1]:.5f}' for s in chunk)}"
            )
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(request, timeout=60) as response:
                        heights += json.loads(response.read())["elevation"]
                    break
                except urllib.error.HTTPError as error:
                    if error.code != 429 or attempt == 4:
                        raise
                    time.sleep(60)  # rate limit: wait for the next minute
            print(f"  elevations {len(heights)}/{len(samples)}")
            time.sleep(PAUSE_S)
        return json.dumps({"spacingM": SPACING_M, "samples": len(samples), "elevation": heights}).encode()

    cache = Cache(slug, refresh)
    data, _ = cache.get("elevation.json", API, download)
    data = json.loads(data)
    if data["samples"] != len(samples):
        raise SystemExit("cached elevations don't match the route; run again with --refresh")
    heights = data["elevation"]

    points = [[round(km, 2), round(h)] for (km, _, _), h in zip(samples, heights)]
    high = max(points, key=lambda p: p[1])
    low = min(points, key=lambda p: p[1])
    elevation = {
        "source": "openmeteo",
        "retrieved": cache.manifest["elevation.json"]["retrieved"],
        "spacingM": SPACING_M,
        "routeKm": round(walked / 1000, 1),
        "stageStarts": starts,
        "highest": {"km": high[0], "m": high[1]},
        "lowest": {"km": low[0], "m": low[1]},
        "points": points,
    }

    out = ROOT / "data" / "derived" / f"{slug}.json"
    existing = json.loads(out.read_text()) if out.exists() else {}
    out.write_text(json.dumps({**existing, "elevation": elevation}, indent=2, ensure_ascii=False) + "\n")
    print(f"{out.relative_to(ROOT)}: {len(points)} samples over {elevation['routeKm']} km; "
          f"highest {high[1]} m at km {high[0]}, lowest {low[1]} m at km {low[0]}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
