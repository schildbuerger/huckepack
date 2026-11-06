"""Freshness check (issue #90): are the trail records still true to their sources?

    ~/.venvs/huckepack/bin/python -m pipeline.freshness                 # report only, every trail
    ~/.venvs/huckepack/bin/python -m pipeline.freshness eifelsteig      # report only, one trail
    ~/.venvs/huckepack/bin/python -m pipeline.freshness --issues        # also open GitHub issues

Three checks, nothing in the records is changed:
1. every link in a record (sources, website, managing bodies, permits, stage pages) for errors and
   redirects; a deep link that now lands on the site's home page counts as broken;
2. every stage page the Outdooractive reader can read (pipeline/readers/outdooractive.py), re-read
   and compared with the stage's figures in the record (distance, ascent, descent, time);
3. sources whose `retrieved` date is more than a year old.

Sites that refuse automated visitors (401, 403, 429) are listed as not checked, never worked around.
With --issues each problem becomes one GitHub issue (problems of one kind on one trail together;
one link shared by most trails as one issue), labelled `bug` and `freshness`, with a hidden key so a
later run updates the open issue instead of opening another, and skips one closed as not planned.
With PROJECT_TOKEN set (a token that can write the owner's project board) the issue is put in the
board's Bugs column and rated:
  Severity: Critical, a stage figure changed (the page shows wrong data); High, a broken link;
            Medium, a source last checked more than a year ago; Low, a redirect.
  Frequency: Always, a link most trail pages carry; Often, one of the ten most read trails
             (derived `popularity`); Sometimes, any other trail; Rarely, only sources the page
             doesn't show (`checkOnly`).
"""

import datetime as dt
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import truststore
import yaml

from pipeline.readers import outdooractive

truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
REPO = "schildbuerger/huckepack"
PROJECT = {"owner": "schildbuerger", "number": "2"}
USER_AGENT = "huckepack-freshness-check (https://huckepack.me; monthly link check)"
STALE_DAYS = 365
TOP_N = 10  # the most read trails count as "Often"
SHARED = 0.5  # a link in more than half the records counts as "Always"
BLOCKED = {401, 403, 429}
SILENT_MAX = 0.3  # more silent sites than this share: the network is down
HOST_GAP = 1.0  # seconds between two requests to one site
FIGURES = {"km": ("distance", "km"), "ascentM": ("ascent", "m"), "descentM": ("descent", "m"), "minutes": ("time", "min")}

SEVERITY = {"figures": "Critical", "broken": "High", "stale": "Medium", "redirect": "Low"}
TITLES = {"figures": "stage figures changed", "broken": "broken links", "stale": "sources older than a year", "redirect": "links redirect"}


# --- what a record links to -------------------------------------------------------------------

def refs(record):
    """Every link in a record: [{url, where, hidden}]; `hidden` when the page doesn't show it."""
    out = []
    add = lambda url, where, hidden=False: isinstance(url, str) and url.startswith("http") and out.append({"url": url, "where": where, "hidden": hidden})
    add(record.get("website"), "website")
    for body in record.get("managedBy") or []:
        add(body.get("url"), f"managed by {body.get('name')}")
    add((record.get("permit") or {}).get("url"), "permit")
    add((record.get("officialGpx") or {}).get("url"), "official GPX")
    for s in (record.get("stages") or {}).get("list") or []:
        add(s.get("track"), f"stage {s.get('number')} page")
    add((record.get("route") or {}).get("track"), "route track")  # a trail without stages (issue #204)
    for src in record.get("sources") or []:
        add(src.get("url"), f"source `{src.get('id')}`", bool(src.get("checkOnly")))
    return out


def stale(record, today):
    """Sources whose `retrieved` date is more than STALE_DAYS before today."""
    out = []
    for src in record.get("sources") or []:
        got = src.get("retrieved")
        if isinstance(got, str):
            got = dt.date.fromisoformat(got[:10])
        if isinstance(got, dt.datetime):
            got = got.date()
        if isinstance(got, dt.date) and (today - got).days > STALE_DAYS:
            out.append({"url": src.get("url"), "where": f"source `{src.get('id')}`", "hidden": bool(src.get("checkOnly")), "detail": f"retrieved {got.isoformat()}"})
    return out


# --- links ------------------------------------------------------------------------------------

def _norm(url):
    """A URL without what doesn't change the page: scheme, www., case, a trailing slash, the fragment."""
    p = urllib.parse.urlsplit(url)
    host = p.netloc.lower().removeprefix("www.")
    return host + (urllib.parse.unquote(p.path).rstrip("/").lower() or "/") + (f"?{p.query}" if p.query else "")


def _tokens(url):
    """What names the page in its address: the last path segment, and numbers of 3+ digits in the
    query (Contingut.aspx?IdPub=10565)."""
    p = urllib.parse.urlsplit(url)
    last = urllib.parse.unquote(p.path).rstrip("/").rsplit("/", 1)[-1].lower()
    return {t for t in [last, *re.findall(r"\d{3,}", p.query)] if t}


def same_page(url, final):
    """A redirect to the same page: the same site, and either the address at its root (a home page
    choosing its language, /en/) or what names the page still in the new address (a language prefix,
    /sv/hogakustenleden; a short link growing its title, /r/1549613 → …/stage-01-…/1549613/)."""
    a, b = urllib.parse.urlsplit(url), urllib.parse.urlsplit(final)
    if a.netloc.lower().removeprefix("www.") != b.netloc.lower().removeprefix("www."):
        return False
    if a.path.strip("/") == "" and not a.query:
        return True
    target = urllib.parse.unquote(b.path + "?" + b.query).lower()
    return any(t in target for t in _tokens(url))


def classify(url, final, status, error=None):
    """ok, redirect, broken or unchecked, from the answer and where the request ended."""
    if error:
        return error
    if status in BLOCKED:
        return "unchecked", f"the site refuses automated visits (HTTP {status})"
    if status >= 400:
        return "broken", f"HTTP {status}"
    if _norm(url) == _norm(final) or same_page(url, final):
        return "ok", ""
    if urllib.parse.urlsplit(url).path.strip("/") and urllib.parse.urlsplit(final).path.strip("/") == "":
        return "broken", f"now lands on the home page ({final})"
    return "redirect", f"now {final}"


def _iri(url):
    """Non-ASCII characters percent-encoded (ca.wikipedia.org/wiki/Camí_de_Cavalls)."""
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(p._replace(netloc=p.netloc.encode("idna").decode(), path=urllib.parse.quote(p.path, safe="/%:@!$&'()*+,;=~-._"), query=urllib.parse.quote(p.query, safe="=&%/:+,;@!$'()*~-._?")))


def _failure(error):
    """Why a request got no answer: ("broken", why) when every visitor would fail too (no such
    host, a certificate that doesn't fit, a refused connection), else ("unchecked", why): resets,
    timeouts, and encryption too old for the checker, which browsers may still accept. The
    checker never weakens its TLS checks."""
    reason = getattr(error, "reason", error)
    text = str(reason)
    if isinstance(reason, ssl.SSLCertVerificationError):
        return "broken", f"its certificate fails ({getattr(reason, "verify_message", None) or text})"
    if isinstance(reason, socket.gaierror):
        return "broken", "the site's name no longer resolves"
    if isinstance(reason, ConnectionRefusedError):
        return "broken", "the site refuses connections"
    if isinstance(reason, ssl.SSLError):
        return "unchecked", f"encryption the checker won't use ({getattr(reason, 'reason', None) or text})"
    return "unchecked", f"no answer ({type(reason).__name__})"


_host_locks, _host_last, _guard = {}, {}, threading.Lock()


def _polite(host):
    with _guard:
        lock = _host_locks.setdefault(host, threading.Lock())
    lock.acquire()
    wait = HOST_GAP - (time.monotonic() - _host_last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    return lock


def fetch(url):
    """(status, final url, html body or None, failure or None): GET, redirects followed, two
    retries on errors and server errors."""
    host = urllib.parse.urlsplit(url).netloc
    failure = None
    for attempt in range(3):
        lock = _polite(host)
        try:
            request = urllib.request.Request(_iri(url), headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"})
            with urllib.request.urlopen(request, timeout=30) as response:
                kind = response.headers.get("Content-Type", "")
                body = response.read(3_000_000).decode("utf-8", "ignore") if "html" in kind else None
                return response.status, response.url, body, None
        except urllib.error.HTTPError as error:
            if error.code < 500 or attempt == 2:
                return error.code, error.url or url, None, None
        except Exception as error:  # DNS, TLS, timeouts, resets
            failure = _failure(error)
            if failure[0] == "broken" and attempt == 1 or attempt == 2:
                return None, url, None, failure
        finally:
            _host_last[host] = time.monotonic()
            lock.release()
        time.sleep(5 * (attempt + 1))
    return None, url, None, failure


def merged(stage_refs, answers):
    """Stage pages that now land on one page together (the Rennsteig's eight stages on the whole
    route's): {url: the page they share}."""
    landing = {}
    for ref in stage_refs:
        final = answers[ref["url"]][1]
        if final and not same_page(ref["url"], final) and _norm(ref["url"]) != _norm(final):
            landing.setdefault(_norm(final), []).append(ref["url"])
    return {u: answers[u][1] for urls in landing.values() if len(set(urls)) > 1 for u in urls}


# --- stage figures ----------------------------------------------------------------------------

# what counts as a change: more than rounding (13 against 13.1 km is the same stage)
TOLERANCE = {"km": lambda a, b: abs(a - b) > max(0.15, 0.02 * a), "ascentM": lambda a, b: abs(a - b) > max(10, 0.05 * a),
             "descentM": lambda a, b: abs(a - b) > max(10, 0.05 * a), "minutes": lambda a, b: abs(a - b) > max(10, 0.05 * a)}


def compare(stage, read):
    """The record's figures that differ from the page's beyond rounding: [(label, ours, theirs)]."""
    out = []
    for key, (label, unit) in FIGURES.items():
        ours, theirs = stage.get(key), read.get(key)
        if ours is not None and theirs is not None and TOLERANCE[key](ours, theirs):
            out.append((label, f"{ours:g} {unit}", f"{theirs:g} {unit}"))
    return out


# --- issues -----------------------------------------------------------------------------------

def frequency(slugs, hidden, top, total):
    if hidden:
        return "Rarely"
    if len(slugs) > total * SHARED:
        return "Always"
    return "Often" if any(s in top for s in slugs) else "Sometimes"


def group(findings, names, top, total):
    """Findings → issues: one per kind and trail; a link in most records as one issue of its own."""
    by_url = {}
    for f in findings:
        if f["kind"] in ("broken", "redirect"):
            by_url.setdefault((f["kind"], f["url"]), set()).add(f["slug"])
    shared = {k for k, slugs in by_url.items() if len(slugs) > total * SHARED}
    issues = {}
    for f in findings:
        if (f["kind"], f.get("url")) in shared:
            key = f"{f['kind']}:{f['url']}"
            title = f"Freshness: {TITLES[f['kind']]} on most trails: {f['url']}"
        else:
            key = f"{f['kind']}:{f['slug']}"
            title = f"Freshness: {names[f['slug']]}: {TITLES[f['kind']]}"
        issue = issues.setdefault(key, {"key": key, "kind": f["kind"], "title": title, "items": [], "slugs": set()})
        issue["items"].append(f)
        issue["slugs"].add(f["slug"])
    for issue in issues.values():
        issue["severity"] = SEVERITY[issue["kind"]]
        issue["frequency"] = frequency(issue["slugs"], all(i["hidden"] for i in issue["items"]), top, total)
    order = list(SEVERITY)
    return sorted(issues.values(), key=lambda i: (order.index(i["kind"]), i["key"]))


FIX = {
    "figures": "Re-read the stage pages, check the new figures (working rule 2) and update the record; then run the pipeline for the trail.",
    "broken": "Find where the page moved (or another official page with the same facts), update the record's link and its `retrieved` date.",
    "stale": "Re-read each source, update anything that changed and set its `retrieved` date to the day you checked.",
    "redirect": "Check the new address shows the same facts, then put it in the record.",
}


def body(issue, names, run_url=None):
    lines = [f"The monthly freshness check (`pipeline/freshness.py`, issue #90) found this on {dt.date.today().isoformat()}.", ""]
    lines += [f"**Severity:** {issue['severity']} · **Frequency:** {issue['frequency']}", ""]
    for f in sorted(issue["items"], key=lambda f: (f["slug"], f["where"])):
        trail = f"{names[f['slug']]}: " if len(issue["slugs"]) > 1 else ""
        link = f"[{f['where']}]({f['url']})" if f.get("url") else f["where"]
        lines.append(f"- {trail}{link}: {f['detail']}")
    lines += ["", f"**To fix:** {FIX[issue['kind']]}", "", "Records: " + ", ".join(f"`data/trails/{s}.yaml`" for s in sorted(issue["slugs"]))]
    if run_url:
        lines += ["", f"Run: {run_url}"]
    lines += ["", f"<!-- freshness-key: {issue['key']} -->"]
    return "\n".join(lines)


def _gh(*args, token=None, check=True):
    env = dict(os.environ, **({"GH_TOKEN": token} if token else {}))
    run = subprocess.run(["gh", *args], capture_output=True, text=True, env=env)
    if check and run.returncode:
        raise RuntimeError(f"gh {' '.join(args[:3])}: {run.stderr.strip()}")
    return run.stdout


def known_issues():
    """key → (number, state, reason) of the issues earlier runs opened, open and closed."""
    out = {}
    raw = _gh("issue", "list", "-R", REPO, "--label", "freshness", "--state", "all", "--limit", "500", "--json", "number,state,stateReason,body")
    for i in json.loads(raw):
        m = re.search(r"<!-- freshness-key: (.+?) -->", i["body"] or "")
        if m and (m.group(1) not in out or i["state"] == "OPEN"):
            out[m.group(1)] = (i["number"], i["state"], i.get("stateReason"))
    return out


def board(token):
    """The project's id and its fields' option ids: {field: (field id, {option: id})}."""
    project = json.loads(_gh("project", "view", PROJECT["number"], "--owner", PROJECT["owner"], "--format", "json", token=token))
    fields = json.loads(_gh("project", "field-list", PROJECT["number"], "--owner", PROJECT["owner"], "--format", "json", token=token))["fields"]
    return project["id"], {f["name"]: (f["id"], {o["name"]: o["id"] for o in f.get("options", [])}) for f in fields}


def file_issues(issues, names, token, run_url):
    known = known_issues()
    project = board(token) if token else None
    for issue in issues:
        text = body(issue, names, run_url)
        number, state, reason = known.get(issue["key"], (None, None, None))
        if state == "CLOSED" and reason == "NOT_PLANNED":
            print(f"  skipped (closed as not planned): #{number} {issue['title']}")
            continue
        if state == "OPEN":
            _gh("issue", "edit", str(number), "-R", REPO, "--body", text)
            print(f"  updated #{number} {issue['title']}")
            continue
        url = _gh("issue", "create", "-R", REPO, "--title", issue["title"], "--body", text, "--label", "bug", "--label", "freshness").strip()
        print(f"  opened {url}")
        if project:
            pid, fields = project
            item = json.loads(_gh("project", "item-add", PROJECT["number"], "--owner", PROJECT["owner"], "--url", url, "--format", "json", token=token))["id"]
            for field, value in (("Status", "Bugs"), ("Severity", issue["severity"]), ("Frequency", issue["frequency"])):
                if field in fields and value in fields[field][1]:
                    _gh("project", "item-edit", "--id", item, "--project-id", pid, "--field-id", fields[field][0], "--single-select-option-id", fields[field][1][value], token=token)


# --- the run ----------------------------------------------------------------------------------

def records(only):
    for path in sorted((ROOT / "data" / "trails").glob("*.yaml")):
        if not only or path.stem in only:
            yield path.stem, yaml.safe_load(path.read_text())


def popular():
    views = {}
    for path in (ROOT / "data" / "derived").glob("*.json"):
        views[path.stem] = (json.loads(path.read_text()).get("popularity") or {}).get("views", 0)
    return set(sorted(views, key=views.get, reverse=True)[:TOP_N])


def run(only, today=None):
    today = today or dt.date.today()
    trails = dict(records(only))
    names = {slug: r["name"] for slug, r in trails.items()}
    total = len(list((ROOT / "data" / "trails").glob("*.yaml")))
    findings, unchecked = [], []
    all_refs = [(slug, ref) for slug, r in trails.items() for ref in refs(r)]
    urls = sorted({ref["url"] for _, ref in all_refs})
    print(f"{len(trails)} trails, {len(all_refs)} links ({len(urls)} distinct)")
    with ThreadPoolExecutor(max_workers=12) as pool:
        answers = dict(zip(urls, pool.map(fetch, urls)))
    # most sites silent means the runner's network is down, not the web: no findings from that
    hosts = {urllib.parse.urlsplit(u).netloc for u in urls}
    silent = {urllib.parse.urlsplit(u).netloc for u, a in answers.items() if a[0] is None}
    if len(hosts) >= 5 and len(silent) > len(hosts) * SILENT_MAX:
        raise SystemExit(f"{len(silent)} of {len(hosts)} sites gave no answer: the network looks down, so nothing is reported")
    landed = {}
    for slug, r in trails.items():
        landed.update(merged([ref for ref in refs(r) if ref["where"].startswith("stage ")], answers))
    verdicts = {}
    for slug, ref in all_refs:
        status, final, _, failure = answers[ref["url"]]
        verdict, detail = classify(ref["url"], final, status, failure)
        if ref["url"] in landed:
            verdict, detail = "broken", f"now lands on a page other stages land on too ({landed[ref['url']]})"
        verdicts[ref["url"]] = verdict
        if verdict == "unchecked":
            unchecked.append((slug, ref["url"], detail))
        elif verdict != "ok":
            findings.append({"kind": verdict, "slug": slug, **ref, "detail": detail})
    # stage figures, from the pages the reader can read: a stage's own page only (the Rennsteig
    # gives every stage the whole route's page), still where it was
    read = 0
    for slug, r in trails.items():
        stages = (r.get("stages") or {}).get("list") or []
        tracks = [s.get("track") for s in stages]
        for s in stages:
            url = s.get("track") or ""
            page = answers.get(url, (None, None, None, None))[2]
            if not page or verdicts.get(url) != "ok" or tracks.count(url) > 1:
                continue
            try:
                figures = outdooractive.parse(page, url)
            except (ValueError, AttributeError, TypeError):
                continue
            read += 1
            for label, ours, theirs in compare(s, figures):
                findings.append({"kind": "figures", "slug": slug, "url": url, "where": f"stage {s.get('number')} {label}", "hidden": False, "detail": f"record {ours}, page now {theirs}"})
        for f in stale(r, today):
            findings.append({"kind": "stale", "slug": slug, **f})
    print(f"{read} stage pages read; {len(findings)} findings; {len(unchecked)} links not checked")
    return findings, unchecked, names, total


def report(issues, blocked, names):
    out = ["## Freshness check", ""]
    if not issues:
        out.append("Nothing found.")
    for i in issues:
        out.append(f"### {i['title']} ({i['severity']} · {i['frequency']})")
        out += [f"- {names[f['slug']]}: {f['where']}: {f['detail']}" for f in i["items"]]
        out.append("")
    if blocked:
        out += ["", "### Not checked (listed only, never worked around)", ""]
        out += [f"- {names[s]}: {u} ({d})" for s, u, d in sorted(blocked)]
    return "\n".join(out)


def main(args):
    issues_too = "--issues" in args
    only = [a for a in args if not a.startswith("--")]
    findings, blocked, names, total = run(only)
    issues = group(findings, names, popular(), total)
    text = report(issues, blocked, names)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(text)
    if issues_too and issues:
        run_url = None
        if os.environ.get("GITHUB_RUN_ID"):
            run_url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        file_issues(issues, names, os.environ.get("PROJECT_TOKEN"), run_url)


if __name__ == "__main__":
    main(sys.argv[1:])
