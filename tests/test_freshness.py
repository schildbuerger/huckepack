"""The freshness check's rules (pipeline/freshness.py, issue #90), without the network."""

import datetime as dt
import socket
import ssl
import unittest
import urllib.error

from pipeline import freshness as f


class Links(unittest.TestCase):
    def test_the_same_page_under_another_address_is_fine(self):
        same = [
            ("https://www.camidecavalls.com/", "https://www.camidecavalls.com/ca/"),  # a home page picks its language
            ("https://www.hogakusten.com/hogakustenleden", "https://www.hogakusten.com/sv/hogakustenleden"),
            ("https://touren.kaernten.at/en/r/1549613/", "https://touren.kaernten.at/en/route/long-distance-hiking/stage-01-alpe-adria-trail/1549613/"),
            ("https://www.camidecavalls.com/contingut.aspx?IdPub=10565", "https://www.camidecavalls.com/ca/GR_223_Un_sender/10565"),
        ]
        for url, final in same:
            self.assertEqual(f.classify(url, final, 200), ("ok", ""), url)

    def test_scheme_www_case_and_slash_are_no_redirect(self):
        self.assertEqual(f.classify("http://parks.canada.ca/pn-np/SCO-WCT", "https://www.parks.canada.ca/pn-np/sco-wct/", 200)[0], "ok")

    def test_a_page_that_moved_is_a_redirect(self):
        verdict, detail = f.classify("https://www.fi.is/en/moya/adverts/425", "https://www.fi.is/en/hiking-trails/trails/laugavegur", 200)
        self.assertEqual(verdict, "redirect")
        self.assertIn("laugavegur", detail)
        self.assertEqual(f.classify("https://www.bml.gv.at/a.pdf", "https://www.bmluk.gv.at/a.pdf", 200)[0], "redirect")

    def test_a_deep_link_landing_on_the_home_page_is_broken(self):
        self.assertEqual(f.classify("https://example.org/trail/stage-3", "https://example.org/", 200)[0], "broken")

    def test_errors_and_refusals(self):
        self.assertEqual(f.classify("https://a.org/x", "https://a.org/x", 404), ("broken", "HTTP 404"))
        self.assertEqual(f.classify("https://a.org/x", "https://a.org/x", 403)[0], "unchecked")
        self.assertEqual(f.classify("https://a.org/x", "https://a.org/x", 429)[0], "unchecked")

    def test_failures_every_visitor_meets_are_broken_the_rest_unchecked(self):
        cert = ssl.SSLCertVerificationError("name mismatch")
        self.assertEqual(f._failure(urllib.error.URLError(cert))[0], "broken")
        self.assertEqual(f._failure(urllib.error.URLError(socket.gaierror(8, "nodename"))), ("broken", "the site's name no longer resolves"))
        self.assertEqual(f._failure(urllib.error.URLError(ConnectionRefusedError()))[0], "broken")
        self.assertEqual(f._failure(urllib.error.URLError(ssl.SSLError(1, "DH_KEY_TOO_SMALL")))[0], "unchecked")
        self.assertEqual(f._failure(ConnectionResetError(54, "reset"))[0], "unchecked")
        self.assertEqual(f._failure(TimeoutError())[0], "unchecked")

    def test_non_ascii_addresses_are_encoded(self):
        self.assertEqual(f._iri("https://ca.wikipedia.org/wiki/Camí_de_Cavalls"), "https://ca.wikipedia.org/wiki/Cam%C3%AD_de_Cavalls")
        self.assertEqual(f._iri("https://a.org/x%20y?q=1&b=2"), "https://a.org/x%20y?q=1&b=2")

    def test_stage_pages_landing_on_one_page_are_found(self):
        refs = [{"url": "https://a.org/stage-1"}, {"url": "https://a.org/stage-2"}, {"url": "https://a.org/stage-3"}]
        answers = {
            "https://a.org/stage-1": (200, "https://a.org/whole-route", None, None),
            "https://a.org/stage-2": (200, "https://a.org/whole-route", None, None),
            "https://a.org/stage-3": (200, "https://a.org/stage-3", None, None),
        }
        self.assertEqual(set(f.merged(refs, answers)), {"https://a.org/stage-1", "https://a.org/stage-2"})


class Records(unittest.TestCase):
    RECORD = {
        "website": "https://trail.org/",
        "managedBy": [{"name": "Trail Club", "url": "https://club.org/"}],
        "permit": {"url": "https://permits.org/"},
        "stages": {"list": [{"number": "1", "track": "https://trail.org/s1"}, {"number": "2", "track": "data/raw/x.gpx"}]},
        "sources": [
            {"id": "site", "url": "https://trail.org/", "retrieved": "2026-10-31"},
            {"id": "old", "url": "https://old.org/", "retrieved": dt.date(2025, 9, 1)},
            {"id": "views", "url": "https://wikimedia.org/api/", "retrieved": "2025-01-01T07:00:00+00:00", "checkOnly": True},
        ],
    }

    def test_every_link_is_collected(self):
        got = [(r["where"], r["hidden"]) for r in f.refs(self.RECORD)]
        self.assertEqual(got, [("website", False), ("managed by Trail Club", False), ("permit", False), ("stage 1 page", False),
                               ("source `site`", False), ("source `old`", False), ("source `views`", True)])

    def test_sources_older_than_a_year(self):
        old = f.stale(self.RECORD, dt.date(2026, 11, 4))
        self.assertEqual([s["where"] for s in old], ["source `old`", "source `views`"])
        self.assertEqual(old[0]["detail"], "retrieved 2025-09-01")
        # 364 days is not yet a year
        self.assertEqual([s["where"] for s in f.stale(self.RECORD, dt.date(2026, 8, 31))], ["source `views`"])


class Figures(unittest.TestCase):
    def test_rounding_is_no_change(self):
        self.assertEqual(f.compare({"km": 13, "ascentM": 400, "minutes": 300}, {"km": 13.1, "ascentM": 408, "minutes": 305}), [])

    def test_changes_beyond_rounding(self):
        got = f.compare({"km": 19.9, "ascentM": 235, "descentM": 347}, {"km": 20.1, "ascentM": 280, "descentM": 392, "minutes": 300})
        self.assertEqual(got, [("ascent", "235 m", "280 m"), ("descent", "347 m", "392 m")])
        self.assertEqual(f.compare({"km": 12}, {"km": 12.4}), [("distance", "12 km", "12.4 km")])


class Issues(unittest.TestCase):
    NAMES = {"a": "Trail A", "b": "Trail B", "c": "Trail C"}

    def test_frequency(self):
        self.assertEqual(f.frequency({"a"}, False, {"a"}, 50), "Often")
        self.assertEqual(f.frequency({"b"}, False, {"a"}, 50), "Sometimes")
        self.assertEqual(f.frequency({"b"}, True, {"b"}, 50), "Rarely")
        self.assertEqual(f.frequency(set(map(str, range(30))), False, set(), 50), "Always")

    def test_one_issue_per_kind_and_trail_a_shared_link_once(self):
        findings = [
            {"kind": "broken", "slug": "a", "url": "https://x.org/1", "where": "website", "hidden": False, "detail": "HTTP 404"},
            {"kind": "broken", "slug": "a", "url": "https://x.org/2", "where": "source `s`", "hidden": False, "detail": "HTTP 404"},
            {"kind": "figures", "slug": "b", "url": "https://x.org/3", "where": "stage 1 ascent", "hidden": False, "detail": "record 1 m, page now 50 m"},
        ] + [{"kind": "redirect", "slug": s, "url": "https://shared.org/", "where": "source `w`", "hidden": False, "detail": "now https://shared.org/en-gb"} for s in "abc"]
        issues = f.group(findings, self.NAMES, {"b"}, 4)
        self.assertEqual([i["key"] for i in issues], ["figures:b", "broken:a", "redirect:https://shared.org/"])
        self.assertEqual([(i["severity"], i["frequency"]) for i in issues], [("Critical", "Often"), ("High", "Sometimes"), ("Low", "Always")])
        self.assertEqual(len(issues[1]["items"]), 2)
        self.assertIn("on most trails", issues[2]["title"])

    def test_the_body_carries_its_key_and_ratings(self):
        issue = f.group([{"kind": "stale", "slug": "a", "url": "https://x.org/", "where": "source `x`", "hidden": False, "detail": "retrieved 2025-01-01"}], self.NAMES, set(), 50)[0]
        text = f.body(issue, self.NAMES)
        self.assertIn("**Severity:** Medium · **Frequency:** Sometimes", text)
        self.assertIn("[source `x`](https://x.org/): retrieved 2025-01-01", text)
        self.assertIn("`data/trails/a.yaml`", text)
        self.assertTrue(text.endswith("<!-- freshness-key: stale:a -->"))


if __name__ == "__main__":
    unittest.main()
