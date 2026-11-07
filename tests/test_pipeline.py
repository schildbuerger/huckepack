"""Tests for the pipeline's pure parts (review of 2026-10-30, #21): the numbers and lines that feed
the site. No downloads; small made-up tracks and OSM data near 50° N, where 0.001° of longitude is
about 71 m and 0.001° of latitude about 111 m.

    ~/.venvs/huckepack/bin/python -m unittest discover -s tests
"""

import math
import unittest

from pipeline import all as pipeline_all, along, climate, elevation, era5_open_data, osm, routes, surface, water

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

    def test_wp_go_maps_polydata(self):
        body = '{"map_id":"37","polydata":[{"lat":"50.1","lng":"8.1"},{"lat":"50.2","lng":"8.2"}],"linecolor":"000000"}'
        self.assertEqual(routes.track_points(body), self.expected)

    def test_gpx_with_several_tracks_reads_the_first(self):
        gpx = ('<gpx><trk><name>Main</name><trkseg><trkpt lat="50.1" lon="8.1"/><trkpt lat="50.2" lon="8.2"/></trkseg></trk>'
               '<trk><name>Alternative</name><trkseg><trkpt lat="51" lon="9"/></trkseg></trk></gpx>')
        self.assertEqual(routes.track_points(gpx), self.expected)

    def test_gpx_route_points_without_a_track(self):
        gpx = '<gpx><rte><name>Route</name><rtept lat="50.1" lon="8.1"><ele>3</ele></rtept><rtept lat="50.2" lon="8.2"/></rte></gpx>'
        self.assertEqual(routes.track_points(gpx), self.expected)

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

    def test_nearest_index(self):
        self.assertEqual(routes.nearest_index(self.line, {"lon": 8.0041, "lat": LAT}), 4)

    def test_split_at_stage_ends(self):
        stages = [{"end": {"lon": 8.003, "lat": LAT}}, {"end": {"lon": 8.01, "lat": LAT}}]
        first, second = routes.split_at(self.line, stages)
        self.assertEqual((first[0], first[-1], second[-1]), (self.line[0], self.line[3], self.line[10]))

    def test_walked_pieces_leave_out_the_rides(self):
        def ride(a, b):
            return {"start": {"name": "a", "lon": a, "lat": LAT}, "end": {"name": "b", "lon": b, "lat": LAT}}

        # a ride in the middle: the walk before it and after it
        before, after = routes.walked_pieces(self.line, [ride(8.003, 8.006)])
        self.assertEqual((before[0], before[-1], after[0], after[-1]), (self.line[0], self.line[3], self.line[6], self.line[10]))
        # a ride from the start and one to the end (the Adlerweg's stages 8 and 12): one walk between
        (walk,) = routes.walked_pieces(self.line, [ride(8.0, 8.002), ride(8.008, 8.01)])
        self.assertEqual((walk[0], walk[-1]), (self.line[2], self.line[8]))

    def test_rides_out_of_order_are_an_error(self):
        ride = {"start": {"name": "a", "lon": 8.006, "lat": LAT}, "end": {"name": "b", "lon": 8.003, "lat": LAT}}
        with self.assertRaises(ValueError):
            routes.walked_pieces(self.line, [ride])

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

    def test_two_branches_at_the_start_keep_the_chain_from_the_start(self):
        # the Camino Francés at Saint-Jean: two routes leave the start and join, so the start
        # isn't a loose end and the open-end chain begins at the far end, only a branch longer
        a = [(8.000, LAT), (8.030, LAT)]
        main = [(8.030, LAT), (8.200, LAT), (8.500, LAT)]
        b = [(8.000, LAT), (8.015, LAT + 0.003), (8.030, LAT)]
        rel = self.relation({1: a, 2: main, 3: b})
        line = routes.relation_piece(rel["elements"], [], (8.0, LAT), (8.0, LAT), (8.2, LAT))
        self.assertEqual(line, [(8.000, LAT), (8.030, LAT), (8.200, LAT)])

    def test_a_chain_from_the_middle_starts_at_the_open_end(self):
        # a variant whose relation passes close to where the stage before ended, in its middle
        # (the South Dorset Ridgeway above Abbotsbury): the chain runs end to end
        a = [(8.000, LAT), (8.020, LAT)]
        b = [(8.020, LAT), (8.040, LAT + 0.001)]
        c = [(8.040, LAT + 0.001), (8.200, LAT)]
        rel = self.relation({1: a, 2: b, 3: c})
        line = routes.relation_chain(rel["elements"], [], (8.040, LAT + 0.0012))
        self.assertEqual({line[0], line[-1]}, {(8.000, LAT), (8.200, LAT)})

    def test_railway_path_takes_the_shorter_track(self):
        # two parallel tracks between the stations, joined at both ends; one makes a detour
        straight = [(8.000, LAT), (8.005, LAT), (8.010, LAT)]
        detour = [(8.000, LAT), (8.005, LAT + 0.004), (8.010, LAT)]
        rel = self.relation({1: straight, 2: detour})
        path = routes.relation_path(rel["elements"], (8.0, LAT), (8.01, LAT))
        self.assertEqual(path, straight)

    def test_path_joins_way_ends_close_together(self):
        # two ways ending 50 m apart without a shared node: joined only with join_m
        a = [(8.000, LAT), (8.005, LAT)]
        b = [(8.0057, LAT), (8.010, LAT)]
        rel = self.relation({1: a, 2: b})
        with self.assertRaises(ValueError):
            routes.relation_path(rel["elements"], (8.0, LAT), (8.01, LAT))
        path = routes.relation_path(rel["elements"], (8.0, LAT), (8.01, LAT), join_m=100)
        self.assertEqual(path, a + b)


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

    def test_a_stage_can_allow_a_longer_bridge(self):
        nodes = {1: (8.000, LAT), 2: (8.003, LAT), 3: (8.0047, LAT), 4: (8.008, LAT)}  # 120 m apart
        data = osm_data(nodes, [(1, [1, 2]), (2, [3, 4])])
        track = [(8.0 + i * 0.0008, LAT) for i in range(11)]
        line, report = osm.match(track, data, max_bridge_m=200)
        self.assertEqual([w for w, _ in report["ways"]], [1, 0, 2])

    def test_a_loop_of_over_3_km_is_split(self):
        # 500 m in, a loop of 1.5 km out, 150 m across and 1.5 km back (3.15 km), 500 m on
        pts = [(x, 0.0) for x in range(0, 2001, 20)] + [(2000.0, y) for y in range(20, 151, 20)]
        pts += [(x, 150.0) for x in range(1980, 499, -20)] + [(500.0, y) for y in range(130, 39, -20)]
        pts += [(x, 40.0) for x in range(480, -1, -20)]
        _, turns = osm.turnarounds(pts)
        self.assertEqual(len(turns), 1)

    def test_a_stage_that_is_a_loop_is_split(self):
        # 6 km out along one side of a square and back round the other three to the start
        side = 1500
        pts = [(x, 0.0) for x in range(0, side + 1, 20)] + [(float(side), y) for y in range(20, side + 1, 20)]
        pts += [(x, float(side)) for x in range(side - 20, -1, -20)] + [(0.0, y) for y in range(side - 20, -1, -20)]
        fine, turns = osm.turnarounds(pts)
        self.assertEqual(len(turns), 1)
        self.assertGreater(math.dist(fine[0], fine[turns[0]]), 2000)  # the far corner

    def test_a_stage_can_allow_more_bridges(self):
        # eight ways in a row with 20 m gaps between them: seven gaps, one more than the default
        nodes, ways = {}, []
        for i in range(8):
            a, b = 2 * i + 1, 2 * i + 2
            nodes[a], nodes[b] = (8.0 + i * 0.0014, LAT), (8.0 + i * 0.0014 + 0.0011, LAT)
            ways.append((i + 1, [a, b]))
        data = osm_data(nodes, ways)
        track = [(8.0 + i * 0.0005, LAT) for i in range(22)]
        with self.assertRaises(ValueError):
            osm.match(track, data)
        line, report = osm.match(track, data, max_bridges=7)
        self.assertEqual([w for w, _ in report["ways"]].count(0), 7)


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

    def test_osm_ref(self):
        # issue #118: the page links each water point to its OSM object
        self.assertEqual(water.osm_ref({"type": "node", "id": 282521395}), "node/282521395")
        self.assertEqual(water.osm_ref({"type": "way", "id": 7}), "way/7")
        self.assertIsNone(water.osm_ref({"lat": 1, "lon": 2}))  # a record's own point, no OSM object


class Along(unittest.TestCase):
    def test_resupply(self):
        self.assertEqual(along.classify({"shop": "supermarket"}), ("resupply", "supermarket"))
        self.assertEqual(along.classify({"amenity": "fuel", "shop": "convenience"}), ("resupply", "convenience"))
        self.assertEqual(along.classify({"amenity": "fuel", "shop": "yes"}), ("resupply", "fuel"))
        self.assertIsNone(along.classify({"amenity": "fuel"}))  # no shop
        self.assertIsNone(along.classify({"shop": "bakery"}))

    def test_beds(self):
        self.assertEqual(along.classify({"tourism": "alpine_hut"}), ("beds", "hut"))
        self.assertEqual(along.classify({"tourism": "camp_site"}), ("beds", "campsite"))
        # shelters are day shelters along these trails, whatever their type
        self.assertIsNone(along.classify({"amenity": "shelter", "shelter_type": "basic_hut"}))
        self.assertIsNone(along.classify({"amenity": "shelter", "shelter_type": "lean_to"}))
        self.assertIsNone(along.classify({"amenity": "shelter", "shelter_type": "picnic_shelter"}))
        self.assertIsNone(along.classify({"tourism": "hotel"}))


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


class WindOffTheSea(unittest.TestCase):
    """Issue #120: a place whose ERA5 cell is mostly sea takes its wind from the nearest mostly-land
    cell. A made-up ERA5-Land grid: land (height 100 m) east of 10.0° E, sea (NaN) west of it."""

    def setUp(self):
        import numpy as np

        grid = np.full((1801, 3600), np.nan)
        grid[:, round((10.0 + 180) / 0.1) :] = 100.0
        self.saved = era5_open_data._land_grid
        era5_open_data._land_grid = grid

    def tearDown(self):
        era5_open_data._land_grid = self.saved

    def test_land_share_counts_land_cells_in_the_era5_cell(self):
        self.assertEqual(era5_open_data.land_share(45.0, 10.5), 1.0)
        self.assertEqual(era5_open_data.land_share(45.0, 9.0), 0.0)
        self.assertTrue(0 < era5_open_data.land_share(45.0, 10.0) < 1)

    def test_a_place_over_the_sea_takes_its_wind_from_the_nearest_land_cell(self):
        lat, lon, share, moved = era5_open_data.wind_cell(45.0, 9.75)
        self.assertTrue(moved)
        self.assertGreater(share, era5_open_data.LAND_MIN)
        self.assertEqual(lat, 45.0)
        self.assertGreater(lon, 9.75)

    def test_a_place_on_land_keeps_its_own_cell(self):
        self.assertEqual(era5_open_data.wind_cell(45.0, 11.0), (45.0, 11.0, 1.0, False))

    def test_far_out_at_sea_it_stays(self):
        self.assertFalse(era5_open_data.wind_cell(45.0, 5.0)[3])


class Walkable(unittest.TestCase):
    def test_trunk_roads_only_where_tagged_for_walkers(self):
        from pipeline import osmlocal
        self.assertTrue(osmlocal.walkable({"highway": "footway"}))
        self.assertFalse(osmlocal.walkable({"highway": "trunk"}))
        self.assertTrue(osmlocal.walkable({"highway": "trunk", "foot": "yes"}))
        self.assertFalse(osmlocal.walkable({"highway": "motorway", "foot": "yes"}))
        self.assertFalse(osmlocal.walkable({"highway": "construction"}))
        self.assertFalse(osmlocal.walkable({}))



class WaterTiers(unittest.TestCase):
    def test_drinking_treatment_and_refills(self):
        water = {"withinM": 500, "points": [{"kind": "drinking", "km": 10.0}, {"kind": "spring", "km": 30.0}]}
        beds = [
            {"kind": "hut", "name": "A", "stage": "2", "km": 50.0, "offM": 100},  # a refill
            {"kind": "hut", "name": "B", "stage": "3", "km": 70.0, "offM": 100, "drinkingWater": "yes"},  # drinking water
            {"kind": "campsite", "name": "C", "stage": "3", "km": 80.0, "offM": 100, "drinkingWater": "no"},  # left out
            {"kind": "hostel", "name": "D", "stage": "3", "km": 85.0, "offM": 900},  # beyond the water reach
        ]
        t = along.water_tiers(water, beds, 100.0)
        self.assertEqual([p["name"] for p in t["promoted"]], ["B"])
        self.assertEqual([p["name"] for p in t["refills"]], ["A"])
        self.assertEqual(t["longestGapKm"]["drinking"], {"km": 60.0, "fromKm": 10.0, "toKm": 70.0})
        self.assertEqual(t["longestGapKm"]["treatment"]["km"], 40.0)
        self.assertEqual(t["longestGapKm"]["refill"]["km"], 30.0)
        self.assertEqual(t["longestGapKm"]["clean"]["km"], 40.0)  # drinking water or a refill, no springs
        # refills whose water a source says is untreated count as any water, not clean water
        u = along.water_tiers(water, beds, 100.0, untreated=True)
        self.assertEqual(u["longestGapKm"]["clean"]["km"], 60.0)
        self.assertEqual(u["longestGapKm"]["refill"]["km"], 30.0)

    def test_places_keep_their_osm_object(self):
        # issue #118: promoted water and refills carry the place's OSM object where it has one
        water = {"withinM": 500, "points": []}
        beds = [
            {"kind": "hut", "name": "A", "stage": "1", "km": 5.0, "offM": 50, "osm": "way/12"},
            {"kind": "hut", "name": "B", "stage": "1", "km": 9.0, "offM": 50, "drinkingWater": "yes", "osm": "node/34"},
            {"kind": "hut", "name": "C", "stage": "1", "km": 12.0, "offM": 50},
        ]
        t = along.water_tiers(water, beds, 20.0)
        self.assertEqual([p.get("osm") for p in t["refills"]], ["way/12", None])
        self.assertEqual(t["promoted"][0]["osm"], "node/34")

if __name__ == "__main__":
    unittest.main()


class CacheKeys(unittest.TestCase):
    """A cached download made for another key (a stage's old guide line) is fetched again."""

    def test_key_change_fetches_again(self):
        import tempfile
        from pathlib import Path
        from pipeline import routes

        with tempfile.TemporaryDirectory() as tmp:
            cache = routes.Cache.__new__(routes.Cache)
            cache.dir, cache.refresh = Path(tmp), False
            cache.manifest_path, cache.manifest = Path(tmp) / "manifest.json", {}
            calls = []
            fetch = lambda body: (lambda: calls.append(body) or body)
            self.assertEqual(cache.get("w.json", "u", fetch(b"a"), key="k1"), ("a", True))
            self.assertEqual(cache.get("w.json", "u", fetch(b"b"), key="k1"), ("a", False))
            self.assertEqual(cache.get("w.json", "u", fetch(b"c"), key="k2"), ("c", True))
            # a cache from before keys were kept takes the key without fetching
            del cache.manifest["w.json"]["key"]
            self.assertEqual(cache.get("w.json", "u", fetch(b"d"), key="k3"), ("c", False))
            self.assertEqual(cache.manifest["w.json"]["key"], "k3")
            self.assertEqual(calls, [b"a", b"c"])


class Photos(unittest.TestCase):
    """pipeline/photos.py: which Commons files count as a trail's photos, and how they are credited."""

    def file(self, **kw):
        base = {"title": "File:Path above the valley.jpg", "w": 4000, "h": 3000, "mime": "image/jpeg", "licence": "CC BY-SA 4.0",
                "restrictions": "", "author": "Rémih", "name": "", "lat": "", "lon": ""}
        return {**base, **kw}

    def test_open_licences_only(self):
        from pipeline import photos

        for ok in ("CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain"):
            self.assertTrue(photos.usable(self.file(licence=ok)), ok)
        for no in ("CC BY-NC-SA 2.0", "CC BY-ND 4.0", "GFDL", ""):
            self.assertFalse(photos.usable(self.file(licence=no)), no)

    def test_photos_not_signs_people_or_small(self):
        from pipeline import photos

        self.assertFalse(photos.usable(self.file(title="File:Wegweiser am Westweg.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:Bus at the station.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:Infotafel Alpe Adria Trail.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:Infoschild Mallnitz.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:Rhodiola.rosea.76.jpg")))  # a species
        self.assertFalse(photos.usable(self.file(title="File:Pararge aegeria, Norfolk coast path.jpg")))
        self.assertTrue(photos.usable(self.file(title="File:Malerweg sächsische Schweiz.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:GA3-Grenzstein87-SB.jpg")))
        self.assertFalse(photos.usable(self.file(title="File:-2018-09-19 Rose Hips (Rosa dumalis), Trimingham.jpg")))
        self.assertFalse(photos.usable(self.file(restrictions="personality")))
        self.assertFalse(photos.usable(self.file(author="")))
        self.assertFalse(photos.usable(self.file(w=1000, h=750)))
        self.assertFalse(photos.usable(self.file(w=3000, h=4000)))  # portrait

    def test_caption_and_author(self):
        from pipeline import photos

        self.assertEqual(photos.caption(self.file(title="File:Tré-le-Champ @ Chamonix (51482715057).jpg")), "Tré-le-Champ, Chamonix")
        self.assertEqual(photos.caption(self.file(name="Le Grandes Jorasses - Vallone del Maratrà - August 8, 2016")), "Le Grandes Jorasses - Vallone del Maratrà")
        self.assertEqual(photos.caption(self.file(title="File:St Blane's Hill - geograph.org.uk - 8350.jpg")), "St Blane's Hill")
        self.assertEqual(photos.caption(self.file(title="File:Neustadt an der Weinstraße - panoramio.jpg")), "Neustadt an der Weinstraße")
        self.assertEqual(photos.caption(self.file(title="File:2013 03 09 Queen Charlotte Track 15km (4).JPG")), "Queen Charlotte Track 15km")
        self.assertEqual(photos.caption(self.file(name="Wonderland Trail at the Nisqually River 360")), "Wonderland Trail at the Nisqually River 360")

    def test_subjects_only_with_scenery(self):
        # a flower, a bird, a memorial or an underpass alone is turned down; with a view it stays (2026-11-06)
        from pipeline import photos

        for title in ("Meadow with flowers above Grindelwald", "View from the war memorial", "Bird's eye view of Ullswater", "Blick über die Blumenwiese"):
            self.assertTrue(photos.usable(self.file(title=f"File:{title}.jpg")), title)
        for title in ("Kea near Hidden Valley Shelter, bird", "Spring flowers", "War memorial, Kirk Yetholm", "Subway under the A229"):
            self.assertFalse(photos.usable(self.file(title=f"File:{title}.jpg")), title)

    def test_spheres_unusable_also_in_the_category(self):
        from pipeline import photos

        sphere = self.file(title="File:Wonderland Trail at the Nisqually River 360 (dc21).jpg", categories="360° panoramas|Wonderland Trail")
        self.assertFalse(photos.usable(sphere))
        self.assertFalse(photos.usable(self.file(w=5760, h=2880)))  # equirectangular
        self.assertEqual(photos.author(self.file(author="Own work Rémih")), "Rémih")
        self.assertEqual(photos.author(self.file(author="Guilhem Vellut from Annecy, France")), "Guilhem Vellut")

    def test_found_by_location_only_scenery(self):
        from pipeline import photos

        self.assertEqual(photos.scenic(self.file(categories="Images from Wiki Loves Earth 2016 in Germany|Kropsburg|Naturpark Pfälzerwald")), 2)
        self.assertEqual(photos.scenic(self.file(title="File:Weinberge bei Deidesheim.jpg", categories="Deidesheim")), 1)
        self.assertEqual(photos.scenic(self.file(title="File:Toyota Aygo sideview.jpg", categories="2018 Toyota automobiles")), 0)
        self.assertEqual(photos.scenic(self.file(title="File:Larix on the trail.jpg", categories="Larix decidua")), 0)  # a species
        self.assertEqual(photos.scenic(self.file(title="File:IMG 2041.jpg", categories="Deidesheim")), 0)  # nothing says scenery
        self.assertEqual(photos.scenic(self.file(categories="Interiors of churches in Germany|Hiking")), 0)
        self.assertEqual(photos.scenic(self.file(title="File:Mapillary (osmplus org) 1.jpg", categories="Valleys")), 0)
        self.assertEqual(photos.scenic(self.file(w=4000, h=2000, categories="Valleys")), 0)  # 2:1, a 360° sphere
        self.assertEqual(photos.scenic(self.file(title="File:ISS067-E-21033 - View of Earth.jpg", categories="Lakes")), 0)  # from space
        self.assertEqual(photos.scenic(self.file(title="File:Kriegerfriedhof Nasswand.jpg", categories="Forests")), 0)

    def test_line_places_within_reach(self):
        from pipeline import photos

        # 10 km due east along the equator; points only at the ends, the line fills in between
        route = [((0.0, 0.0), 0.0), ((0.0899, 0.0), 10.0)]
        line = photos.Line(route)
        off, km = line.nearest((0.045, 0.002))  # mid-way, about 220 m north
        self.assertAlmostEqual(km, 5.0, delta=0.15)
        self.assertLess(off, 0.25)
        self.assertEqual(photos.place(self.file(lon="0.045", lat="0.002"), line, 0.5), round(km, 1))
        self.assertIs(photos.place(self.file(lon="0.045", lat="0.006"), line, 0.5), False)  # 670 m off
        self.assertIsNone(photos.place(self.file(), line, 0.5))  # no position
        self.assertEqual(photos.samples(route, 2.5), [(0.0, 0.0), (0.0899, 0.0)])

    def test_batches_stay_short(self):
        from pipeline import photos

        groups = list(photos.batches([f"File:{'Ä' * 40} {i}.jpg" for i in range(60)]))
        self.assertTrue(all(len(g) <= 50 for g in groups))
        self.assertEqual(sum(len(g) for g in groups), 60)
        self.assertTrue(all(sum(len(photos.urllib.parse.quote(t)) + 3 for t in g) <= 3000 for g in groups))

    def test_spread_fills_the_gaps(self):
        from pipeline import photos

        cands = [self.file(title=f"File:{k}.jpg", km=k, author=a, rank=1) for k, a in ((1, "A"), (2, "A"), (3, "A"), (55, "B"), (90, "C"))]
        got = photos.spread(cands, [10], 3, 100)
        self.assertEqual([c["km"] for c in got], [90, 55, 1])  # farthest from km 10 first
        self.assertEqual(len(photos.spread(cands[:3], [], 3, 100)), 2)  # two by one author at most


class ZippedGpx(unittest.TestCase):
    """pipeline/routes.py: a GPX offered as a zip archive is unpacked on download."""

    def test_unzips_the_gpx(self):
        import io
        import zipfile

        from pipeline.routes import unzipped_gpx

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("__MACOSX/._a.gpx", b"junk")
            z.writestr("readme.txt", b"hello")
            z.writestr("section-1.gpx", b"<gpx>1</gpx>")
        self.assertEqual(unzipped_gpx(buf.getvalue()), b"<gpx>1</gpx>")
        self.assertEqual(unzipped_gpx(b"<gpx>2</gpx>"), b"<gpx>2</gpx>")

    def test_kmz_in_a_zip_and_its_line(self):
        # the Caminho de Cora Coralina's download: a zip holding a KMZ holding doc.kml
        import io
        import zipfile

        from pipeline.routes import track_points, unzipped_gpx

        kml = b"""<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Town</name><Point><coordinates>-48.8,-15.9,0</coordinates></Point></Placemark>
<Placemark><LineString><coordinates>-48.80,-15.92,700 -48.81,-15.93,710
-48.82,-15.94,720</coordinates></LineString></Placemark></Document></kml>"""
        kmz = io.BytesIO()
        with zipfile.ZipFile(kmz, "w") as z:
            z.writestr("doc.kml", kml)
        outer = io.BytesIO()
        with zipfile.ZipFile(outer, "w") as z:
            z.writestr("route.kmz", kmz.getvalue())
        body = unzipped_gpx(outer.getvalue())
        self.assertEqual(body, kml)
        self.assertEqual(track_points(body.decode()), [(-48.8, -15.92), (-48.81, -15.93), (-48.82, -15.94)])


class Extracts(unittest.TestCase):
    def test_region_copy_not_a_longer_namesake(self):
        # "sachsen-*" also matches sachsen-anhalt's copy; only the region's own dated files count
        import tempfile
        from pathlib import Path
        from unittest import mock

        from pipeline import osmlocal

        with tempfile.TemporaryDirectory() as d:
            for name in ("sachsen-anhalt-261101.osm.pbf", "sachsen-261031.osm.pbf"):
                (Path(d) / name).write_bytes(b"")
            with mock.patch.object(osmlocal, "EXTRACTS_DIR", Path(d)):
                self.assertEqual(osmlocal.extract("sachsen", "unused").name, "sachsen-261031.osm.pbf")


class StagelessTrails(unittest.TestCase):
    # issue #204: a trail without stages by design is one internal segment over the whole route
    TERMINI = {"start": {"name": "Longmire", "lat": 46.75, "lon": -121.81}, "end": {"name": "Longmire", "lat": 46.75, "lon": -121.81}}

    def test_one_segment_to_the_finish(self):
        trail = {"termini": self.TERMINI, "stages": {"none": True, "source": "nps"}, "route": {"relation": 1}}
        (segment,) = osm.stage_list(trail)
        self.assertEqual((segment["number"], segment["kind"], segment["whole"]), ("1", "main", True))
        self.assertEqual(segment["end"]["name"], "Longmire")
        self.assertNotIn("track", segment)

    def test_whole_route_track(self):
        trail = {"termini": self.TERMINI, "stages": {"none": True, "source": "nps"}, "route": {"track": "https://example.org/w.gpx"}}
        self.assertEqual(osm.stage_list(trail)[0]["track"], "https://example.org/w.gpx")

    def test_stages_unchanged(self):
        stages = [{"number": "1", "kind": "main", "km": 10}]
        self.assertEqual(osm.stage_list({"stages": {"list": stages}}), stages)
        self.assertEqual(osm.stage_list({}), [])


class FasterBuilds(unittest.TestCase):
    """2026-11-06: the preflight, the shared cache manifest and the corridor's kept area."""

    def test_bot_check_by_title_or_challenge_script_only(self):
        from pipeline import preflight

        self.assertEqual(preflight.bot_check("<title>Just a moment...</title>"), "Just a moment")
        self.assertTrue(preflight.bot_check('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script>'))
        # a page that only mentions a captcha (Wikipedia's scripts, GitHub) is no bot check
        self.assertIsNone(preflight.bot_check("<title>Long Trail - Wikipedia</title><script>var captcha=1</script>"))
        # Cloudflare's passive script on every page of a site behind it is no bot check either
        self.assertIsNone(preflight.bot_check('<title>Tahoe Rim Trail</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'))

    def test_relation_in_pieces_is_a_blocker(self):
        from unittest import mock

        from pipeline import preflight

        def w(id_, a, b):
            return {"type": "way", "id": id_, "geometry": [{"lon": a[0], "lat": a[1]}, {"lon": b[0], "lat": b[1]}]}

        # two pieces of 1.4 km each, 3 km apart: the chain stops after the first
        elements = [
            {"type": "relation", "id": 1, "tags": {"name": "Test Trail"}, "members": [{"type": "way", "ref": i, "role": ""} for i in (10, 11, 12, 13)]},
            w(10, (8.000, LAT), (8.010, LAT)), w(11, (8.010, LAT), (8.020, LAT)),
            w(12, (8.062, LAT), (8.072, LAT)), w(13, (8.072, LAT), (8.082, LAT)),
        ]
        with mock.patch.object(preflight, "relation_elements", return_value=elements):
            ok, lines = preflight.check_relation([1], start=(8.0, LAT))
        self.assertFalse(ok)
        self.assertIn("left out", "\n".join(lines))
        with mock.patch.object(preflight, "relation_elements", return_value=elements[:3]):
            ok, _ = preflight.check_relation([1], start=(8.0, LAT))
        self.assertTrue(ok)

    def test_manifest_writes_merge(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest import mock

        with tempfile.TemporaryDirectory() as d, mock.patch.object(routes, "ROOT", Path(d)):
            a, b = routes.Cache("t", False), routes.Cache("t", False)  # two steps, each read the manifest empty
            a.get("one.json", "u1", lambda: b"{}")
            b.get("two.json", "u2", lambda: b"{}")
            self.assertEqual(sorted(json.loads((Path(d) / "data/raw/t/manifest.json").read_text())), ["one.json", "two.json"])

    def test_cell_centres_fall_in_their_cells(self):
        from pipeline import osmlocal

        for lon, lat in [(8.0, 50.0), (-122.3, 46.8), (170.5, -45.1), (-70.9, -51.0)]:
            c = osmlocal._cell(lon, lat)
            self.assertEqual(osmlocal._cell(*osmlocal._cell_centres([c])[0]), c)


class MainRoles(unittest.TestCase):
    def test_route_role_counts_as_the_main_line(self):
        # the Fundy Footpath's ways carry the role "route" (2026-11-06)
        def w(id_, a, b):
            return {"type": "way", "id": id_, "geometry": [{"lon": a, "lat": LAT}, {"lon": b, "lat": LAT}]}

        rel = {"elements": [
            {"type": "relation", "id": 1, "members": [{"type": "way", "ref": 10, "role": "route"}, {"type": "way", "ref": 11, "role": "main"}, {"type": "way", "ref": 12, "role": "alternative"}]},
            w(10, 8.000, 8.010), w(11, 8.010, 8.020), w(12, 8.020, 8.030),
        ]}
        line = routes.relation_line(rel, set(), (8.0, LAT))
        self.assertAlmostEqual(routes.line_km(line), 1.43, places=1)


class PhotoAtStart(unittest.TestCase):
    def test_km_zero_is_a_place(self):
        # the condition in photos.choose(): a photo at km 0.0 is placed, not dropped
        for km, placed in ((0.0, True), (12.5, True), (None, False), (False, False)):
            self.assertEqual(km is not None and km is not False, placed)


class Captions(unittest.TestCase):
    def test_camera_date_and_frame_go(self):
        from pipeline import photos

        f = {"name": None, "title": "File:20150708 - 41 - Pukaskwa National Park, Ont. - Southern Headland Panorama.jpg"}
        self.assertEqual(photos.caption(f), "Pukaskwa National Park, Ont. - Southern Headland Panorama")
        self.assertEqual(photos.caption({"name": None, "title": "File:Nisqually River 360.jpg"}), "Nisqually River 360")
        self.assertEqual(photos.caption({"name": None, "title": "File:Southern Headland Panorama No. 2.jpg"}), "Southern Headland Panorama")


class PreflightContent(unittest.TestCase):
    def test_login_box_in_a_header_is_no_wall(self):
        from pipeline import preflight

        box = '<form><input type="password" name="pw"></form>'
        self.assertFalse(preflight.login_wall("<title>The Cohos Trail</title>" + box + "<p>" + "trail news " * 300 + "</p>"))
        self.assertTrue(preflight.login_wall("<title>Member login</title>" + box))
        self.assertTrue(preflight.login_wall("<title>Members</title>" + box + "<p>Please log in.</p>"))

    def test_a_taken_over_domain(self):
        from pipeline import preflight

        self.assertTrue(preflight.spam("<title>GACOR188</title><p>situs slot gacor, toto online terpercaya</p>"))
        self.assertIsNone(preflight.spam("<title>Pinhoti Trail Alliance</title><p>Trail sections and maps</p>"))


class AccessViaPort(unittest.TestCase):
    def test_road_distance_runs_to_the_ferry_port(self):
        import io
        import json
        import tempfile
        from pathlib import Path
        from unittest import mock

        from pipeline import access

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "data" / "trails").mkdir(parents=True)
            (root / "data" / "trails" / "isle.yaml").write_text(
                "termini: {start: {name: S, lat: 48.0, lon: -88.5}}\n"
                "access:\n  - {kind: airport, name: A, lat: 47.0, lon: -88.0, via: {name: Port, lat: 47.1, lon: -88.6, by: ferry}, source: osm}\n"
            )
            asked = []

            def urlopen(request, timeout=0):
                asked.append(request.full_url)
                return io.BytesIO(json.dumps({"code": "Ok", "routes": [{"distance": 15800, "duration": 1920}]}).encode())

            with mock.patch.object(access, "ROOT", root), mock.patch.object(routes, "ROOT", root), mock.patch("urllib.request.urlopen", urlopen):
                access.build("isle")
            self.assertIn("-88.6,47.1", asked[0])  # to the port, not the island start
            hub = json.loads((root / "data" / "derived" / "isle.json").read_text())["access"]["hubs"][0]
            self.assertEqual((hub["to"], hub["roadKm"]), ("Port", 15.8))


class ClimbThreshold(unittest.TestCase):
    """The check's terrain-model ascent counts climbs and drops once they reach 10 m (2026-11-07),
    as the site's climbs() in src/lib/trails.ts."""

    def test_wobbles_dont_add_up(self):
        self.assertEqual(pipeline_all.climbs([100, 104, 99, 105, 100, 106]), (0, 0))

    def test_steps_from_the_last_reference(self):
        self.assertEqual(pipeline_all.climbs([100, 106, 112, 118, 124, 127]), (24, 0))
        self.assertEqual(pipeline_all.climbs([200, 190, 215]), (25, 10))

    def test_raw_without_threshold(self):
        self.assertEqual(pipeline_all.climbs([100, 104, 99, 105], threshold=0), (10, 5))
        self.assertEqual(pipeline_all.CLIMB_THRESHOLD_M, 10)


class TerrainWindows(unittest.TestCase):
    """GEDTM30 is read in windows around chunks of consecutive samples (pipeline/elevation.py)."""

    def test_chunks_cover_every_sample_with_margin(self):
        pixels = [(10.2 + i * 3.3, 50.7 - i * 1.1) for i in range(95)]
        wins = elevation.windows(pixels, chunk=40, margin=2)
        self.assertEqual([(a, b) for a, b, *_ in wins], [(0, 40), (40, 80), (80, 95)])
        for a, b, c0, r0, w, h in wins:
            for col, row in pixels[a:b]:
                # the four nearest cell centres are within the window, with the margin to spare
                self.assertGreaterEqual(math.floor(col - 0.5) - c0, 1)
                self.assertGreaterEqual(math.floor(row - 0.5) - r0, 1)
                self.assertLess(math.floor(col - 0.5) + 1, c0 + w - 1)
                self.assertLess(math.floor(row - 0.5) + 1, r0 + h - 1)

    def test_bilinear_between_cell_centres(self):
        import numpy as np

        grid = np.array([[0.0, 10.0], [20.0, 30.0]])
        self.assertAlmostEqual(elevation.bilinear(grid, 0.5, 0.5), 0.0)  # on the first centre
        self.assertAlmostEqual(elevation.bilinear(grid, 1.0, 1.0), 15.0)  # between all four
        self.assertAlmostEqual(elevation.bilinear(grid, 1.5, 0.5), 10.0)

    def test_bilinear_leaves_out_cells_without_data(self):
        import numpy as np

        nodata = np.float32(3.4028234663852886e38)
        grid = np.array([[10.0, nodata], [10.0, 10.0]], dtype=np.float32)
        self.assertAlmostEqual(elevation.bilinear(grid, 1.0, 1.0, nodata), 10.0)
        self.assertIsNone(elevation.bilinear(np.full((2, 2), nodata, dtype=np.float32), 1.0, 1.0, nodata))
