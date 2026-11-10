"""Read Forst parts tables that are printed as pictures (often turned on their side).

Each page is drawn at 400 dpi and read with tesseract the right way up, and turned 90 degrees each way;
the reading with the most part-number rows wins. Rows look like: item, part no, description, qty.
"""
import re
import subprocess
import sys
from pathlib import Path

import pytesseract
from PIL import Image

PN = r'\d{2}\s?[-–~]\s?[0-9A-Z]{1,3}\s?[-–~]\s?[0-9A-Z]{2,5}(?:\.[0-9A-Z]{1,3})?(?:-[A-Z0-9]{1,2})?'
ROW = re.compile(r'(?<![\w.-])([0-9S]{1,2}[a-z]?(?:\s?[,&]\s?\d{1,2})?)\s+(' + PN + r')\s+(.+?)\s+(\d{1,3})(?=\s+\d{1,2}[a-z]?\s+\d{2}\s?[-–~]|\s*$)')


def clean_pn(s):
    s = re.sub(r'\s', '', s).replace('–', '-').replace('~', '-')
    head, mid, tail = s.split('-', 2)
    fix = str.maketrans({'O': '0', 'o': '0', 'I': '1', 'l': '1', 'S': '5', 'B': '8'})
    # The middle group is digits, or A for assemblies (12-A-020). The tail is digits with an optional .suffix.
    mid = mid if mid.upper() in ('A', 'M') else mid.translate(fix)
    tail_main, *rest = tail.split('.', 1)
    tail_main = re.sub(r'^(\d*)', lambda m: m.group(1), tail_main.translate(fix) if re.fullmatch(r'[0-9OoIlSB]+(-[A-Z0-9]+)?', tail_main) else tail_main)
    if re.fullmatch(r'0\d{3}', tail_main):
        tail_main = tail_main[1:]  # OCR doubles a leading zero: 0075 -> 075
    return '-'.join([head.translate(fix), mid, tail_main]) + ('.' + rest[0] if rest else '')


def read(img):
    best = (0, [], 0)
    for angle in (0, 90, 270):
        im = img.rotate(angle, expand=True) if angle else img
        text = pytesseract.image_to_string(im, config='--psm 6')
        rows = []
        for line in text.splitlines():
            line = line.replace('|', ' ').replace('[', ' ').replace(']', ' ')
            line = re.sub(r'\s+', ' ', line).strip()
            for m in ROW.finditer(line):
                ref, pn, desc, qty = m.groups()
                rows.append([re.sub(r'\s', '', ref).replace('&', ','), clean_pn(pn), desc.strip(' .'), int(qty)])
        if len(rows) > len(best[1]):
            best = (angle, rows, len(text))
    return best


def page_image(pdf, page, dpi=400):
    out = Path(f'/tmp/ocr-{Path(pdf).stem}-{page}')
    subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-r', str(dpi), '-gray', '-png', '-singlefile', pdf, str(out)], check=True)
    return Image.open(str(out) + '.png')


if __name__ == '__main__':
    pdf, page = sys.argv[1], int(sys.argv[2])
    angle, rows, _ = read(page_image(pdf, page))
    print('angle', angle, 'rows', len(rows))
    for r in rows:
        print(r)
