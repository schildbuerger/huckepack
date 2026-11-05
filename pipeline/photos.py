"""Photos of a trail from Wikimedia Commons (researched 2026-11-05, docs/scope.md; built the same day).

    ~/.venvs/huckepack/bin/python -m pipeline.photos <slug>            # use the cached Commons listing
    ~/.venvs/huckepack/bin/python -m pipeline.photos <slug> --refresh  # ask Commons again

The record's `wikidata` item names the trail's photo (P18) and its Commons category (P373). From the
category and its direct subcategories named after it the step takes photos only under an open licence (public
domain, CC0, CC BY, CC BY-SA: no NC, ND or GFDL-only), with no restriction tagged (personality
rights, trademarks), a named author, JPEG, landscape and at least 1,200 px wide, and not a map, sign,
logo, diagram, vehicle or station by its title. A photo with a camera position must lie within 1 km of the trail's
map line (data/derived/lines/<slug>.json), and is placed at its kilometre; one without a position
counts only from the trail's own category, not a subcategory (a town's category holds the town).
The P18 photo comes first, then up to MAX photos spread along the route, then unplaced ones.
data/reference/photo-exclude.yaml lists files a hand check turned down.

Each photo is downloaded once at 1,280 px (Commons' own resizing) and saved by
scripts/photos-webp.mjs as WebP in public/photos/<slug>/ (NN.webp and a 480 px NN-s.webp), so the
site serves its own copy: no hotlinking, no new host for the privacy policy or the CSP. Writes
data/photos/<slug>.json: each photo's file page, author, licence, caption and kilometre, which the
trail page's mosaic and gallery credit ("Photo: <author>, <licence>, Wikimedia Commons"). Commons
doesn't warrant a file's licence: the step reads it from the file's metadata, and the hand check
(photo-exclude.yaml) is the way to drop one.
"""

import json
import math
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import yaml

from pipeline.popularity import ENTITY, get
from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/{name}?width=1280"
MAX = 8
NEAR_KM = 1.0
OPEN = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?)", re.I)
NOT_PHOTO = re.compile(
    r"\b(map|karte|carte|mappa|mapa|logo|plan|sign|signpost|schild|wegweiser|panneau|marker|markierung|waymark|"
    r"stamp|stempel|leaflet|flyer|profile|profil|elevation|diagram|schema|scheme|poster|plaque|tafel|"
    r"bus|irisbus|gare|bahnhof|station|train|tram|truck|lkw|car park|parking|parkplatz|interior|innenraum)\b",
    re.I,
)


def query(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    return get(url)


def strip(html):
    text = re.sub(r"<[^>]+>", "", html or "")
    return re.sub(r"\s+", " ", text).strip()


def files_in(category):
    """Files of a category with their metadata, and its direct subcategories."""
    files, cont = [], {}
    while True:
        r = query({
            "action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
            "gcmtype": "file", "gcmlimit": "50", "prop": "imageinfo",
            "iiprop": "url|size|extmetadata|mime", **cont,
        }) or {}
        for page in (r.get("query") or {}).get("pages", {}).values():
            ii = page["imageinfo"][0]
            m = ii.get("extmetadata", {})
            val = lambda k: strip(m.get(k, {}).get("value", ""))
            files.append({
                "title": page["title"], "w": ii["width"], "h": ii["height"], "mime": ii["mime"],
                "page": ii["descriptionurl"], "licence": val("LicenseShortName"), "licenceUrl": val("LicenseUrl"),
                "author": val("Artist"), "restrictions": val("Restrictions"), "name": val("ObjectName"),
                "lat": val("GPSLatitude"), "lon": val("GPSLongitude"),
            })
        if "continue" not in r:
            break
        cont = r["continue"]
        time.sleep(1)
    subs = query({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{category}", "cmtype": "subcat", "cmlimit": "50"}) or {}
    return files, [c["title"].split(":", 1)[1] for c in (subs.get("query") or {}).get("categorymembers", [])]


def km_between(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    return 2 * 6371 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))


def route_points(slug):
    """The main route's points [lon, lat] with their kilometre, from the walked lines."""
    path = ROOT / "data" / "derived" / "lines" / f"{slug}.json"
    if not path.exists():
        return []
    pts, km = [], 0.0
    for stage in json.loads(path.read_text())["stages"]:
        if stage["kind"] != "main":
            continue
        for line in stage["lines"]:
            for p in line:
                if pts:
                    km += km_between(pts[-1][0], p)
                pts.append((p, km))
    return pts


def usable(f):
    return (
        f["mime"] == "image/jpeg"
        and OPEN.match(f["licence"] or "")
        and "NC" not in f["licence"] and "ND" not in f["licence"]
        and not f["restrictions"]
        and f["author"]
        and f["w"] >= 1200 and f["w"] >= 1.2 * f["h"]
        and not NOT_PHOTO.search(f["title"].replace("_", " "))
    )


def caption(f):
    name = f["name"] or f["title"].split(":", 1)[1].rsplit(".", 1)[0]
    name = re.sub(r"\s*\(\d{6,}\)$", "", name)  # Flickr ids
    name = re.sub(r"\s+-\s+\w+ \d{1,2}, \d{4}$", "", name)  # " - August 8, 2016"
    name = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", name)
    name = re.sub(r"\s*\d{1,2}$", "", name).replace("_", " ").replace(" @ ", ", ")
    return name[:90]


def author(f):
    a = re.sub(r"\b(Own work|Eigenes Werk|Travail personnel)\b[.,;: ]*", "", f["author"]).strip(" ,;.")
    return re.sub(r"\s+from\s+.*$", "", a)[:60] or "unknown"


def choose(slug, listing, p18, excluded):
    route = route_points(slug)
    main_titles = set(listing["main"])
    cands = {}
    for f in listing["files"]:
        if f["title"] in excluded or not usable(f):
            continue
        km = off = None
        if f["lat"] and f["lon"] and route:
            pos = (float(f["lon"]), float(f["lat"]))
            best = min(route, key=lambda r: km_between(r[0], pos))
            off = km_between(best[0], pos)
            if off > NEAR_KM:
                continue
            km = round(best[1], 1)
        elif f["title"] not in main_titles:
            continue  # unplaced photos only from the trail's own category
        cands[f["title"]] = {**f, "km": km}
    picked = []
    if p18 and ("File:" + p18) in cands:
        picked.append(cands.pop("File:" + p18))
    placed = sorted((c for c in cands.values() if c["km"] is not None), key=lambda c: c["km"])
    room = MAX - len(picked)
    if len(placed) > room:  # spread over the route: evenly spaced picks
        placed = [placed[round(i * (len(placed) - 1) / max(1, room - 1))] for i in range(room)]
        placed = list({c["title"]: c for c in placed}.values())
    picked += placed[:room]
    rest = sorted((c for c in cands.values() if c["km"] is None and c not in picked), key=lambda c: -c["w"])
    picked += rest[: MAX - len(picked)]
    # route order, the trail's own photo (P18) first
    head, tail = picked[:1], sorted(picked[1:], key=lambda c: (c["km"] is None, c["km"] or 0))
    return head + tail if picked and p18 and picked[0]["title"] == "File:" + p18 else sorted(picked, key=lambda c: (c["km"] is None, c["km"] or 0))


def build(slug, refresh=False):
    record = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    out = ROOT / "data" / "photos" / f"{slug}.json"
    folder = ROOT / "public" / "photos" / slug
    qid = record.get("wikidata")
    excluded = set((yaml.safe_load((ROOT / "data" / "reference" / "photo-exclude.yaml").read_text()) or {}).get(slug, []) or [])
    cache = Cache(slug, refresh)

    def download():
        if not qid:
            return json.dumps({"wikidata": None, "p18": None, "category": None, "files": [], "main": []}).encode()
        claims = get(ENTITY.format(q=qid))["entities"][qid]["claims"]
        first = lambda p: (claims.get(p) or [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value")
        p18, cat = first("P18"), first("P373")
        files, main = [], []
        if cat:
            files, subs = files_in(cat)
            main = [f["title"] for f in files]
            # only subcategories about the trail itself ("Tour du Mont Blanc in 2016", "GR 20 stages"), not
            # the towns and things along it
            for sub in [x for x in subs if cat.lower() in x.lower()][:25]:
                time.sleep(1)
                files += files_in(sub)[0]
        if p18 and "File:" + p18 not in {f["title"] for f in files}:
            r = query({"action": "query", "titles": "File:" + p18, "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime"}) or {}
            for page in (r.get("query") or {}).get("pages", {}).values():
                if "imageinfo" in page:
                    ii = page["imageinfo"][0]
                    m = ii.get("extmetadata", {})
                    val = lambda k: strip(m.get(k, {}).get("value", ""))
                    files.append({"title": page["title"], "w": ii["width"], "h": ii["height"], "mime": ii["mime"], "page": ii["descriptionurl"],
                                  "licence": val("LicenseShortName"), "licenceUrl": val("LicenseUrl"), "author": val("Artist"),
                                  "restrictions": val("Restrictions"), "name": val("ObjectName"), "lat": val("GPSLatitude"), "lon": val("GPSLongitude")})
                    main.append(page["title"])
        return json.dumps({"wikidata": qid, "p18": p18, "category": cat, "files": files, "main": main}, ensure_ascii=False).encode()

    data, _ = cache.get("commons.json", f"{qid} P18 P373", download, key=qid or "none")
    listing = json.loads(data)
    picks = choose(slug, listing, listing.get("p18"), excluded)
    # the same photos as last time, all still on disk: nothing to download
    if out.exists() and not refresh:
        before = json.loads(out.read_text())["photos"]
        if [p["page"] for p in before] == [f["page"] for f in picks] and all((ROOT / "public" / p["src"].lstrip("/")).exists() for p in before):
            print(f"{slug}: {len(before)} photos, unchanged")
            return
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("*.webp"):
        old.unlink()
    photos = []
    for n, f in enumerate(picks, 1):
        name = f["title"].split(":", 1)[1]
        raw = cache.dir / f"photo-{n:02d}.jpg"
        body = get_bytes(FILEPATH.format(name=urllib.parse.quote(name)))
        raw.write_bytes(body)
        size = json.loads(subprocess.run(["node", str(ROOT / "scripts" / "photos-webp.mjs"), str(raw), str(folder / f"{n:02d}")],
                                         check=True, capture_output=True, text=True).stdout)
        raw.unlink()
        time.sleep(1)
        photos.append({
            "src": f"/photos/{slug}/{n:02d}.webp", "thumb": f"/photos/{slug}/{n:02d}-s.webp", "w": size["w"], "h": size["h"],
            "caption": caption(f), "author": author(f), "licence": f["licence"], "licenceUrl": f["licenceUrl"] or None,
            "page": f["page"], "km": f["km"],
        })
    out.parent.mkdir(parents=True, exist_ok=True)
    if photos:
        out.write_text(json.dumps({"source": "commons", "retrieved": cache.manifest["commons.json"]["retrieved"], "wikidata": qid,
                                   "category": listing.get("category"), "photos": photos}, indent=1, ensure_ascii=False) + "\n")
    else:
        out.unlink(missing_ok=True)
        folder.rmdir() if folder.exists() and not any(folder.iterdir()) else None
    usable_n = sum(1 for f in listing["files"] if usable(f))
    print(f"{slug}: {len(listing['files'])} files in Commons ({listing.get('category') or 'no category'}), {usable_n} usable, {len(photos)} taken"
          + (f", {sum(1 for p in photos if p['km'] is not None)} placed on the route" if photos else ""))


def get_bytes(url):
    import urllib.request
    from pipeline.popularity import USER_AGENT

    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=120) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    for slug in args:
        build(slug, refresh="--refresh" in sys.argv)
