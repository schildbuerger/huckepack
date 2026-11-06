"""A quick look for blockers before a trail is built (docs/trail-building.md, step 2), in seconds
rather than a full pipeline run (the Bruce Trail's and the Caminho de Cora Coralina's blockers
showed only after one, 2026-11-06).

    ~/.venvs/huckepack/bin/python -m pipeline.preflight <slug>                      # a record's links and relations
    ~/.venvs/huckepack/bin/python -m pipeline.preflight --url <page> --relation <id> # before there is a record

Checks every link the pipeline and the page rely on (the website, the sources, the stage tracks,
the official GPX page) for what docs/trail-building.md counts as a blocker: a bot check
(Cloudflare, Anubis, a captcha), a login or refusal (401, 403, 429), a certificate that fails;
never worked around, the certificate check never weakened. And each OSM relation the route
follows (route.relation, the stages' own), read from the OSM API with its child relations:
whether its ways chain into one line as pipeline/routes.py chains them (gaps between ways, ways
left over) and how long that line is against the stated length. Prints what it finds and exits
1 when anything blocks. It changes nothing.
"""

import io
import json
import math
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path

import truststore
import yaml

from pipeline import osm
from pipeline.freshness import _failure, _iri
from pipeline.routes import MAIN_ROLES, line_km, relation_line, stage_relations

truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
USER_AGENT = "huckepack-pipeline/1.0 (https://huckepack.me; personal project)"
OSM_API = "https://api.openstreetmap.org/api/0.6"
# a bot check's page: its title (Cloudflare's interstitial, Anubis, a captcha page) or the challenge's
# own script; a page that only mentions a captcha somewhere (Wikipedia, GitHub) is no bot check
BOT_TITLE = re.compile(r"<title>[^<]*(Just a moment|Attention Required|Making sure you.re not a bot|captcha|DDoS|Access denied)[^<]*</title>", re.I)
# Cloudflare's challenge itself ("/cdn-cgi/challenge-platform/h/…/orchestrate", cf-chl-), not its
# passive "jsd" script, which sits on every page of a site behind Cloudflare (tahoerimtrail.org)
BOT_SCRIPT = re.compile(r"/cdn-cgi/challenge-platform/h/|cf-chl-|within\.website/x/cmd/anubis|anubis_challenge", re.I)


def bot_check(page):
    m = BOT_TITLE.search(page) or BOT_SCRIPT.search(page)
    return m.group(1) if m and m.lastindex else (m.group(0) if m else None)
GAP_M = 100  # a jump between relation ways the matcher would have to bridge (MAX_BRIDGE_M)
CHAINED_MIN = 0.95  # less of the relation's length in one line: OSM is in pieces there


def probe(url):
    """(ok, what): one GET with redirects followed, looking at the status and the first 200 KB."""
    request = urllib.request.Request(_iri(url), headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"})
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            head = r.read(200_000).decode("utf-8", "ignore")
            if bot_check(head):
                return False, f"a bot check on the page ({bot_check(head)})"
            if re.search(r"<input[^>]+type=.password", head, re.I) and not re.search(r"<gpx|<kml", head, re.I):
                return False, "a login form"
            return True, f"{r.status}" + (f", now {r.url}" if r.url.rstrip("/") != url.rstrip("/") else "")
    except urllib.error.HTTPError as error:
        body = error.read(200_000).decode("utf-8", "ignore") if error.fp else ""
        if error.headers.get("cf-mitigated") or bot_check(body):
            return False, f"{error.code}, a bot check"
        if error.code in (401, 403, 429):
            return False, f"{error.code}, refused (no workaround: record it on the issue)"
        return False, f"{error.code}"
    except Exception as error:  # DNS, TLS, timeouts
        kind, why = _failure(error)
        return False, why


def _get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as r:
        return json.loads(r.read())


def relation_elements(rid, seen=None):
    """A relation and its child relations from the OSM API, in the Overpass shape the pipeline's
    relation_line() reads: relations with members, ways with their geometry."""
    seen = seen if seen is not None else set()
    if rid in seen:
        return []
    seen.add(rid)
    data = _get_json(f"{OSM_API}/relation/{rid}/full.json")["elements"]
    nodes = {e["id"]: e for e in data if e["type"] == "node"}
    out = []
    for e in data:
        if e["type"] == "way":
            out.append({"type": "way", "id": e["id"], "geometry": [{"lat": nodes[n]["lat"], "lon": nodes[n]["lon"]} for n in e["nodes"] if n in nodes]})
        elif e["type"] == "relation":
            out.append({"type": "relation", "id": e["id"], "tags": e.get("tags", {}), "members": e["members"]})
            if e["id"] == rid:
                for m in e["members"]:
                    if m["type"] == "relation":
                        out += relation_elements(m["ref"], seen)
    return out


def check_relation(rids, start=None, stated_km=None):
    """(ok, lines): whether the relations' ways chain into one line from `start` (lon, lat; else
    from an open end), with the gaps on the way and what is left over."""
    elements = []
    for rid in rids:
        elements += relation_elements(rid)
    rels = [e for e in elements if e["type"] == "relation"]
    ways = {e["id"]: e for e in elements if e["type"] == "way"}
    main = [ways[m["ref"]]["geometry"] for r in rels for m in r["members"] if m["type"] == "way" and m["ref"] in ways and m.get("role", "") in MAIN_ROLES]
    if not main:
        return False, [f"relation {', '.join(map(str, rids))}: no ways without a role (only alternatives or excursions?)"]
    total = sum(line_km([(p["lon"], p["lat"]) for p in g]) for g in main)
    if start is None:
        start = (main[0][0]["lon"], main[0][0]["lat"])
    log = io.StringIO()
    with redirect_stdout(log):
        line = relation_line({"elements": elements}, set(), start, from_open_end=True)
    chained = line_km([(p["lon"], p["lat"]) for p in line]) if line and isinstance(line[0], dict) else line_km(line)
    name = rels[0].get("tags", {}).get("name", "")
    lines = [f"relation {', '.join(map(str, rids))} {name}: {len(main)} ways, {total:.1f} km; one line from the start {chained:.1f} km ({chained / total:.0%})"]
    gaps = [int(g) for g in re.findall(r"\d+", (re.search(r"gaps of \[([^\]]*)\]", log.getvalue()) or [None, ""])[1])]
    big = [g for g in gaps if g > GAP_M]
    if big:
        lines.append(f"  gaps over {GAP_M} m between its ways: {big} (the matcher bridges up to 100 m; longer ones need a stage's maxBridgeM, joinM or via points)")
    left = re.search(r"\d+ ways \([\d.]+ km\) left out", log.getvalue())
    if left:
        lines.append(f"  {left.group(0)}: they don't continue the line")
    ok = chained / total >= CHAINED_MIN and not big
    if stated_km:
        off = abs(chained - stated_km) / stated_km
        lines.append(f"  against the stated {stated_km} km: {off:.0%} apart" + (" (more than 10 %)" if off > 0.10 else ""))
        ok = ok and off <= 0.10
    return ok, lines


def record_targets(slug):
    trail = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    urls = []
    if trail.get("website"):
        urls.append(("website", trail["website"]))
    for s in trail.get("sources") or []:
        if s.get("url"):
            urls.append((f"source {s.get('id')}", s["url"]))
    gpx = trail.get("officialGpx") or {}
    if isinstance(gpx, dict) and gpx.get("url"):
        urls.append(("official GPX page", gpx["url"]))
    tracks = {(trail.get("route") or {}).get("track")} | {s.get("track") for s in osm.stage_list(trail)}
    urls += [("track", t) for t in sorted(t for t in tracks if t)]
    seen, unique = set(), []
    for what, u in urls:
        if u not in seen:
            seen.add(u)
            unique.append((what, u))
    route = trail.get("route") or {}
    rel = route.get("relation")
    relations = [rel if isinstance(rel, list) else [rel]] if rel else []
    stage_rels = [stage_relations(s) for s in osm.stage_list(trail) if s.get("relation")]
    if stage_rels and not rel:
        relations.append(sorted({r for rs in stage_rels for r in rs}))
    start = None
    t = trail.get("termini") or {}
    if (t.get("start") or {}).get("lon") is not None:
        start = (t["start"]["lon"], t["start"]["lat"])
    stated = (trail.get("length") or [{}])[0].get("km") if trail.get("length") else None
    return unique, relations, start, stated


def main(argv):
    flags = {"--url": [], "--relation": []}
    rest = []
    it = iter(argv)
    for a in it:
        if a in flags:
            flags[a].append(next(it))
        else:
            rest.append(a)
    if rest:
        urls, relations, start, stated = record_targets(rest[0])
    else:
        urls = [("page", u) for u in flags["--url"]]
        relations = [[int(r) for r in flags["--relation"]]] if flags["--relation"] else []
        start, stated = None, None
    if not urls and not relations:
        raise SystemExit(__doc__)
    blocked = False
    for what, url in urls:
        ok, why = probe(url)
        blocked |= not ok
        print(f"  {'ok' if ok else 'BLOCKER'}  {what}: {url} ({why})")
    for rids in relations:
        try:
            ok, lines = check_relation(rids, start, stated)
        except (urllib.error.URLError, socket.timeout, ssl.SSLError, KeyError) as error:
            ok, lines = False, [f"relation {rids}: not read ({error})"]
        blocked |= not ok
        print(f"  {'ok' if ok else 'BLOCKER'}  " + "\n".join(lines))
    print("\nblocked: record it on the issue and move on" if blocked else "\nno blocker found")
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
