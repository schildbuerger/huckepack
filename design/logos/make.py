"""Logo proposals for huckepack: writes one SVG per proposal into this folder.

    python3 design/logos/make.py

Colours are CSS variables with fallbacks, so the files work standalone (terracotta and ink)
and follow the site's theme when inlined: --logo-ink, --logo-accent, --logo-soft.
Pixel logos are drawn from the grids below: o = ink, # = accent, p = soft accent, . = empty.
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent
INK = "var(--logo-ink, #2a221d)"
ACCENT = "var(--logo-accent, #b0502a)"
SOFT = "var(--logo-soft, #e8b79c)"
COLOURS = {"o": INK, "#": ACCENT, "p": SOFT}


def pixel_svg(grid, title):
    """One rect per horizontal run of a colour; crisp edges at any size."""
    rows = [r for r in grid.strip("\n").split("\n")]
    w, h = len(rows[0]), len(rows)
    assert all(len(r) == w for r in rows), f"{title}: rows differ in width"
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < w:
            c = row[x]
            run = 1
            while x + run < w and row[x + run] == c:
                run += 1
            if c in COLOURS:
                rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{COLOURS[c]}"/>')
            x += run
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges" role="img">'
        f"<title>{title}</title>{''.join(rects)}</svg>\n"
    )


# A · pixel, 16 × 16: front view with a carry loop, outline in ink, pocket with a buckle
PIXEL_PACK = """
................
......oooo......
.....o....o.....
....oooooooo....
...o########o...
..o##########o..
..o##########o..
..o#oooooooo#o..
..o#oppppppo#o..
..o#oppooppo#o..
..o#oppppppo#o..
..o#oooooooo#o..
..o##########o..
...oooooooooo...
...oo......oo...
................
"""

# B · pixel, 12 × 12: solid silhouette, a mountain cut out of the front
PIXEL_PEAK = """
....####....
...#....#...
..########..
.##########.
.##########.
.#####.####.
.####...###.
.###.....##.
.##########.
.##########.
..########..
..##....##..
"""

# C · illustrated, monoline: body, carry loop, flap and pocket, round caps
LINE = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img">
<title>Backpack, line</title>
<path d="M9.5 7V5.5a2.5 2.5 0 0 1 5 0V7"/>
<rect x="5" y="7" width="14" height="14" rx="4"/>
<path d="M5 12c4.5 1.6 9.5 1.6 14 0"/>
<rect x="8.5" y="15" width="7" height="3.5" rx="1.2"/>
</svg>
"""

# D · illustrated, solid: silhouette with a flap line and a mountain cut out (mask); a wide flat
# handle and shoulder-strap tabs keep it from reading as a padlock
SOLID = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Backpack, mountain</title>
<defs><mask id="hp-peak"><rect width="24" height="24" fill="#fff"/>
<path d="M5.6 12.2c4.2 1.7 8.6 1.7 12.8 0" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round"/>
<path d="M7.5 19.5 10.8 15.2 12.5 17 13.8 15.8 16.5 19.5Z" fill="#000"/></mask></defs>
<g mask="url(#hp-peak)" fill="{ACCENT}">
<path d="M8 8V6.6A2.1 2.1 0 0 1 10.1 4.5h3.8A2.1 2.1 0 0 1 16 6.6V8h-1.6V6.8a.7.7 0 0 0-.7-.7h-3.4a.7.7 0 0 0-.7.7V8Z"/>
<rect x="4.5" y="7.5" width="15" height="14" rx="3.5"/>
<rect x="2.6" y="11" width="2.6" height="7" rx="1.2"/>
<rect x="18.8" y="11" width="2.6" height="7" rx="1.2"/>
</g>
</svg>
"""

# E · illustrated, two-tone: a thru-hiker's pack with a rolled sleeping mat on top
MAT = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Backpack, sleeping mat</title>
<rect x="4" y="3" width="16" height="4.5" rx="2.25" fill="{SOFT}"/>
<path d="M8 3v4.5M16 3v4.5" stroke="{INK}" stroke-width="1.2"/>
<rect x="5" y="8.5" width="14" height="13" rx="3.5" fill="{ACCENT}"/>
<path d="M5.5 13.5c4.3 1.4 8.7 1.4 13 0" fill="none" stroke="{INK}" stroke-width="1.2" stroke-linecap="round"/>
<rect x="8.5" y="16" width="7" height="3.5" rx="1.2" fill="none" stroke="{INK}" stroke-width="1.2"/>
</svg>
"""

LOGOS = {
    "a-pixel-pack": pixel_svg(PIXEL_PACK, "Backpack, pixel"),
    "b-pixel-peak": pixel_svg(PIXEL_PEAK, "Backpack with mountain, pixel"),
    "c-line": LINE,
    "d-solid-peak": SOLID,
    "e-mat": MAT,
}

if __name__ == "__main__":
    for name, svg in LOGOS.items():
        (HERE / f"{name}.svg").write_text(svg)
        print(f"design/logos/{name}.svg  {len(svg)} bytes")
