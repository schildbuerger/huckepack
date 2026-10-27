"""Build a trail's map line from OpenStreetMap, guided by the GPX tracks of its stages.

    .venv/bin/python -m pipeline.routes <slug>            # use cached downloads in data/raw/<slug>/
    .venv/bin/python -m pipeline.routes <slug> --refresh  # download tracks and OSM ways again

For each stage with a `track` URL in data/trails/<slug>.yaml: download the GPX and the OSM
ways around it (both cached in data/raw/<slug>/, with manifest.json recording when each was
retrieved), match the track to the ways (pipeline/osm.py) and write
public/routes/<slug>.geojson: one LineString of OSM geometry per stage, simplified to about
10 m and rounded to 5 decimals, with the stage's number, kind, from and to and how well the
match covers the track. Prints a report; stages that cover less than 95% of their track need
a look (OSM may be missing a path there).
"""

import json
import math
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import truststore
import yaml

from pipeline import osm

# Verify downloads through the operating system's certificate store; Python's own bundle
# is missing on some installs. Never disable verification instead.
truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
TOLERANCE_M = 10
USER_AGENT = "huckepack-pipeline (personal project)"


class Cache:
    """Downloads for one trail in data/raw/<slug>/, with retrieval times in manifest.json."""

    def __init__(self, slug, refresh):
        self.dir = ROOT / "data" / "raw" / slug
        self.dir.mkdir(parents=True, exist_ok=True)
        self.refresh = refresh
        self.manifest_path = self.dir / "manifest.json"
        self.manifest = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else {}

    def get(self, name, url, download):
        """Cached file `name`, calling download() -> bytes when missing or refreshing."""
        path = self.dir / name
        if self.refresh or not path.exists():
            path.write_bytes(download())
            self.manifest[name] = {"url": url, "retrieved": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            self.manifest_path.write_text(json.dumps(self.manifest, indent=2, sort_keys=True) + "\n")
            return path.read_text(), True
        return path.read_text(), False


def http_get(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def track_points(gpx):
    """(lon, lat) of every track point, whichever order the attributes come in."""
    points = []
    for attrs in re.findall(r"<trkpt\b([^>]*)>", gpx):
        lat = re.search(r'\blat="([-\d.]+)"', attrs)
        lon = re.search(r'\blon="([-\d.]+)"', attrs)
        points.append((float(lon.group(1)), float(lat.group(1))))
    if len(points) < 2:
        raise ValueError("track has fewer than two points")
    return points


def simplify(points, tolerance_m):
    """Douglas-Peucker on a local equirectangular projection (fine at trail scale)."""
    proj = osm.Projection(sum(p[1] for p in points) / len(points))
    xy = [proj.xy(lon, lat) for lon, lat in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        index, worst = None, tolerance_m
        for i in range(first + 1, last):
            d = osm.point_segment(xy[i], xy[first], xy[last])
            if d > worst:
                index, worst = i, d
        if index is not None:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def build(slug, refresh=False):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    stages = [s for s in trail.get("stages", {}).get("list", []) if s.get("track")]
    if not stages:
        raise SystemExit(f"{slug}: no stage has a track")
    cache = Cache(slug, refresh)
    features, stage_ways = [], []
    print(f"{'stage':<12} {'stated':>7} {'track':>7} {'osm':>7} {'covered':>8} {'max off':>8}")
    for stage in stages:
        label = f"{stage['number']}-{stage['kind']}"
        gpx, _ = cache.get(f"stage-{label}.gpx", stage["track"], lambda: http_get(stage["track"]))
        track = track_points(gpx)

        def download_ways():
            return json.dumps(osm.fetch_ways(track), separators=(",", ":")).encode()

        ways, fetched = cache.get(f"osm-stage-{label}.json", osm.OVERPASS, download_ways)
        if fetched:
            time.sleep(5)  # be polite to the public Overpass server
        line, report = osm.match(track, json.loads(ways))
        print(
            f"{label:<12} {stage['km']:>6.1f}k {report['track_km']:>6.1f}k {report['km']:>6.1f}k"
            f" {report['covered']:>7.0%} {report['max_off_m']:>7.0f}m"
            + ("   <- check" if report["covered"] < 0.95 else "")
        )
        stage_ways.append({"number": stage["number"], "kind": stage["kind"], "ways": report["ways"]})
        features.append(
            {
                "type": "Feature",
                "properties": {
                    **{k: stage[k] for k in ("number", "kind", "from", "to")},
                    "covered": round(report["covered"], 3),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[round(x, 5), round(y, 5)] for x, y in simplify(line, TOLERANCE_M)],
                },
            }
        )
    out = ROOT / "public" / "routes" / f"{slug}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n")
    # which OSM ways each stage uses (for pipeline/surface.py), in data/derived/<slug>.json
    derived = ROOT / "data" / "derived" / f"{slug}.json"
    existing = json.loads(derived.read_text()) if derived.exists() else {}
    derived.write_text(json.dumps({**existing, "routeWays": stage_ways}, indent=2, ensure_ascii=False) + "\n")
    count = sum(len(f["geometry"]["coordinates"]) for f in features)
    print(f"{out.relative_to(ROOT)}: {len(features)} stages, {count} points, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
