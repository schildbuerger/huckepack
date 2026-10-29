"""Elevation profile of a trail's main route.

    .venv/bin/python -m pipeline.elevation <slug>            # use cached elevations
    .venv/bin/python -m pipeline.elevation <slug> --refresh  # sample the terrain model again

Needs public/routes/<slug>.geojson (pipeline.routes). Samples the main stages every SPACING_M
along the map line (the same kilometres as the water and surface charts) and reads each
sample's height from the Copernicus DEM GLO-30 (30 m grid; a surface model, so in forests it
measures the canopy). Its 1° tiles come as Cloud Optimized GeoTIFFs from AWS Open Data (no
account) and are kept in data/dem/ (git-ignored, shared by all trails; 30 to 45 MB each);
heights are interpolated bilinearly between the four nearest cells and cached in
data/raw/<slug>/elevation-glo30.json. Writes data/derived/<slug>.json under `elevation`:
[km, metres] per sample, stage starts, and the highest and lowest points (with coordinates).
Source id `copdem`; the licence asks for the notice in its record and a liability disclaimer
in the legal notice.
"""

import http.client
import json
import math
import sys
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import rasterio

from pipeline import osm
from pipeline.routes import USER_AGENT, Cache

ROOT = Path(__file__).resolve().parent.parent
SPACING_M = 100
DEM_DIR = ROOT / "data" / "dem"
TILE_URL = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/{name}/{name}.tif"


def tile_name(lon, lat):
    """The GLO-30 tile holding a point: named after its south-west corner."""
    ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
    return f"Copernicus_DSM_COG_10_{ns}{abs(math.floor(lat)):02d}_00_{ew}{abs(math.floor(lon)):03d}_00_DEM"


def tile(name):
    """Path of a cached tile, downloaded first if missing; None for open sea (no tile)."""
    path = DEM_DIR / f"{name}.tif"
    if not path.exists():
        DEM_DIR.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(TILE_URL.format(name=name), headers={"User-Agent": USER_AGENT})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=300) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError as error:
                if error.code in (403, 404):  # the bucket has no tiles over the sea
                    return None
                raise
            except (http.client.IncompleteRead, urllib.error.URLError):
                if attempt == 3:
                    raise  # cut off or unreachable: try again
        path.write_bytes(data)
        print(f"  downloaded {name} ({len(data) // 1_000_000} MB)")
    return path


def heights(points):
    """Height in metres at each (lon, lat): bilinear between the four nearest cell centres."""
    out = [0.0] * len(points)
    by_tile = {}
    for i, (lon, lat) in enumerate(points):
        by_tile.setdefault(tile_name(lon, lat), []).append(i)
    for name, idx in by_tile.items():
        path = tile(name)
        if path is None:
            continue
        with rasterio.open(path) as ds:
            grid = ds.read(1).astype(float)
            inverse = ~ds.transform
        rows, cols = grid.shape
        for i in idx:
            col, row = inverse * points[i]
            x = min(max(col - 0.5, 0), cols - 1)  # from pixel corners to cell centres
            y = min(max(row - 0.5, 0), rows - 1)
            x0, y0 = min(int(x), cols - 2), min(int(y), rows - 2)
            fx, fy = x - x0, y - y0
            q = grid[y0 : y0 + 2, x0 : x0 + 2]
            out[i] = float(np.dot([1 - fy, fy], q @ [1 - fx, fx]))
    return out


def route_samples(slug):
    """Points every SPACING_M along the main stages of the map line, as (km, lon, lat), the km
    where each main stage starts, and the main route's length in metres. Shared with
    pipeline/landcover.py, so its samples fall on the elevation profile's kilometres."""
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
    return samples, starts, walked


def build(slug, refresh=False):
    samples, starts, walked = route_samples(slug)

    def download():
        hs = heights([(lon, lat) for _, lon, lat in samples])
        return json.dumps({"spacingM": SPACING_M, "samples": len(samples), "elevation": [round(h, 1) for h in hs]}).encode()

    cache = Cache(slug, refresh)
    names = sorted({tile_name(lon, lat) for _, lon, lat in samples})
    data, _ = cache.get("elevation-glo30.json", " ".join(TILE_URL.format(name=n) for n in names), download)
    data = json.loads(data)
    if data["samples"] != len(samples):
        raise SystemExit("cached elevations don't match the route; run again with --refresh")
    heights_m = data["elevation"]

    points = [[round(km, 2), round(h)] for (km, _, _), h in zip(samples, heights_m)]
    hi = max(range(len(points)), key=lambda i: points[i][1])
    lo = min(range(len(points)), key=lambda i: points[i][1])
    high, low = points[hi], points[lo]
    # with coordinates, so later steps (climate) can look up these places
    at = lambda i: {"lat": round(samples[i][2], 5), "lon": round(samples[i][1], 5)}
    elevation = {
        "source": "copdem",
        "retrieved": cache.manifest["elevation-glo30.json"]["retrieved"],
        "spacingM": SPACING_M,
        "routeKm": round(walked / 1000, 1),
        "stageStarts": starts,
        "highest": {"km": high[0], "m": high[1], **at(hi)},
        "lowest": {"km": low[0], "m": low[1], **at(lo)},
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
