"""Landscape along a trail: land cover from ESA WorldCover.

    .venv/bin/python -m pipeline.landcover <slug>            # use the cached samples
    .venv/bin/python -m pipeline.landcover <slug> --refresh  # read the land cover map again

Needs the elevation step (pipeline.elevation): it samples the same points, every 100 m along the
main stages of the map line, so land cover and heights share their kilometres. Each sample's class
comes from ESA WorldCover 2021 (10 m, CC BY 4.0), read straight from its Cloud Optimized GeoTIFFs
on AWS Open Data (only the blocks around the route are fetched): the most common class in the
3 × 3 pixels (30 m) around the point, so the path itself doesn't count as bare ground. The 11
WorldCover classes are folded into the six GROUPS below. Writes data/derived/<slug>.json under
`landcover`: the share of each group on the main route, runs of one group along the route, and
the highest sample in forest (with the elevation profile's height there).
"""

import json
import math
import sys
from collections import Counter
from pathlib import Path

import rasterio
from rasterio.windows import Window

from pipeline.elevation import route_samples
from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent
TILE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
# WorldCover classes in the groups the page shows, in its fixed order. Six, not eleven: the
# page's colours stay apart for every reader only up to about six (checked with the dataviz
# validator; --land-* in Base.astro)
GROUPS = [
    ("forest", [10, 95]),  # tree cover, mangroves
    ("open", [20, 30]),  # shrubland and grassland: heath, meadows, pasture
    ("moss", [100]),  # moss and lichen
    ("bare", [60]),  # bare or sparse vegetation: rock, scree, sand, lava
    ("water", [70, 80, 90]),  # snow and ice, water, herbaceous wetland
    ("farm", [40, 50]),  # cropland, built-up
]
GROUP_OF = {code: g for g, codes in GROUPS for code in codes}


def tile(lon, lat):
    """The 3° WorldCover tile holding a point, named after its south-west corner."""
    la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def classes(points):
    """The WorldCover class at each (lon, lat): the most common in the 3 × 3 pixels around it
    (ties: the centre pixel's); 0 where the map has no data."""
    out = [0] * len(points)
    by_tile = {}
    for i, (lon, lat) in enumerate(points):
        by_tile.setdefault(tile(lon, lat), []).append(i)
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
    with env:
        for name, idx in by_tile.items():
            with rasterio.open(f"/vsicurl/{TILE_URL.format(tile=name)}") as ds:
                for i in idx:
                    row, col = ds.index(*points[i])
                    cells = ds.read(1, window=Window(col - 1, row - 1, 3, 3)).ravel().tolist()
                    counts = Counter(c for c in cells if c)
                    if counts:
                        top = max(counts.values())
                        centre = cells[4]
                        out[i] = centre if counts.get(centre) == top else counts.most_common(1)[0][0]
            print(f"  tile {name}: {len(idx)} samples")
    return out


def build(slug, refresh=False):
    out_path = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(out_path.read_text())
    elevation = derived.get("elevation")
    if not elevation:
        raise SystemExit("run pipeline.elevation first: land cover shares its samples")
    samples, starts, walked = route_samples(slug)
    if len(samples) != len(elevation["points"]):
        raise SystemExit("the route changed since the elevation step; run pipeline.elevation again")

    def download():
        codes = classes([(lon, lat) for _, lon, lat in samples])
        return json.dumps({"samples": len(samples), "classes": codes}).encode()

    cache = Cache(slug, refresh)
    data, _ = cache.get("landcover.json", TILE_URL.format(tile="…"), download)
    data = json.loads(data)
    if data["samples"] != len(samples):
        raise SystemExit("cached land cover doesn't match the route; run again with --refresh")
    groups = [GROUP_OF.get(c) for c in data["classes"]]

    known = [g for g in groups if g]
    total = len(known) or 1
    shares = {g: round(sum(1 for x in known if x == g) / total, 3) for g, _ in GROUPS}

    # runs of one group along the route; a sample stands for the 100 m around it
    kms = [round(km, 2) for km, _, _ in samples]
    edges = [0.0] + [round((a + b) / 2, 2) for a, b in zip(kms, kms[1:])] + [round(walked / 1000, 2)]
    runs = []
    for i, g in enumerate(groups):
        if runs and runs[-1]["group"] == g:
            runs[-1]["toKm"] = edges[i + 1]
        else:
            runs.append({"group": g, "fromKm": edges[i], "toKm": edges[i + 1]})
    runs = [r for r in runs if r["group"]]

    # the highest point the trail passes through forest (a rough treeline along the route)
    heights = [m for _, m in elevation["points"]]
    in_forest = [i for i, g in enumerate(groups) if g == "forest"]
    top = max(in_forest, key=lambda i: heights[i]) if in_forest else None

    landcover = {
        "source": "worldcover",
        "retrieved": cache.manifest["landcover.json"]["retrieved"],
        "spacingM": round(walked / max(len(samples) - 1, 1)),
        "routeKm": round(walked / 1000, 1),
        "stageStarts": starts,
        "shares": shares,
        "runs": runs,
        "highestForest": {"km": kms[top], "m": heights[top]} if top is not None else None,
    }
    out_path.write_text(json.dumps({**derived, "landcover": landcover}, indent=2, ensure_ascii=False) + "\n")
    print(f"{out_path.relative_to(ROOT)}: land cover over {landcover['routeKm']} km in {len(runs)} runs")
    for g, _ in GROUPS:
        if shares[g]:
            print(f"  {g:<7} {shares[g]:>6.1%}")
    if landcover["highestForest"]:
        print(f"  highest in forest: {landcover['highestForest']['m']} m at km {landcover['highestForest']['km']}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
