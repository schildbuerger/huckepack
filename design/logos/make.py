"""Logo proposals for huckepack: pictograms in pixel art and stencil style, one SVG each.

    python3 design/logos/make.py

Colours are CSS variables with fallbacks, so the files work standalone (terracotta and ink)
and follow the site's theme when inlined: --logo-ink, --logo-accent, --logo-soft.
Pixel logos are drawn from the grids below: o = ink, # = accent, p = soft accent, . = empty.
Small grids (12 × 12) on purpose: a pictogram has to survive at 16 px.
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent
INK = "var(--logo-ink, #2a221d)"
ACCENT = "var(--logo-accent, #b0502a)"
SOFT = "var(--logo-soft, #e8b79c)"
COLOURS = {"o": INK, "#": ACCENT, "p": SOFT}


def pixel_svg(grid, title):
    """One rect per horizontal run of a colour; crisp edges at any size."""
    rows = grid.strip("\n").split("\n")
    w, h = len(rows[0]), len(rows)
    assert all(len(r) == w for r in rows), f"{title}: rows differ in width"
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < w:
            c, run = row[x], 1
            while x + run < w and row[x + run] == c:
                run += 1
            if c in COLOURS:
                rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{COLOURS[c]}"/>')
            x += run
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges" role="img">'
        f"<title>{title}</title>{''.join(rects)}</svg>\n"
    )


# A · cairn, pixel: four flat stones stacked, wider towards the ground and set off-centre in
# turn, each carried "huckepack" by the one below; one-pixel gaps keep them apart
CAIRN = """
............
.....##.....
....####....
............
...####.....
..######....
............
....######..
...########.
............
..########..
.##########.
"""

# B · tent, pixel: an A-frame with a dark door, a pole tip and the ground
TENT = """
............
............
............
......o.....
.....##.....
....####....
...######...
..###oo###..
.###oooo###.
###oooooo###
oooooooooooo
............
"""

# C · signpost, pixel: an ink post with two accent boards pointing opposite ways
SIGNPOST = """
.....oo.....
.....oo####.
.....oo#####
.....oo####.
.....oo.....
.####oo.....
#####oo.....
.####oo.....
.....oo.....
.....oo.....
.....oo.....
....oooo....
"""

# D · stencil: a peak with the switchback trail cut out
PEAK = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Peak with trail, stencil</title>
<defs><mask id="hp-trail"><rect width="24" height="24" fill="#fff"/>
<path d="M12 21.5 9.4 18.6l5.2-2.6-3.8-2.6 2.2-2" fill="none" stroke="#000" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></mask></defs>
<path mask="url(#hp-trail)" d="M12 3 22.5 21H1.5Z" fill="{ACCENT}"/>
</svg>
"""

# E · stencil "h": the stem, a stencil gap, then the arch as a peak, with a pointed inner arch
MONOGRAM = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Letter h with a mountain, stencil</title>
<rect x="3.5" y="2.5" width="4.5" height="19" fill="{ACCENT}"/>
<path d="M9.3 21.5V13.4L14.4 8.3 20.5 14.4V21.5H16.6V17.2L14.4 14.6 13.2 16.2V21.5Z" fill="{ACCENT}"/>
</svg>
"""

LOGOS = {
    "a-cairn": pixel_svg(CAIRN, "Cairn, pixel"),
    "b-tent": pixel_svg(TENT, "Tent, pixel"),
    "c-signpost": pixel_svg(SIGNPOST, "Signpost, pixel"),
    "d-peak-stencil": PEAK,
    "e-h-stencil": MONOGRAM,
}

if __name__ == "__main__":
    for old in HERE.glob("*.svg"):
        old.unlink()
    for name, svg in LOGOS.items():
        (HERE / f"{name}.svg").write_text(svg)
        print(f"design/logos/{name}.svg  {len(svg)} bytes")
