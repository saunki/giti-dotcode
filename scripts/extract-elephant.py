"""Extract the elephant mark from the Giti logo (Illustrator .ai, PDF-compatible) into an SVG.

Usage: python scripts/extract-elephant.py [assets/logo/Logo.ai] [public/models/giti-elephant.svg]

The logo has five filled paths: the yellow plate, the divider, the outline frame, the
"Giti" lettering and the elephant. The elephant is the dark path inside the right-hand
panel; its eye and ear/trunk line are cut-outs (holes) in that same path.
"""
import sys

import pymupdf

src = sys.argv[1] if len(sys.argv) > 1 else "assets/logo/Logo.ai"
dst = sys.argv[2] if len(sys.argv) > 2 else "public/models/giti-elephant.svg"

page = pymupdf.open(src)[0]
drawings = page.get_drawings()

# the elephant: a filled path whose box sits right of the divider (x > 1340) and is not the frame
elephant = next(
    d for d in drawings
    if d.get("fill") and d["rect"].x0 > 1340 and d["rect"].width < 600
)
r = elephant["rect"]
pad = 4


def pt(p):
    return f"{p.x - r.x0 + pad:.2f} {p.y - r.y0 + pad:.2f}"


parts = []
cursor = None
for item in elephant["items"]:
    kind = item[0]
    if kind == "l":
        a, b = item[1], item[2]
        if cursor is None or abs(cursor.x - a.x) > 0.01 or abs(cursor.y - a.y) > 0.01:
            parts.append(f"M {pt(a)}")
        parts.append(f"L {pt(b)}")
        cursor = b
    elif kind == "c":
        a, c1, c2, b = item[1:5]
        if cursor is None or abs(cursor.x - a.x) > 0.01 or abs(cursor.y - a.y) > 0.01:
            parts.append(f"M {pt(a)}")
        parts.append(f"C {pt(c1)} {pt(c2)} {pt(b)}")
        cursor = b
    elif kind == "re":
        q = item[1]
        parts.append(f"M {pt(q.tl)} L {pt(q.tr)} L {pt(q.br)} L {pt(q.bl)} Z")
        cursor = None
    elif kind == "qu":
        q = item[1]
        parts.append(f"M {pt(q.ul)} L {pt(q.ur)} L {pt(q.lr)} L {pt(q.ll)} Z")
        cursor = None

fill = "#{:02x}{:02x}{:02x}".format(*(round(c * 255) for c in elephant["fill"]))
fill = {"#231916": "#000000"}.get(fill, fill)  # site uses pure black instead of the logo brown-black
rule = "evenodd" if elephant.get("even_odd") else "nonzero"
w, h = r.width + pad * 2, r.height + pad * 2
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" width="{w:.0f}" height="{h:.0f}">\n'
    f'  <path fill="{fill}" fill-rule="{rule}" d="{" ".join(parts)}"/>\n'
    f"</svg>\n"
)
with open(dst, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"wrote {dst}: {len(elephant['items'])} segments, fill {fill}, rule {rule}, {w:.0f}x{h:.0f}")
