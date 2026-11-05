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
Where these leave fewer than MAX, Commons by location fills the gaps (2026-11-05): a geosearch round
points every GEO_STEP_KM along the line (cached in data/raw/<slug>/commons-geo.json), keeping photos
within GEO_NEAR_KM of it under the same rules whose Commons categories show the trail's surroundings
(scenic()), spread into the stretches the others leave.
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
GEO_STEP_KM = 2.5
GEO_RADIUS_M = 1500
GEO_NEAR_KM = 0.5
OPEN = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?)", re.I)
NOT_PHOTO = re.compile(
    r"\b(map|karte|carte|mappa|mapa|logo|plan|sign|signpost|fingerpost|waymarker|schild|wegweiser|panneau|marker|markierung|waymark|"
    r"stamp|stempel|leaflet|flyer|profile|profil|elevation|diagram|schema|scheme|poster|plaque|tafel|"
    r"bus|irisbus|gare|bahnhof|station|train|tram|truck|lkw|car park|parking|parkplatz|interior|innenraum)\b",
    re.I,
)

# A photo found by location shows the trail's surroundings only when its Commons categories say so: a
# landscape, a view, nature, a castle or the like (LANDSCAPE), and nothing of what is photographed beside
# a path just as often (NOT_LANDSCAPE: vehicles, interiors, people, events, objects, a species close up,
# whose category is its Latin name). Quality marks and nature contests rank a photo higher (GOOD).
LANDSCAPE = re.compile(
    r"\b(landscapes?|landschaft\w*|paysages?|paesaggi\w*|paisajes?|panoramas?|views?|aussicht\w*|ausblick\w*|"
    r"vineyards?|weinberg\w*|weinbau|vines?|viticulture|forests?|w[äa]ld(er|ern)?|woods?|woodlands?|mountains?|"
    r"berge?|gebirge|hills?|valleys?|t[äa]l(er)?|lakes?|seen?|lochs?|rivers?|fl[uü]ss\w*|bach|streams?|coasts?|"
    r"k[üu]ste\w*|coastline|beach(es)?|str[äa]nde?|cliffs?|bays?|sea|meer|nature reserves?|naturschutzgebiet\w*|"
    r"naturparks?|national parks?|nationalparks?|protected areas?|parco|parque|hiking|wanderweg\w*|wandern|trails?|"
    r"footpaths?|paths?|rocks?|felsen|castles?|burg(en|ruine)?|ruins?|ruinen?|moors?|moorland|heath(land)?|heide|"
    r"meadows?|wiesen?|glaciers?|gletscher|summits?|gipfel|passes|waterfalls?|wasserf[äa]lle?|gorges?|schlucht\w*|"
    r"dunes?|islands?|inseln?|countryside|fields?|pastures?|fells?|moors|munros?|peaks?|ridges?|fjords?|"
    r"wiki loves earth)\b",
    re.I,
)
NOT_LANDSCAPE = re.compile(
    r"\b(automobiles?|cars|vehicles?|motorcycles?|buses|trucks|lorries|tractors?|trains?|locomotives?|railway stations?|"
    r"aircraft|interiors?|innenansicht\w*|people|portraits?|men|women|children|groups of|selfies?|insects?|"
    r"lepidoptera|butterfl\w+|moths?|birds?|aves|doves?|gulls?|ducks?|fauna|animals|mammals|"
    r"crows?|ravens?|rooks?|jackdaws?|robins?|swans?|geese|goose|herons?|eagles?|buzzards?|owls?|puffins?|gannets?|"
    r"oystercatchers?|curlews?|deer|stags?|seals?|otters?|sheep|lambs?|cows?|cattle|horses?|ponies|pony|dogs?|cats?|"
    r"squirrels?|hares?|rabbits?|fox(es)?|lizards?|snakes?|frogs?|toads?|beetles?|spiders?|fungi|mushrooms?|food|dishes|meals|coats of arms|documents|"
    r"signs?|information boards?|plaques?|graves?|tombstones?|grabsteine?|cemeter\w*|friedh[öo]f\w*|sculptures?|"
    r"museums?|exhibitions?|events?|festivals?|concerts?|sports?|football|races?|marathons?|demonstrations?|"
    r"weddings?|construction|baustellen?|shops?|restaurants?|bars|pubs|house numbers?|doors?|windows?|details?|"
    r"close-ups?|macro|night|nachts?|fireworks|christmas|weihnacht\w*|carnival|fasching|fastnacht)\b",
    re.I,
)
SPHERE = re.compile(r"\b(mapillary|equirectangular|360°?|spherical|photospheres?|sph[äa]risch\w*)\b", re.I)
GOOD = re.compile(r"\b(quality images|valued images|featured pictures|wiki loves earth)\b", re.I)
TAXON = re.compile(r"^[A-Z][a-z]+ [a-z]{3,}( [a-z]+)?$")


def scenic(f):
    """0 when a photo found by location isn't one of the trail's surroundings, else its rank (1–2)."""
    cats = [c.strip() for c in (f.get("categories") or "").split("|") if c.strip()]
    text = " | ".join(cats) + " | " + f["title"].replace("_", " ")
    if NOT_LANDSCAPE.search(text) or any(TAXON.match(c) for c in cats) or not LANDSCAPE.search(text):
        return 0
    if SPHERE.search(text) or f["w"] == 2 * f["h"]:
        return 0  # a 360° sphere (Mapillary, equirectangular): bent out of shape in a frame
    return 2 if GOOD.search(text) else 1


def query(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    return get(url)


def strip(html):
    text = re.sub(r"<[^>]+>", "", html or "")
    return re.sub(r"\s+", " ", text).strip()


def record(page):
    """A file page with imageinfo as the step's file record."""
    ii = page["imageinfo"][0]
    m = ii.get("extmetadata", {})
    val = lambda k: strip(m.get(k, {}).get("value", ""))
    return {
        "title": page["title"], "w": ii["width"], "h": ii["height"], "mime": ii["mime"],
        "page": ii["descriptionurl"], "licence": val("LicenseShortName"), "licenceUrl": val("LicenseUrl"),
        "author": val("Artist"), "restrictions": val("Restrictions"), "name": val("ObjectName"),
        "lat": val("GPSLatitude"), "lon": val("GPSLongitude"), "categories": val("Categories"),
    }


def files_info(titles):
    """File records for the given file titles, 50 to a request."""
    files = []
    for i in range(0, len(titles), 50):
        r = query({"action": "query", "titles": "|".join(titles[i:i + 50]), "prop": "imageinfo",
                   "iiprop": "url|size|extmetadata|mime"}) or {}
        files += [record(page) for page in (r.get("query") or {}).get("pages", {}).values() if "imageinfo" in page]
        time.sleep(1)
    return files


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
            if "imageinfo" in page:
                files.append(record(page))
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
    name = re.sub(r"\s*-\s*(geograph\.org\.uk\s*-\s*\d+|panoramio(\s*\(\d+\))?)$", "", name, flags=re.I)  # copies from Geograph and Panoramio
    name = re.sub(r"\s+-\s+\w+ \d{1,2}, \d{4}$", "", name)  # " - August 8, 2016"
    name = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", name)
    name = re.sub(r"\s*\d{1,2}$", "", name).replace("_", " ").replace(" @ ", ", ")
    return name[:90]


def author(f):
    a = re.sub(r"\b(Own work|Eigenes Werk|Travail personnel)\b[.,;: ]*", "", f["author"]).strip(" ,;.")
    return re.sub(r"\s+from\s+.*$", "", a)[:60] or "unknown"


class Line:
    """The main route for "how far from the trail, and at which km": its points every 100 m in a grid
    of cells about 2 km square, so thousands of photo positions stay quick to place."""

    STEP_KM = 0.1

    def __init__(self, route):
        self.pts = []
        for (a, ka), (b, kb) in zip(route, route[1:]):
            n = max(1, math.ceil((kb - ka) / self.STEP_KM))
            self.pts += [((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n), ka + (kb - ka) * i / n) for i in range(n)]
        if route:
            self.pts.append(route[-1])
        self.total = route[-1][1] if route else 0
        lat0 = route[0][0][1] if route else 0
        self.dlat, self.dlon = 0.02, 0.02 / max(0.2, math.cos(math.radians(lat0)))
        self.grid = {}
        for pt in self.pts:
            self.grid.setdefault(self.cell(pt[0]), []).append(pt)

    def cell(self, pos):
        return (math.floor(pos[1] / self.dlat), math.floor(pos[0] / self.dlon))

    def nearest(self, pos):
        """(distance in km, km along the route) of the route's nearest point, or None beyond about 1 km."""
        cy, cx = self.cell(pos)
        near = [pt for dy in (-1, 0, 1) for dx in (-1, 0, 1) for pt in self.grid.get((cy + dy, cx + dx), [])]
        if not near:
            return None
        best = min(near, key=lambda r: km_between(r[0], pos))
        return km_between(best[0], pos), best[1]


def samples(route, step):
    """Points along the route `step` km apart, the end included."""
    out, due = [], 0.0
    for pt, km in route:
        if km >= due:
            out.append(pt)
            due = km + step
    if route and out[-1] != route[-1][0]:
        out.append(route[-1][0])
    return out


def nearby(slug, line, route):
    """Commons files photographed close to the trail: a geosearch round points every GEO_STEP_KM km,
    each GEO_RADIUS_M wide (the circles overlap, so a band of at least 800 m either side of the line is
    covered), kept when JPEG and within GEO_NEAR_KM of the line, then their metadata."""
    hits = {}
    for lon, lat in samples(route, GEO_STEP_KM):
        r = query({"action": "query", "list": "geosearch", "gscoord": f"{lat:.5f}|{lon:.5f}", "gsradius": GEO_RADIUS_M,
                   "gsnamespace": "6", "gslimit": "500"}) or {}
        for g in (r.get("query") or {}).get("geosearch", []):
            hits.setdefault(g["title"], (g["lon"], g["lat"]))
        time.sleep(1)
    titles = []
    for title, pos in hits.items():
        near = line.nearest(pos)
        if re.search(r"\.jpe?g$", title, re.I) and near and near[0] <= GEO_NEAR_KM:
            titles.append(title)
    files = files_info(sorted(titles))
    for f in files:
        if not (f["lat"] and f["lon"]):
            f["lon"], f["lat"] = (str(v) for v in hits[f["title"]])
    kept = [f for f in files if usable(f) and scenic(f)]
    print(f"{slug}: {len(hits)} files round the route in Commons, {len(titles)} JPEGs within {GEO_NEAR_KM * 1000:.0f} m, "
          f"{len(kept)} usable scenery")
    return kept  # only these are cached: all of them came to 3 MB for one trail


def place(f, line, limit):
    """km along the route of a file's position within `limit` km of the line; None without a position;
    False when it lies farther off."""
    if not (f["lat"] and f["lon"]) or not line.pts:
        return None
    try:
        near = line.nearest((float(f["lon"]), float(f["lat"])))
    except ValueError:
        return None
    return round(near[1], 1) if near and near[0] <= limit else False


def spread(cands, taken_km, room, total):
    """Up to `room` candidates spread along the route: each time one of those farthest from every photo
    taken (within a twentieth of the route of the farthest), the best ranked and then the largest among
    them; at most two by one author."""
    out, kms, by = [], list(taken_km), {}
    cands = list(cands)
    gap = lambda c: min((abs(c["km"] - k) for k in kms), default=total - abs(c["km"] - total / 2))
    while cands and len(out) < room:
        far = max(gap(c) for c in cands)
        best = max((c for c in cands if gap(c) >= far - total / 20), key=lambda c: (c.get("rank", 1), c["w"]))
        cands.remove(best)
        if by.get(best["author"], 0) >= 2:
            continue
        by[best["author"]] = by.get(best["author"], 0) + 1
        out.append(best)
        kms.append(best["km"])
    return out


def choose(slug, listing, p18, excluded, geo=()):
    """The trail's photos: the P18 photo, the category's (spread along the route), and where they leave
    room, photos taken close to the trail (`geo`, from nearby()), spread into the gaps."""
    route = route_points(slug)
    line = Line(route)
    main_titles = set(listing["main"])
    cands = {}
    for f in listing["files"]:
        if f["title"] in excluded or not usable(f):
            continue
        km = place(f, line, NEAR_KM)
        if km is False or (km is None and f["title"] not in main_titles):
            continue  # off the trail, or unplaced and not from the trail's own category
        cands[f["title"]] = {**f, "km": km, "found": "category"}
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
    if len(picked) < MAX:
        have = {c["title"] for c in picked} | set(cands)
        near = []
        for f in geo:
            if f["title"] in have or f["title"] in excluded or not usable(f):
                continue
            km = place(f, line, GEO_NEAR_KM)
            rank = scenic(f)
            if km not in (None, False) and rank:
                near.append({**f, "km": km, "found": "location", "rank": rank})
        picked += spread(near, [c["km"] for c in picked if c["km"] is not None], MAX - len(picked), line.total)
    # route order, the trail's own photo (P18) first
    order = lambda c: (c["km"] is None, c["km"] or 0)
    if picked and p18 and picked[0]["title"] == "File:" + p18:
        return picked[:1] + sorted(picked[1:], key=order)
    return sorted(picked, key=order)


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
            for f in files_info(["File:" + p18]):
                files.append(f)
                main.append(f["title"])
        return json.dumps({"wikidata": qid, "p18": p18, "category": cat, "files": files, "main": main}, ensure_ascii=False).encode()

    data, _ = cache.get("commons.json", f"{qid} P18 P373", download, key=qid or "none")
    listing = json.loads(data)
    geo = []
    route = route_points(slug)
    # Commons by location only where the trail's own photos leave room: a geosearch takes a request
    # every 2.5 km of trail
    if route and len(choose(slug, listing, listing.get("p18"), excluded)) < MAX:
        line = Line(route)
        geo_key = f"with categories, {line.total:.1f} km, every {GEO_STEP_KM} km, {GEO_RADIUS_M} m, within {GEO_NEAR_KM} km"
        body, _ = cache.get("commons-geo.json", "Commons geosearch along the route",
                            lambda: json.dumps({"files": nearby(slug, line, route)}, ensure_ascii=False).encode(), key=geo_key)
        geo = json.loads(body)["files"]
    picks = choose(slug, listing, listing.get("p18"), excluded, geo)
    # the same photos as last time, all still on disk: nothing to download
    if out.exists() and not refresh:
        before = json.loads(out.read_text())["photos"]
        if [p["page"] for p in before] == [f["page"] for f in picks] and all((ROOT / "public" / p["src"].lstrip("/")).exists() for p in before):
            for b, f in zip(before, picks):  # what the rules say of them now (how found, caption)
                b["found"], b["caption"] = f["found"], caption(f)
            data_out = json.loads(out.read_text())
            data_out["photos"] = before
            out.write_text(json.dumps(data_out, indent=1, ensure_ascii=False) + "\n")
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
            "page": f["page"], "km": f["km"], "found": f["found"],
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
          + (f", {sum(1 for p in photos if p['km'] is not None)} placed on the route, {sum(1 for p in photos if p['found'] == 'location')} found by location" if photos else ""))


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
