"""OpenStreetMap from Geofabrik extracts on disk, instead of the public Overpass API.

The Overpass server is shared and often busy (502s, timeouts, empty answers that look like
"nothing here"). This reads the same OpenStreetMap data from Geofabrik's daily regional extracts
(.osm.pbf, ODbL like all OSM data): for each of a trail's points the smallest Geofabrik region
holding it, downloaded once into git-ignored data/osm/ (a newer copy with --refresh when the one
on disk is older than MAX_AGE_DAYS). One pass over each extract then collects the trail's
corridor, everything within CORRIDOR_M of its points: the paths and roads with their nodes and
tags, the route relations it names with their member ways, and the water points. The corridor is
cached as data/osm/corridors/<slug>.json.gz and answers the pipeline's questions in the shape
Overpass answered them (pipeline/osm.py Source), so the steps and their caches don't change.

A trail without GPX tracks (route relations only) first has its relations' ways collected; their
geometry then defines the corridor.
"""

import gzip
import json
import math
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import osmium
import truststore

truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
OSM_DIR = ROOT / "data" / "osm"
# the extracts are large (hundreds of MB to GB each) and only re-downloadable input: keep them
# outside a synced project folder with HUCKEPACK_OSM_EXTRACTS=/some/local/folder
EXTRACTS_DIR = Path(os.environ.get("HUCKEPACK_OSM_EXTRACTS", OSM_DIR / "extracts"))
INDEX_URL = "https://download.geofabrik.de/index-v1.json"
USER_AGENT = "huckepack-pipeline (personal project)"
MAX_AGE_DAYS = 7
CORRIDOR_M = 600  # wider than any query: ways within 200 m of a track, water within 400 m of the route
CELL_DEG = 0.004  # corridor grid, about 450 m north-south
WATER_TAGS = (("amenity", "drinking_water"), ("amenity", "water_point"), ("man_made", "water_tap"), ("natural", "spring"))
MEMBER_TYPES = {"n": "node", "w": "way", "r": "relation"}
EXCLUDED_HIGHWAYS = {"motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed", "platform"}


def _get(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            return urllib.request.urlopen(request, timeout=600)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))


# --- which extracts -----------------------------------------------------------------------


def _index():
    path = OSM_DIR / "geofabrik-index.json"
    if not path.exists() or time.time() - path.stat().st_mtime > MAX_AGE_DAYS * 86400:
        OSM_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_get(INDEX_URL).read())
    return json.loads(path.read_text())["features"]


def _rings(geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [poly for poly in polys]


def _inside(lon, lat, poly):
    """Point in polygon (outer ring minus holes), by ray casting."""

    def in_ring(ring):
        inside = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
        return inside

    return in_ring(poly[0]) and not any(in_ring(hole) for hole in poly[1:])


def regions_for(points):
    """The smallest Geofabrik region holding each point, as [(id, pbf url)] without repeats.
    Each point is also tried a corridor's width off in every direction, so ways just across a
    regional border are in."""
    features = [f for f in _index() if f.get("geometry") and f["properties"].get("urls", {}).get("pbf")]
    boxes = []
    for f in features:
        coords = [c for poly in _rings(f["geometry"]) for c in poly[0]]
        xs, ys = [c[0] for c in coords], [c[1] for c in coords]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    pad = CORRIDOR_M / 111_000
    found, seen = [], set()
    for lon, lat in points:
        for dx, dy in ((0, 0), (pad, 0), (-pad, 0), (0, pad), (0, -pad)):
            x, y = lon + dx / max(math.cos(math.radians(lat)), 0.2), lat + dy
            best = None
            for f, (x0, y0, x1, y1) in zip(features, boxes):
                if x0 <= x <= x1 and y0 <= y <= y1 and any(_inside(x, y, p) for p in _rings(f["geometry"])):
                    area = (x1 - x0) * (y1 - y0)
                    if best is None or area < best[0]:
                        best = (area, f)
            if best and best[1]["properties"]["id"] not in seen:
                seen.add(best[1]["properties"]["id"])
                found.append((best[1]["properties"]["id"], best[1]["properties"]["urls"]["pbf"]))
    return found


def extract(region, url, refresh=False):
    """The region's extract on disk, downloaded when missing (or, refreshing, when older than
    MAX_AGE_DAYS). Geofabrik redirects "-latest" to a dated file; that date names the copy."""
    folder = EXTRACTS_DIR
    folder.mkdir(parents=True, exist_ok=True)
    stem = region.replace("/", "_")
    have = sorted(folder.glob(f"{stem}-*.osm.pbf"))
    if have and not (refresh and time.time() - have[-1].stat().st_mtime > MAX_AGE_DAYS * 86400):
        return have[-1]
    with _get(url) as response:
        dated = response.geturl().rsplit("/", 1)[-1]  # e.g. iceland-261028.osm.pbf
        date = dated.rsplit("-", 1)[-1].split(".")[0]
        target = folder / f"{stem}-{date}.osm.pbf"
        part = target.with_suffix(".part")
        size = int(response.headers.get("Content-Length") or 0)
        print(f"  downloading {region} ({size / 1e6:.0f} MB)")
        with part.open("wb") as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
    part.rename(target)
    for old in have:
        old.unlink()
    return target


def _timestamp(path):
    header = osmium.io.Reader(str(path), osmium.osm.NOTHING).header()
    return header.get("osmosis_replication_timestamp") or datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")


# --- the corridor -------------------------------------------------------------------------


def _cells(points, pad_m=CORRIDOR_M):
    """Grid cells within about pad_m of the points (a square buffer)."""
    cells = set()
    r = math.ceil(pad_m / 111_000 / CELL_DEG)
    for lon, lat in points:
        k = max(math.cos(math.radians(lat)), 0.2)
        cx, cy = int(lon * k // CELL_DEG), int(lat // CELL_DEG)
        for i in range(cx - r, cx + r + 1):
            for j in range(cy - r, cy + r + 1):
                cells.add((i, j))
    return cells


def _cell(lon, lat):
    k = max(math.cos(math.radians(lat)), 0.2)
    return int(lon * k // CELL_DEG), int(lat // CELL_DEG)


class Corridor:
    """The trail's OSM data near its points, in memory, answering like Overpass."""

    def __init__(self, data):
        self.data = data
        self.nodes = {int(k): v for k, v in data["nodes"].items()}
        self.ways = {int(k): v for k, v in data["ways"].items()}
        self.relations = {int(k): v for k, v in data["relations"].items()}
        self.cells = {tuple(c) for c in data["cells"]}
        self.retrieved = data["retrieved"]
        self.label = "geofabrik:" + ",".join(e["region"] for e in data["extracts"])
        # nodes by grid cell, so a query looks only at the cells its boxes touch
        self.by_cell = {}
        for nid, (lon, lat) in self.nodes.items():
            self.by_cell.setdefault(_cell(lon, lat), []).append(nid)
        self.ways_of = {}
        for wid, w in self.ways.items():
            if w.get("highway"):
                for n in w["nodes"]:
                    self.ways_of.setdefault(n, []).append(wid)

    def covers(self, points):
        return all(_cell(lon, lat) in self.cells for lon, lat in points)

    def _in_boxes(self, lon, lat, boxes):
        return any(s <= lat <= n and w <= lon <= e for s, w, n, e in boxes)

    def _box_cells(self, box):
        s, w, n, e = box
        lat = (s + n) / 2
        k = max(math.cos(math.radians(lat)), 0.2)
        return {
            (i, j)
            for i in range(int(w * k // CELL_DEG) - 1, int(e * k // CELL_DEG) + 2)
            for j in range(int(s // CELL_DEG), int(n // CELL_DEG) + 1)
        }

    def ways_around(self, boxes):
        """Ways with a node in any of the boxes (south, west, north, east), and their nodes,
        like Overpass's `out skel;>;out skel qt;`."""
        hit = set()
        for box in boxes:
            for c in self._box_cells(box):
                for nid in self.by_cell.get(c, ()):
                    if nid in self.ways_of and self._in_boxes(*self.nodes[nid], [box]):
                        hit.update(self.ways_of[nid])
        ways = [(wid, self.ways[wid]) for wid in sorted(hit)]
        node_ids = {n for _, w in ways for n in w["nodes"] if n in self.nodes}
        elements = [{"type": "way", "id": wid, "nodes": [n for n in w["nodes"] if n in self.nodes]} for wid, w in ways]
        elements += [{"type": "node", "id": n, "lon": self.nodes[n][0], "lat": self.nodes[n][1]} for n in node_ids]
        return {"elements": elements, "retrieved": self.retrieved}

    def relation(self, rid, children=True):
        """The relation (and with children its child relations) with its ways' geometry, like
        `relation(id);(._;rel(r););out body;way(r);out geom;`."""
        rels, todo = [], [rid]
        while todo:
            r = todo.pop()
            if r not in self.relations or any(x["id"] == r for x in rels):
                continue
            members = self.relations[r]
            rels.append({"type": "relation", "id": r, "members": [{"type": t, "ref": ref, "role": role} for t, ref, role in members]})
            if children:
                todo += [ref for t, ref, _ in members if t == "relation"]
        way_ids = {ref for rel in rels for m in rel["members"] if m["type"] == "way" for ref in [m["ref"]]}
        elements = list(rels) + [
            {
                "type": "way",
                "id": wid,
                "geometry": [{"lon": self.nodes[n][0], "lat": self.nodes[n][1]} for n in self.ways[wid]["nodes"] if n in self.nodes],
            }
            for wid in way_ids
            if wid in self.ways
        ]
        return {"elements": elements, "retrieved": self.retrieved}

    def water(self, box):
        """Water points in the box, with their tags."""
        s, w, n, e = box
        return {
            "elements": [{"type": "node", **p} for p in self.data["water"] if s <= p["lat"] <= n and w <= p["lon"] <= e],
            "retrieved": self.retrieved,
        }

    def way_tags(self, ids):
        return {
            "elements": [{"type": "way", "id": i, "tags": self.ways[i]["tags"]} for i in ids if i in self.ways],
            "retrieved": self.retrieved,
        }


def build_corridor(slug, guides, relation_ids=(), coarse=(), refresh=False):
    """Collect the corridor around `guides` (lon, lat points: tracks, termini, stage ends) and
    the named relations' ways; `coarse` points (termini, stage ends) bound the search for the
    relations' ways where no tracks are known. Cached in data/osm/corridors/<slug>.json.gz."""
    regions = regions_for(guides + list(coarse))
    if not regions:
        raise SystemExit(f"{slug}: no Geofabrik region holds the trail's points")
    paths = [(region, extract(region, url, refresh)) for region, url in regions]
    print(f"  extracts: {', '.join(p.name for _, p in paths)}")

    # 1. the named relations and their child relations, until no new ones turn up
    relations = {}
    wanted = set(relation_ids)
    while wanted - set(relations):
        before = len(relations)
        for _, path in paths:
            for r in osmium.FileProcessor(str(path), osmium.osm.RELATION).with_filter(osmium.filter.IdFilter(wanted - set(relations))):
                relations[r.id] = [(MEMBER_TYPES[m.type], m.ref, m.role) for m in r.members]
                wanted |= {m.ref for m in r.members if m.type == "r"}
        if len(relations) == before:
            break  # the rest isn't in these extracts
    member_ways = {ref for ms in relations.values() for t, ref, _ in ms if t == "way"}

    # 2. relation-only trails first: the relations' own ways, whose geometry then defines the
    # corridor (no GPX to go by; a box around a long trail's ends would hold far too much)
    def ways_pass(keep):
        for _, path in paths:
            for w in osmium.FileProcessor(str(path), osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(
                osmium.filter.EntityFilter(osmium.osm.WAY)
            ):
                locs = [(n.ref, n.lon, n.lat) for n in w.nodes if n.location.valid()]
                if locs and keep(w, locs):
                    yield w, locs

    ways, nodes = {}, {}

    def add(w, locs):
        ways[w.id] = {"nodes": [ref for ref, _, _ in locs], "tags": {t.k: t.v for t in w.tags}, "highway": w.tags.get("highway")}
        for ref, lon, lat in locs:
            nodes[ref] = (round(lon, 7), round(lat, 7))

    if not guides:
        for w, locs in ways_pass(lambda w, locs: w.id in member_ways):
            add(w, locs)
        guides = [nodes[n] for w in ways.values() for n in w["nodes"]] + list(coarse)

    # 3. the paths and roads near the guides
    cells = _cells(guides)

    def near(w, locs):
        highway = w.tags.get("highway")
        if w.id in member_ways:
            return True
        return bool(highway) and highway not in EXCLUDED_HIGHWAYS and any(_cell(lon, lat) in cells for _, lon, lat in locs)

    for w, locs in ways_pass(near):
        add(w, locs)

    # 4. water points in the corridor
    water = []
    for _, path in paths:
        for n in osmium.FileProcessor(str(path), osmium.osm.NODE).with_filter(osmium.filter.TagFilter(*WATER_TAGS)):
            if _cell(n.location.lon, n.location.lat) in cells:
                water.append({"id": n.id, "lon": round(n.location.lon, 7), "lat": round(n.location.lat, 7), "tags": {t.k: t.v for t in n.tags}})

    stamps = sorted(_timestamp(p) for _, p in paths)
    data = {
        "extracts": [{"region": r, "file": p.name, "timestamp": _timestamp(p)} for r, p in paths],
        "retrieved": stamps[0],  # the oldest extract: the data are at least this fresh
        "cells": sorted(cells),
        "nodes": nodes,
        "ways": ways,
        "relations": relations,
        "water": water,
    }
    out = OSM_DIR / "corridors" / f"{slug}.json.gz"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode()))
    print(f"  corridor: {len(ways)} ways, {len(nodes)} nodes, {len(relations)} relations, {len(water)} water points")
    return Corridor(json.loads(json.dumps(data)))


def corridor(slug, guides=None, relation_ids=(), coarse=(), refresh=False):
    """The trail's cached corridor, rebuilt when refreshing, when it doesn't cover the guide
    points, or when a named relation is missing."""
    path = OSM_DIR / "corridors" / f"{slug}.json.gz"
    if path.exists() and not refresh:
        c = Corridor(json.loads(gzip.decompress(path.read_bytes())))
        if (guides is None or c.covers(guides)) and all(r in c.relations for r in relation_ids):
            return c
    if guides is None:
        raise SystemExit(f"{slug}: no OSM corridor yet; run pipeline.routes first")
    return build_corridor(slug, guides, relation_ids, coarse, refresh)
