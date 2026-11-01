"""Regression test for the map lines (issue #92): every trail's matched length and each stage's
length and coverage (`measured` in data/derived/<slug>.json, written by pipeline/routes.py) must
match the values recorded in tests/route_expectations.json. A pipeline change that moves a line
fails here until the change is checked and the expectations are rewritten on purpose:

    UPDATE_ROUTE_EXPECTATIONS=1 ~/.venvs/huckepack/bin/python -m unittest tests.test_route_regression
"""

import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = ROOT / "tests" / "route_expectations.json"
KM_TOLERANCE = 0.05  # km per stage: rounding, not a moved line
COVER_TOLERANCE = 0.005


def current():
    out = {}
    for f in sorted((ROOT / "data" / "derived").glob("*.json")):
        m = json.loads(f.read_text()).get("measured")
        if m:
            out[f.stem] = {"km": m["km"], "stages": {f"{s['number']}-{s['kind']}": [s["km"], s["covered"]] for s in m["stages"]}}
    return out


class RouteRegression(unittest.TestCase):
    def test_map_lines_unchanged(self):
        now = current()
        if os.environ.get("UPDATE_ROUTE_EXPECTATIONS"):
            EXPECTED.write_text(json.dumps(now, indent=1, sort_keys=True) + "\n")
            self.skipTest("expectations rewritten")
        expected = json.loads(EXPECTED.read_text())
        problems = []
        for slug, exp in expected.items():
            got = now.get(slug)
            if not got:
                problems.append(f"{slug}: no measured map line any more")
                continue
            for stage, (km, cover) in exp["stages"].items():
                g = got["stages"].get(stage)
                if not g:
                    problems.append(f"{slug} stage {stage}: missing")
                elif abs(g[0] - km) > KM_TOLERANCE or abs(g[1] - cover) > COVER_TOLERANCE:
                    problems.append(f"{slug} stage {stage}: {g[0]} km, {g[1]:.1%} covered (expected {km} km, {cover:.1%})")
            for stage in set(got["stages"]) - set(exp["stages"]):
                problems.append(f"{slug} stage {stage}: new")
        for slug in set(now) - set(expected):
            problems.append(f"{slug}: new trail, not in the expectations (rewrite them)")
        self.assertFalse(problems, "map lines changed:\n" + "\n".join(problems))


if __name__ == "__main__":
    unittest.main()
