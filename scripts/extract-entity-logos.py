#!/usr/bin/env python3
"""Rebuild brand/assets/{fvo,on}/ from the entities' official brand-guide PDFs.

The logo artwork in brand/assets/ is cut from the vector pages of each
entity's brand guide (no separate logo package was supplied), rendered at
high DPI on a transparent ground, recolored to the guide's published HEX
values (poppler's CMYK->RGB conversion drifts), and exported in the variants
apps need. Re-run this when a guide revision lands:

    python3 -I scripts/extract-entity-logos.py \
        --fvo FVO_BrandGuidelines_Sept2026.pdf \
        --on  OrthoNebraska_Brand_Guidelines.pdf

Requires poppler-utils (pdftocairo) and Pillow. Crop boxes are in points on
the guide pages they name; if a revision moves the artwork, adjust them.
The guides themselves are not committed (this repo is public).
"""
import argparse, os, subprocess, tempfile
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "brand", "assets")
DPI = 1200
LOGO_H = 240   # header lockups: 2x+ for a 32-48px UI height
MARK_H = 512
ICON = 222     # favicon canvas, same as the Sequel swoosh icon.png


def render(pdf, page, tmp):
    out = os.path.join(tmp, f"p{page}")
    subprocess.run(["pdftocairo", "-png", "-transp", "-r", str(DPI), "-f", str(page),
                    "-l", str(page), "-singlefile", pdf, out], check=True)
    return Image.open(out + ".png").convert("RGBA")


def cut(page_img, box_pt):
    s = DPI / 72
    im = page_img.crop(tuple(round(v * s) for v in box_pt))
    return im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())


def nearest_recolor(im, mapping):
    """Map each opaque-ish pixel to the official hex of its nearest rendered color."""
    src = [(tuple(k), tuple(int(v[i:i + 2], 16) for i in (1, 3, 5))) for k, v in mapping.items()]
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            _, to = min(src, key=lambda kv: sum((c - d) ** 2 for c, d in zip(kv[0], (r, g, b))))
            px[x, y] = (*to, a)
    return im


def split_x(im):
    """Column index where the mark ends and the wordmark begins (first transparent gap)."""
    a = im.getchannel("A")
    cols = [any(a.getpixel((x, y)) > 8 for y in range(0, im.height, 2)) for x in range(im.width)]
    seen = False
    for x, filled in enumerate(cols):
        if filled:
            seen = True
        elif seen and x > im.width * 0.1:
            return x
    raise SystemExit("no mark/wordmark gap found")


def fill(im, hex_, region=None):
    rgb = tuple(int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    out = im.copy()
    x0 = region[0] if region else 0
    x1 = region[1] if region else im.width
    px = out.load()
    for y in range(out.height):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (*rgb, a)
    return out


def save(im, path, height=None, square=None):
    if square:
        im.thumbnail((square - 16, square - 16), Image.LANCZOS)
        c = Image.new("RGBA", (square, square), (0, 0, 0, 0))
        c.paste(im, ((square - im.width) // 2, (square - im.height) // 2), im)
        im = c
    elif height:
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    im.save(path, optimize=True)
    print(os.path.relpath(path, os.path.join(ROOT, "..", "..")), im.size)


def fvo(pdf, tmp):
    d = os.path.join(ROOT, "fvo")
    # Rendered (poppler) -> official guide HEX (p.8): 627 dark, 6159 mid, 7479 light.
    official = {(9, 35, 27): "#14332D", (33, 115, 78): "#177255", (76, 192, 109): "#14C579"}
    p2, p3 = render(pdf, 2, tmp), render(pdf, 3, tmp)
    primary = nearest_recolor(cut(p2, (294, 156, 564, 218)), official)  # Primary Logo, p.2
    mark = nearest_recolor(cut(p3, (390, 600, 462, 667)), official)     # Icon-Only Mark, p.3
    gap = split_x(primary)
    save(primary, os.path.join(d, "logo-color.png"), LOGO_H)
    # Dark grounds: the guide's "on black" variation — green mark, white wordmark (p.2).
    save(fill(primary, "#FFFFFF", (gap, primary.width)), os.path.join(d, "logo-reverse.png"), LOGO_H)
    save(fill(primary, "#FFFFFF"), os.path.join(d, "logo-white.png"), LOGO_H)
    save(mark, os.path.join(d, "mark.png"), MARK_H)
    save(mark, os.path.join(d, "icon.png"), square=ICON)


def on(pdf, tmp):
    d = os.path.join(ROOT, "on")
    p4 = render(pdf, 4, tmp)
    vertical = cut(p4, (30, 144, 163, 194))   # Vertical (Preferred), p.4
    icon = cut(p4, (324, 144, 396, 204))      # Icon, p.4
    gap = split_x(vertical)
    # The gradient mark is kept as rendered; the wordmark is the custom-mix navy.
    color = fill(vertical, "#25245C", (gap, vertical.width))
    save(color, os.path.join(d, "logo-color.png"), LOGO_H)
    save(fill(vertical, "#FFFFFF", (gap, vertical.width)), os.path.join(d, "logo-reverse.png"), LOGO_H)
    save(fill(vertical, "#FFFFFF"), os.path.join(d, "logo-white.png"), LOGO_H)
    save(icon, os.path.join(d, "mark.png"), MARK_H)
    save(icon, os.path.join(d, "icon.png"), square=ICON)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fvo")
    ap.add_argument("--on")
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        if args.fvo:
            fvo(args.fvo, tmp)
        if args.on:
            on(args.on, tmp)
