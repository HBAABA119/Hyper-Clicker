"""Generate the NSIS installer artwork.

Tauri renders `headerImage` (150x57) and `sidebarImage` (164x314) inside the
Windows installer. Generating them from the same palette and mark as the app
gives a coherent install experience without hand-editing Tauri's NSIS
template -- and without the risk of an unverifiable `!define` override.

    python scripts/make_installer_images.py
"""

import math
import os
import struct
import zlib

PAPER = (244, 242, 238)
PAPER_DEEP = (235, 232, 226)
INDIGO = (67, 56, 202)
INDIGO_SOFT = (238, 242, 255)
INK = (28, 25, 23)
TEAL = (15, 118, 110)

SS = 3


def rounded_box_sdf(px, py, x, y, w, h, r):
    cx, cy = x + w / 2.0, y + h / 2.0
    qx = abs(px - cx) - (w / 2.0 - r)
    qy = abs(py - cy) - (h / 2.0 - r)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def point_in_polygon(px, py, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > py) != (y2 > py):
            x_at = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if px < x_at:
                inside = not inside
    return inside


def blend(dst, src, alpha):
    return tuple(dst[i] + (src[i] - dst[i]) * alpha for i in range(3))


def draw_mark(px, py, cx, cy, scale):
    """The app mark, centred on (cx, cy) at `scale` of its 64-unit design."""
    dx = (px - cx) / scale + 32.0
    dy = (py - cy) / scale + 32.0

    colour = None
    # Rings
    for radius, opacity in ((20.0, 0.42), (13.5, 0.20)):
        if abs(math.hypot(dx - 32, dy - 32) - radius) <= 0.9 * scale:
            colour = blend(colour or PAPER, INDIGO, opacity)

    # Arrow
    arrow = [
        (24.6, 21.4),
        (42.4, 30.6),
        (35.0, 32.5),
        (32.1, 40.3),
    ]
    scaled = [(cx + (x - 32) * scale, cy + (y - 32) * scale) for x, y in arrow]
    if point_in_polygon(px, py, scaled):
        colour = INK

    # Click point
    if math.hypot(px - cx, py - cy) <= 2.6 * scale:
        colour = TEAL

    return colour


def render_header(width=150, height=57):
    rows = []
    for py in range(height):
        row = bytearray()
        for px in range(width):
            r = g = b = 0.0
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    colour = draw_mark(x, y, width * 0.30, height * 0.5, height / 64.0 * 0.82)
                    if colour:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        hits += 1
            total = SS * SS
            if hits:
                r, g, b = r / hits, g / hits, b / hits
            else:
                r, g, b = PAPER
            row += bytes((round(r), round(g), round(b), 255))
        rows.append(bytes(row))
    return rows


def render_sidebar(width=164, height=314):
    rows = []
    for py in range(height):
        row = bytearray()
        for px in range(width):
            r = g = b = 0.0
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS

                    # Vertical paper gradient with an indigo wash up top.
                    t = min(1.0, y / height)
                    base = [
                        PAPER[i] + (PAPER_DEEP[i] - PAPER[i]) * t for i in range(3)
                    ]
                    wash = max(0.0, 1.0 - y / 90.0) * 0.85
                    colour = blend(base, INDIGO_SOFT, wash)

                    mark = draw_mark(x, y, width / 2, 74, 0.92)
                    if mark:
                        colour = mark

                    # Accent rules beneath the mark.
                    if abs(y - 128) < 1.0 and 40 < x < width - 40:
                        colour = INDIGO
                    if abs(y - 138) < 1.0 and 62 < x < width - 62:
                        colour = blend(colour, INDIGO, 0.35)
                    if abs(y - 146) < 1.0 and 48 < x < width - 48:
                        colour = blend(colour, INDIGO, 0.2)

                    r += colour[0]
                    g += colour[1]
                    b += colour[2]
                    hits += 1
            total = SS * SS
            r, g, b = r / hits, g / hits, b / hits
            row += bytes((round(r), round(g), round(b), 255))
        rows.append(bytes(row))
    return rows


def encode_png(width, height, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(kind, data):
        body = struct.pack(">I", len(data)) + kind + data
        return body + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    out_dir = os.path.join("src-tauri", "installer-assets")
    os.makedirs(out_dir, exist_ok=True)

    header = encode_png(150, 57, render_header())
    with open(os.path.join(out_dir, "header.png"), "wb") as fh:
        fh.write(header)
    print(f"wrote header.png (150x57, {len(header)} bytes)")

    sidebar = encode_png(164, 314, render_sidebar())
    with open(os.path.join(out_dir, "sidebar.png"), "wb") as fh:
        fh.write(sidebar)
    print(f"wrote sidebar.png (164x314, {len(sidebar)} bytes)")


if __name__ == "__main__":
    main()