"""Build a trail's map line from OpenStreetMap, guided by the GPX tracks of its stages.

    .venv/bin/python -m pipeline.routes <slug>            # use cached downloads in data/raw/<slug>/
    .venv/bin/python -m pipeline.routes <slug> --refresh  # download tracks and OSM ways again

Trails without GPX tracks can name their OSM hiking relation instead (`route.relation`, plus
`route.alternatives`, ways with role "alternative" that close gaps in the main members): its
ways are chained into one line from the start, split at each stage's `end` point, and each piece
guides the matcher like a GPX track would (cached as osm-relation.json). Where OSM maps the trail
as one relation per section (a superroute), each stage can name its own `relation` instead: its
ways are chained from where the previous stage ended (the trail's start for the first) and guide
that stage (cached as osm-relation-<id>.json).

For each stage with a `track` URL in data/trails/<slug>.yaml: download the GPX and the OSM
ways around it (both cached in data/raw/<slug>/, with manifest.json recording when each was
retrieved), match the track to the ways (pipeline/osm.py) and write
public/routes/<slug>.geojson: one LineString of OSM geometry per stage, simplified to about
10 m and rounded to 5 decimals, with the stage's number, kind, from and to and how well the
match covers the track. Prints a report; stages that cover less than 95% of their track need
a look (OSM may be missing a path there).
"""

import http.client
import json
import math
import re
import sys
import time
import urllib.error
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
MAX_RELATION_GAP_M = 1000  # a longer jump between relation ways ends the chained line
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
            body = download()
            path.write_bytes(body)
            # when the data carry their own date (OSM from an extract: the extract's), that one
            retrieved = datetime.now(timezone.utc).isoformat(timespec="seconds")
            try:
                retrieved = json.loads(body).get("retrieved") or retrieved
            except (ValueError, AttributeError):
                pass
            self.manifest[name] = {"url": url, "retrieved": retrieved}
            self.manifest_path.write_text(json.dumps(self.manifest, indent=2, sort_keys=True) + "\n")
            return path.read_text(), True
        return path.read_text(), False


def http_get(url):
    """Download url, retrying when the connection drops or the server is busy."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, http.client.IncompleteRead, TimeoutError):
            if attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))


def track_points(gpx):
    """(lon, lat) of every track point, whichever order the attributes come in. A `track` can also
    be a tour page that carries its track as schema.org data instead of a GPX file ("geo":
    GeoShape "line": "lat lon lat lon …", as Outdooractive's pages do, whose GPX download needs a
    login); it is cached under the same .gpx name, so it stays local like the GPX files."""
    points = []
    for attrs in re.findall(r"<trkpt\b([^>]*)>", gpx):
        lat = re.search(r'\blat="([-\d.]+)"', attrs)
        lon = re.search(r'\blon="([-\d.]+)"', attrs)
        points.append((float(lon.group(1)), float(lat.group(1))))
    if not points:
        shape = re.search(r'"@type"\s*:\s*"GeoShape"\s*,\s*"line"\s*:\s*"([-\d.\s]+)"', gpx)
        if shape:
            values = [float(v) for v in shape.group(1).split()]
            points = [(lon, lat) for lat, lon in zip(values[::2], values[1::2])]
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


def relation_line(relation, alternatives, start):
    """The relation's main ways (and the chosen alternatives) chained into one (lon, lat) line
    from the end nearest `start`; each next way is the one whose end is nearest, flipped to fit."""
    elements = relation["elements"]
    ways = {e["id"]: e for e in elements if e["type"] == "way"}
    # the relation's own ways, and those of its child relations where it is made of sections
    wanted = [
        ways[m["ref"]]["geometry"]
        for rel in (e for e in elements if e["type"] == "relation")
        for m in rel["members"]
        if m["type"] == "way" and m["ref"] in ways and (m.get("role", "") == "" or m["ref"] in alternatives)
    ]
    proj = osm.Projection(start[1])
    xy = lambda p: proj.xy(p["lon"], p["lat"])
    s = proj.xy(*start)
    first = min(wanted, key=lambda g: min(math.dist(xy(g[0]), s), math.dist(xy(g[-1]), s)))
    wanted.remove(first)
    line = first if math.dist(xy(first[0]), s) <= math.dist(xy(first[-1]), s) else first[::-1]
    jumps = []
    while wanted:
        end = xy(line[-1])
        gap, g = min(((min(math.dist(end, xy(g[0])), math.dist(end, xy(g[-1]))), g) for g in wanted), key=lambda t: t[0])
        if gap > MAX_RELATION_GAP_M:
            break  # the rest doesn't continue the line (pieces bypassed by an alternative)
        wanted.remove(g)
        line = line + (g if math.dist(end, xy(g[0])) <= math.dist(end, xy(g[-1])) else g[::-1])[1:]
        if gap > 20:
            jumps.append(round(gap))
    if jumps:
        print(f"  relation: gaps of {jumps} m between its ways (the matcher bridges them)")
    if wanted:
        km = sum(math.dist(xy(a), xy(b)) for g in wanted for a, b in zip(g, g[1:])) / 1000
        print(f"  relation: {len(wanted)} ways ({km:.1f} km) left out, they don't continue the line")
    return [(p["lon"], p["lat"]) for p in line]


def stage_relations(stage):
    """A stage's OSM relations: `relation` is one id or a list of them."""
    r = stage.get("relation")
    return [] if r is None else r if isinstance(r, list) else [r]


def piece(line, a, b):
    """The part of a line between the points nearest a and b (lon, lat), in the line's direction."""
    proj = osm.Projection(line[0][1])
    xy = [proj.xy(*p) for p in line]
    i = min(range(len(line)), key=lambda k: math.dist(xy[k], proj.xy(*a)))
    j = min(range(len(line)), key=lambda k: math.dist(xy[k], proj.xy(*b)))
    if j <= i:
        raise ValueError(f"stage end {b} lies before its start {a} along the relation")
    return line[i : j + 1]


def split_at(line, stages):
    """One piece of the line per stage, cut at the point nearest each stage's end."""
    proj = osm.Projection(line[0][1])
    xy = [proj.xy(*p) for p in line]
    pieces, i = [], 0
    for stage in stages:
        target = proj.xy(stage["end"]["lon"], stage["end"]["lat"])
        j = min(range(i, len(line)), key=lambda k: math.dist(xy[k], target))
        pieces.append(line[i : j + 1])
        i = j
    return pieces


def build(slug, refresh=False):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    all_stages = trail.get("stages", {}).get("list", [])
    stages = [s for s in all_stages if s.get("track") or s.get("relation")]
    cache = Cache(slug, refresh)
    guides = {}
    relation = trail.get("route", {}).get("relation")
    start, end = trail["termini"]["start"], trail["termini"]["end"]

    def track_of(stage):
        label = f"{stage['number']}-{stage['kind']}"
        gpx, _ = cache.get(f"stage-{label}.gpx", stage["track"], lambda: http_get(stage["track"]))
        return track_points(gpx)

    # the OSM data, opened only when a download is due (pipeline/osm.py source): a local corridor
    # around every stage's GPX track, or for relation-only trails around the relations' ways
    src = None

    def osm_src():
        nonlocal src
        if src is None:
            tracks = [p for s in all_stages if s.get("track") for p in track_of(s)]
            coarse = [(start["lon"], start["lat"]), (end["lon"], end["lat"])]
            coarse += [(s["end"]["lon"], s["end"]["lat"]) for s in all_stages if s.get("end")]
            relation_ids = ([relation] if relation else []) + [r for s in all_stages for r in stage_relations(s)]
            src = osm.source(slug, tracks + (coarse if tracks else []), relation_ids, coarse, refresh)
        return src

    if not stages and relation:
        # no GPX: the OSM relation, split at the stage ends, guides the matcher
        stages = [s for s in all_stages if s.get("end")]
        data, _ = cache.get(
            "osm-relation.json", osm.source_label(), lambda: json.dumps(osm_src().relation(relation, children=False), separators=(",", ":")).encode()
        )
        line = relation_line(json.loads(data), trail["route"].get("alternatives", []), (start["lon"], start["lat"]))
        guides = {s["number"]: piece for s, piece in zip(stages, split_at(line, stages))}
    if not stages:
        raise SystemExit(f"{slug}: no stage has a track (or an end point and a route.relation)")
    features, stage_ways = [], []
    print(f"{'stage':<12} {'stated':>7} {'track':>7} {'osm':>7} {'covered':>8} {'max off':>8}")
    previous_end = (start["lon"], start["lat"])
    last = None  # the stage before, so a run of variants chains from one to the next
    for stage in stages:
        label = f"{stage['number']}-{stage['kind']}"
        if stage["number"] in guides:
            track = guides[stage["number"]]
        elif stage.get("relation"):
            # one relation, or several in a row (an OSM section and the start of the next);
            # chained from where the previous main stage ended, or, for a variant after a
            # variant, from where that one ended; cut at the stage's `end` when it has one
            elements = []
            for rid in stage_relations(stage):
                data, fetched = cache.get(
                    f"osm-relation-{rid}.json", osm.source_label(), lambda rid=rid: json.dumps(osm_src().relation(rid), separators=(",", ":")).encode()
                )
                if fetched and osm.SOURCE == "overpass":
                    time.sleep(5)
                elements += json.loads(data)["elements"]
            begin = last[1] if stage["kind"] != "main" and last and last[0] != "main" else previous_end
            if stage.get("end"):
                # a stage that is only part of its relations: chain them from the end nearest the
                # trail's start (chaining from a point in the middle could head the wrong way), then
                # keep the piece from where the stage begins to its `end`
                full = relation_line({"elements": elements}, stage.get("alternatives", []), (start["lon"], start["lat"]))
                track = piece(full, begin, (stage["end"]["lon"], stage["end"]["lat"]))
            else:
                track = relation_line({"elements": elements}, stage.get("alternatives", []), begin)
        else:
            track = track_of(stage)

        def download_ways():
            return json.dumps(osm.fetch_ways(track, osm_src()), separators=(",", ":")).encode()

        ways, fetched = cache.get(f"osm-stage-{label}.json", osm.source_label(), download_ways)
        if fetched and osm.SOURCE == "overpass":
            time.sleep(5)  # be polite to the public Overpass server
        line, report = osm.match(track, json.loads(ways))
        if stage["kind"] == "main":
            previous_end = track[-1]
        last = (stage["kind"], track[-1])
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
