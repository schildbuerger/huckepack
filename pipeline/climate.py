"""Climate by month along a trail, and daylight hours.

    .venv/bin/python -m pipeline.climate <slug>            # use cached weather data
    .venv/bin/python -m pipeline.climate <slug> --refresh  # ask the weather API again

Needs the elevation step (pipeline.elevation), whose highest and lowest points of the main
route are the two places looked up: the trail's high and low ground. For each, 30 years of
daily weather (YEARS) from the Open-Meteo historical weather API (ERA5 and ERA5-Land reanalysis,
CC BY 4.0; adjusted to the place's real elevation; cached in data/raw/<slug>/climate-*.json),
averaged per month: day highs, night lows, wet days (at least 1 mm), snow days (at least 1 cm),
frost nights (below 0 °C) and precipitation. Daylight is computed, not downloaded: sunrise to
sunset on the 15th of each month at the trail's latitude. Writes data/derived/<slug>.json under
`climate`.
"""

import json
import math
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

from pipeline.routes import USER_AGENT, Cache

ROOT = Path(__file__).resolve().parent.parent
API = "https://archive-api.open-meteo.com/v1/archive"
YEARS = (1995, 2024)  # 30 full years, the usual length for a climate average
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum"
PAUSE_S = 70  # the free API counts long requests as many calls and limits them per minute
PLACES = (("low", "lowest", "Lowest point"), ("high", "highest", "Highest point"))


def daylight_hours(lat, month):
    """Sunrise to sunset on the 15th of the month (standard refraction and sun radius)."""
    day = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1]
    decl = math.radians(23.44) * math.sin(math.radians(360 / 365 * (284 + day)))
    phi = math.radians(lat)
    cos_w = (math.sin(math.radians(-0.833)) - math.sin(phi) * math.sin(decl)) / (math.cos(phi) * math.cos(decl))
    return 2 * math.degrees(math.acos(max(-1, min(1, cos_w)))) / 15


def fetch(place):
    url = (
        f"{API}?latitude={place['lat']}&longitude={place['lon']}&elevation={place['m']}"
        f"&start_date={YEARS[0]}-01-01&end_date={YEARS[1]}-12-31&daily={DAILY}&timezone=auto"
    )

    def download():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    data = response.read()
                time.sleep(PAUSE_S)
                return data
            except urllib.error.HTTPError as error:
                if error.code != 429 or attempt == 4:
                    raise
                time.sleep(PAUSE_S)  # rate limit: wait for the next minute
        raise AssertionError("unreachable")

    return url, download


def monthly(daily):
    """Per month: averages over all its days (temperatures) or per year (counts and sums)."""
    days = defaultdict(list)
    for i, date in enumerate(daily["time"]):
        days[int(date[5:7])].append({k: daily[k][i] for k in daily if k != "time"})
    years = YEARS[1] - YEARS[0] + 1
    out = {}
    for month, rows in days.items():
        rows = [r for r in rows if r["temperature_2m_max"] is not None]
        out[month] = {
            "tmax": round(sum(r["temperature_2m_max"] for r in rows) / len(rows), 1),
            "tmin": round(sum(r["temperature_2m_min"] for r in rows) / len(rows), 1),
            "wetDays": round(sum(r["precipitation_sum"] >= 1 for r in rows) / years, 1),
            "snowDays": round(sum((r["snowfall_sum"] or 0) >= 1 for r in rows) / years, 1),
            "frostNights": round(sum(r["temperature_2m_min"] < 0 for r in rows) / years, 1),
            "precipMm": round(sum(r["precipitation_sum"] or 0 for r in rows) / years),
        }
    return out


def build(slug, refresh=False):
    out = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(out.read_text())
    elevation = derived.get("elevation")
    if not elevation or "lat" not in elevation["highest"]:
        raise SystemExit("run pipeline.elevation first: it finds the places to look up")

    cache = Cache(slug, refresh)
    places, per_place = [], {}
    for pid, key, label in PLACES:
        point = elevation[key]
        place = {"id": pid, "label": label, "km": point["km"], "m": point["m"], "lat": point["lat"], "lon": point["lon"]}
        url, download = fetch(place)
        data, fresh = cache.get(f"climate-{pid}.json", url, download)
        if fresh:
            print(f"  downloaded {label.lower()} ({point['m']} m)")
        per_place[pid] = monthly(json.loads(data)["daily"])
        places.append(place)

    lat = sum(p["lat"] for p in places) / len(places)
    months = [
        {"month": m, **{pid: per_place[pid][m] for pid in per_place}, "daylightH": round(daylight_hours(lat, m), 1)}
        for m in range(1, 13)
    ]
    climate = {
        "source": "era5",
        "retrieved": min(cache.manifest[f"climate-{pid}.json"]["retrieved"] for pid in per_place),
        "years": list(YEARS),
        "places": places,
        "months": months,
    }
    out.write_text(json.dumps({**derived, "climate": climate}, indent=2, ensure_ascii=False) + "\n")
    print(f"{out.relative_to(ROOT)}: climate {YEARS[0]}–{YEARS[1]} at {', '.join(f'{p['m']} m' for p in places)}")
    for m in months:
        lo, hi = m["low"], m["high"]
        print(f"  {m['month']:>2}  low {lo['tmin']:>5} … {lo['tmax']:>5} °C  high {hi['tmin']:>5} … {hi['tmax']:>5} °C"
              f"  wet {hi['wetDays']:>4}  snow {hi['snowDays']:>4}  frost {hi['frostNights']:>4}  daylight {m['daylightH']} h")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
