"""Find the balloon numbers on the ST6P drawings (forst-st6p-<nn>.png) so the finder can make them clickable.

Balloons are found as circles (OpenCV Hough) whose outline is drawn all the way round, then the
number inside each is read by matching its digits against digits drawn in a few similar fonts
(Tesseract misreads single digits in rings), turned upright first on the pages printed sideways. Only numbers that are item
numbers in that drawing's parts list are kept.
Writes balloons.json: {page: {"wh": [w, h], "m": [[number, x1, y1, x2, y2], ...]}}.
"""
import json
import re

import cv2
import numpy as np
from PIL import Image


# Drawings whose numbers are printed sideways (read top to bottom after turning a quarter clockwise).
SIDEWAYS = {1, 3, 9, 10, 13}


FONTS = [
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf',
]
GLYPH = (20, 28)


def norm(mask):
    """A glyph's ink, trimmed and scaled to GLYPH (float 0-1)."""
    ys, xs = np.nonzero(mask)
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    h, w = m.shape
    # Keep the shape: pad to the glyph box's proportions before scaling (a "1" stays thin).
    ratio = GLYPH[0] / GLYPH[1]
    if w / h < ratio:
        pad = int((h * ratio - w) / 2)
        m = cv2.copyMakeBorder(m, 0, 0, pad, pad, cv2.BORDER_CONSTANT, value=0)
    else:
        pad = int((w / ratio - h) / 2)
        m = cv2.copyMakeBorder(m, pad, pad, 0, 0, cv2.BORDER_CONSTANT, value=0)
    return cv2.resize(m, GLYPH, interpolation=cv2.INTER_AREA).astype(float) / 255


def templates():
    from PIL import Image, ImageDraw, ImageFont
    out = []
    for path in FONTS:
        try:
            font = ImageFont.truetype(path, 80)
        except OSError:
            continue
        for ch in '0123456789a':
            im = Image.new('L', (120, 120), 0)
            ImageDraw.Draw(im).text((20, 10), ch, fill=255, font=font)
            out.append((ch, norm(np.array(im) > 128)))
    return out


TEMPLATES = None


def classify(mask):
    """Best character for one glyph and how well it matched (0-1)."""
    g = norm(mask)
    best = ('', 0.0)
    for ch, t in TEMPLATES:
        score = 1 - np.abs(g - t).mean() * 2
        if score > best[1]:
            best = (ch, score)
    return best


def read(crop, sideways, tall=0.12):
    """The number inside one balloon: (text, worst glyph score)."""
    best = ('', 0.0)
    for rot in ((cv2.ROTATE_90_CLOCKWISE,) if sideways else (None,)):
        # One way round only: turning both ways would let a 6 read as a 9.
        im = crop if rot is None else cv2.rotate(crop, rot)
        ink = (im < 150).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
        h = im.shape[0]
        w = im.shape[1]
        # Digits only: not the ring's edge (anything touching the crop's border) or specks.
        glyphs = [
            i for i in range(1, n)
            if stats[i, cv2.CC_STAT_HEIGHT] > tall * h and stats[i, cv2.CC_STAT_AREA] > 6
            and stats[i, cv2.CC_STAT_LEFT] > 1 and stats[i, cv2.CC_STAT_TOP] > 1
            and stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] < w - 1 and stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT] < h - 1
        ]
        if not glyphs or len(glyphs) > 3:
            continue
        glyphs.sort(key=lambda i: stats[i, cv2.CC_STAT_LEFT])
        text, worst = '', 1.0
        for i in glyphs:
            ch, sc = classify(lab == i)
            text += ch
            worst = min(worst, sc)
        if worst > best[1]:
            best = (text, worst)
    return best


def holes(gray, scale=1):
    """Round holes in the ink at a few thresholds: the insides of balloons (and some bolt holes)."""
    seen = []
    for th in (200, 170):
        bw = (gray < th).astype(np.uint8) * 255
        contours, tree = cv2.findContours(bw, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        for i, c in enumerate(contours):
            if tree[0][i][3] == -1:
                continue
            area, per = cv2.contourArea(c), cv2.arcLength(c, True)
            if area < 60 * scale**2 or area > 8000 * scale**2 or not per or 4 * np.pi * area / per**2 < 0.75:
                continue
            x, y, w, h = cv2.boundingRect(c)
            if 0.8 < w / h < 1.25 and not any(abs(x - s[0]) < 10 and abs(y - s[1]) < 10 for s in seen):
                seen.append((x, y, w, h))
    return seen


def balloons(path, refs, sideways, tag):
    """Balloons found at two sizes and two digit-size rules, best reading kept per place."""
    gray0 = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    wh = [gray0.shape[1], gray0.shape[0]]
    out = []
    for scale in (1, 2):
        gray = gray0 if scale == 1 else cv2.resize(gray0, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        for x, y, w, h in holes(gray, scale):
            crop = gray[y:y + h, x:x + w]
            if crop.mean() > 252:
                continue
            crop = cv2.resize(crop, None, fx=80 / h, fy=80 / h, interpolation=cv2.INTER_CUBIC)
            for tall in (0.12, 0.25):
                text, conf = read(crop, sideways, tall)
                if text in refs and conf >= 0.6:
                    # The ring itself is a few pixels outside the hole.
                    out.append([text, (x - 3 * scale) // scale, (y - 3 * scale) // scale, (x + w + 3 * scale) // scale, (y + h + 3 * scale) // scale, conf])
    keep = []
    for b in sorted(out, key=lambda b: -b[5]):
        if not any(abs(b[1] - k[1]) < 8 and abs(b[2] - k[2]) < 8 for k in keep):
            keep.append(b)
    # Bolt holes that happened to read as a number are much smaller than the page's balloons.
    if keep:
        sizes = sorted(k[3] - k[1] for k in keep)
        typical = sizes[len(sizes) // 2]
        keep = [k for k in keep if k[3] - k[1] > 0.6 * typical]
    return [b[:5] for b in keep], wh


def page(args):
    global TEMPLATES
    TEMPLATES = TEMPLATES or templates()
    i, sec = args
    refs = {x for r in sec['parts'] for x in re.split(r'[,\s]+', r[0]) if x}
    m, wh = balloons(f'forst-st6p-{i:02d}.png', refs, i in SIDEWAYS, i)
    got = {x[0] for x in m}
    print(i, sec['name'], f'{len(got)}/{len(refs)}', 'missing:', sorted(refs - got, key=lambda v: (len(v), v)), flush=True)
    return i, {'wh': wh, 'm': m}


def main():
    from multiprocessing import Pool
    parts = json.load(open('st6p-parts.json'))
    with Pool(7) as pool:
        res = dict(pool.map(page, list(enumerate(parts, start=1))))
    json.dump(res, open('balloons.json', 'w'))


if __name__ == '__main__':
    main()
