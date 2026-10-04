"""Generate the NSIS installer artwork.

Tauri renders `headerImage` (150x57) and `sidebarImage` (164x314) inside the
Windows installer. Generating them from the same palette and mark as the app
gives a coherent install experience without hand-editing Tauri's NSIS
template -- and without the risk of an unverifiable `!define` override.

    python scripts/make_installer_images.py

These must be **BMP**, not PNG. NSIS hands them to `nsDialogs::Create`,
which loads the file with `LoadImage`; that only understands Windows
bitmaps. A PNG produces `warning 5040: Unsupported format` from makensis and
is silently discarded, so the installer falls back to the stock artwork.
"""

import math
import os
import struct

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


def rounded_bar(px, py, x0, y0, w, h, colour, radius=None):
    """Paint a rounded bar, or None when (px, py) is outside it."""
    r = radius if radius is not None else h / 2.0
    if rounded_box_sdf(px, py, x0, y0, w, h, r) <= 0:
        return colour
    return None


def ring_ticks(px, py, cx, cy, radius, count, length, width_px, opacity):
    """The 32 ticks that ring the logo mark, used as a quiet background motif."""
    dx, dy = px - cx, py - cy
    dist = math.hypot(dx, dy)
    if abs(dist - radius) > width_px:
        return None
    if dist == 0:
        return None
    angle = math.atan2(dy, dx) % (2 * math.pi)
    step = 2 * math.pi / count
    # Distance to the nearest tick centre, so each tick occupies one step.
    offset = (angle % step) - step / 2.0
    tangential = abs(offset) * dist
    if tangential > length / 2.0:
        return None
    return blend(PAPER_DEEP, INDIGO, opacity)


def render_header(width=150, height=57):
    # Centred: MUI2 lays the page title out beside the header bitmap, so
    # pushing the mark to either edge would collide with the text.
    scale = height / 64.0 * 0.86
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
                    colour = draw_mark(x, y, width / 2, height / 2, scale)
                    if colour:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        hits += 1
            if hits:
                r, g, b = r / hits, g / hits, b / hits
            else:
                r, g, b = PAPER
            row += bytes((round(r), round(g), round(b), 255))
        rows.append(bytes(row))
    return rows


def render_sidebar(width=164, height=314):
    # A wordmark-sized block of "type" beneath the mark, then the logo's tick
    # ring filling the lower half so the panel does not read as empty.
    bars = [
        (44, 150, 76, 5.0, INDIGO),
        (44, 162, 52, 4.0, blend(PAPER_DEEP, INDIGO, 0.38)),
        (44, 172, 62, 3.0, blend(PAPER_DEEP, INDIGO, 0.22)),
    ]
    mark_cy = 88.0
    mark_scale = 1.12
    ring = (width / 2, 240.0, 48.0, 32, 9.0, 1.6, 0.30)

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
                    base = blend(PAPER, PAPER_DEEP, t)
                    wash = max(0.0, 1.0 - y / 104.0) * 0.9
                    colour = blend(base, INDIGO_SOFT, wash)

                    tick = ring_ticks(
                        x,
                        y,
                        ring[0],
                        ring[1],
                        ring[2],
                        ring[3],
                        ring[4],
                        ring[5],
                        ring[6],
                    )
                    if tick:
                        colour = tick

                    for bx, by, bw, bh, bcolour in bars:
                        painted = rounded_bar(x, y, bx, by, bw, bh, bcolour)
                        if painted:
                            colour = painted

                    mark = draw_mark(x, y, width / 2, mark_cy, mark_scale)
                    if mark:
                        colour = mark

                    r += colour[0]
                    g += colour[1]
                    b += colour[2]
                    hits += 1
            r, g, b = r / hits, g / hits, b / hits
            row += bytes((round(r), round(g), round(b), 255))
        rows.append(bytes(row))
    return rows


def encode_bmp24(width, height, rows):
    """Encode RGBA rows as a bottom-up, uncompressed 24-bit Windows bitmap.

    24-bit rather than 32-bit: every pixel here is fully opaque, so nothing is
    lost, and it is the variant `LoadImage` accepts everywhere.
    """
    stride = (width * 3 + 3) // 4 * 4
    padding = b"\x00" * (stride - width * 3)

    pixels = bytearray()
    for row in reversed(rows):
        line = bytearray()
        for px in range(width):
            r, g, b, _a = row[px * 4 : px * 4 + 4]
            line += bytes((b, g, r))  # BMP stores BGR
        pixels += line + padding

    file_header = struct.pack("<2sIHHI", b"BM", 14 + 40 + len(pixels), 0, 0, 54)
    info_header = struct.pack(
        "<IiiHHIIiiII",
        40,  # biSize
        width,  # biWidth
        height,  # biHeight (positive => bottom-up)
        1,  # biPlanes
        24,  # biBitCount
        0,  # biCompression = BI_RGB
        len(pixels),
        2835,  # ~72 DPI
        2835,
        0,  # biClrUsed
        0,  # biClrImportant
    )
    return file_header + info_header + bytes(pixels)


def main():
    out_dir = os.path.join("src-tauri", "installer-assets")
    os.makedirs(out_dir, exist_ok=True)

    header = encode_bmp24(150, 57, render_header())
    with open(os.path.join(out_dir, "header.bmp"), "wb") as fh:
        fh.write(header)
    print(f"wrote header.bmp (150x57, 24-bit, {len(header)} bytes)")

    sidebar = encode_bmp24(164, 314, render_sidebar())
    with open(os.path.join(out_dir, "sidebar.bmp"), "wb") as fh:
        fh.write(sidebar)
    print(f"wrote sidebar.bmp (164x314, 24-bit, {len(sidebar)} bytes)")


if __name__ == "__main__":
    main()