"""Cut the exploded drawings out of the ST6P manual pages (st6p-parts.pdf, page 1 = manual page 35).

Each page is drawn at 200 dpi. The header, title, parts tables and notes (from the PDF's own text, or the tables'
pale blue shading where a table is a picture) are painted white, then the page
is trimmed to what's left, the drawing. Balloon numbers are part of the drawings' pictures, so
they stay. Writes forst-st6p-<nn>.png.
"""
import re
import subprocess
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

DPI = 200


def words(page):
    """Word boxes (in points) from pdftotext -bbox."""
    out = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-bbox', 'st6p-parts.pdf', '-'], capture_output=True, text=True).stdout
    out = re.sub(r'<!DOCTYPE[^>]*>', '', out).replace('xmlns="http://www.w3.org/1999/xhtml"', '')
    root = ET.fromstring(out)
    for w in root.iter('word'):
        yield w.text or '', [float(w.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax')]


def blue_boxes(a):
    """Boxes around the tables' pale blue shading (connected bands, grown to take in the white rows)."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    mask = (b - r > 10) & (r > 180) & (b > 225)
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return []
    # Group shaded pixels into blocks on a coarse grid, so two tables side by side stay separate.
    from scipy import ndimage
    lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=40))
    boxes = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) * (x1 - x0) < 20000:
            continue
        boxes.append((x0 - 10, y0 - 10, x1 + 10, y1 + 10))
    return boxes


def clusters(boxes, gap=25):
    """Word boxes merged into blocks: words closer than gap points join the same block."""
    blocks = [list(b) for b in boxes]
    merged = True
    while merged:
        merged = False
        for i in range(len(blocks)):
            for j in range(i + 1, len(blocks)):
                a, b = blocks[i], blocks[j]
                if a[0] - gap < b[2] and b[0] - gap < a[2] and a[1] - gap < b[3] and b[1] - gap < a[3]:
                    blocks[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del blocks[j]
                    merged = True
                    break
            if merged:
                break
    return blocks


def main():
    for p in range(1, 15):
        subprocess.run(['pdftoppm', '-f', str(p), '-l', str(p), '-r', str(DPI), '-png', '-singlefile', 'st6p-parts.pdf', f'page{p}'], check=True)
        im = Image.open(f'page{p}.png').convert('RGB')
        a = np.array(im)
        k = DPI / 72
        # The page header and the section title.
        a[: int(92 * k)] = 255
        # Every other printed word is a parts table or a note (the balloon numbers are inside the
        # drawings' pictures), so blank the box round them all, borders included.
        # Table borders reach well past the words. The light board's table sits close to its drawing and
        # its note runs down the page edge beside it, so those two are blanked separately and tightly.
        boxes = [b for t, b in words(p) if b[3] > 92]
        note = [b for b in boxes if p == 13 and b[0] >= 535 and b[3] < 480]
        rest = [b for b in boxes if b not in note]
        for group, side in ((note, 30), (rest, 6 if p == 13 else 40)):
            for x0, y0, x1, y1 in clusters(group):
                a[max(0, int((y0 - 14) * k)):int((y1 + 14) * k), max(0, int((x0 - side) * k)):int((x1 + side) * k)] = 255
        # Tables printed as pictures (hopper tray, top feed roller, flywheel): find them by their shading.
        if p in (1, 9, 10):
            for x0, y0, x1, y1 in blue_boxes(a):
                # On the flywheel page only the tables down the right-hand side; the drawing has blue-grey shading.
                if p == 10 and x0 < 0.6 * a.shape[1]:
                    continue
                a[max(0, y0):y1, max(0, x0):x1] = 255
        if p == 12:
            # A centre line runs on down past the pump's drawing towards its table.
            a[int(0.665 * a.shape[0]):] = 255
        im = Image.fromarray(a)
        ink = np.array(im.convert('L')) < 200
        ys, xs = np.nonzero(ink)
        pad = 24
        im = im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad)))
        # Grey only, 16 shades: the drawings are line art, and this keeps the files small.
        im = im.convert('L').quantize(16, dither=Image.Dither.NONE)
        im.save(f'forst-st6p-{p:02d}.png', optimize=True)
        print(p, im.size)


if __name__ == '__main__':
    main()
