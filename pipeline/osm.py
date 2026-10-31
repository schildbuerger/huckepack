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
import re
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
TURN_ARM_M = 150  # a turnaround: the track 150 m before and after it lies together
LOOP_GAP_M = 100  # a short loop: the track comes back within this of where it left
MAX_BRIDGE_M = 100  # where OSM's ways don't connect, a gap up to this long near the track is bridged


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


def stage_order(number):
    """Sort key for a stage number: its digits, so "N8" (the Goldsteig's Nordroute) sorts as 8."""
    return float(re.sub(r"[^\d.]", "", number) or 0)


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


def turnarounds(track, step=20, arm_m=TURN_ARM_M):
    """Indices (into resample(track, step)) where the track turns back on itself: a summit walked
    up and down the same path (the points arm_m before and after lie together, and the turn is at
    least 100 m from them), or a short loop out to a viewpoint and back on a parallel path (the
    track leaves a point and comes back within LOOP_GAP_M of it after 0.6 to 3 km; the turn is the
    loop's farthest point, at least three times as far out as the gap)."""
    pts = resample(track, step)
    k = round(arm_m / step)
    found = []
    for i in range(k, len(pts) - k):
        gap = math.dist(pts[i - k], pts[i + k])
        if gap < NEAR_M and math.dist(pts[i], pts[i - k]) > 100:
            if found and i - found[-1][0] <= k:
                if gap < found[-1][1]:
                    found[-1] = (i, gap)
            else:
                found.append((i, gap))
    turns = [i for i, _ in found]
    lo, hi = round(600 / step), round(3000 / step)
    i = 0
    while i < len(pts) - lo:
        j = next((j for j in range(i + lo, min(i + hi, len(pts))) if math.dist(pts[i], pts[j]) < LOOP_GAP_M), None)
        if j is not None:
            far = max(range(i, j), key=lambda m: math.dist(pts[i], pts[m]))
            if math.dist(pts[i], pts[far]) > 3 * math.dist(pts[i], pts[j]) and not any(i <= t <= j for t in turns):
                turns.append(far)
            i = j
        else:
            i += 1
    return pts, sorted(turns)


def match(track_lonlat, osm):
    """Return (OSM coordinates of the matched route as (lon, lat), report).

    report["ways"] lists the OSM ways the route uses, in order: [way id, metres], with
    consecutive pieces of the same way merged. Where the track turns back on itself (out to a
    summit and back), each leg is matched on its own: the cheapest path would skip the spur."""
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node"}
    ways = [e for e in osm["elements"] if e["type"] == "way"]
    proj = Projection(sum(lat for _, lat in track_lonlat) / len(track_lonlat))
    track = [proj.xy(lon, lat) for lon, lat in track_lonlat]
    xy = {n: proj.xy(*ll) for n, ll in nodes.items()}

    fine, turns = turnarounds(track)
    # only where OSM has a node near the turn: a stray track point must not force a detour
    turns = [t for t in turns if min(math.dist(fine[t], q) for q in xy.values()) <= NEAR_M]
    legs = [fine[a : b + 1] for a, b in zip([0, *turns], [*turns, len(fine) - 1])] if turns else [track]
    # the legs meet at the same node (the one nearest the turnaround), so they chain
    path, pairs = [], {}
    for leg in legs:
        leg_path, via = _cheapest_path(leg, ways, xy)
        path += leg_path[1:] if path else leg_path
        pairs.update({(a, b): via[b] for a, b in zip(leg_path, leg_path[1:])})

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
        if report["ways"] and report["ways"][-1][0] == pairs[a, b]:
            report["ways"][-1][1] += metres
        else:
            report["ways"].append([pairs[a, b], metres])
    report["ways"] = [[w, round(m, 1)] for w, m in report["ways"]]
    return [nodes[n] for n in path], report


def _cheapest_path(track, ways, xy):
    """The cheapest chain of OSM nodes from the track's start to its end, and the way that
    reaches each node."""
    index = SegmentIndex(track)
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

    def search():
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
        return dist, prev, via

    dist, prev, via = search()
    # where OSM has no way across (a crossing mapped as removed, the Sauerland-Waldroute's Ruhr at
    # Bestwig), bridge the shortest gap near the track between what is reached and the rest, up to
    # MAX_BRIDGE_M; only then, so trails whose ways connect are untouched. Way id 0 marks the bridge
    for _ in range(3):
        if target in dist:
            break
        near = [n for n in graph if off[n] <= MAX_BRIDGE_M]
        reached = [n for n in near if n in dist]
        rest = [n for n in near if n not in dist]
        # the shortest gap, counting how far its ends lie off the track
        pairs = ((math.dist(xy[a], xy[b]), a, b) for a in reached for b in rest)
        gap = min(((length + off[a] + off[b], length, a, b) for length, a, b in pairs if length <= MAX_BRIDGE_M), default=None)
        if not gap:
            break
        _, length, a, b = gap
        graph[a].append((b, length * 10, 0))
        graph[b].append((a, length * 10, 0))
        print(f"  bridged a {length:.0f} m gap between OSM ways (no way there in OSM)")
        dist, prev, via = search()
    if target not in dist:
        raise ValueError("the OSM ways near the track don't connect start and end")

    path = [target]
    while path[-1] != source:
        path.append(prev[path[-1]])
    path.reverse()
    return path, via
