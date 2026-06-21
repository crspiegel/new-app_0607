#!/usr/bin/env python3
"""Helper for the cutout-rig-animation skill (needs Pillow).

Usage examples:
  # 1) overlay a coordinate grid on an image to read joint pixels
  python rig-helper.py grid path/to/base.png out_grid.png

  # 2) composite layers (base first, then parts) and save — confirm it == original
  python rig-helper.py recon out_recon.png base.png arm.png head.png ...

  # 3) render a rotated extreme frame to check gaps/seams before wiring CSS
  #    each part spec is "file.png:pivotX,pivotY:angleDeg"
  python rig-helper.py rotate out_frame.png "#2b70c9" base.png \
        "arm.png:110,192:9" "head.png:146,135:3"
"""
import sys
from PIL import Image, ImageDraw


def grid(src, out):
    im = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    g = Image.alpha_composite(bg, im).convert("RGB")
    d = ImageDraw.Draw(g)
    for x in range(0, im.size[0], 25):
        d.line([(x, 0), (x, im.size[1])], fill=(255, 0, 0), width=1)
        if x % 50 == 0:
            d.text((x + 1, 1), str(x), fill=(180, 0, 0))
    for y in range(0, im.size[1], 25):
        d.line([(0, y), (im.size[0], y)], fill=(0, 0, 255), width=1)
        if y % 50 == 0:
            d.text((1, y + 1), str(y), fill=(0, 0, 180))
    g.save(out)
    print("grid ->", out, im.size)


def recon(out, layers):
    base = Image.open(layers[0]).convert("RGBA")
    c = Image.new("RGBA", base.size, (255, 255, 255, 255))
    for f in layers:
        c = Image.alpha_composite(c, Image.open(f).convert("RGBA"))
    c.convert("RGB").save(out)
    print("recon ->", out)


def _hex(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def rotate(out, bg, base, specs):
    im = Image.open(base).convert("RGBA")
    c = Image.new("RGBA", im.size, _hex(bg))
    c = Image.alpha_composite(c, im)
    for spec in specs:
        f, piv, ang = spec.split(":")
        px, py = (int(v) for v in piv.split(","))
        p = Image.open(f).convert("RGBA")
        c = Image.alpha_composite(
            c, p.rotate(float(ang), resample=Image.BICUBIC, center=(px, py))
        )
    c.convert("RGB").save(out)
    print("rotate ->", out)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "grid":
        grid(sys.argv[2], sys.argv[3])
    elif cmd == "recon":
        recon(sys.argv[2], sys.argv[3:])
    elif cmd == "rotate":
        rotate(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
    else:
        print(__doc__)
