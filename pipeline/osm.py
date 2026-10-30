"""Match a GPX track to OpenStreetMap ways, so the map line is OSM geometry (ODbL).

The GPX only guides the choice of ways: the route is the cheapest path through the OSM
network between the ways nearest the track's start and end, where a way costs its length
times a penalty that grows with its distance from the track. Where OSM has no way near the
track, the path detours, and the coverage figures in the report show it.
"""

import heapq
import http.client
import json
import math
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# OVERPASS_URL picks a mirror (same OSM data) when the main instance is busy, e.g.
# https://overpass.kumi.systems/api/interpreter
OVERPASS = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "huckepack-pipeline (personal project)"
SEARCH_RADIUS_M = 200  # ways fetched around the track
BOX_M = 1000  # the track is queried in boxes over pieces of about this length
SIGMA_M = 15  # penalty scale: a way 15 m off the track costs double, 50 m about 12 times
FAR_M = 300  # distances beyond this are treated as this
NEAR_M = 30  # a track point counts as covered if the matched line is this close


class Projection:
    """Local equirectangular projection in metres (fine at trail-stage scale)."""

    def __init__(self, lat0):
        self.k = math.cos(math.radians(lat0)) * 6371000 * math.pi / 180
        self.m = 6371000 * math.pi / 180

    def xy(self, lon, lat):
        return lon * self.k, lat * self.m


class SegmentIndex:
    """Grid index of line segments for nearest-distance lookups."""

    def __init__(self, points, cell=100):
        self.cell = cell
        self.grid = {}
        for a, b in zip(points, points[1:]):
            for key in self._cells(a, b):
                self.grid.setdefault(key, []).append((a, b))

    def _cells(self, a, b):
        c = self.cell
        x0, x1 = sorted((a[0], b[0]))
        y0, y1 = sorted((a[1], b[1]))
        for i in range(int(x0 // c), int(x1 // c) + 1):
            for j in range(int(y0 // c), int(y1 // c) + 1):
                yield i, j

    def distance(self, p, limit=FAR_M):
        c = self.cell
        r = int(limit // c) + 1
        ci, cj = int(p[0] // c), int(p[1] // c)
        best = limit
        for i in range(ci - r, ci + r + 1):
            for j in range(cj - r, cj + r + 1):
                for a, b in self.grid.get((i, j), ()):
                    best = min(best, point_segment(p, a, b))
        return best


def point_segment(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == dy == 0:
        return math.dist(p, a)
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.dist(p, (a[0] + t * dx, a[1] + t * dy))


def resample(points, step):
    """Points every `step` metres along a projected polyline."""
    out = [points[0]]
    carry = 0.0
    for a, b in zip(points, points[1:]):
        seg = math.dist(a, b)
        pos = step - carry
        while pos <= seg:
            t = pos / seg
            out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
            pos += step
        carry = (carry + seg) % step
    out.append(points[-1])
    return out


def around(line_lonlat, max_points=150):
    """Overpass `around` coordinates for a polyline, thinned to keep the query short.
    Thinning cuts corners, so callers query a wider radius and filter precisely afterwards."""
    stride = max(1, len(line_lonlat) // max_points)
    thin = line_lonlat[::stride] + [line_lonlat[-1]]
    # no point twice in a row: a zero-length segment makes Overpass's `around` match nothing at
    # all, silently (the last point is often already in the thinned line)
    pairs = [f"{lat:.5f},{lon:.5f}" for lon, lat in thin]
    return ",".join(p for i, p in enumerate(pairs) if i == 0 or p != pairs[i - 1])


def boxes(line_lonlat, piece_m=BOX_M, pad_m=SEARCH_RADIUS_M):
    """Bounding boxes (south, west, north, east) of consecutive pieces of about piece_m of a line,
    each padded by pad_m, so together they hug the line."""
    proj = Projection(line_lonlat[0][1])
    out, piece, run = [], [line_lonlat[0]], 0.0
    for a, b in zip(line_lonlat, line_lonlat[1:]):
        piece.append(b)
        run += math.dist(proj.xy(*a), proj.xy(*b))
        if run >= piece_m or b is line_lonlat[-1]:
            lons, lats = [p[0] for p in piece], [p[1] for p in piece]
            dlat = pad_m / proj.m
            dlon = pad_m / proj.k
            out.append((min(lats) - dlat, min(lons) - dlon, max(lats) + dlat, max(lons) + dlon))
            piece, run = [b], 0.0
    return out


def fetch_ways(track_lonlat, src=None):
    data = (src or Overpass()).ways_around(boxes(track_lonlat))
    if not any(e["type"] == "way" for e in data["elements"]):
        raise RuntimeError("no OSM ways around the track; not caching an empty result")
    return data


# Where the OSM data come from: Geofabrik extracts on disk (pipeline/osmlocal.py, the default), or
# the public Overpass API with OSM_SOURCE=overpass. Both answer the same questions in the same
# shape, so the steps and their caches don't depend on which.
SOURCE = os.environ.get("OSM_SOURCE", "geofabrik")


class Overpass:
    label = OVERPASS

    def ways_around(self, boxes_):
        way = 'way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|platform)$"]'
        union = "".join(f"{way}({s:.5f},{w:.5f},{n:.5f},{e:.5f});" for s, w, n, e in boxes_)
        return fetch(f"[out:json][timeout:120];({union});out skel;>;out skel qt;")

    def relation(self, rid, children=True):
        more = "(._;rel(r););" if children else ""
        return fetch(f"[out:json][timeout:120];relation({rid});{more}out body;way(r);out geom;")

    def water(self, box):
        s, w, n, e = box
        b = f"{s:.5f},{w:.5f},{n:.5f},{e:.5f}"
        tags = ('["amenity"~"^(drinking_water|water_point)$"]', '["man_made"="water_tap"]', '["natural"="spring"]')
        return fetch("[out:json][timeout:120];(" + "".join(f"node{t}({b});" for t in tags) + ");out body;")

    def way_tags(self, ids):
        return fetch(f"[out:json][timeout:120];way(id:{','.join(map(str, ids))});out tags;")


def source_label():
    """What the caches' manifest records as where OSM data came from."""
    return OVERPASS if SOURCE == "overpass" else "https://download.geofabrik.de/"


def source(slug, guides=None, relation_ids=(), coarse=(), refresh=False):
    """The OSM data for a trail: its local corridor (built from Geofabrik extracts when missing or
    not covering `guides`), or Overpass. guides None: use the corridor as it is."""
    if SOURCE == "overpass":
        return Overpass()
    from pipeline import osmlocal

    return osmlocal.corridor(slug, guides, relation_ids, coarse, refresh)


def fetch(query):
    """Run an Overpass query, retrying while the server is busy."""
    body = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read())
            # Overpass reports a timeout or memory error as a remark with an empty result and status
            # 200; never return (and cache) that as if nothing were there
            if "runtime error" in data.get("remark", ""):
                if attempt == 4:
                    raise RuntimeError(f"Overpass: {data['remark']}")
                time.sleep(30 * (attempt + 1))
                continue
            data["retrieved"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            return data
        except (urllib.error.HTTPError, urllib.error.URLError, http.client.IncompleteRead, ConnectionError, TimeoutError) as error:
            busy = not isinstance(error, urllib.error.HTTPError) or error.code in (429, 502, 503, 504)
            if not busy or attempt == 4:
                raise
            time.sleep(30 * (attempt + 1))  # Overpass is busy or cut the response; back off


def match(track_lonlat, osm):
    """Return (OSM coordinates of the matched route as (lon, lat), report).

    report["ways"] lists the OSM ways the route uses, in order: [way id, metres], with
    consecutive pieces of the same way merged."""
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node"}
    ways = [e for e in osm["elements"] if e["type"] == "way"]
    proj = Projection(sum(lat for _, lat in track_lonlat) / len(track_lonlat))
    track = [proj.xy(lon, lat) for lon, lat in track_lonlat]
    index = SegmentIndex(track)
    xy = {n: proj.xy(*ll) for n, ll in nodes.items()}

    # node distance to the track, computed once per node
    off = {n: index.distance(p) for n, p in xy.items()}

    graph = {}
    for way in ways:
        refs = [n for n in way["nodes"] if n in xy]
        for a, b in zip(refs, refs[1:]):
            length = math.dist(xy[a], xy[b])
            mid = ((xy[a][0] + xy[b][0]) / 2, (xy[a][1] + xy[b][1]) / 2)
            d = max(off[a], off[b], index.distance(mid))
            cost = length * (1 + (d / SIGMA_M) ** 2)
            graph.setdefault(a, []).append((b, cost, way["id"]))
            graph.setdefault(b, []).append((a, cost, way["id"]))
    if not graph:
        raise ValueError("no OSM ways near the track")

    def nearest(p):
        return min(graph, key=lambda n: math.dist(xy[n], p))

    source, target = nearest(track[0]), nearest(track[-1])
    dist, prev, via, heap = {source: 0.0}, {}, {}, [(0.0, source)]
    while heap:
        d, n = heapq.heappop(heap)
        if n == target:
            break
        if d > dist[n]:
            continue
        for m, cost, way_id in graph[n]:
            nd = d + cost
            if nd < dist.get(m, math.inf):
                dist[m], prev[m], via[m] = nd, n, way_id
                heapq.heappush(heap, (nd, m))
    if target not in dist:
        raise ValueError("the OSM ways near the track don't connect start and end")

    path = [target]
    while path[-1] != source:
        path.append(prev[path[-1]])
    path.reverse()

    # How well the matched line follows the track: share of the track within NEAR_M of it,
    # and the furthest the track gets from it.
    matched_xy = [xy[n] for n in path]
    matched_index = SegmentIndex(matched_xy)
    samples = [matched_index.distance(p, limit=2000) for p in resample(track, 20)]
    report = {
        "km": sum(math.dist(a, b) for a, b in zip(matched_xy, matched_xy[1:])) / 1000,
        "track_km": sum(math.dist(a, b) for a, b in zip(track, track[1:])) / 1000,
        "covered": sum(d <= NEAR_M for d in samples) / len(samples),
        "max_off_m": max(samples),
        "start_off_m": math.dist(matched_xy[0], track[0]),
        "end_off_m": math.dist(matched_xy[-1], track[-1]),
        "ways": [],
    }
    for a, b in zip(path, path[1:]):
        metres = math.dist(xy[a], xy[b])
        if report["ways"] and report["ways"][-1][0] == via[b]:
            report["ways"][-1][1] += metres
        else:
            report["ways"].append([via[b], metres])
    report["ways"] = [[w, round(m, 1)] for w, m in report["ways"]]
    return [nodes[n] for n in path], report
