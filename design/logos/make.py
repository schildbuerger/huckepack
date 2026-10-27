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


# All five are side views of a tall pack: a straight back panel on the left with the shoulder
# strap hugging it and ending in a hip-belt stub, a domed lid, and a front pocket on the right.
# (A wide body or a closed strap loop reads as a mug; keep them tall and the strap open.)

# The pixel logos share one 24 × 24 side-view silhouette, traced from logo D: strap behind
# the back panel (cols 6–7) with a hip-belt stub, body, domed lid overhanging the front, front
# pocket. Marks: # pack, L lid line, P pocket edge, p pocket inside, m mountain, . empty.
SILHOUETTE = """
........................
........................
............##..........
..........######........
.........########.......
........##########......
........###########.....
........############....
........###########.....
......#.LLLLLLLLLLL.....
......##.##########.....
......##.##########.....
......##.##########PPP..
......##.##########PpP..
......##.##########PpP..
......##.####m#####PpP..
......##.###mmm####PpP..
......##.##mmmmm###PpP..
......##.#mmmmmmm##PpP..
......#############PPP..
.........##########.....
.........##########.....
........................
........................
"""


def outline_grid(sil):
    """A: ink on the pack's edge, the lid line and the pocket edge; accent inside; soft pocket."""
    rows = sil.strip("\n").split("\n")
    filled = lambda x, y: 0 <= y < len(rows) and 0 <= x < len(rows[0]) and rows[y][x] != "."
    out = []
    for y, row in enumerate(rows):
        line = ""
        for x, c in enumerate(row):
            if c == ".":
                line += "."
            elif c in "LP":
                line += "o"
            elif c == "p":
                line += "p"
            elif not all(filled(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                line += "o"
            else:
                line += "#"
        out.append(line)
    return "\n".join(out)


def solid_grid(sil):
    """B: one colour; the mountain cut out, the lid line cut out except at its ends."""
    rows = sil.strip("\n").split("\n")
    out = []
    for row in rows:
        line = "".join("." if c == "m" else "#" if c in "#Pp" else c for c in row)
        if "L" in line:
            first, last = line.index("L"), line.rindex("L")
            line = "".join("#" if c == "L" and x in (first, last) else "." if c == "L" else c for x, c in enumerate(line))
        out.append(line)
    return "\n".join(out)


# A · pixel, 24 × 24: outlined, with lid line and soft pocket
PIXEL_PACK = outline_grid(SILHOUETTE)
# B · pixel, 24 × 24, one colour: solid, mountain cut out
PIXEL_PEAK = solid_grid(SILHOUETTE)

# C · illustrated, monoline
LINE = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{ACCENT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img">
<title>Backpack, line</title>
<path d="M9.5 21.5V7a3.5 3.5 0 0 1 3.5-3.5h1A4.5 4.5 0 0 1 18.5 8v12a1.5 1.5 0 0 1-1.5 1.5Z"/>
<path d="M9.5 9.5H16a2.5 2.5 0 0 0 2.4-1.8"/>
<path d="M18.5 13.5h.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-.5"/>
<path d="M9.5 6.5C6.8 8.5 6.6 14.5 7.4 18.8h2.1"/>
<path d="M12.5 3.6V2.3"/>
</svg>
"""

# D · illustrated, solid: silhouette with the lid line and a mountain cut out (mask)
SOLID = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Backpack, mountain</title>
<defs><mask id="hp-peak"><rect width="24" height="24" fill="#fff"/>
<path d="M10.2 9.6H16a2.6 2.6 0 0 0 2.4-1.7" fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round"/>
<path d="M10.6 20.2 13.2 15.6 14.6 17.4 15.6 16.4 18 20.2Z" fill="#000"/></mask></defs>
<path d="M9.6 6.6C6.7 8.6 6.5 14.6 7.3 19h2.4" fill="none" stroke="{ACCENT}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<g mask="url(#hp-peak)" fill="{ACCENT}">
<path d="M9 22V7a4 4 0 0 1 4-4h1.2A4.8 4.8 0 0 1 19 7.8V20.5a1.5 1.5 0 0 1-1.5 1.5Z"/>
<path d="M18.6 13h.7a1.7 1.7 0 0 1 1.7 1.7v3.6a1.7 1.7 0 0 1-1.7 1.7h-.7Z"/>
<rect x="12.6" y="1.4" width="1.4" height="2.4" rx=".7"/>
</g>
</svg>
"""

# E · illustrated, duotone: logo C's line drawing in ink, with the lid and the front pocket
# filled in accent
DUO = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
<title>Backpack, duotone</title>
<path d="M9.5 9.5V7a3.5 3.5 0 0 1 3.5-3.5h1A4.5 4.5 0 0 1 18.5 8v1.5Z" fill="{ACCENT}"/>
<path d="M18.5 13.5h.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-.5Z" fill="{ACCENT}"/>
<g fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<path d="M9.5 21.5V7a3.5 3.5 0 0 1 3.5-3.5h1A4.5 4.5 0 0 1 18.5 8v12a1.5 1.5 0 0 1-1.5 1.5Z"/>
<path d="M9.5 9.5h9"/>
<path d="M18.5 13.5h.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-.5"/>
<path d="M9.5 6.5C6.8 8.5 6.6 14.5 7.4 18.8h2.1"/>
<path d="M12.5 3.6V2.3"/>
</g>
</svg>
"""

LOGOS = {
    "a-pixel-pack": pixel_svg(PIXEL_PACK, "Backpack, pixel"),
    "b-pixel-peak": pixel_svg(PIXEL_PEAK, "Backpack with mountain, pixel"),
    "c-line": LINE,
    "d-solid-peak": SOLID,
    "e-duotone": DUO,
}

if __name__ == "__main__":
    for name, svg in LOGOS.items():
        (HERE / f"{name}.svg").write_text(svg)
        print(f"design/logos/{name}.svg  {len(svg)} bytes")
