"""Build a trail's map line from the GPX tracks of its stages.

    .venv/bin/python -m pipeline.routes <slug>            # use cached tracks in data/raw/<slug>/
    .venv/bin/python -m pipeline.routes <slug> --refresh  # download the tracks again

Reads the `track` URL of each stage in data/trails/<slug>.yaml, caches the downloads in
data/raw/<slug>/ (with manifest.json recording when each was retrieved) and writes
public/routes/<slug>.geojson: one LineString per stage, simplified to about 10 m and
rounded to 5 decimals (about 1 m), with the stage's number, kind, from and to.
"""

import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import truststore
import yaml

# Verify downloads through the operating system's certificate store; Python's own bundle
# is missing on some installs. Never disable verification instead.
truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
TOLERANCE_M = 10
USER_AGENT = "huckepack-pipeline (personal project)"


def cached_track(slug, url, name, refresh):
    raw = ROOT / "data" / "raw" / slug
    raw.mkdir(parents=True, exist_ok=True)
    path = raw / name
    manifest_path = raw / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if refresh or not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
        manifest[name] = {"url": url, "retrieved": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return path.read_text()


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
    lat0 = math.radians(sum(p[1] for p in points) / len(points))
    xy = [(math.radians(lon) * math.cos(lat0) * 6371000, math.radians(lat) * 6371000) for lon, lat in points]

    def distance(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == dy == 0:
            return math.dist(p, a)
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.dist(p, (a[0] + t * dx, a[1] + t * dy))

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        index, worst = None, tolerance_m
        for i in range(first + 1, last):
            d = distance(xy[i], xy[first], xy[last])
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
    features = []
    for stage in stages:
        name = f"stage-{stage['number']}-{stage['kind']}.gpx"
        points = simplify(track_points(cached_track(slug, stage["track"], name, refresh)), TOLERANCE_M)
        features.append(
            {
                "type": "Feature",
                "properties": {k: stage[k] for k in ("number", "kind", "from", "to")},
                "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in points]},
            }
        )
    out = ROOT / "public" / "routes" / f"{slug}.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n")
    count = sum(len(f["geometry"]["coordinates"]) for f in features)
    print(f"{out.relative_to(ROOT)}: {len(features)} stages, {count} points, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
