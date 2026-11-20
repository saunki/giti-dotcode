"""Extract the full Giti logo (all filled paths, original colours) from the .ai into an SVG.

Usage: python scripts/extract-logo.py [assets/logo/Logo.ai] [public/brand/giti-logo.svg]
"""
import os
import sys

import pymupdf

src = sys.argv[1] if len(sys.argv) > 1 else "assets/logo/Logo.ai"
dst = sys.argv[2] if len(sys.argv) > 2 else "public/brand/giti-logo.svg"

drawings = [d for d in pymupdf.open(src)[0].get_drawings() if d.get("fill")]
x0 = min(d["rect"].x0 for d in drawings)
y0 = min(d["rect"].y0 for d in drawings)
x1 = max(d["rect"].x1 for d in drawings)
y1 = max(d["rect"].y1 for d in drawings)


def pt(p):
    return f"{p.x - x0:.2f} {p.y - y0:.2f}"


paths = []
for d in drawings:
    parts, cursor = [], None
    for item in d["items"]:
        kind = item[0]
        if kind in ("l", "c"):
            a, b = item[1], item[-1]
            if cursor is None or abs(cursor.x - a.x) > 0.01 or abs(cursor.y - a.y) > 0.01:
                parts.append(f"M {pt(a)}")
            parts.append(f"L {pt(b)}" if kind == "l" else f"C {pt(item[2])} {pt(item[3])} {pt(b)}")
            cursor = b
        elif kind == "re":
            q = item[1]
            parts.append(f"M {pt(q.tl)} L {pt(q.tr)} L {pt(q.br)} L {pt(q.bl)} Z")
            cursor = None
        elif kind == "qu":
            q = item[1]
            parts.append(f"M {pt(q.ul)} L {pt(q.ur)} L {pt(q.lr)} L {pt(q.ll)} Z")
            cursor = None
    fill = "#{:02x}{:02x}{:02x}".format(*(round(c * 255) for c in d["fill"]))
    fill = {"#231916": "#000000"}.get(fill, fill)  # site uses pure black instead of the logo brown-black
    rule = "evenodd"  # the frame and letter counters are drawn as same-direction holes
    paths.append(f'  <path fill="{fill}" fill-rule="{rule}" d="{" ".join(parts)}"/>')
    print(fill, rule, d["rect"])

os.makedirs(os.path.dirname(dst), exist_ok=True)
w, h = x1 - x0, y1 - y0
with open(dst, "w", encoding="utf-8") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}">\n' + "\n".join(paths) + "\n</svg>\n")
print(f"wrote {dst} {w:.0f}x{h:.0f}")
