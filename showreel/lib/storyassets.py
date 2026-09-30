"""Background + card mask for Story cuts (1080x1920): black with the app's blue/pink glows,
an RGB ring around the video card, and a clear band under the card for IG stickers.
  python3 lib/storyassets.py OUT_DIR  ->  story_bg.ppm, story_mask.pgm
Numbers are shared with stories.mjs (CARD)."""
import sys, os
import numpy as np

W, H = 1080, 1920
CARD = dict(x=195, y=210, w=690, h=1228, r=38)   # 0.64 of a 9:16 frame; sticker band ~1460-1670
GAMA = np.array([[47, 160, 255], [166, 92, 255], [255, 61, 174], [37, 232, 200], [47, 160, 255]], float)


def rr_dist(px, py, x, y, w, h, r):
    """Signed distance to a rounded rect (negative inside)."""
    cx, cy = x + w / 2, y + h / 2
    qx = np.abs(px - cx) - (w / 2 - r)
    qy = np.abs(py - cy) - (h / 2 - r)
    out = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    ins = np.minimum(np.maximum(qx, qy), 0)
    return out + ins - r


def main(out):
    os.makedirs(out, exist_ok=True)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    for (gx, gy, rad, col, a) in [(-60, 260, 900, (47, 160, 255), 0.30), (1140, 1760, 950, (255, 61, 174), 0.24), (540, 1560, 520, (166, 92, 255), 0.08)]:
        d = np.hypot(xx - gx, yy - gy) / rad
        f = np.clip(1 - d, 0, 1) ** 2 * a
        img += f[..., None] * np.array(col, np.float32)
    c = CARD
    d = rr_dist(xx, yy, c["x"] - 9, c["y"] - 9, c["w"] + 18, c["h"] + 18, c["r"] + 9)
    ring = np.clip(1 - np.abs(d + 1.5) / 1.8, 0, 1)
    ang = (np.arctan2(yy - (c["y"] + c["h"] / 2), xx - (c["x"] + c["w"] / 2)) / (2 * np.pi) + 0.25) % 1 * 4
    i0 = np.floor(ang).astype(int)
    fr = (ang - i0)[..., None]
    rc = GAMA[i0] * (1 - fr) + GAMA[i0 + 1] * fr
    glow = np.clip(1 - np.abs(d) / 40, 0, 1) ** 3 * 0.35
    img = img * (1 - ring[..., None]) + rc * ring[..., None] + rc * glow[..., None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    with open(os.path.join(out, "story_bg.ppm"), "wb") as f:
        f.write(b"P6 %d %d 255\n" % (W, H)); f.write(img.tobytes())
    my, mx = np.mgrid[0:c["h"], 0:c["w"]].astype(np.float32)
    md = rr_dist(mx + 0.5, my + 0.5, 0, 0, c["w"], c["h"], c["r"])
    m = (np.clip(0.5 - md, 0, 1) * 255).astype(np.uint8)
    with open(os.path.join(out, "story_mask.pgm"), "wb") as f:
        f.write(b"P5 %d %d 255\n" % (c["w"], c["h"])); f.write(m.tobytes())


if __name__ == "__main__":
    main(sys.argv[1])
