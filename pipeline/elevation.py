"""Elevation profile of a trail's main route.

    ~/.venvs/huckepack/bin/python -m pipeline.elevation <slug>            # use cached elevations
    ~/.venvs/huckepack/bin/python -m pipeline.elevation <slug> --refresh  # sample the terrain model again

Needs public/routes/<slug>.geojson (pipeline.routes). Samples the main stages every SPACING_M
along the map line (the same kilometres as the water and surface charts) and reads each
sample's height from GEDTM30 v1.2, OpenGeoHub's global ensemble digital terrain model (30 m
grid, bare earth: the ground under the trees, not the canopy; CC BY 4.0; since 2026-11-07,
before the Copernicus DEM GLO-30, a surface model). It is one global Cloud Optimized GeoTIFF,
read remotely with rasterio in windows around chunks of consecutive samples (no account, no
tiles kept); heights are interpolated bilinearly between the four nearest cells and cached in
data/raw/<slug>/elevation-gedtm30.json. Writes data/derived/<slug>.json under `elevation`:
[km, metres] per sample, stage starts, and the highest and lowest points (with coordinates).
Source id `gedtm30` (CC BY 4.0). The Copernicus DEM source and its notice were removed from the
records and the legal notice on 2026-11-07, since no figure uses the Copernicus DEM any more.
"""

import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
import rasterio.errors
from rasterio.windows import Window

from pipeline import osm
from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent
SPACING_M = 100
# very long trails (the Pacific Crest Trail's 4,265 km) are sampled every 500 m, so their pages stay
# under about 1 MB; the gradients then use 500 m bars (decided on 2026-10-31)
LONG_TRAIL_M = 1_000_000
LONG_SPACING_M = 500


def spacing_for(total_m):
    return LONG_SPACING_M if total_m > LONG_TRAIL_M else SPACING_M
# GEDTM30 v1.2 (OpenGeoHub, CC BY 4.0, decided 2026-11-07): one global Cloud Optimized GeoTIFF of
# bare-earth heights (30 m, metres above EGM2008; the file's scale tag of 0.1 is wrong, its own
# list says 1), read remotely: only the 2048-pixel blocks around the route, no account, nothing kept
DTM_URL = "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif"
CACHE_NAME = "elevation-gedtm30.json"
SOURCE_ID = "gedtm30"
CHUNK = 40  # consecutive samples read in one window (about 4 km at 100 m)
MARGIN = 2  # pixels around them, so every sample has its four neighbours
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",  # don't list the bucket
    "GDAL_HTTP_MAX_RETRY": 5,
    "GDAL_HTTP_RETRY_DELAY": 3,
    "GDAL_CACHEMAX": 1024,  # MB of decoded blocks: neighbouring windows share them
    "CPL_VSIL_CURL_CACHE_SIZE": 200_000_000,
}


def windows(pixels, chunk=CHUNK, margin=MARGIN):
    """Read windows for samples in pixel coordinates (col, row), consecutive ones together: one
    (first, last + 1, col0, row0, width, height) a chunk, covering each sample's four nearest cell
    centres with `margin` pixels to spare."""
    out = []
    for a in range(0, len(pixels), chunk):
        part = pixels[a : a + chunk]
        c0 = math.floor(min(c for c, _ in part)) - margin
        r0 = math.floor(min(r for _, r in part)) - margin
        c1 = math.floor(max(c for c, _ in part)) + margin + 1
        r1 = math.floor(max(r for _, r in part)) + margin + 1
        out.append((a, a + len(part), c0, r0, c1 - c0, r1 - r0))
    return out


def bilinear(grid, col, row, nodata=None):
    """Height at pixel coordinates (col, row) of `grid`, bilinear between the four nearest cell
    centres (pixel corners to centres: half a pixel); cells without data are left out and the rest
    reweighted; None when all four lack data."""
    rows, cols = grid.shape
    x = min(max(col - 0.5, 0), cols - 1)
    y = min(max(row - 0.5, 0), rows - 1)
    x0, y0 = min(int(x), cols - 2), min(int(y), rows - 2)
    fx, fy = x - x0, y - y0
    q = grid[y0 : y0 + 2, x0 : x0 + 2].astype(float)
    w = np.outer([1 - fy, fy], [1 - fx, fx])
    valid = np.isfinite(q) if nodata is None else (np.isfinite(q) & (q != float(nodata)))
    if not valid.any():
        return None
    weight = w[valid].sum()
    return float((q[valid] * w[valid]).sum() / weight) if weight > 0 else float(q[valid].mean())


def heights(points):
    """Height in metres at each (lon, lat) from GEDTM30, read in windows around chunks of
    consecutive samples; None where the model has no data (open sea)."""
    out = [None] * len(points)
    with rasterio.Env(**GDAL_ENV), rasterio.open(DTM_URL) as ds:
        inverse = ~ds.transform
        nodata = np.float32(ds.nodata) if ds.nodata is not None else None
        pixels = [inverse * p for p in points]
        for a, b, c0, r0, w, h in windows(pixels):
            for attempt in range(4):
                try:
                    grid = ds.read(1, window=Window(c0, r0, w, h))  # raw values: metres (not the scale tag)
                    break
                except rasterio.errors.RasterioIOError:
                    if attempt == 3:
                        raise
                    time.sleep(5 * (attempt + 1))
            for i in range(a, b):
                col, row = pixels[i]
                out[i] = bilinear(grid, col - c0, row - r0, nodata)
    return out


def route_samples(slug):
    """Points every SPACING_M along the main stages of the map line, as (km, lon, lat), the km
    where each main stage starts, and the main route's length in metres. Shared with
    pipeline/landcover.py, so its samples fall on the elevation profile's kilometres."""
    route = json.loads((ROOT / "public" / "routes" / f"{slug}.geojson").read_text())
    # in the record's order, as pipeline/along.py
    stages = [f for f in route["features"] if f["properties"]["kind"] == "main"]
    every = [c for f in stages for c in f["geometry"]["coordinates"]]
    proj = osm.Projection(sum(lat for _, lat in every) / len(every))
    total = sum(math.dist(proj.xy(*a), proj.xy(*b)) for f in stages for a, b in zip(f["geometry"]["coordinates"], f["geometry"]["coordinates"][1:]))
    spacing = spacing_for(total)

    # samples every `spacing` along the main stages, with their km and stage
    samples, starts, walked = [], [], 0.0
    for f in stages:
        line = f["geometry"]["coordinates"]
        xy = [proj.xy(*c) for c in line]
        if "part" not in f["properties"]:  # a stage's later parts (after a ride) don't start it
            starts.append({"number": f["properties"]["number"], "km": round(walked / 1000, 2)})
        next_at = math.ceil(walked / spacing) * spacing
        for (a, b), (la, lb) in zip(zip(xy, xy[1:]), zip(line, line[1:])):
            seg = math.dist(a, b)
            while seg > 0 and next_at <= walked + seg:
                t = (next_at - walked) / seg
                samples.append((next_at / 1000, la[0] + t * (lb[0] - la[0]), la[1] + t * (lb[1] - la[1])))
                next_at += spacing
            walked += seg
    end = stages[-1]["geometry"]["coordinates"][-1]
    samples.append((walked / 1000, end[0], end[1]))
    return samples, starts, walked


def build(slug, refresh=False):
    samples, starts, walked = route_samples(slug)

    def download():
        hs = heights([(lon, lat) for _, lon, lat in samples])
        return json.dumps({"spacingM": spacing_for(walked), "samples": len(samples), "elevation": [None if h is None else round(h, 1) for h in hs]}).encode()

    cache = Cache(slug, refresh)
    data, _ = cache.get(CACHE_NAME, DTM_URL, download)
    data = json.loads(data)
    if data["samples"] != len(samples):
        raise SystemExit("cached elevations don't match the route; run again with --refresh")
    heights_m = data["elevation"]
    missing = sum(h is None for h in heights_m)
    if missing:
        # open sea (a ferry, a causeway the model leaves out): sea level, said so in the run's output
        print(f"  {missing} sample(s) without terrain data, taken as 0 m (sea)")
        heights_m = [0.0 if h is None else h for h in heights_m]

    points = [[round(km, 2), round(h)] for (km, _, _), h in zip(samples, heights_m)]
    hi = max(range(len(points)), key=lambda i: points[i][1])
    lo = min(range(len(points)), key=lambda i: points[i][1])
    high, low = points[hi], points[lo]
    # with coordinates, so later steps (climate) can look up these places
    at = lambda i: {"lat": round(samples[i][2], 5), "lon": round(samples[i][1], 5)}
    elevation = {
        "source": SOURCE_ID,
        "retrieved": cache.manifest[CACHE_NAME]["retrieved"],
        "spacingM": spacing_for(walked),
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
