"""Read Forst parts tables printed as pictures, straight from the images embedded in the manual page.

Each embedded picture (with its transparency mask laid on white) is enlarged and read with tesseract
the right way up and turned each way; the reading with the most part-number rows wins.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from ocr_tables import ROW, clean_pn  # noqa: E402
from prep import clean  # noqa: E402


def images(pdf, page):
    d = Path(tempfile.mkdtemp(prefix='fimg'))
    subprocess.run(['pdfimages', '-f', str(page), '-l', str(page), '-png', pdf, str(d / 'i')], check=True)
    listing = subprocess.run(['pdfimages', '-list', '-f', str(page), '-l', str(page), pdf], capture_output=True, text=True).stdout.splitlines()[2:]
    files = sorted(d.glob('i-*.png'))
    out = []
    for i, line in enumerate(listing):
        kind = line.split()[2]
        if kind == 'smask':
            continue
        im = Image.open(files[i]).convert('RGB')
        if i + 1 < len(listing) and listing[i + 1].split()[2] == 'smask':
            m = Image.open(files[i + 1]).convert('L')
            w = Image.new('RGB', im.size, 'white')
            w.paste(im, (0, 0), m)
            im = w
        if im.width * im.height > 40000:
            out.append(im)
    return out


def fix_ref(ref):
    ref = re.sub(r'\s', '', ref).replace('&', ',')
    return re.sub(r'^S', '5', re.sub(r'^O', '0', ref))


def read_rows(im):
    best = (None, [])
    g = clean(im, 3 if max(im.size) < 1300 else 2)
    for angle in (0, 90, 270):
        r = g.rotate(angle, expand=True, fillcolor=255) if angle else g
        text = pytesseract.image_to_string(r, config='--psm 6')
        rows = []
        for line in text.splitlines():
            line = re.sub(r'[|\[\]{}]', ' ', line)
            line = re.sub(r'\s+', ' ', line).strip()
            for m in ROW.finditer(line):
                ref, pn, desc, qty = m.groups()
                rows.append([fix_ref(ref), clean_pn(pn), desc.strip(' .'), int(qty)])
        if len(rows) > len(best[1]):
            best = (angle, rows)
    return best


def page_rows(pdf, page):
    rows = []
    for im in images(pdf, page):
        angle, r = read_rows(im)
        rows += r
    return rows


if __name__ == '__main__':
    for r in page_rows(sys.argv[1], int(sys.argv[2])):
        print(r)
