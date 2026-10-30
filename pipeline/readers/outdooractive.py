"""Stage lists from Outdooractive tour pages, ready to paste into a trail record.

    .venv/bin/python -m pipeline.readers.outdooractive <stage page url> [<url> ...]
    .venv/bin/python -m pipeline.readers.outdooractive --overview <page listing the stages>

Many tourism portals run on Outdooractive (outdooractive.com, touren.kaernten.at, regional
"Tourenportal" sites); their tour pages share one layout: a title with the stage's start and
end, a block of figures (distance, duration, ascent, descent, highest and lowest point, in the
page's language) and the track as schema.org data, which pipeline/routes.py reads directly. This
reads the figures (English or German labels) and prints one stage per line in the record's
format, with the page as the stage's `track`, plus totals to check against the trail's stated
length. With --overview it takes the stage pages from the links on one page (a multi-day tour or
the trail's stage list), in their order there.

The figures are the publisher's: copy them with the page as the source, and check them (working
rule 2). Stage numbers come from the titles ("Stage 7", "Etappe 7"), else the order given.
"""

import html
import http.client
import re
import sys
import time
import urllib.error
import urllib.request

import truststore

truststore.inject_into_ssl()

USER_AGENT = "huckepack-pipeline (personal project)"
# the figure labels by page language, each with how that language writes numbers
LABELS = {
    "en": {"km": "Distance", "time": "Duration", "up": "Ascent", "down": "Descent", "hi": "Highest point", "lo": "Lowest point", "thousands": ",", "decimal": "."},
    "de": {"km": "Strecke", "time": "Dauer", "up": "Aufstieg", "down": "Abstieg", "hi": "Höchster Punkt", "lo": "Tiefster Punkt", "thousands": ".", "decimal": ","},
}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read().decode("utf-8", "ignore")
        except (urllib.error.URLError, http.client.IncompleteRead, TimeoutError, ConnectionError):
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))


def _text(page):
    page = re.sub(r"(?s)<(script|style)\b.*?</\1>", " ", page)
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page)))


def parse(page, url):
    """The stage's figures from one tour page."""
    text = _text(page)
    lang = next((code for code, l in LABELS.items() if re.search(rf"\b{l['up']} [\d.,]+ h?m\b", text)), None)
    if lang is None:
        raise ValueError(f"{url}: no Outdooractive figures found (English or German)")
    l = LABELS[lang]

    def number(label, unit):
        m = re.search(rf"\b{re.escape(l[label])} ([\d.,]+) {unit}\b", text)
        if not m:
            return None
        return float(m.group(1).replace(l["thousands"], "").replace(l["decimal"], "."))

    title = html.unescape(re.search(r"(?s)<title>(.*?)</title>", page).group(1)).split("•")[0].strip()
    # "Stage 18 Alpe-Adria-Trail: Arriach - Gerlitzen Alpe", "Etappe 3: Hinterzarten – Titisee"
    number_m = re.search(r"\b(?:Stage|Etappe|Tappa)\s*(\d+[a-z]?)\b", title, re.I)
    route = title.split(":", 1)[1] if ":" in title else title
    ends = re.split(r"\s+[-–—>]\s+|\s+to\s+|\s+nach\s+", route.strip(), maxsplit=1)
    duration = re.search(rf"\b{re.escape(l['time'])} (\d+):(\d+) h\b", text)
    return {
        "title": title,
        "number": number_m.group(1).lstrip("0") or "0" if number_m else None,
        "from": ends[0].strip() if len(ends) == 2 else None,
        "to": ends[1].strip() if len(ends) == 2 else None,
        "km": number("km", "km"),
        "ascentM": int(number("up", "h?m") or 0) if number("up", "h?m") is not None else None,
        "descentM": int(number("down", "h?m") or 0) if number("down", "h?m") is not None else None,
        "minutes": int(duration.group(1)) * 60 + int(duration.group(2)) if duration else None,
        "highestM": number("hi", "m"),
        "lowestM": number("lo", "m"),
        "track": url,
    }


def stage_links(page, base):
    """Tour page links on an overview page, in order, without repeats: Outdooractive tour URLs end
    in their numeric id (…/route/…/<name>/1549902/ or /r/1549902)."""
    origin = re.match(r"https?://[^/]+", base).group(0)
    seen, out = set(), []
    for href in re.findall(r'href="([^"]+)"', page):
        m = re.search(r"/(?:r|route|tour)/(?:[^\"]*/)?(\d{5,})/?$", href)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append(href if href.startswith("http") else origin + href)
    return out


def yaml_line(s, number):
    fields = [f'number: "{s["number"] or number}"', "kind: main", f"from: {s['from'] or '?'}", f"to: {s['to'] or '?'}"]
    if s["km"] is not None:
        fields.append(f"km: {s['km']:g}")
    for key in ("ascentM", "descentM", "minutes"):
        if s[key] is not None:
            fields.append(f"{key}: {s[key]}")
    fields.append(f'track: "{s["track"]}"')
    return "    - { " + ", ".join(fields) + " }"


def main(args):
    if not args:
        raise SystemExit(__doc__)
    urls = stage_links(fetch(args[1]), args[1]) if args[0] == "--overview" else args
    stages = []
    for i, url in enumerate(urls, 1):
        try:
            stages.append(parse(fetch(url), url))
        except ValueError as error:
            print(f"# skipped: {error}", file=sys.stderr)
        time.sleep(1)  # be polite to the portal
    for i, s in enumerate(stages, 1):
        print(yaml_line(s, i))
    km = sum(s["km"] or 0 for s in stages)
    print(f"# {len(stages)} stages, {km:.1f} km, {sum(s['ascentM'] or 0 for s in stages):,} m up, {sum(s['descentM'] or 0 for s in stages):,} m down")
    missing = [s["title"] for s in stages if None in (s["from"], s["to"], s["km"])]
    if missing:
        print(f"# check by hand (no start, end or distance read): {'; '.join(missing)}")


if __name__ == "__main__":
    main(sys.argv[1:])
