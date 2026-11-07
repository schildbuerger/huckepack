"""Regions a trail lies in, from open data (the user's rule of 2026-11-07).

    ~/.venvs/huckepack/bin/python -m pipeline.regions <slug> [<slug> …]
    ~/.venvs/huckepack/bin/python -m pipeline.regions --all

Besides countries and continents, the searches group trails by two kinds of region, both from
Natural Earth (1:10m, public domain, naturalearthdata.com), never from hand-picked lists:

- admin: first-level subdivisions (states, provinces, Länder, the UK's nations), Natural Earth's
  "Admin 1 – States, Provinces". Where Natural Earth's polygons are a level below ISO 3166-2's first
  level, they are joined into it by the property that names it (`DISSOLVE`): France's departments
  into its regions, Italy's provinces into its regions, Spain's provinces into its autonomous
  communities, the UK's districts into England, Scotland, Wales and Northern Ireland, Belgium's
  provinces into its three regions.
- natural: mountain ranges, plateaus, peninsulas, deserts, islands and the like, Natural Earth's
  "Geography regions" polygons; without continents, and without regions as large as a country or a
  continent's plain (`SKIP`).

A trail belongs to a region when at least SHARE_MIN (20 %, the landscape filter's rule) of its
main route lies inside it: the main stages of our OSM map line (public/routes/<slug>.geojson),
cut into pieces of at most 500 m, each piece counted by its midpoint. The two layers are downloaded
once into ~/.cache/huckepack/naturalearth/ (not the repository). Writes data/derived/<slug>.json
`regions` (only that key, the rest of the file as it is): [{name, kind, code?, cla?, share}], the
largest share first.
"""

import json
import math
import os
import sys
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(os.environ.get("HUCKEPACK_CACHE", Path.home() / ".cache" / "huckepack")) / "naturalearth"
# Natural Earth v5.1.2 as GeoJSON, from its official repository (the same data as naciscdn.org's
# shapefiles; public domain, https://www.naturalearthdata.com/about/terms-of-use/)
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
LAYERS = {"admin": "ne_10m_admin_1_states_provinces", "natural": "ne_10m_geography_regions_polys"}
SHARE_MIN = 0.2
PIECE_KM = 0.5
# countries whose Natural Earth polygons are below ISO 3166-2's first level: the property that names
# the first level
DISSOLVE = {"FR": "region", "IT": "region", "ES": "region", "GB": "geonunit", "BE": "geonunit"}
# ISO 3166-2 codes of the joined regions where Natural Earth gives none
CODES = {"England": "GB-ENG", "Scotland": "GB-SCT", "Wales": "GB-WLS", "Northern Ireland": "GB-NIR"}
# natural regions left out: continents, and those as large as a country or a continent's plain
# (Natural Earth's largest scale ranks of these classes: Great Britain, the British Isles, Iceland,
# the North European Plain)
SKIP_CLASSES = {"Continent", "Dragons-be-here"}
SKIP_LARGE = {"Island": 2, "Island group": 2, "Plain": 2, "Lowland": 2, "Basin": 2, "Tundra": 2}


def download(name):
    import truststore

    truststore.inject_into_ssl()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{name}.geojson"
    if not path.exists():
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(BASE + f"{name}.geojson", tmp)
        tmp.rename(path)
    return path


def rings_of(geometry):
    """A geometry's polygons as lists of rings (the outer ring first, then its holes)."""
    if geometry is None:
        return []
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return list(geometry["coordinates"])
    return []


def bbox_of(polygons):
    xs = [p[0] for poly in polygons for p in poly[0]]
    ys = [p[1] for poly in polygons for p in poly[0]]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def in_ring(xs, ys, ring):
    """Ray casting for many points at once: which of (xs, ys) lie inside the closed ring?"""
    r = np.asarray(ring, dtype=float)[:, :2]
    x1, y1 = r[:, 0], r[:, 1]
    x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
    out = np.zeros(len(xs), dtype=bool)
    step = max(1, 2_000_000 // max(1, len(r)))  # points per pass, so a pass stays a few MB
    for i in range(0, len(xs), step):
        px, py = xs[i : i + step, None], ys[i : i + step, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            cross = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / (y2 - y1) + x1)
        out[i : i + step] = (cross.sum(axis=1) % 2) == 1
    return out


def inside(region, xs, ys):
    """Which points lie inside the region (any of its polygons, outside their holes)."""
    hit = np.zeros(len(xs), dtype=bool)
    for poly in region["polygons"]:
        outer = np.asarray(poly[0], dtype=float)
        x0, y0 = outer[:, 0].min(), outer[:, 1].min()
        x1, y1 = outer[:, 0].max(), outer[:, 1].max()
        near = (~hit) & (xs >= x0) & (xs <= x1) & (ys >= y0) & (ys <= y1)
        if not near.any():
            continue
        idx = np.nonzero(near)[0]
        ok = in_ring(xs[idx], ys[idx], poly[0])
        for hole in poly[1:]:
            ok &= ~in_ring(xs[idx], ys[idx], hole)
        hit[idx[ok]] = True
    return hit


def title(name):
    """A Natural Earth label in plain words: "PYRENEES" → "Pyrenees", "Grampian Mts." → "Grampian Mountains"."""
    words = name.split()
    if name.isupper():
        words = [w.capitalize() for w in words]
    expand = {"Mts.": "Mountains", "Mts": "Mountains", "Pen.": "Peninsula", "Cord.": "Cordillera", "Is.": "Islands", "I.": "Island", "Mt.": "Mount"}
    return " ".join(expand.get(w, w) for w in words)


def natural_name(p):
    """English where Natural Earth's English name is the same place; its label otherwise (its
    NAME_EN is now and then another feature's: "Grampian Mts." reads "Cruach nam Miseag")."""
    label = title(p["NAME"])
    en = p.get("NAME_EN") or ""

    def starts(s):
        plain = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
        return {w[:4] for w in "".join(c if c.isalnum() else " " for c in plain).split() if len(w) >= 4}

    return en if en and (starts(en) & starts(label) or not starts(label)) else label


def load_regions():
    """Every candidate region: {name, kind, code, cla, polygons, bbox}."""
    out = []
    admin = json.loads(download(LAYERS["admin"]).read_text())
    joined = {}
    for f in admin["features"]:
        p = f["properties"]
        polys = rings_of(f["geometry"])
        if not polys:
            continue
        cc = p.get("iso_a2")
        key = DISSOLVE.get(cc)
        if key and p.get(key):
            name = p[key]
            code = CODES.get(name) or (p.get("region_cod") if (p.get("region_cod") or "").startswith(f"{cc}-") else None)
            r = joined.setdefault((cc, name), {"name": name, "kind": "admin", "code": code, "country": cc, "polygons": []})
            r["polygons"] += polys
        else:
            out.append({"name": p.get("name_en") or p["name"], "kind": "admin", "code": p.get("iso_3166_2"), "country": cc, "polygons": polys})
    out += joined.values()
    natural = json.loads(download(LAYERS["natural"]).read_text())
    for f in natural["features"]:
        p = f["properties"]
        cla = p["FEATURECLA"]
        if cla in SKIP_CLASSES or p["SCALERANK"] <= SKIP_LARGE.get(cla, -1):
            continue
        polys = rings_of(f["geometry"])
        if polys:
            out.append({"name": natural_name(p), "kind": "natural", "cla": cla, "polygons": polys})
    for r in out:
        r["bbox"] = bbox_of(r["polygons"])
    return [r for r in out if r["bbox"]]


def km(a, b):
    """Distance in km between two [lon, lat] points (equirectangular, fine for 500 m pieces)."""
    lat = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(b[0] - a[0]) * math.cos(lat)
    dy = math.radians(b[1] - a[1])
    return 6371.0 * math.hypot(dx, dy)


def pieces(lines, step=PIECE_KM):
    """The lines cut into pieces of at most `step` km: (midpoint [lon, lat], km) each."""
    for line in lines:
        for a, b in zip(line, line[1:]):
            d = km(a, b)
            n = max(1, math.ceil(d / step))
            for i in range(n):
                t = (i + 0.5) / n
                yield (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), d / n


def main_lines(slug):
    """The main stages of the trail's map line, as lists of [lon, lat]."""
    path = ROOT / "public" / "routes" / f"{slug}.geojson"
    if not path.exists():
        return []
    lines = []
    for f in json.loads(path.read_text())["features"]:
        if f["properties"].get("kind") != "main":
            continue
        g = f["geometry"]
        lines += [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
    return lines


def memberships(lines, regions, share_min=SHARE_MIN):
    """The regions holding at least `share_min` of the lines' length, the largest share first."""
    parts = list(pieces(lines))
    total = sum(k for _, k in parts)
    if not total:
        return []
    xs = np.array([p[0] for p, _ in parts])
    ys = np.array([p[1] for p, _ in parts])
    ks = np.array([k for _, k in parts])
    box = (xs.min(), ys.min(), xs.max(), ys.max())
    near = [r for r in regions if r["bbox"][0] <= box[2] and r["bbox"][2] >= box[0] and r["bbox"][1] <= box[3] and r["bbox"][3] >= box[1]]
    out = []
    for r in near:
        share = float(ks[inside(r, xs, ys)].sum()) / total
        if share >= share_min:
            entry = {"name": r["name"], "kind": r["kind"]}
            if r.get("code"):
                entry["code"] = r["code"]
            if r.get("cla"):
                entry["cla"] = r["cla"]
            entry["share"] = round(share, 3)
            out.append(entry)
    return sorted(out, key=lambda e: (-e["share"], e["kind"], e["name"]))


def write(slug, found):
    """Only the `regions` key of the derived file, the rest as it is (other steps write theirs)."""
    path = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(path.read_text())
    derived["regions"] = found
    path.write_text(json.dumps(derived, indent=2, ensure_ascii=False) + "\n")


def build(slug, refresh=False):
    """One trail, as pipeline.all runs its steps (the layers are downloaded once, never refreshed:
    Natural Earth's version is pinned)."""
    build_many([slug])


def build_many(slugs):
    regions = load_regions()
    for slug in slugs:
        found = memberships(main_lines(slug), regions)
        write(slug, found)
        print(f"{slug}: " + ", ".join(f"{e['name']} ({e['kind']}, {e['share']:.0%})" for e in found))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--all" in sys.argv:
        args = sorted(p.stem for p in (ROOT / "data" / "derived").glob("*.json") if (ROOT / "public" / "routes" / f"{p.stem}.geojson").exists())
    if not args:
        raise SystemExit(__doc__)
    build_many(args)
