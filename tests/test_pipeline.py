"""Tests for the pipeline's pure parts (review of 2026-10-30, #21): the numbers and lines that feed
the site. No downloads; small made-up tracks and OSM data near 50° N, where 0.001° of longitude is
about 71 m and 0.001° of latitude about 111 m.

    .venv/bin/python -m unittest discover -s tests
"""

import math
import unittest

from pipeline import climate, osm, routes, surface, water

LAT = 50.0


def way(id_, nodes):
    return {"type": "way", "id": id_, "nodes": nodes}


def osm_data(nodes, ways):
    """Overpass-shaped elements: nodes as {id: (lon, lat)} and ways as [(id, [node ids])]."""
    return {
        "elements": [{"type": "node", "id": n, "lon": lon, "lat": lat} for n, (lon, lat) in nodes.items()]
        + [way(i, ns) for i, ns in ways]
    }


class StageOrder(unittest.TestCase):
    def test_route_letters_order_by_digits(self):
        self.assertEqual(osm.stage_order("14"), 14)
        self.assertEqual(osm.stage_order("N8"), 8)
        self.assertEqual(osm.stage_order("S22"), 22)
        self.assertEqual(sorted(["N10", "7", "N8"], key=osm.stage_order), ["7", "N8", "N10"])


class TrackPoints(unittest.TestCase):
    expected = [(8.1, 50.1), (8.2, 50.2)]

    def test_gpx_with_attributes_in_either_order(self):
        gpx = '<gpx><trk><trkseg><trkpt lat="50.1" lon="8.1"/><trkpt lon="8.2" lat="50.2"></trkpt></trkseg></trk></gpx>'
        self.assertEqual(routes.track_points(gpx), self.expected)

    def test_schema_org_line_as_lat_lon(self):
        page = '{"geo": {"@type": "GeoShape", "line": "50.1 8.1 50.2 8.2"}}'
        self.assertEqual(routes.track_points(page), self.expected)

    def test_schema_org_line_as_lon_lat_height(self):
        page = '{"@type": "GeoShape", "line": "8.1,50.1,300 8.2,50.2,310"}'
        self.assertEqual(routes.track_points(page), self.expected)

    def test_schema_org_type_list_with_start_coordinates(self):
        page = '{"@type": ["GeoCoordinates", "GeoShape"], "latitude": 50.1, "longitude": 8.1, "line": "50.1 8.1 50.2 8.2"}'
        self.assertEqual(routes.track_points(page), self.expected)

    def test_neusta_polyline_html_escaped(self):
        page = '<div data-map="{&quot;polyline&quot;:&quot;8.1,50.1 8.2,50.2&quot;}">'
        self.assertEqual(routes.track_points(page), self.expected)

    def test_no_track_is_an_error(self):
        with self.assertRaises(ValueError):
            routes.track_points("<html>no line here</html>")


class Lines(unittest.TestCase):
    line = [(8.0 + i * 0.001, LAT) for i in range(11)]  # about 715 m eastwards

    def test_line_km(self):
        self.assertAlmostEqual(routes.line_km(self.line), 0.715, delta=0.01)

    def test_piece_between_nearest_points(self):
        part = routes.piece(self.line, (8.0021, LAT + 0.0001), (8.0059, LAT))
        self.assertEqual(part[0], self.line[2])
        self.assertEqual(part[-1], self.line[6])

    def test_piece_against_the_line_direction_is_an_error(self):
        with self.assertRaises(ValueError):
            routes.piece(self.line, (8.008, LAT), (8.002, LAT))

    def test_simplify_keeps_ends_and_drops_straight_points(self):
        out = routes.simplify(self.line, 10)
        self.assertEqual((out[0], out[-1]), (self.line[0], self.line[-1]))
        self.assertLess(len(out), len(self.line))


class Relations(unittest.TestCase):
    @staticmethod
    def relation(ways, roles=None):
        geo = lambda pts: [{"lon": lon, "lat": lat} for lon, lat in pts]
        return {
            "elements": [{"type": "relation", "id": 1, "members": [{"type": "way", "ref": i, "role": (roles or {}).get(i, "")} for i in ways]}]
            + [{"type": "way", "id": i, "geometry": geo(pts)} for i, pts in ways.items()]
        }

    def test_chains_ways_out_of_order_and_flipped(self):
        a = [(8.000, LAT), (8.002, LAT)]
        b = [(8.004, LAT), (8.002, LAT)]  # drawn the other way
        c = [(8.004, LAT), (8.006, LAT)]
        line = routes.relation_line(self.relation({3: c, 1: a, 2: b}), [], (8.0, LAT))
        self.assertEqual(line[0], (8.0, LAT))
        self.assertEqual(line[-1], (8.006, LAT))
        self.assertEqual(len(line), 4)

    def test_alternatives_only_when_chosen(self):
        a = [(8.000, LAT), (8.002, LAT)]
        alt = [(8.002, LAT), (8.004, LAT)]
        rel = self.relation({1: a, 2: alt}, roles={2: "alternative"})
        self.assertEqual(routes.relation_line(rel, [], (8.0, LAT))[-1], (8.002, LAT))
        self.assertEqual(routes.relation_line(rel, [2], (8.0, LAT))[-1], (8.004, LAT))

    def test_railway_path_takes_the_shorter_track(self):
        # two parallel tracks between the stations, joined at both ends; one makes a detour
        straight = [(8.000, LAT), (8.005, LAT), (8.010, LAT)]
        detour = [(8.000, LAT), (8.005, LAT + 0.004), (8.010, LAT)]
        rel = self.relation({1: straight, 2: detour})
        path = routes.relation_path(rel["elements"], (8.0, LAT), (8.01, LAT))
        self.assertEqual(path, straight)


class Match(unittest.TestCase):
    def test_follows_the_way_near_the_track(self):
        # a path along the track and a road 100 m north of it; the track runs on the path
        nodes = {i: (8.0 + i * 0.001, LAT) for i in range(6)} | {10 + i: (8.0 + i * 0.001, LAT + 0.0009) for i in range(6)}
        data = osm_data(nodes, [(1, list(range(6))), (2, [10 + i for i in range(6)]), (3, [0, 10]), (4, [5, 15])])
        track = [(8.0 + i * 0.0005, LAT + 0.00005) for i in range(11)]
        line, report = osm.match(track, data)
        self.assertEqual([w for w, _ in report["ways"]], [1])
        self.assertEqual(report["covered"], 1.0)
        self.assertAlmostEqual(report["km"], 0.357, delta=0.01)

    def test_bridges_a_short_gap_where_osm_has_no_way(self):
        # two paths 40 m apart along the track (a crossing OSM lacks): bridged, marked as way 0
        nodes = {1: (8.000, LAT), 2: (8.003, LAT), 3: (8.00356, LAT), 4: (8.006, LAT)}
        data = osm_data(nodes, [(1, [1, 2]), (2, [3, 4])])
        track = [(8.0 + i * 0.0006, LAT) for i in range(11)]
        line, report = osm.match(track, data)
        self.assertEqual([w for w, _ in report["ways"]], [1, 0, 2])

    def test_a_long_gap_is_not_bridged(self):
        nodes = {1: (8.000, LAT), 2: (8.003, LAT), 3: (8.0047, LAT), 4: (8.008, LAT)}  # 120 m apart
        data = osm_data(nodes, [(1, [1, 2]), (2, [3, 4])])
        track = [(8.0 + i * 0.0008, LAT) for i in range(11)]
        with self.assertRaises(ValueError):
            osm.match(track, data)


class Surface(unittest.TestCase):
    def test_surface_tag_first(self):
        self.assertEqual(surface.classify({"surface": "asphalt", "highway": "path"}), ("paved", False))
        self.assertEqual(surface.classify({"surface": "gravel;grass"}), ("gravel", False))

    def test_inferred_from_the_way_type(self):
        self.assertEqual(surface.classify({"highway": "path"}), ("natural", True))
        self.assertEqual(surface.classify({"highway": "track"}), ("gravel", True))

    def test_unknown(self):
        self.assertEqual(surface.classify({}), ("unknown", False))


class Water(unittest.TestCase):
    def test_longest_gap_counts_start_and_end(self):
        self.assertEqual(water.longest_gap([5, 12], 40), {"km": 28, "fromKm": 12, "toKm": 40})
        self.assertEqual(water.longest_gap([], 30), {"km": 30, "fromKm": 0, "toKm": 30})

    def test_kind(self):
        self.assertEqual(water.kind({"amenity": "drinking_water"}), "drinking")
        self.assertEqual(water.kind({"natural": "spring", "drinking_water": "yes"}), "drinking")
        self.assertEqual(water.kind({"natural": "spring"}), "spring")
        self.assertIsNone(water.kind({"amenity": "bench"}))


class Climate(unittest.TestCase):
    def test_cell_snaps_to_the_grid_and_10_m(self):
        self.assertEqual(climate.cell({"lat": 50.1234, "lon": 8.4567, "m": 543}), {"lat": 50.1, "lon": 8.5, "m": 540})

    def test_daylight(self):
        self.assertAlmostEqual(climate.daylight_hours(0, 3), 12.1, delta=0.1)
        self.assertGreater(climate.daylight_hours(60, 6), 18.5)
        self.assertLess(climate.daylight_hours(60, 12), 6.5)

    def test_monthly_averages_and_counts_per_year(self):
        years = climate.YEARS[1] - climate.YEARS[0] + 1
        n = 31 * years
        daily = {
            "time": ["2000-01-%02d" % (i % 31 + 1) for i in range(n)],
            "temperature_2m_max": [4.0] * n,
            "temperature_2m_min": [-2.0] * n,
            "precipitation_sum": [2.0 if i % 31 < 10 else 0.0 for i in range(n)],
            "snowfall_sum": [0.0] * n,
            "wind_speed_10m_max": [20.0] * n,
            "wind_gusts_10m_max": [30.0] * n,
        }
        jan = climate.monthly(daily)[1]
        self.assertEqual((jan["tmax"], jan["tmin"]), (4.0, -2.0))
        self.assertEqual(jan["wetDays"], 10)
        self.assertEqual(jan["frostNights"], 31)


if __name__ == "__main__":
    unittest.main()
