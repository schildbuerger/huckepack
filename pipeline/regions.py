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
once into ~/.cache/huckepack/naturalearth/ (not the repository).

Names in English (the user's decisions of 2026-11-07): an admin region takes the English label of
its Wikidata item (CC0; by Natural Earth's wikidataid, else its ISO 3166-2 code, P300, or HASC code,
P8119; cached in the same folder), "Cataluña" → "Catalonia", the Natural Earth name kept as an other
name. An admin and a natural region that are one place are listed once, under the admin region's
English name with the natural one as an other name: each covers at least MERGE_OVERLAP (90 %) of
the other's area (Corse and the island of Corsica, Islas Baleares and the Balearic Islands; counted
on a grid over both, for the pairs a trail has a fifth of its route in each).

Writes data/derived/<slug>.json `regions` (only that key, the rest of the file as it is): [{name,
kind, code?, cla?, also?, share}], the largest share first.
"""

import json
import math
import os
import sys
import unicodedata
import urllib.parse
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
# an admin and a natural region are one place when each covers at least this share of the other's area
MERGE_OVERLAP = 0.9
MERGE_GRID = 200
PIECE_KM = 0.5
# countries whose Natural Earth polygons are below ISO 3166-2's first level: the property that names
# the first level
DISSOLVE = {"FR": "region", "IT": "region", "ES": "region", "GB": "geonunit", "BE": "geonunit"}
# ISO 3166-2 codes of the joined regions where Natural Earth gives none
CODES = {
    "England": "GB-ENG", "Scotland": "GB-SCT", "Wales": "GB-WLS", "Northern Ireland": "GB-NIR",
    "Flemish Region": "BE-VLG", "Walloon Region": "BE-WAL", "Brussels Capital Region": "BE-BRU",
}
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
    """Every candidate region: {id, name, kind, code, hasc, qid, cla, polygons, bbox}."""
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
            rc = p.get("region_cod") or ""
            code = CODES.get(name) or (rc if rc.startswith(f"{cc}-") else None)
            hasc = rc if rc.startswith(f"{cc}.") else None
            r = joined.setdefault((cc, name), {"name": name, "kind": "admin", "code": code, "hasc": hasc, "country": cc, "polygons": []})
            r["polygons"] += polys
        else:
            out.append({"name": p.get("name_en") or p["name"], "kind": "admin", "code": p.get("iso_3166_2"), "qid": p.get("wikidataid"), "country": cc, "polygons": polys})
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
    out = [r for r in out if r["bbox"]]
    for i, r in enumerate(out):
        r["id"] = i
    return out


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


def route_km(lines, regions):
    """The route's length and, for every region it touches, the km inside it; for every admin
    and natural region it touches both, the km inside both: (total, {id: km}, {(admin, natural): km})."""
    parts = list(pieces(lines))
    total = sum(k for _, k in parts)
    if not total:
        return 0.0, {}, {}
    xs = np.array([p[0] for p, _ in parts])
    ys = np.array([p[1] for p, _ in parts])
    ks = np.array([k for _, k in parts])
    box = (xs.min(), ys.min(), xs.max(), ys.max())
    near = [r for r in regions if r["bbox"][0] <= box[2] and r["bbox"][2] >= box[0] and r["bbox"][1] <= box[3] and r["bbox"][3] >= box[1]]
    masks = {}
    for r in near:
        m = inside(r, xs, ys)
        if m.any():
            masks[r["id"]] = m
    within = {i: float(ks[m].sum()) for i, m in masks.items()}
    kind = {r["id"]: r["kind"] for r in near}
    both = {}
    for a, ma in masks.items():
        if kind[a] != "admin":
            continue
        for n, mn in masks.items():
            if kind[n] == "natural":
                k = float(ks[ma & mn].sum())
                if k:
                    both[(a, n)] = k
    return total, within, both


def overlap(r1, r2, n=MERGE_GRID):
    """How much of each region's area the other covers: (share of r1 in r2, share of r2 in r1),
    counted on an n × n grid over both bounding boxes, each point weighted by cos(latitude)."""
    x0, y0 = min(r1["bbox"][0], r2["bbox"][0]), min(r1["bbox"][1], r2["bbox"][1])
    x1, y1 = max(r1["bbox"][2], r2["bbox"][2]), max(r1["bbox"][3], r2["bbox"][3])
    gx, gy = np.meshgrid(np.linspace(x0, x1, n), np.linspace(y0, y1, n))
    xs, ys = gx.ravel(), gy.ravel()
    w = np.cos(np.radians(ys))
    m1, m2 = inside(r1, xs, ys), inside(r2, xs, ys)
    a1, a2, both = w[m1].sum(), w[m2].sum(), w[m1 & m2].sum()
    return (both / a1 if a1 else 0.0), (both / a2 if a2 else 0.0)


def merges(pairs, regions_by_id, share=MERGE_OVERLAP):
    """Admin and natural regions that are one place: each covers at least `share` of the other's area
    (Corse and the island of Corsica). Judged for the pairs a trail lies in both of. {natural id: admin id}."""
    out = {}
    for a, n in sorted(pairs):
        if n in out or a in out.values():
            continue
        s1, s2 = overlap(regions_by_id[a], regions_by_id[n])
        if s1 >= share and s2 >= share:
            out[n] = a
    return out


def entries(total, within, regions_by_id, merged, names, share_min=SHARE_MIN):
    """A trail's regions holding at least `share_min` of its route, a merged pair as one, the
    largest share first: [{name, kind, code?, cla?, also?, share}]."""
    shares = {}
    for i, k in within.items():
        i = merged.get(i, i)
        shares[i] = max(shares.get(i, 0.0), k / total)
    partner = {a: n for n, a in merged.items()}
    out = []
    for i, share in shares.items():
        if share < share_min:
            continue
        r = regions_by_id[i]
        name, also = names(r)
        if i in partner:
            # one place: the admin region's English name, else the natural region's (English in
            # Natural Earth), the other names kept
            n = regions_by_id[partner[i]]
            if not also and n["name"] != name:
                name, also = n["name"], [name]
            also = [x for x in [*also, n["name"]] if x != name]
        e = {"name": name, "kind": r["kind"]}
        if r.get("code"):
            e["code"] = r["code"]
        if r.get("cla"):
            e["cla"] = r["cla"]
        if also:
            e["also"] = sorted(set(also))
        e["share"] = round(share, 3)
        out.append(e)
    out.sort(key=lambda e: (-e["share"], e["kind"], e["name"]))
    # one name once: an admin and a natural region of one name (the Balearic Islands, the region
    # and the island group within it) are one place to the search; the larger share stays
    seen = {}
    for e in out:
        if e["name"] in seen:
            kept = seen[e["name"]]
            also = sorted(set(kept.get("also", []) + e.get("also", [])) - {kept["name"]})
            if also:
                kept["also"] = also
        else:
            seen[e["name"]] = e
    return list(seen.values())


def memberships(lines, regions, share_min=SHARE_MIN):
    """One trail on its own, without names or merges: the regions holding at least `share_min`."""
    total, within, _ = route_km(lines, regions)
    if not total:
        return []
    by_id = {r["id"]: r for r in regions}
    return entries(total, within, by_id, {}, lambda r: (r["name"], []), share_min)


# ——— English names from Wikidata (CC0) ———

WIKIDATA_CACHE = "wikidata-en.json"
USER_AGENT = "huckepack-pipeline/1.0 (https://huckepack.me; regions of long-distance trails)"


def _get(url):
    import truststore

    truststore.inject_into_ssl()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except (TimeoutError, OSError):
            if attempt == 2:
                raise


def wikidata_keys(r):
    """How Wikidata knows an admin region: its item (Natural Earth's wikidataid), its ISO 3166-2
    code (P300) or its HASC code (P8119), in that order."""
    keys = []
    if r.get("qid"):
        keys.append(r["qid"])
    if r.get("code"):
        keys.append(f"P300:{r['code']}")
    if r.get("hasc"):
        keys += [f"P8119:{r['hasc']}", f"P300:{r['hasc'].replace('.', '-')}"]
    return keys


def english_names(regions):
    """The English label of each admin region's Wikidata item, cached in ~/.cache/huckepack/naturalearth/."""
    path = CACHE_DIR / WIKIDATA_CACHE
    cache = json.loads(path.read_text()) if path.exists() else {}
    want = {k for r in regions if r["kind"] == "admin" for k in wikidata_keys(r)} - set(cache)
    qids = sorted(k for k in want if k.startswith("Q"))
    for i in range(0, len(qids), 50):
        batch = qids[i : i + 50]
        data = _get("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=" + "|".join(batch))
        for q in batch:
            cache[q] = data.get("entities", {}).get(q, {}).get("labels", {}).get("en", {}).get("value")
    codes = sorted(k for k in want if not k.startswith("Q"))
    if codes:
        values = " ".join(json.dumps(k.split(":", 1)[1]) for k in codes)
        query = (
            "SELECT ?code ?en WHERE { VALUES ?code { " + values + " } "
            "?item wdt:P300|wdt:P8119 ?code . ?item rdfs:label ?en FILTER(LANG(?en) = 'en') }"
        )
        data = _get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(query))
        # a HASC code has a dot (ES.CT), an ISO 3166-2 code a hyphen (ES-CT)
        found = {f"{'P8119' if '.' in b['code']['value'] else 'P300'}:{b['code']['value']}": b["en"]["value"] for b in data["results"]["bindings"]}
        for k in codes:
            cache[k] = found.get(k)
    if not want:
        return cache
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
    return cache


def namer(cache):
    """A region's name and other names: an admin region in English from Wikidata where there is
    one, its Natural Earth name then among the other names."""

    def names(r):
        if r["kind"] == "admin":
            en = next((cache.get(k) for k in wikidata_keys(r) if cache.get(k)), None)
            if en and en != r["name"]:
                return en, [r["name"]]
        return r["name"], []

    return names


def write(slug, found):
    """Only the `regions` key of the derived file, the rest as it is (other steps write theirs)."""
    path = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(path.read_text())
    derived["regions"] = found
    path.write_text(json.dumps(derived, indent=2, ensure_ascii=False) + "\n")


def all_slugs():
    return sorted(p.stem for p in (ROOT / "data" / "derived").glob("*.json") if (ROOT / "public" / "routes" / f"{p.stem}.geojson").exists())


def build(slug, refresh=False):
    """As pipeline.all runs its steps: every trail again, since a new trail can change which regions
    are merged (the layers are downloaded once, never refreshed: Natural Earth's version is pinned)."""
    build_many(all_slugs())


def build_many(slugs):
    """Writes the given trails' regions; which regions are the same place is judged on every trail."""
    regions = load_regions()
    by_id = {r["id"]: r for r in regions}
    routes = {slug: route_km(main_lines(slug), regions) for slug in sorted(set(all_slugs()) | set(slugs))}
    # pairs of an admin and a natural region holding a fifth of one trail each
    pairs = set()
    for total, within, both in routes.values():
        for a, n in both:
            if total and within[a] / total >= SHARE_MIN and within[n] / total >= SHARE_MIN:
                pairs.add((a, n))
    merged = merges(pairs, by_id)
    for n, a in merged.items():
        print(f"same place: {by_id[a]['name']} (admin) and {by_id[n]['name']} (natural)")
    # names only for the regions a trail lies in
    used = {merged.get(i, i) for total, within, _ in routes.values() if total for i, k in within.items() if k / total >= SHARE_MIN}
    names = namer(english_names([by_id[i] for i in used]))
    for slug in slugs:
        total, within, _ = routes[slug]
        found = entries(total, within, by_id, merged, names) if total else []
        write(slug, found)
        print(f"{slug}: " + ", ".join(f"{e['name']} ({e['kind']}, {e['share']:.0%})" for e in found))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--all" in sys.argv:
        args = all_slugs()
    if not args:
        raise SystemExit(__doc__)
    build_many(args)
