"""Cut each part out of its highlighted view: Partful draws a yellow outline round the selected part, so fill
inside that outline and keep only those pixels, on white. Returns None when no closed outline is found."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def yellow(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 150) & (g > 150) & (b < 110) & (abs(r - g) < 80)


def cutout(im, out=640, pad=0.08):
    a = np.asarray(im.convert('RGB'))
    y = yellow(a)
    if y.sum() < 40:
        return None
    # Close small gaps in the outline, then fill what it encloses.
    yc = ndi.binary_closing(y, structure=np.ones((5, 5)), iterations=2)
    filled = ndi.binary_fill_holes(yc)
    lab, n = ndi.label(filled)
    if not n:
        return None
    sizes = ndi.sum(filled, lab, range(1, n + 1))
    # The part is the biggest filled shape nearest the middle (the crop is centred on it).
    h, w = y.shape
    best, score = 0, -1
    for i, s in enumerate(sizes, start=1):
        cy, cx = ndi.center_of_mass(lab == i)
        d = ((cy - h / 2) ** 2 + (cx - w / 2) ** 2) ** 0.5 / (w / 2)
        sc = s * (1.2 - min(d, 1))
        if sc > score:
            best, score = i, sc
    m = lab == best
    inner = m & ~ndi.binary_dilation(y, iterations=1)
    # An outline that encloses nothing (an open curve) is not a part.
    if inner.sum() < 0.25 * m.sum() or m.sum() < 600:
        return None
    # The outline sits round the part: drop it and its soft (blended) edge, keep what is inside.
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    warm = (r - b > 45) & (g - b > 35) & (abs(r - g) < 90) & (r > 90)
    ring = ndi.binary_dilation(y, iterations=2) | (ndi.binary_dilation(y, iterations=5) & warm)
    m = m & ~ring
    m = ndi.binary_opening(m, iterations=1)
    lab2, n2 = ndi.label(m)
    if n2 > 1:
        sz = ndi.sum(m, lab2, range(1, n2 + 1))
        m = np.isin(lab2, [i + 1 for i, s in enumerate(sz) if s >= 0.02 * sz.max()])
    if m.sum() < 400:
        return None
    res = np.full_like(a, 255)
    res[m] = a[m]
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = int(max(x1 - x0, y1 - y0) * (1 + 2 * pad)) + 2
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    canvas = Image.new('RGB', (side, side), 'white')
    crop = Image.fromarray(res).crop((x0, y0, x1 + 1, y1 + 1))
    canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return canvas.resize((out, out), Image.LANCZOS)
