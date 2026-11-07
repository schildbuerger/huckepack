"""Distances from a trail's travel hubs (railway station, airports) to its start.

    ~/.venvs/huckepack/bin/python -m pipeline.access <slug>            # use the cached routing results
    ~/.venvs/huckepack/bin/python -m pipeline.access <slug> --refresh  # ask the router again

For each hub in the `access` list of data/trails/<slug>.yaml: the driving distance and time to
the trail's start (or, for a start on an island, to the port in the hub's `via`, 2026-11-07: road
routing to an island snapped it to the nearest mainland shore) from OSRM (routing on OpenStreetMap data; public demo server, so light use
only), and the straight-line distance. Router answers are cached in data/raw/<slug>/; the
result goes into data/derived/<slug>.json under `access`.
"""

import fcntl
import json
import math
import re
import sys
import time
import urllib.request
from pathlib import Path

import yaml

from pipeline.routes import USER_AGENT, Cache

ROOT = Path(__file__).resolve().parent.parent
OSRM = "https://router.project-osrm.org/route/v1/driving"
_last = [0.0]  # the demo server's policy: at most one request a second


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
    names = []
    for hub in hubs:
        name = "osrm-access-" + re.sub(r"[^a-z0-9]+", "-", hub["name"].lower()).strip("-") + ".json"
        names.append(name)
        to = hub.get("via") or start
        url = f"{OSRM}/{hub['lon']},{hub['lat']};{to['lon']},{to['lat']}?overview=false"

        def download():
            time.sleep(max(0.0, 1.1 - (time.time() - _last[0])))
            _last[0] = time.time()
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()

        answer, _ = cache.get(name, url, download, key=url)
        route = json.loads(answer)
        if route.get("code") != "Ok":
            raise SystemExit(f"{hub['name']}: router answered {route.get('code')}")
        results.append(
            {
                "name": hub["name"],
                **({"to": hub["via"]["name"]} if hub.get("via") else {}),
                "roadKm": round(route["routes"][0]["distance"] / 1000, 1),
                "driveMin": round(route["routes"][0]["duration"] / 60),
                "straightKm": round(straight_km((hub["lat"], hub["lon"]), (to["lat"], to["lon"])), 1),
            }
        )
        print(f"{hub['name']}: {results[-1]['roadKm']} km by road ({results[-1]['driveMin']} min), "
              f"{results[-1]['straightKm']} km straight")

    # routes of hubs no longer in the record go (2026-11-07: the hubs were chosen anew)
    stale = [p for p in cache.dir.glob("osrm-access-*.json") if p.name not in names]
    if stale:
        with open(cache.dir / ".manifest.lock", "w") as lock:  # as Cache._save: other steps may write meanwhile
            fcntl.flock(lock, fcntl.LOCK_EX)
            disk = json.loads(cache.manifest_path.read_text()) if cache.manifest_path.exists() else {}
            for p in stale:
                p.unlink()
                disk.pop(p.name, None)
            cache.manifest_path.write_text(json.dumps(disk, indent=2, sort_keys=True) + "\n")

    out = ROOT / "data" / "derived" / f"{slug}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(out.read_text()) if out.exists() else {}
    access = {
        "source": "osrm",
        "retrieved": max(cache.manifest[n]["retrieved"] for n in names),
        "hubs": results,
    }
    out.write_text(json.dumps({**existing, "access": access}, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
