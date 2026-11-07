"""Suggest travel hubs for a trail's start, by the rules of 2026-11-07 (docs/scope.md), for a person
to review and paste into the record's `access` list.

    ~/.venvs/huckepack/bin/python -m pipeline.hubs <slug>             # print the suggestions as YAML
    ~/.venvs/huckepack/bin/python -m pipeline.hubs <slug> --json      # the same, with every candidate
    ~/.venvs/huckepack/bin/python -m pipeline.hubs <slug> --port "Bluff (to Oban)" -46.6011 168.3437 ferry
                                                                       # an island: mainland hubs sail from here

The rules:
- Airports: the nearest airport, by road, with year-round scheduled international passenger flights
  (English Wikipedia's "Airlines and destinations" tables; a destination is international when its
  country, from Wikidata, differs from the airport's; charters and flights that only begin later
  don't count), plus a second one when it is within 1.25 x + 20 km of the first. However far: no
  cap. Where an airport with only seasonal international flights is much nearer (the year-round
  one is beyond 1.25 x + 20 km of it), that one too, `flights: seasonal`. Domestic-only airports
  are not hubs.
- Stations: the nearest station served by long-distance trains (on at least two OpenStreetMap
  train route relations tagged service=long_distance, high_speed or night) and, when that one isn't
  in a city of 100,000 or more (GeoNames cities15000), the main station of the nearest such city;
  each within 300 km by road. Where OSM's tagging misses a service (Japan's limited expresses, New
  Zealand's scenic trains, VIA Rail's Corridor), EXTRA_STATIONS adds the station, with the
  operator's page. Without railways, the record keeps its hand-picked main bus station.
- An island: a hub whose road route crosses water goes to the mainland port (`via`), as
  pipeline/access.py measures it.

Downloads are cached in ~/.cache/huckepack/hubs/ (not the repo; HUCKEPACK_CACHE moves it): the
OurAirports and GeoNames files, the Wikipedia articles (fetched again when older than 30 days), the
Wikidata countries of their destinations, Overpass answers and OSRM routes (public demo server: at
most one request a second).
"""

import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import truststore
import yaml

# the operating system's certificate store, as pipeline/routes.py (never disable verification)
truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("HUCKEPACK_CACHE", Path.home() / ".cache" / "huckepack")) / "hubs"
USER_AGENT = "huckepack-pipeline/1.0 (https://huckepack.me; travel hub suggestions)"
OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"
GEONAMES = "https://download.geonames.org/export/dump/cities15000.zip"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
WIKIDATA = "https://query.wikidata.org/sparql"
OVERPASS = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
OSRM = "https://router.project-osrm.org/route/v1/driving"
FRESH_DAYS = 30

SECOND_FACTOR, SECOND_KM = 1.25, 20  # a second hub "about as near": within 1.25 x + 20 km
STATION_MAX_KM = 300  # stations further away by road aren't suggested (airports have no cap)
MIN_LD_RELATIONS = 2  # a long-distance station: on at least two such route relations
CITY_POP = 100_000

# Stations OSM's route relations miss (2026-11-07): name, coordinates (the OSM station node) and the
# operator's page that shows the long-distance service
EXTRA_STATIONS = [
    {"name": "Kii-Tanabe", "lat": 33.73288, "lon": 135.38454, "service": "JR West limited express Kuroshio (Kyoto/Shin-Osaka – Kii-Tanabe)",
     "url": "https://www.tb-kumano.jp/en/transport/train/"},
    {"name": "National Park (Waimarino)", "lat": -39.17583, "lon": 175.39321, "service": "Great Journeys NZ Northern Explorer (Auckland – Wellington)",
     "url": "https://www.greatjourneysnz.com/routes/northern-explorer/"},
    {"name": "Hamilton (Frankton)", "lat": -37.79092, "lon": 175.26523, "service": "Great Journeys NZ Northern Explorer (Auckland – Wellington)",
     "url": "https://www.greatjourneysnz.com/routes/northern-explorer/"},
    {"name": "Greymouth", "lat": -42.44829, "lon": 171.21459, "service": "Great Journeys NZ TranzAlpine (Christchurch – Greymouth)",
     "url": "https://www.greatjourneysnz.com/routes/tranzalpine/"},
    {"name": "Christchurch", "lat": -43.53992, "lon": 172.60791, "service": "Great Journeys NZ TranzAlpine and Coastal Pacific",
     "url": "https://www.greatjourneysnz.com/routes/tranzalpine/"},
    {"name": "Picton", "lat": -41.28837, "lon": 174.00486, "service": "Great Journeys NZ Coastal Pacific (Christchurch – Picton)",
     "url": "https://www.greatjourneysnz.com/routes/coastal-pacific/"},
    {"name": "Kingston station (VIA Rail)", "lat": 44.25723, "lon": -76.53679, "service": "VIA Rail Corridor (Toronto – Ottawa/Montréal)",
     "url": "https://www.viarail.ca/en/explore-our-destinations/stations/ontario/kingston"},
    {"name": "Ottawa station (VIA Rail)", "lat": 45.41647, "lon": -75.65173, "service": "VIA Rail Corridor (Toronto/Montréal – Ottawa)",
     "url": "https://www.viarail.ca/en/explore-our-destinations/stations/ontario/ottawa"},
    {"name": "Hong Kong West Kowloon", "lat": 22.30368, "lon": 114.16493, "service": "MTR High Speed Rail (Guangzhou–Shenzhen–Hong Kong Express Rail Link)",
     "url": "https://www.highspeed.mtr.com.hk/en/main/index.html"},
]

_last_request = [0.0]


# --- pure parts (tests/test_pipeline.py) -----------------------------------------------------------

def km_between(a_lat, a_lon, b_lat, b_lon):
    """Great-circle distance in km."""
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b_lon - a_lon) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def destinations_section(wikitext):
    """The passenger part of an airport article's "Airlines and destinations" section, or None."""
    m = re.search(r"^(=+)\s*Airlines and destinations\s*=+\s*$", wikitext, re.M)
    if not m:
        m = re.search(r"^(=+)\s*(Airlines|Destinations|Airline and destinations)\s*=+\s*$", wikitext, re.M | re.I)
        if not m:
            return None
    rest = wikitext[m.end():]
    end = re.search(r"^={1,%d}[^=].*?=+\s*$" % len(m.group(1)), rest, re.M)
    section = rest[: end.start()] if end else rest
    cargo = re.search(r"^=+\s*Cargo.*$", section, re.M | re.I)
    return section[: cargo.start()] if cargo else section


LINK = re.compile(r"\[\[([^\]\|]+)(?:\|([^\]]*))?\]\]")
# a label switching what follows: '''Seasonal:''', Seasonal charter:, Charter:, '''Year-round:'''
LABEL = re.compile(r"('''[^']+?'''|(?<![\w\[])(?:Seasonal(?:\s+charter)?|Charter|Year[- ]round|Summer|Winter)\s*:)", re.I)


def _mode(label):
    w = label.strip("'").strip().lower()
    if "charter" in w:
        return "charter"
    if any(k in w for k in ("seasonal", "summer", "winter")):
        return "seasonal"
    if "year" in w or "regular" in w:
        return "year"
    return None


def destination_cell(cell):
    """Destinations in one table cell: [{"dest": title, "mode": year/seasonal/charter, "status":
    ok/begins/resumes/ends}], the mode set by the last label before it."""
    out, mode = [], "year"
    for token in LABEL.split(cell):
        if LABEL.fullmatch(token or ""):
            m = _mode(token)
            if m:
                mode = m
                continue
        for link in LINK.finditer(token):
            target = link.group(1).strip()
            if target.lower().startswith(("file:", "image:", "category:")):
                continue
            after = token[link.end(): link.end() + 60].split(",")[0].split("[[")[0].lower()
            status = ("begins" if re.search(r"begins|commences|starts", after) else
                      "resumes" if "resumes" in after else "ends" if "ends" in after else "ok")
            out.append({"dest": target, "mode": mode, "status": status})
    return out


def route_table(wikitext):
    """The passenger routes of an airport article: [{"airline", "dest", "mode", "status"}]."""
    section = destinations_section(wikitext)
    if section is None:
        return []
    s = re.sub(r"<!--.*?-->", "", section, flags=re.S)
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    # keep the pipes inside links and nested templates out of the table's cells
    s = LINK.sub(lambda m: "[[" + m.group(1) + ("¦" + m.group(2) if m.group(2) else "") + "]]", s)
    for _ in range(3):
        s = re.sub(r"\{\{(?!Airport[ -]dest)([^{}]*)\}\}", lambda m: "⟪" + m.group(1).replace("|", "¦") + "⟫", s, flags=re.I)
    pairs = []
    for m in re.finditer(r"\{\{\s*Airport[ -]dest(?:ination)?[ -]list(.*?)\}\}", s, re.S | re.I):
        # by position: an empty cell (a row without references) still counts
        cells = [c.strip() for c in m.group(1).split("|")][1:]
        stride = 3 if any(re.match(r"3rdcol", c) for c in cells) else 2
        cells = [c for c in cells if not re.match(r"^\w+\s*=", c)]
        pairs += [(cells[i], cells[i + 1]) for i in range(0, len(cells) - 1, stride)]
    if not pairs and "wikitable" in s:
        for table in re.finditer(r"\{\|(.*?)\n\|\}", s, re.S):
            for row in table.group(1).split("\n|-")[1:]:
                cells = [c.strip() for c in re.split(r"\n\||\|\|", row) if c.strip() and not c.strip().startswith("!")]
                cells = [re.sub(r"^\s*(style|rowspan|colspan|align)=[^|]*\|", "", c) for c in cells]
                if len(cells) >= 2:
                    pairs.append((cells[0], cells[1]))
    routes = []
    for airline, dests in pairs:
        airline, dests = airline.replace("¦", "|"), dests.replace("¦", "|")
        for word in ("begins", "resumes", "ends"):
            dests = re.sub(r"⟪[^⟫]*?%s[^⟫]*⟫" % word, " (%s)" % word, dests, flags=re.I)
        dests = re.sub(r"⟪[^⟫]*⟫", "", dests)
        name = LINK.search(airline)
        airline = name.group(1) if name else re.sub(r"⟪.*?⟫", "", airline).strip()
        routes += [{"airline": airline, **d} for d in destination_cell(dests)]
    return routes


def classify(routes, home, countries):
    """'year-round' when any international route runs all year, 'seasonal' when international routes
    run only in a season (or resume after a break), else None (domestic only, charters, or routes that
    only begin later). `countries(title)` gives a destination's ISO countries ([] when unknown)."""
    year, seasonal = set(), set()
    for r in routes:
        iso = countries(r["dest"])
        if not iso or home in iso or r["status"] == "begins" or r["mode"] == "charter":
            continue
        (seasonal if r["mode"] == "seasonal" or r["status"] == "resumes" else year).add(r["dest"])
    return "year-round" if year else "seasonal" if seasonal else None


def near_enough(km, first_km):
    """A second hub counts when it is about as near as the first: within 1.25 x + 20 km."""
    return km <= first_km * SECOND_FACTOR + SECOND_KM


def pick_airports(candidates):
    """From candidates [{"flights": year-round/seasonal, "km": by road (total, ferries included),
    "ferry": crosses water where the start isn't on an island, ...}]: the nearest year-round one, a
    second one about as near, and the nearest seasonal-only one when the first year-round one is
    not about as near as it. Ordered by distance."""
    def key(c):
        return (c["ferry"], c["km"])
    year = sorted((c for c in candidates if c["flights"] == "year-round" and c["km"] is not None), key=key)
    picks = []
    if year:
        picks.append(year[0])
        if len(year) > 1 and year[1]["ferry"] == year[0]["ferry"] and near_enough(year[1]["km"], year[0]["km"]):
            picks.append(year[1])
    seasonal = sorted((c for c in candidates if c["flights"] == "seasonal" and c["km"] is not None), key=key)
    if seasonal and (not year or not near_enough(year[0]["km"], seasonal[0]["km"])):
        picks.append(seasonal[0])
    return sorted(picks, key=lambda c: c["km"])


# --- cached downloads ------------------------------------------------------------------------------

def _get(url, data=None, headers=None, polite=1.0, timeout=180, tries=4):
    wait = polite - (time.time() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(tries):
        _last_request[0] = time.time()
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # busy servers answer 429/504 now and then
            if attempt == tries - 1 or (isinstance(e, urllib.error.HTTPError) and e.code == 400):
                raise
            print(f"  retry {url[:60]}…: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))


def _stale(path, days=FRESH_DAYS):
    return not path.exists() or datetime.now().timestamp() - path.stat().st_mtime > days * 86400


def _json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(path)


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def airports():
    """OurAirports' airports with scheduled service and an IATA code (public domain)."""
    path = CACHE / "airports.csv"
    if _stale(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_get(OURAIRPORTS))
    rows = csv.DictReader(io.StringIO(path.read_text(encoding="utf-8")))
    return [
        {"iata": r["iata_code"], "name": r["name"], "type": r["type"], "country": r["iso_country"],
         "lat": float(r["latitude_deg"]), "lon": float(r["longitude_deg"]), "wikipedia": r["wikipedia_link"]}
        for r in rows
        if r["iata_code"] and r["scheduled_service"] == "yes" and r["type"] in ("large_airport", "medium_airport", "small_airport")
    ]


def cities():
    """GeoNames' cities of 15,000 or more (CC BY 4.0): name, coordinates, population."""
    path = CACHE / "cities15000.txt"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(_get(GEONAMES))) as z:
            path.write_bytes(z.read("cities15000.txt"))
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        f = line.split("\t")
        if f[7] in ("PPLX", "PPLH", "PPLQ", "PPLW"):  # parts of cities, historical, abandoned
            continue
        out.append({"name": f[1], "lat": float(f[4]), "lon": float(f[5]), "pop": int(f[14] or 0), "id": f[0]})
    return out


def article_for(airport):
    """The English Wikipedia article of an airport: OurAirports' link, else Wikidata's (IATA, P238)."""
    path = CACHE / "articles.json"
    known = _json(path, {})
    if airport["iata"] in known:
        return known[airport["iata"]]
    title = None
    if "en.wikipedia.org/wiki/" in airport["wikipedia"]:
        title = urllib.parse.unquote(airport["wikipedia"].split("/wiki/")[1]).replace("_", " ")
    else:
        q = ('SELECT ?article WHERE { ?a wdt:P238 "%s" . ?article schema:about ?a ; '
             'schema:isPartOf <https://en.wikipedia.org/> . }' % airport["iata"])
        body = _get(WIKIDATA + "?" + urllib.parse.urlencode({"query": q}), headers={"Accept": "application/sparql-results+json"})
        found = {urllib.parse.unquote(b["article"]["value"].split("/wiki/")[1]).replace("_", " ")
                 for b in json.loads(body)["results"]["bindings"]}
        title = found.pop() if len(found) == 1 else None
    known[airport["iata"]] = title
    _write(path, known)
    return title


def wikitext(title, refresh=False):
    """An article's wikitext (CC BY-SA 4.0), cached and fetched again when older than 30 days."""
    path = CACHE / "wikipedia" / (re.sub(r"[^\w.-]+", "_", title)[:150] + ".json")
    page = _json(path, None)
    stale = page is None or refresh or (datetime.now(timezone.utc).date() - datetime.fromisoformat(page["retrieved"]).date()).days > FRESH_DAYS
    if stale:
        q = {"action": "query", "prop": "revisions", "rvprop": "content|timestamp", "rvslots": "main",
             "titles": title, "redirects": 1, "format": "json", "formatversion": 2}
        d = json.loads(_get(WIKIPEDIA + "?" + urllib.parse.urlencode(q)))
        p = d["query"]["pages"][0]
        rev = (p.get("revisions") or [{}])[0]
        page = {"title": p.get("title", title), "revision": rev.get("timestamp"), "retrieved": _today(),
                "text": rev.get("slots", {}).get("main", {}).get("content", "")}
        _write(path, page)
    return page


def countries_of(titles):
    """Wikidata's countries (ISO 3166 alpha-2, P17 → P297) of Wikipedia titles: {title: [iso]}."""
    qpath, cpath = CACHE / "wikidata-items.json", CACHE / "wikidata-countries.json"
    items, iso = _json(qpath, {}), _json(cpath, {})
    todo = sorted({t for t in titles if t not in items})
    for k in range(0, len(todo), 50):
        chunk = todo[k:k + 50]
        q = {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item", "titles": "|".join(chunk),
             "redirects": 1, "format": "json", "formatversion": 2}
        d = json.loads(_get(WIKIPEDIA + "?" + urllib.parse.urlencode(q)))["query"]
        norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
        red = {r["from"]: r["to"] for r in d.get("redirects", [])}
        pages = {p["title"]: p.get("pageprops", {}).get("wikibase_item") for p in d["pages"]}
        for t in chunk:
            x = norm.get(t, t)
            items[t] = pages.get(red.get(x, x))
    if todo:
        _write(qpath, items)
    need = sorted({items[t] for t in titles if items.get(t) and items[t] not in iso})
    for k in range(0, len(need), 300):
        chunk = need[k:k + 300]
        q = "SELECT ?i ?iso WHERE { VALUES ?i { %s } ?i wdt:P17 ?c . ?c wdt:P297 ?iso }" % " ".join("wd:" + x for x in chunk)
        d = json.loads(_get(WIKIDATA, data=urllib.parse.urlencode({"query": q}).encode(),
                            headers={"Accept": "application/sparql-results+json"}))
        for x in chunk:
            iso.setdefault(x, [])
        for b in d["results"]["bindings"]:
            x, c = b["i"]["value"].rsplit("/", 1)[1], b["iso"]["value"]
            if c not in iso[x]:
                iso[x].append(c)
    if need:
        _write(cpath, iso)
    return {t: iso.get(items.get(t) or "", []) for t in titles}


def airport_flights(airport, refresh=False):
    """(flights, article, revision): year-round/seasonal/None from the airport's Wikipedia routes."""
    title = article_for(airport)
    if not title:
        return None, None, None
    page = wikitext(title, refresh)
    routes = route_table(page["text"])
    iso = countries_of([r["dest"].split("#")[0].strip() for r in routes])
    flights = classify(routes, airport["country"], lambda t: iso.get(t.split("#")[0].strip(), []))
    return flights, page["title"], page["revision"]


def route(a, b, ferry_ok=True):
    """OSRM's road route from a to b (lat, lon): km, minutes, km on ferries, snap distances (m)."""
    path = CACHE / "osrm.json"
    cache = _json(path, {})
    key = "%.5f,%.5f;%.5f,%.5f" % (a[1], a[0], b[1], b[0])
    if key not in cache:
        try:
            d = json.loads(_get(f"{OSRM}/{key}?overview=false&steps=true", polite=1.1))
        except urllib.error.HTTPError as e:  # 400 with a body: no route between the two (NoRoute, NoSegment)
            if e.code != 400:
                raise
            d = json.loads(e.read() or b"{}") or {"code": "NoRoute"}
        if d.get("code") != "Ok":
            cache[key] = {"code": d.get("code")}
        else:
            r = d["routes"][0]
            ferry = sum(s["distance"] for leg in r["legs"] for s in leg["steps"] if s.get("mode") == "ferry")
            cache[key] = {"code": "Ok", "km": round(r["distance"] / 1000, 1), "min": round(r["duration"] / 60),
                          "ferryKm": round(ferry / 1000, 1), "snap": [round(w.get("distance", 0)) for w in d["waypoints"]]}
        cache = {**_json(path, {}), key: cache[key]}
        _write(path, cache)
    return cache[key]


def overpass(query, name):
    path = CACHE / "overpass" / f"{name}.json"
    if not path.exists():
        body = _get(OVERPASS, data=urllib.parse.urlencode({"data": query}).encode(), polite=2, timeout=900)
        d = json.loads(body)
        if "runtime error" in d.get("remark", "") or "timed out" in d.get("remark", ""):
            raise SystemExit(f"Overpass: {d['remark']}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return json.loads(path.read_text())


def _norm_station(name):
    name = re.sub(r"\s+", " ", name.strip())
    return re.sub(r"\s*(\(.*?\)|Gleis.*|Bahnsteig.*|Platform.*|[Vv]oie.*|Binario.*)$", "", name).strip()


def train_stations(lat, lon, reach_km=STATION_MAX_KM):
    """Stops on OSM's long-distance train route relations (ODbL) within reach of a point: name,
    coordinates (median of the stop nodes), number of relations. Answers for a box are cached and
    reused for any point whose reach they cover."""
    dlat = reach_km / 111 * 0.85  # a road distance is rarely under 1.2 times the straight line
    dlon = dlat / max(math.cos(math.radians(lat)), 0.2)
    index_path = CACHE / "overpass" / "trains-index.json"
    index = _json(index_path, {})

    def inside(b, y, x):
        return b[0] <= y <= b[2] and b[1] <= x <= b[3]

    # the reach is covered when most points of a 7 x 7 grid over it lie in some cached box
    # (the parts left out are mostly sea, or abroad where boxes were drawn round the trails)
    grid = [(lat + dlat * (i / 3 - 1), lon + dlon * (j / 3 - 1)) for i in range(7) for j in range(7)]
    used = {n for n, b in index.items() if any(inside(b, y, x) for y, x in grid)}
    if sum(any(inside(index[n], y, x) for n in used) for y, x in grid) < 0.5 * len(grid):
        s, w, n, e = (round(lat - dlat - 0.5, 1), round(lon - dlon - 0.5, 1), round(lat + dlat + 0.5, 1), round(lon + dlon + 0.5, 1))
        box = f"trains_{s}_{w}_{n}_{e}"
        q = (f'[out:json][timeout:800][maxsize:1073741824];rel({s},{w},{n},{e})[route=train]'
             f'[service~"^(long_distance|high_speed|night)$"]->.r;foreach.r->.x(.x out tags;'
             f'(node(r.x:"stop");node(r.x:"stop_exit_only");node(r.x:"stop_entry_only"););out ids;);'
             f'(node(r.r:"stop");node(r.r:"stop_exit_only");node(r.r:"stop_entry_only"););out qt;')
        overpass(q, box)
        index = {**_json(index_path, {}), box: [s, w, n, e]}
        _write(index_path, index)
        used = {box}
    elements = [el for name in sorted(used) for el in overpass("", name)["elements"]]
    rels, members, nodes, current = {}, {}, {}, None
    for el in elements:
        if el["type"] == "relation":
            current = el["id"]
            rels[current] = el.get("tags", {})
            members.setdefault(current, set())
        elif el["type"] == "node" and "lat" not in el and current:
            members[current].add(el["id"])
        elif el["type"] == "node" and "lat" in el:
            nodes[el["id"]] = el
    stations, by_name = [], {}
    for rid, ids in members.items():
        for nid in ids:
            n = nodes.get(nid)
            if not n:
                continue
            name = _norm_station(n.get("tags", {}).get("name", "") or "?")
            hit = next((s for s in by_name.get(name, []) if km_between(s["lat"], s["lon"], n["lat"], n["lon"]) < 3), None)
            if not hit:
                hit = {"name": name, "lat": n["lat"], "lon": n["lon"], "rels": set(), "pts": []}
                by_name.setdefault(name, []).append(hit)
                stations.append(hit)
            hit["rels"].add(rid)
            hit["pts"].append((n["lat"], n["lon"]))
    out = []
    for s in stations:
        lats, lons = sorted(p[0] for p in s["pts"]), sorted(p[1] for p in s["pts"])
        out.append({"name": s["name"], "lat": lats[len(lats) // 2], "lon": lons[len(lons) // 2], "relations": len(s["rels"])})
    return out


def city_of(lat, lon, towns, max_km=8):
    """The nearest town of 50,000 or more within 8 km of a point, if it has 100,000 or more."""
    best = None
    for c in towns:
        if c["pop"] < 50_000 or abs(c["lat"] - lat) > 0.25 or abs(c["lon"] - lon) > 0.5:
            continue
        d = km_between(lat, lon, c["lat"], c["lon"])
        if d <= max_km and (best is None or d < best[0]):
            best = (d, c)
    return best[1] if best and best[1]["pop"] >= CITY_POP else None


def osm_objects(hubs, slug):
    """The OSM station nodes and airport objects of the suggested hubs: their names and coordinates."""
    parts = []
    for h in hubs:
        if h["kind"] == "airport":
            parts.append(f'nwr(around:15000,{h["lat"]},{h["lon"]})[aeroway=aerodrome][iata="{h["iata"]}"];')
        else:
            parts.append(f'nwr(around:1200,{h["lat"]},{h["lon"]})[railway~"^(station|halt)$"];')
    if not parts:
        return []
    query = "[out:json][timeout:120];(" + "".join(parts) + ");out center tags;"
    d = overpass(query, f"objects_{slug}_{hashlib.sha1(query.encode()).hexdigest()[:10]}")
    return d["elements"]


def _match_osm(hub, elements):
    def where(e):
        return (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
    if hub["kind"] == "airport":
        found = [e for e in elements if e.get("tags", {}).get("iata") == hub["iata"]]
    else:
        words = set(re.findall(r"\w{4,}", hub["name"].lower()))
        found = [e for e in elements if e.get("tags", {}).get("railway") in ("station", "halt")
                 and km_between(hub["lat"], hub["lon"], *where(e)) < 1.2]
        found.sort(key=lambda e: (not words & set(re.findall(r"\w{4,}", (e["tags"].get("name", "") + " " + e["tags"].get("name:en", "")).lower())),
                                  e["tags"].get("railway") != "station", km_between(hub["lat"], hub["lon"], *where(e))))
    if not found:
        return None
    e = found[0]
    lat, lon = where(e)
    return {"osm": f'{e["type"]}/{e["id"]}', "lat": round(lat, 5), "lon": round(lon, 5),
            "osmName": e["tags"].get("name:en") or e["tags"].get("name")}


# --- suggestions -----------------------------------------------------------------------------------

def _road(hub, start, ports, island):
    """Road km from a hub to the start, or to the nearest mainland port when the route crosses water."""
    r = route((hub["lat"], hub["lon"]), (start["lat"], start["lon"]))
    # a start off the road (the Great Divide Trail's at the border) snaps to the nearest road up to
    # 20 km away; on an island only 5 km, or the router snaps it to the mainland shore
    ok = r.get("code") == "Ok" and max(r.get("snap", [0])) < (5000 if ports else 20000)
    total = r["km"] if ok else None
    out = {"km": total, "totalKm": total, "min": r.get("min") if ok else None, "ferry": False, "via": None}
    crosses = ok and (r.get("ferryKm") or 0) > 0  # Bute's Colintraive crossing is 0.4 km
    if ports and (crosses or not ok):
        # the port nearest by road
        by_road = [(route((hub["lat"], hub["lon"]), (p["lat"], p["lon"])), p) for p in ports]
        by_road = [(r_, p) for r_, p in by_road if r_.get("code") == "Ok" and not r_.get("ferryKm")]
        if by_road:
            rp, port = min(by_road, key=lambda x: x[0]["km"])
            out.update(km=rp["km"], min=rp["min"], via=port)
            # compare hubs by the whole way, ferries included; a route that failed counts the straight line
            out["totalKm"] = total if total is not None else round(rp["km"] + km_between(port["lat"], port["lon"], start["lat"], start["lon"]), 1)
    elif crosses and not island:
        out["ferry"] = True
    return out


def suggest_airports(start, ports=(), island=False, refresh=False):
    near = sorted(((km_between(start["lat"], start["lon"], a["lat"], a["lon"]), a) for a in airports()), key=lambda x: x[0])
    seen, year_d = [], None
    for d, a in near:
        if d > 2500 or (year_d is not None and d > 2 * year_d + 50):
            break
        if a["type"] == "small_airport" and d > 300:
            continue
        flights, article, revision = airport_flights(a, refresh)
        if flights:
            seen.append({**a, "straightKm": round(d, 1), "flights": flights, "article": article, "revision": revision})
            if flights == "year-round" and year_d is None:
                year_d = d
        if sum(1 for s in seen if s["flights"] == "year-round") >= 4:
            break
    cands = []
    for a in seen:
        if a["flights"] == "seasonal" and year_d is not None and a["straightKm"] > year_d:
            continue  # a seasonal airport further than a year-round one is never listed
        road = _road(a, start, ports, island)
        cands.append({**a, **road, "km": road["totalKm"], "roadKm": road["km"]})
    return pick_airports(cands), cands


def suggest_stations(start, ports=(), island=False):
    lds = train_stations(start["lat"], start["lon"])
    towns = cities()
    for s in lds:
        c = city_of(s["lat"], s["lon"], towns)
        s["city"] = c and c["name"]
        s["cityId"] = c and c["id"]
        s["cityKm"] = c and km_between(s["lat"], s["lon"], c["lat"], c["lon"])
        s["straightKm"] = round(km_between(start["lat"], start["lon"], s["lat"], s["lon"]), 1)
    extra = [{**x, "relations": None, "city": None, "extra": True,
              "straightKm": round(km_between(start["lat"], start["lon"], x["lat"], x["lon"]), 1)} for x in EXTRA_STATIONS]
    # an island's stations are near its ports, not its start: order them by the nearer of the two
    for x in lds + extra:
        x["nearKm"] = min([x["straightKm"]] + [km_between(p["lat"], p["lon"], x["lat"], x["lon"]) for p in ports])
    for x in extra:
        c = city_of(x["lat"], x["lon"], towns)
        x["city"], x["cityId"] = c and c["name"], c and c["id"]

    def nearest(group, n=6 if ports else 3):  # across water the straight line says less
        group = sorted(group, key=lambda s: s["nearKm"])
        if not group or group[0]["nearKm"] > STATION_MAX_KM:
            return None
        lim = group[0]["nearKm"] * 1.6 + 30
        best = None
        for s in [g for g in group if g["nearKm"] <= lim][:n]:
            road = _road(s, start, ports, island)
            if road["km"] is None:
                continue
            k = (road["ferry"], road["km"])  # to the start, or to the island's port: the crossing is the same
            if best is None or k < best[0]:
                best = (k, {**s, **road, "roadKm": road["km"]})
        return best[1] if best and best[1]["roadKm"] <= STATION_MAX_KM else None

    first = nearest([s for s in lds if s["relations"] >= MIN_LD_RELATIONS] + extra)
    picks = [first] if first else []
    if not (first and first.get("city")):
        main = {}
        for s in lds + extra:
            if not s.get("cityId"):
                continue
            b = main.get(s["cityId"])
            if b is None or ((s["relations"] or 99), -(s.get("cityKm") or 0)) > ((b["relations"] or 99), -(b.get("cityKm") or 0)):
                main[s["cityId"]] = s
        second = nearest(list(main.values()))
        if second and not (first and km_between(first["lat"], first["lon"], second["lat"], second["lon"]) < 2):
            picks.append(second)
    return picks


def suggest(slug, ports=(), refresh=False, lookup=True):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    start = trail["termini"]["start"]
    island = bool(ports)
    stations = suggest_stations(start, ports, island)
    picked, cands = suggest_airports(start, ports, island, refresh)
    hubs = [{"kind": "station", **s} for s in stations] + [{"kind": "airport", **a} for a in picked]
    elements = osm_objects(hubs, slug) if lookup else []
    for h in hubs:
        h["osmMatch"] = _match_osm(h, elements) if lookup else None
    current = trail.get("access") or []
    return {"slug": slug, "start": start, "hubs": hubs, "airportCandidates": cands, "current": current}


def as_record(h):
    """A hub as the record's `access` entry."""
    m = h.get("osmMatch") or {}
    if h["kind"] == "airport":
        name = re.sub(r"\s*\(.*?\)$", "", h["article"] or h["name"]) + f' ({h["iata"]})'
    else:
        name = h["name"] if h.get("extra") else (m.get("osmName") or h["name"])
    entry = {"kind": h["kind"], "name": name, "lat": m.get("lat", round(h["lat"], 5)), "lon": m.get("lon", round(h["lon"], 5))}
    if h["kind"] == "airport" and h["flights"] == "seasonal":
        entry["flights"] = "seasonal"
    if h.get("via"):
        entry["via"] = {"name": h["via"]["name"], "lat": h["via"]["lat"], "lon": h["via"]["lon"], "by": h["via"].get("by", "ferry")}
    entry["source"] = "osm"
    return entry


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    slug, ports = args[0], []
    if "--port" in argv:
        i = argv.index("--port")
        ports.append({"name": argv[i + 1], "lat": float(argv[i + 2]), "lon": float(argv[i + 3]),
                      "by": argv[i + 4] if len(argv) > i + 4 and not argv[i + 4].startswith("--") else "ferry"})
    s = suggest(slug, ports, refresh="--refresh" in argv)
    if "--json" in argv:
        print(json.dumps(s, indent=1, ensure_ascii=False, default=str))
        return
    print(f"# {slug}: suggested by pipeline.hubs ({_today()}); review before pasting into `access`")
    for h in s["hubs"]:
        why = (f'{h["flights"]} international flights (Wikipedia: {h["article"]}, revision {h["revision"]})'
               if h["kind"] == "airport" else
               f'{h.get("service") or str(h["relations"]) + " long-distance OSM route relations"}{", " + h["city"] if h.get("city") else ""}')
        print(f'# {h["kind"]}: {h["roadKm"]} km by road{" to " + h["via"]["name"] if h.get("via") else ""}; {why}'
              f'{"; OSM " + h["osmMatch"]["osm"] if h.get("osmMatch") else "; no OSM object matched: check the coordinates"}')
    print(yaml.safe_dump({"access": [as_record(h) for h in s["hubs"]]}, sort_keys=False, allow_unicode=True))


if __name__ == "__main__":
    main(sys.argv[1:])
