"""How much interest a trail draws: views of its Wikipedia articles (issue #84).

    .venv/bin/python -m pipeline.popularity <slug>            # use the cached counts
    .venv/bin/python -m pipeline.popularity <slug> --refresh  # ask Wikimedia again

The record's `wikidata` item (Q…) lists the trail's Wikipedia article in every language
(sitelinks); for each, the views by people (agent "user", so no bots and crawlers) over the last
twelve complete months come from Wikimedia's pageview API (open data, CC0), summed over all
languages. It measures interest in the trail, not hikers on it, and favours trails with articles
in many languages; the home page's "Popular trails" ranks by it. A trail without a Wikidata item
or article has no figure (not zero) and isn't ranked. Cached in data/raw/<slug>/wikimedia.json
per twelve-month window, so a new month asks again. Writes data/derived/<slug>.json under
`popularity`.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import yaml

from pipeline.routes import Cache

ROOT = Path(__file__).resolve().parent.parent
ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{q}.json"
VIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/all-access/user/{title}/monthly/{start}/{end}"
# Wikimedia asks API clients to say who they are and how to reach them
USER_AGENT = "huckepack-pipeline/1.0 (https://huckepack.me; personal project)"
# sitelinks that aren't language Wikipedias
NOT_WIKIPEDIA = {"commonswiki", "specieswiki", "wikidatawiki", "metawiki", "mediawikiwiki", "sourceswiki", "incubatorwiki"}


def get(url):
    """JSON from a Wikimedia API; None for 404 (an article without views in the window). Retries
    only dropped connections and busy answers, so a missing article doesn't wait."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(5 * (attempt + 1))


def window(today=None):
    """The last twelve complete months, as (first month, last month), e.g. ('2025-10', '2026-09')."""
    today = today or date.today()
    end_y, end_m = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    start_y, start_m = (end_y - 1, end_m + 1) if end_m < 12 else (end_y, 1)
    return f"{start_y}-{start_m:02d}", f"{end_y}-{end_m:02d}"


def articles(qid):
    """The trail's Wikipedia articles: [(project, title)], e.g. ('de.wikipedia', 'Moselsteig')."""
    entity = get(ENTITY.format(q=qid))["entities"][qid]
    out = []
    for site, link in entity.get("sitelinks", {}).items():
        if not site.endswith("wiki") or site in NOT_WIKIPEDIA:
            continue
        out.append((f"{site[:-4].replace('_', '-')}.wikipedia", link["title"]))
    return sorted(out)


def views(project, title, start, end):
    """Monthly views by people of one article, summed over the window (0 if it had none)."""
    url = VIEWS.format(
        project=project,
        title=urllib.parse.quote(title.replace(" ", "_"), safe=""),
        start=start.replace("-", "") + "01",
        end=end.replace("-", "") + "28",
    )
    data = get(url)  # None: no views in the window (or the article is newer)
    return sum(i["views"] for i in data["items"]) if data else 0


def build(slug, refresh=False):
    record = yaml.safe_load((ROOT / "data" / "trails" / f"{slug}.yaml").read_text())
    out = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(out.read_text()) if out.exists() else {}
    qid = record.get("wikidata")
    if not qid:
        derived.pop("popularity", None)
        out.write_text(json.dumps(derived, indent=2, ensure_ascii=False) + "\n")
        print(f"{slug}: no `wikidata` item in the record, so no page views (not ranked as popular)")
        return
    start, end = window()
    cache = Cache(slug, refresh)
    name = "wikimedia.json"
    cached = cache.manifest.get(name)
    if cached and cached["url"] != f"{qid} {start}..{end}":
        (cache.dir / name).unlink(missing_ok=True)  # a new month, or another item: count again

    def download():
        counts = [{"project": p, "title": t, "views": views(p, t, start, end)} for p, t in articles(qid)]
        return json.dumps({"wikidata": qid, "from": start, "to": end, "articles": counts}, ensure_ascii=False).encode()

    data, fresh = cache.get(name, f"{qid} {start}..{end}", download)
    data = json.loads(data)
    total = sum(a["views"] for a in data["articles"])
    derived["popularity"] = {
        "source": "wikimedia",
        "retrieved": cache.manifest[name]["retrieved"],
        "wikidata": qid,
        "from": data["from"],
        "to": data["to"],
        "views": total,
        "articles": data["articles"],
    }
    out.write_text(json.dumps(derived, indent=2, ensure_ascii=False) + "\n")
    print(f"{out.relative_to(ROOT)}: {total:,} page views {data['from']} to {data['to']} in {len(data['articles'])} language(s)")
    for a in sorted(data["articles"], key=lambda a: -a["views"]):
        print(f"  {a['project']:<16} {a['views']:>8,}  {a['title']}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
