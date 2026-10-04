"""Generate the HyperClicker app icons.

Tauri needs these files to compile the Windows resource section. They are
generated from scratch here (pure stdlib: zlib + struct) so there is no binary
blob checked in that nobody can regenerate.

IMPORTANT: this draws the *same geometry* as `src/components/Logo.tsx`, so the
taskbar/exe icon matches the in-app logo. If you change the mark, change it in
both places.

    python scripts/make_icons.py
"""

import math
import os
import struct
import zlib

# --- palette (kept in step with the CSS design tokens) ---------------------
BADGE_FROM = (255, 255, 255)
BADGE_TO = (230, 233, 251)
INDIGO = (67, 56, 202)
INK = (28, 25, 23)
TEAL = (15, 118, 110)

# --- geometry, in a 64x64 design space -------------------------------------
BADGE = (3.0, 3.0, 58.0, 58.0, 15.0)  # x, y, w, h, corner radius
BADGE_STROKE = 1.6
BADGE_STROKE_ALPHA = 0.42

TICK_COUNT = 32
MAJOR_EVERY = 4
TICK_R2 = 28.5

RINGS = ((20.0, 1.8, 0.42), (13.5, 1.5, 0.20))

ARROW = ((24.6, 21.4), (42.4, 30.6), (35.0, 32.5), (32.1, 40.3))
DOT_RADIUS = 2.6

SS = 3  # supersampling factor per axis


def rounded_box_sdf(px, py, x, y, w, h, r):
    """Signed distance to a rounded rectangle. Negative inside."""
    cx, cy = x + w / 2.0, y + h / 2.0
    qx = abs(px - cx) - (w / 2.0 - r)
    qy = abs(py - cy) - (h / 2.0 - r)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


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
    return (
        dst[0] + (src[0] - dst[0]) * alpha,
        dst[1] + (src[1] - dst[1]) * alpha,
        dst[2] + (src[2] - dst[2]) * alpha,
    )


def shade(px, py):
    """Colour at a point in 64x64 design space, as (r, g, b, a)."""
    bx, by, bw, bh, br = BADGE

    # 1. Badge fill: diagonal gradient between the two stops.
    t = max(0.0, min(1.0, (px + py) / 128.0))
    base = tuple(
        BADGE_FROM[i] + (BADGE_TO[i] - BADGE_FROM[i]) * t for i in range(3)
    )
    alpha = 1.0

    # 2. Ticks.
    for i in range(TICK_COUNT):
        angle = (i / TICK_COUNT) * math.tau - math.pi / 2
        major = i % MAJOR_EVERY == 0
        r1 = 24.0 if major else 25.6
        a0 = (32 + math.cos(angle) * r1, 32 + math.sin(angle) * r1)
        a1 = (32 + math.cos(angle) * TICK_R2, 32 + math.sin(angle) * TICK_R2)
        half = (1.8 if major else 1.1) / 2.0
        if segment_distance(px, py, a0[0], a0[1], a1[0], a1[1]) <= half:
            base = blend(base, INDIGO, 0.5 if major else 0.26)

    # 3. Pulse rings.
    for radius, width, opacity in RINGS:
        if abs(math.hypot(px - 32, py - 32) - radius) <= width / 2.0:
            base = blend(base, INDIGO, opacity)

    # 4. Click arrow, with a light inner stroke to lift it off the rings.
    if point_in_polygon(px, py, ARROW):
        base = INK

    # 5. Click point.
    if math.hypot(px - 32, py - 32) <= DOT_RADIUS:
        base = TEAL

    # 6. Badge outline last so it always sits on top of the inner detail.
    sd = rounded_box_sdf(px, py, bx, by, bw, bh, br)
    if abs(sd) <= BADGE_STROKE / 2.0:
        base = blend(base, INDIGO, BADGE_STROKE_ALPHA)

    # Clip everything to the badge silhouette.
    if rounded_box_sdf(px, py, bx, by, bw, bh, br) > 0:
        alpha = 0.0

    return (base[0], base[1], base[2], alpha)


def render(size):
    scale = size / 64.0
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0.0
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    dx = (px + (sx + 0.5) / SS) / scale
                    dy = (py + (sy + 0.5) / SS) / scale
                    cr, cg, cb, ca = shade(dx, dy)
                    hits += ca
                    r += cr * ca
                    g += cg * ca
                    b += cb * ca
            total = SS * SS
            alpha = hits / total
            if alpha > 0:
                r, g, b = r / hits, g / hits, b / hits
            row += bytes(
                (
                    round(max(0.0, min(255.0, r))),
                    round(max(0.0, min(255.0, g))),
                    round(max(0.0, min(255.0, b))),
                    round(max(0.0, min(1.0, alpha)) * 255),
                )
            )
        rows.append(bytes(row))
    return rows


def encode_png(size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(kind, data):
        body = struct.pack(">I", len(data)) + kind + data
        return body + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def encode_ico(images):
    """Wrap PNG blobs into an ICO (Vista+ permits embedded PNG entries)."""
    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    directory = b""
    payload = b""
    for size, blob in images:
        dim = size if size < 256 else 0
        directory += struct.pack(
            "<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset
        )
        payload += blob
        offset += len(blob)
    return header + directory + payload


def main():
    out_dir = os.path.join("src-tauri", "icons")
    os.makedirs(out_dir, exist_ok=True)

    cache = {}

    def png_for(size):
        if size not in cache:
            cache[size] = encode_png(size, render(size))
        return cache[size]

    for name, size in {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }.items():
        with open(os.path.join(out_dir, name), "wb") as fh:
            fh.write(png_for(size))
        print(f"wrote {name} ({size}x{size})")

    sizes = [16, 24, 32, 48, 64, 128, 256]
    ico = encode_ico([(s, png_for(s)) for s in sizes])
    with open(os.path.join(out_dir, "icon.ico"), "wb") as fh:
        fh.write(ico)
    print(f"wrote icon.ico ({len(ico)} bytes, {len(sizes)} sizes)")


if __name__ == "__main__":
    main()