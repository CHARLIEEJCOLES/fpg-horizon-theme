"""Turn version 2 captures (svt2-<slug>.json, from runner_v2.js) into sections, part outlines and pictures.

For each machine, every assembly with parts becomes a section:
  img2/forst-v2-<slug>-<nn>.webp  the group's exploded 3D view, full resolution, framed on its parts
  m: [ref, x0, y0, x1, y1, path]  each part's exact shape on that view (SVG path in image pixels)
Each part number gets one picture, cut out of its highlighted view onto white:
  img2/forst-pt-<part no>.webp
Writes sections_v2.json ({slug: [...]}) and part_pics_v2.json ({part no: file}), keeping other machines' entries.
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from cutout import cutout

HERE = Path(__file__).parent
IMG = HERE / 'img2'


def part_no(href):
    """The catalogue's mesh id is the part number with '_' for '.', plus an instance number: 12-13-003_P_010 -> 12-13-003.P."""
    m = re.search(r'[?&]mesh=([^&]+)', href) or re.search(r'parts-catalogue/([^?]+)', href)
    s = re.sub(r'%([0-9A-F]{2})', lambda x: chr(int(x.group(1), 16)), m.group(1))
    return re.sub(r'_\d{3}$', '', s).replace('_', '.')


def data_image(url):
    return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1])))


def save_view(url, path, spots=()):
    """Saves a group's view framed on its own parts (the catalogue shows the whole machine round them), or with
    the empty background trimmed when there are none. Returns the crop's offset and the saved size."""
    im = data_image(url).convert('RGB')
    if spots:
        x0 = min(s[1] for s in spots); y0 = min(s[2] for s in spots)
        x1 = max(s[3] for s in spots); y1 = max(s[4] for s in spots)
        w, h = x1 - x0, y1 - y0
        # A tight margin round the group's own parts (so what shows is what can be clicked), at least 480 x 360.
        pw, ph = max(w * 0.05, (480 - w) / 2, 24), max(h * 0.05, (360 - h) / 2, 24)
        box = (int(max(0, x0 - pw)), int(max(0, y0 - ph)), int(min(im.width, x1 + pw)), int(min(im.height, y1 + ph)))
    else:
        a = np.asarray(im).astype(int)
        diff = np.abs(a - a[3, 3]).max(axis=2) > 12
        ys, xs = np.where(diff)
        pad = 40
        box = (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)), int(min(im.width, xs.max() + pad + 1)), int(min(im.height, ys.max() + pad + 1))) if len(xs) else (0, 0, im.width, im.height)
    im = im.crop(box)
    im.save(path, 'WEBP', quality=86, method=6)
    return (box[0], box[1]), im.size


def shape(spot, off):
    """A part's outline mask (half resolution, inside its box) to its filled shape as an SVG path on the trimmed view."""
    base, x0, y0, x1, y1, cw, ch, mask = spot[:8]
    w, h = x1 - x0 + 1, y1 - y0 + 1
    m = np.asarray(data_image(mask).convert('L')) > 127
    m = cv2.resize(m.astype(np.uint8) * 255, (w, h), interpolation=cv2.INTER_NEAREST)
    # Close gaps in the outline (where another part crossed it), then fill what it encloses.
    k = max(5, int(round(min(w, h) * 0.02)) | 1)
    closed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    cs, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    filled = np.zeros_like(closed)
    cv2.drawContours(filled, cs, -1, 255, -1)
    pts = cv2.findNonZero(m)
    hull = cv2.convexHull(pts)
    # An outline that is open (the part partly hidden) encloses little: use its hull instead.
    if cv2.countNonZero(filled) < 0.35 * cv2.contourArea(hull):
        filled = np.zeros_like(closed)
        cv2.fillPoly(filled, [hull], 255)
    cs, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    areas = [cv2.contourArea(c) for c in cs]
    big = max(areas) if areas else 0
    if big < 12:
        return None
    paths = []
    for c, a in zip(cs, areas):
        if a < 0.06 * big:
            continue
        eps = max(1.2, 0.004 * cv2.arcLength(c, True))
        p = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(p) < 3:
            continue
        pts = [f'{int(x) + x0 - off[0]} {int(y) + y0 - off[1]}' for x, y in p]
        paths.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(paths) if paths else None


def main(files):
    IMG.mkdir(exist_ok=True)
    sections_all = json.loads((HERE / 'sections_v2.json').read_text()) if (HERE / 'sections_v2.json').exists() else {}
    pics = json.loads((HERE / 'part_pics_v2.json').read_text()) if (HERE / 'part_pics_v2.json').exists() else {}
    for f in files:
        d = json.loads(Path(f).read_text())
        slug = d['slug']
        nodes = []

        def walk(n):
            # The track units carry their maker's CAD pieces ("Copy_of_..."): not Forst part numbers, so left out.
            if n['path'] and n['path'][-1].startswith('Copy_of_'):
                return
            if n.get('error'):
                print('  skipped', ' > '.join(n['path']), n['error'])
                return
            if n['parts']:
                nodes.append(n)
            for c in n['children']:
                walk(c)
        walk(d['tree'])
        secs, nshapes, nlines = [], 0, 0
        for i, n in enumerate(nodes, start=1):
            rows = {}
            for p in n['parts']:
                no = part_no(p['href'])
                if no.startswith('Copy.'):
                    continue
                if no in rows:
                    rows[no][2] += p['qty']
                else:
                    rows[no] = [no, p['name'], p['qty']]
            rows = list(rows.values())
            if not rows:
                continue
            name = ' › '.join(n['path'][-2:]) if n['path'] else 'Machine'
            pic, off, wh = '', (0, 0), None
            if n['url'] in d['asm']:
                pic = f'forst-v4-{slug}-{i:02d}.webp'
                mine = [s for s in (d.get('spots') or {}).get(n['url'], []) if s[0].replace('_', '.') in {r[0] for r in rows}]
                off, wh = save_view(d['asm'][n['url']], IMG / pic, mine)
            ref = {r[0]: str(k) for k, r in enumerate(rows, start=1)}
            m = []
            for spot in (d.get('spots') or {}).get(n['url'], []):
                no = spot[0].replace('_', '.')
                if no not in ref or not wh:
                    continue
                path = shape(spot, off)
                if path:
                    m.append([ref[no], spot[1] - off[0], spot[2] - off[1], spot[3] - off[0], spot[4] - off[1], path])
            # Big shapes first, so smaller parts lying over them stay on top and clickable.
            m.sort(key=lambda e: -((e[3] - e[1]) * (e[4] - e[2])))
            nshapes += len(m)
            nlines += len(rows)
            secs.append({'name': name, 'path': n['path'], 'code': n.get('code', ''), 'pic': pic, 'wh': list(wh) if wh else None, 'm': m,
                         'parts': [[ref[r[0]]] + r for r in rows]})
        cut = 0
        for base, url in d['part'].items():
            no = base.replace('_', '.')
            if no.startswith('Copy.'):
                continue
            fn = 'forst-pt-' + re.sub(r'[^0-9A-Za-z-]', '-', no) + '.webp'
            src = data_image(url).convert('RGB')
            out = cutout(src, out=min(1024, max(512, src.width)))
            if out is not None:
                cut += 1
            (out or src).save(IMG / fn, 'WEBP', quality=88, method=6)
            pics[no] = fn
        sections_all[slug] = secs
        print(f'{slug}: {len(secs)} sections, {nlines} lines, {nshapes} part shapes, {len(d["part"])} part pictures ({cut} cut out)')
    (HERE / 'sections_v2.json').write_text(json.dumps(sections_all, indent=1, ensure_ascii=False))
    (HERE / 'part_pics_v2.json').write_text(json.dumps(pics, indent=1, sort_keys=True))


if __name__ == '__main__':
    main(sys.argv[1:])
