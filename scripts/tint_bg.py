"""Derive area backdrops from the forest plate by shifting hue and value.

Placeholders so each area reads differently while the rotation is wired up -
drop real art over these files and nothing else has to change.
"""
import os
from PIL import Image

SRC = os.path.expanduser("~/pokemon-wannabe/assets/bg/forest.png")
OUT = os.path.expanduser("~/pokemon-wannabe/assets/bg")

# name -> (hue shift in degrees, saturation x, value x)
VARIANTS = {
    "hills.png":  (-28, 0.85, 1.05),   # dry olive slopes
    "lake.png":   (118, 0.90, 0.95),   # cool blue water
    "canyon.png": (-95, 0.95, 0.88),   # red rock, dimmer
}

def tint(img, deg, sat, val):
    hsv = img.convert("RGB").convert("HSV")
    h, s, v = hsv.split()
    shift = int(deg / 360 * 255) % 255
    h = h.point(lambda p: (p + shift) % 255)
    s = s.point(lambda p: min(255, int(p * sat)))
    v = v.point(lambda p: min(255, int(p * val)))
    return Image.merge("HSV", (h, s, v)).convert("RGB")

src = Image.open(SRC)
for name, (deg, sat, val) in VARIANTS.items():
    tint(src, deg, sat, val).save(os.path.join(OUT, name))
    print("wrote", name)
