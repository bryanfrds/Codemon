"""Turn Pixmon PNGs into game-ready sprites: transparent, trimmed, downscaled.

The pack ships 256x256 art on a solid white field. A global white-key would also
punch holes in white bellies and eyes, so the background is removed by flooding
inward from the edges instead - only white connected to the border goes.
"""
import glob, os, sys
from collections import deque
from PIL import Image

OUT = os.path.expanduser("~/pokemon-wannabe/assets/pixmons")
SIZE = 96          # plenty for a 500px battle canvas, and small on disk
NEAR_WHITE = 232   # every channel at least this counts as background

def strip_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        r, g, b, a = px[x, y]
        if not (r >= NEAR_WHITE and g >= NEAR_WHITE and b >= NEAR_WHITE):
            continue
        seen[y][x] = True
        px[x, y] = (r, g, b, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img

def main(count):
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob("pixmons/*.png"))[:count]
    for i, f in enumerate(files):
        img = strip_background(Image.open(f))
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        # Fit inside a square without distorting, then centre it.
        img.thumbnail((SIZE, SIZE), Image.LANCZOS)
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))
        canvas.save(os.path.join(OUT, f"{i:03d}.png"))
    print(f"wrote {len(files)} sprites to {OUT}")

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
