"""Where each time zone is, for the home page's "Trails near you" (issue #85).

    .venv/bin/python -m pipeline.timezones   # download the tz database's tables, write the JSON

The browser knows its time zone (Europe/Berlin, America/Denver) without asking and without
sending anything; the home page turns it into a rough place with this table and sorts the trails
by their distance from there, all in the browser. The tz database (IANA, public domain) gives each
zone the coordinates of its principal city (zone.tab), and old names still in use map to their
current zone (backward). Writes src/lib/timezones.json: {zone: [lat, lon]}, one decimal.
"""

import json
import re
from pathlib import Path

from pipeline.routes import http_get

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://raw.githubusercontent.com/eggert/tz/main/"
OUT = ROOT / "src" / "lib" / "timezones.json"


def degrees(text):
    """'+4230' or '+423020' (±DDMM[SS]) and '+00131' or '-1234567' (±DDDMM[SS]) to decimal degrees."""
    sign = -1 if text[0] == "-" else 1
    digits = text[1:]
    deg_len = 2 if len(digits) in (4, 6) else 3
    d, rest = int(digits[:deg_len]), digits[deg_len:]
    m = int(rest[:2])
    s = int(rest[2:4]) if len(rest) >= 4 else 0
    return sign * (d + m / 60 + s / 3600)


def main():
    zones = {}
    for line in http_get(BASE + "zone.tab").decode().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        _, coords, zone = line.split("\t")[:3]
        lat, lon = re.match(r"([+-]\d+)([+-]\d+)", coords).groups()
        zones[zone] = [round(degrees(lat), 1), round(degrees(lon), 1)]
    for line in http_get(BASE + "backward").decode().splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0] == "Link" and parts[1] in zones and parts[2] not in zones:
            zones[parts[2]] = zones[parts[1]]
    OUT.write_text(json.dumps(dict(sorted(zones.items())), separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(zones)} time zones, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
