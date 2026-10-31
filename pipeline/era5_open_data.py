"""Daily weather 1995–2024 for one place from Open-Meteo's open data on AWS (issue #89), in the shape
of the Open-Meteo archive API's `daily` block, so pipeline/climate.py averages it the same way.

The historical API allows only about six trails a day; the same reanalysis lies in Open-Meteo's
public bucket (s3://openmeteo, CC BY 4.0, no account), in .om files built for reading one place's
time series: a whole year per file up to 2021, 21-day chunks after that. Like the API's default
blend: temperature from ERA5-Land (0.1°), moved to the place's height with the standard lapse
rate (0.65 °C per 100 m from the grid cell's own height); precipitation, snowfall, wind and gusts
from ERA5 (0.25°). Days run in local standard time (UTC plus the time zone's winter offset, from the
nearest main city in src/lib/timezones.json); snowfall in cm is the water equivalent × 0.7, as
the API gives it.

Reads over HTTPS with the OS trust store (truststore) through the pipeline's proxy settings.
"""

import asyncio
import json
import math
import ssl
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import omfiles
import truststore
from fsspec.implementations.http import HTTPFileSystem

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://openmeteo.s3.us-west-2.amazonaws.com/data/"
CHUNK_H = 504  # hours per chunk file (meta.json `chunk_time_length`)
LAST_YEAR_FILE = 2021  # whole-year files up to this year, chunks after
LAPSE = 0.0065  # °C per metre
LAND = "copernicus_era5_land"
ERA5 = "copernicus_era5"
VARIABLES = {
    "t2m": (LAND, "temperature_2m"),
    "precip": (ERA5, "precipitation"),
    "snow": (ERA5, "snowfall_water_equivalent"),
    "u10": (ERA5, "wind_u_component_10m"),
    "v10": (ERA5, "wind_v_component_10m"),
    "gust": (ERA5, "wind_gusts_10m"),
}
GRID = {LAND: 0.1, ERA5: 0.25}


class _FS(HTTPFileSystem):
    # omfiles passes `path=`; the HTTP filesystem names it `url`
    async def _cat_file(self, url=None, start=None, end=None, path=None, **kw):
        return await super()._cat_file(url or path, start=start, end=end, **kw)

    async def _info(self, url=None, path=None, **kw):
        return await super()._info(url or path, **kw)


_fs = None


def _filesystem():
    global _fs
    if _fs is None:
        _fs = _FS(client_kwargs={"trust_env": True}, ssl=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT))
    return _fs


def _open(path):
    for attempt in range(4):
        try:
            return omfiles.OmFileReader.from_fsspec(_filesystem(), BASE + path)
        except Exception:
            if attempt == 3:
                raise


def _cell(model, lat, lon):
    """The grid cell (row, column) of a place: rows from 90° S up, columns from 180° W east."""
    step = GRID[model]
    return round((lat + 90) / step), round((lon + 180) / step) % round(360 / step)


def _series(model, var, lat, lon, start, end):
    """Hourly values at the place's cell from `start` to `end` (UTC datetimes, end excluded)."""
    iy, ix = _cell(model, lat, lon)
    parts = []
    t = start
    while t < end:
        if t.year <= LAST_YEAR_FILE:
            year_start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
            year_end = min(datetime(t.year + 1, 1, 1, tzinfo=timezone.utc), end)
            r = _open(f"{model}/{var}/year_{t.year}.om")
            a, b = int((t - year_start).total_seconds() // 3600), int((year_end - year_start).total_seconds() // 3600)
            parts.append(np.asarray(r[iy, ix, a:b], dtype=float))
            t = year_end
        else:
            hours = int(t.timestamp() // 3600)
            chunk = hours // CHUNK_H
            chunk_start = datetime.fromtimestamp(chunk * CHUNK_H * 3600, tz=timezone.utc)
            chunk_end = min(chunk_start + timedelta(hours=CHUNK_H), end)
            r = _open(f"{model}/{var}/chunk_{chunk}.om")
            a, b = hours - chunk * CHUNK_H, int((chunk_end - chunk_start).total_seconds() // 3600)
            parts.append(np.asarray(r[iy, ix, a:b], dtype=float))
            t = chunk_end
    return np.concatenate(parts)


def _cell_height(lat, lon, model=LAND):
    """The grid cell's mean height in metres; a sea cell's (stored as -999) is sea level."""
    r = _open(f"{model}/static/HSURF.om")
    iy, ix = _cell(model, lat, lon)
    h = float(np.asarray(r[iy : iy + 1, ix : ix + 1]).ravel()[0])
    return 0.0 if h < -500 or np.isnan(h) else h


def _utc_offset_hours(lat, lon):
    """The winter (standard) UTC offset of the time zone whose main city is nearest the place."""
    zones = json.loads((ROOT / "src" / "lib" / "timezones.json").read_text())
    def dist(z):
        c = zones[z]  # [lat, lon] of the zone's main city
        return (c[0] - lat) ** 2 + ((c[1] - lon) * math.cos(math.radians(lat))) ** 2
    zone = min(zones, key=dist)
    return ZoneInfo(zone).utcoffset(datetime(2021, 1, 15)).total_seconds() / 3600


def hourly(lat, lon, elevation_m, years=(1995, 2024)):
    """Hourly series for the place from the first local midnight of `years[0]`: the variables of
    VARIABLES, temperature already moved to the place's height."""
    offset = _utc_offset_hours(lat, lon)
    # local standard days: fetch from the first local midnight, in UTC
    start = datetime(years[0], 1, 1, tzinfo=timezone.utc) - timedelta(hours=offset)
    end = datetime(years[1] + 1, 1, 1, tzinfo=timezone.utc) - timedelta(hours=offset)
    with ThreadPoolExecutor(max_workers=len(VARIABLES)) as pool:
        futures = {k: pool.submit(_series, m, v, lat, lon, start, end) for k, (m, v) in VARIABLES.items()}
        h = {k: f.result() for k, f in futures.items()}
    if np.isnan(h["t2m"]).mean() > 0.01:
        # ERA5-Land covers land only: a place at the coast (the MacLehose Trail's start) can fall in
        # a sea cell; take ERA5's temperature there, moved from its own cell's height
        h["t2m"] = _series(ERA5, "temperature_2m", lat, lon, start, end) + LAPSE * (_cell_height(lat, lon, ERA5) - elevation_m)
    else:
        h["t2m"] = h["t2m"] + LAPSE * (_cell_height(lat, lon) - elevation_m)
    return h


def snow_fraction(t):
    """The share of precipitation that falls as snow at temperature t (°C): all of it at 0 °C and
    below, none from 2 °C, in proportion between (a common rain-snow threshold). ERA5's own
    snowfall is that of its 25 km cell's mean height; at the place's height it can be rain."""
    return np.clip((2 - t) / 2, 0, 1)


def daily_from_hourly(h, years=(1995, 2024)):
    """The API's `daily` block: time, temperature_2m_max/min (°C), precipitation_sum (mm),
    snowfall_sum (cm: water equivalent × 0.7), wind_speed_10m_max and wind_gusts_10m_max (km/h)."""
    t2m = h["t2m"]
    gaps = [k for k, v in h.items() if np.isnan(v).any()]
    if gaps:
        raise ValueError(f"no data for {', '.join(gaps)} at this place (a sea cell?)")
    n = len(t2m) // 24
    day = lambda a: a[: n * 24].reshape(n, 24)
    speed = np.hypot(h["u10"], h["v10"])
    first = datetime(years[0], 1, 1)
    return {
        "time": [(first + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)],
        "temperature_2m_max": np.round(day(t2m).max(axis=1), 1).tolist(),
        "temperature_2m_min": np.round(day(t2m).min(axis=1), 1).tolist(),
        "precipitation_sum": np.round(day(h["precip"]).sum(axis=1), 1).tolist(),
        "snowfall_sum": np.round(day(h["precip"] * snow_fraction(t2m)).sum(axis=1) * 0.7, 2).tolist(),
        "wind_speed_10m_max": np.round(day(speed).max(axis=1) * 3.6, 1).tolist(),
        "wind_gusts_10m_max": np.round(day(h["gust"]).max(axis=1) * 3.6, 1).tolist(),
    }


def daily(lat, lon, elevation_m, years=(1995, 2024)):
    """The place's daily weather, as the archive API's `daily` block."""
    return daily_from_hourly(hourly(lat, lon, elevation_m, years), years)
