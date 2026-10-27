"""Distances from a trail's travel hubs (railway station, airports) to its start.

    .venv/bin/python -m pipeline.access <slug>            # use the cached routing results
    .venv/bin/python -m pipeline.access <slug> --refresh  # ask the router again

For each hub in the `access` list of data/trails/<slug>.yaml: the driving distance and time to
the trail's start from OSRM (routing on OpenStreetMap data; public demo server, so light use
only), and the straight-line distance. Router answers are cached in data/raw/<slug>/; the
result goes into data/derived/<slug>.json under `access`.
"""

import json
import math
import sys
import urllib.request
from pathlib import Path

import yaml

from pipeline.routes import USER_AGENT, Cache

ROOT = Path(__file__).resolve().parent.parent
OSRM = "https://router.project-osrm.org/route/v1/driving"


def straight_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def build(slug, refresh=False):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    hubs = trail.get("access", [])
    if not hubs:
        raise SystemExit(f"{slug}: no access hubs in the trail record")
    start = trail["termini"]["start"]
    cache = Cache(slug, refresh)
    results = []
    for i, hub in enumerate(hubs):
        url = f"{OSRM}/{hub['lon']},{hub['lat']};{start['lon']},{start['lat']}?overview=false"

        def download():
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()

        answer, _ = cache.get(f"osrm-access-{i}.json", url, download)
        route = json.loads(answer)
        if route.get("code") != "Ok":
            raise SystemExit(f"{hub['name']}: router answered {route.get('code')}")
        results.append(
            {
                "name": hub["name"],
                "roadKm": round(route["routes"][0]["distance"] / 1000, 1),
                "driveMin": round(route["routes"][0]["duration"] / 60),
                "straightKm": round(straight_km((hub["lat"], hub["lon"]), (start["lat"], start["lon"])), 1),
            }
        )
        print(f"{hub['name']}: {results[-1]['roadKm']} km by road ({results[-1]['driveMin']} min), "
              f"{results[-1]['straightKm']} km straight")

    out = ROOT / "data" / "derived" / f"{slug}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(out.read_text()) if out.exists() else {}
    access = {
        "source": "osrm",
        "retrieved": max(cache.manifest[f"osrm-access-{i}.json"]["retrieved"] for i in range(len(hubs))),
        "hubs": results,
    }
    out.write_text(json.dumps({**existing, "access": access}, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
