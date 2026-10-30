"""Climate by month along a trail, and daylight hours.

    .venv/bin/python -m pipeline.climate <slug>            # use cached weather data
    .venv/bin/python -m pipeline.climate <slug> --refresh  # ask the weather API again
    .venv/bin/python -m pipeline.climate --pending         # every trail whose climate is due

Needs the elevation step (pipeline.elevation), whose highest and lowest points of the main
route are the two places looked up: the trail's high and low ground. For each, 30 years of
daily weather (YEARS) from the Open-Meteo historical weather API (ERA5 and ERA5-Land reanalysis,
CC BY 4.0; adjusted to the place's real elevation; cached in data/raw/<slug>/climate-*.json),
averaged per month. Each place is looked up at its ERA5-Land grid cell (0.1°, the data's own
resolution) and its height to 10 m (`cell()`), so a cached place stays valid while the route's
highest or lowest point stays in that cell: rebuilding a route rarely costs a download. The free
API allows about 10,000 calls a day and counts one place (30 years) as about 780, so about six
trails a day: when the daily quota is reached the step leaves the trail pending (`pending()`,
reported by pipeline.all's check) instead of failing, and `--pending` catches up later. Monthly
figures: day highs, night lows, wet days (at least 1 mm), snow days (at least 1 cm),
frost nights (below 0 °C), precipitation, the mean daily top wind (the highest hourly mean at
10 m) and stormy days (gusts of GUSTY_KMH or more). Daylight is computed, not downloaded: sunrise to sunset on the 15th of each month at the trail's latitude. Writes
data/derived/<slug>.json under `climate`.
"""

import http.client
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
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max"
GUSTY_KMH = 70  # daily top gust from which a hiker can be blown off balance on exposed ground
PAUSE_S = 70  # the free API counts long requests as many calls and limits them per minute
PLACES = (("low", "lowest", "Lowest point"), ("high", "highest", "Highest point"))


class QuotaReached(Exception):
    """The weather API's daily or hourly quota is used up: try again later."""


def cell(point):
    """The place as the API is asked for it: the ERA5-Land grid point (0.1°) nearest the point and
    its height to 10 m (the API corrects temperatures to it; 5 m is 0.03 °C)."""
    return {"lat": round(point["lat"], 1), "lon": round(point["lon"], 1), "m": int(round(point["m"], -1))}


def cell_of_url(url):
    """The cell a cached download was asked for (older caches asked for the exact point)."""
    q = dict(part.split("=", 1) for part in url.split("?", 1)[1].split("&"))
    return cell({"lat": float(q["latitude"]), "lon": float(q["longitude"]), "m": float(q["elevation"])})


def daylight_hours(lat, month):
    """Sunrise to sunset on the 15th of the month (standard refraction and sun radius)."""
    day = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1]
    decl = math.radians(23.44) * math.sin(math.radians(360 / 365 * (284 + day)))
    phi = math.radians(lat)
    cos_w = (math.sin(math.radians(-0.833)) - math.sin(phi) * math.sin(decl)) / (math.cos(phi) * math.cos(decl))
    return 2 * math.degrees(math.acos(max(-1, min(1, cos_w)))) / 15


def fetch(place):
    c = cell(place)
    url = (
        f"{API}?latitude={c['lat']}&longitude={c['lon']}&elevation={c['m']}"
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
            except (urllib.error.HTTPError, urllib.error.URLError, http.client.IncompleteRead) as error:
                if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                    reason = json.loads(error.read() or b"{}").get("reason", "")
                    # a daily or hourly limit doesn't lift by waiting a minute; the minutely one does
                    if "Daily" in reason or "Hourly" in reason:
                        raise QuotaReached(reason) from None
                busy = not isinstance(error, urllib.error.HTTPError) or error.code in (429, 502, 503, 504)
                if not busy or attempt == 4:
                    raise
                time.sleep(PAUSE_S)  # rate limited, busy or cut off: wait and try again
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
            "windKmh": round(sum(r["wind_speed_10m_max"] or 0 for r in rows) / len(rows), 1),
            "gustDays": round(sum((r["wind_gusts_10m_max"] or 0) >= GUSTY_KMH for r in rows) / years, 1),
        }
    return out


def build(slug, refresh=False):
    out = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(out.read_text())
    elevation = derived.get("elevation")
    if not elevation or "lat" not in elevation["highest"]:
        raise SystemExit("run pipeline.elevation first: it finds the places to look up")

    if not refresh and not pending(slug):
        print(f"{out.relative_to(ROOT)}: climate up to date (its places are still in the route's grid cells)")
        return True
    cache = Cache(slug, refresh)
    places, per_place = [], {}
    for pid, key, label in PLACES:
        point = elevation[key]
        place = {"id": pid, "label": label, "km": point["km"], "m": point["m"], "lat": point["lat"], "lon": point["lon"]}
        url, download = fetch(place)
        name = f"climate-{pid}.json"
        cached = cache.manifest.get(name)
        if cached and cell_of_url(cached["url"]) != cell(place):
            (cache.dir / name).unlink(missing_ok=True)  # the point moved to another cell
        try:
            data, fresh = cache.get(name, url, download)
        except QuotaReached as error:
            print(f"  climate pending: {error} (run `.venv/bin/python -m pipeline.climate --pending` later)")
            return False
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
              f"  wet {hi['wetDays']:>4}  wind {hi['windKmh']:>5} gusts {hi['gustDays']:>4}  snow {hi['snowDays']:>4}  frost {hi['frostNights']:>4}  daylight {m['daylightH']} h")
    return True


def pending(slug):
    """Whether the trail's climate is due: never built, or its places have moved to other cells
    since (the derived climate then still describes the old route's high and low ground)."""
    path = ROOT / "data" / "derived" / f"{slug}.json"
    derived = json.loads(path.read_text()) if path.exists() else {}
    elevation, climate = derived.get("elevation"), derived.get("climate")
    if not elevation or "lat" not in elevation["highest"]:
        return False  # not ready for this step yet
    if not climate:
        return True
    have = {p["id"]: cell(p) for p in climate["places"]}
    return any(have.get(pid) != cell(elevation[key]) for pid, key, _ in PLACES)


def catch_up():
    """Every trail whose climate is due, until the quota runs out."""
    due = [p.stem for p in sorted((ROOT / "data" / "trails").glob("*.yaml")) if pending(p.stem)]
    print(f"climate due for {len(due)} trail(s): {', '.join(due) or 'none'}")
    for slug in due:
        print(f"\n== {slug}")
        if not build(slug):
            print(f"stopped: {len(due) - due.index(slug)} trail(s) still due")
            return


if __name__ == "__main__":
    if "--pending" in sys.argv:
        catch_up()
        raise SystemExit
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    build(args[0], refresh="--refresh" in sys.argv)
