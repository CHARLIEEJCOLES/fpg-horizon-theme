"""Turn the Forst parts catalogue captures (svt-<slug>.json, from runner.js) into parts lists and images.

For each machine: every assembly in the catalogue becomes a section with its exploded 3D view and its
parts (Forst part number, name, quantity). Part pictures (the part highlighted in place) are kept once per
part number. Writes:
  img/forst-3d-<slug>-<nn>.webp   assembly views
  img/forst-part-<part no>.webp   part pictures
  sections.json                   {slug: [{name, code, pic, parts: [[part no, name, qty]]}]}
  part_pics.json                  {part no: file name}
"""
import base64
import json
import re
import sys
from pathlib import Path

from PIL import Image
import io

HERE = Path(__file__).parent
IMG = HERE / 'img'


def part_no(href):
    """The catalogue's mesh id is the part number with '_' for '.', plus an instance number: 12-13-003_P_010 -> 12-13-003.P."""
    m = re.search(r'[?&]mesh=([^&]+)', href)
    if not m:
        m = re.search(r'parts-catalogue/([^?]+)', href)
    s = re.sub(r'%([0-9A-F]{2})', lambda x: chr(int(x.group(1), 16)), m.group(1))
    s = re.sub(r'_\d{3}$', '', s)
    return s.replace('_', '.')


def save_webp(data_url, path, max_w=None):
    raw = base64.b64decode(data_url.split(',', 1)[1])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=82, method=6)
    return im.size


def trim(im_path):
    """Cut the empty background round an assembly view, keeping a margin. Returns (left, top, width, height)."""
    im = Image.open(im_path).convert('RGB')
    bg = im.getpixel((3, 3))
    diff = Image.eval(Image.merge('RGB', [c.point(lambda v, b=b: 255 if abs(v - b) > 12 else 0) for c, b in zip(im.split(), bg)]).convert('L'), lambda v: v)
    box = diff.getbbox()
    if box:
        pad = 30
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
        im = im.crop(box)
    im.save(im_path, 'WEBP', quality=82, method=6)
    return (box[0], box[1]) if box else (0, 0), im.size


def main(files):
    IMG.mkdir(exist_ok=True)
    sections_all = json.loads((HERE / 'sections.json').read_text()) if (HERE / 'sections.json').exists() else {}
    pics = json.loads((HERE / 'part_pics.json').read_text()) if (HERE / 'part_pics.json').exists() else {}
    for f in files:
        d = json.loads(Path(f).read_text())
        slug = d['slug']
        nodes = []

        def walk(n):
            if n.get('error'):
                print('  skipped', ' > '.join(n['path']), n['error'])
                return
            if n['parts']:
                nodes.append(n)
            for c in n['children']:
                walk(c)
        walk(d['tree'])
        secs = []
        for i, n in enumerate(nodes, start=1):
            name = ' › '.join(n['path'][-2:]) if n['path'] else 'Machine'
            pic, off, wh = '', (0, 0), None
            if n['url'] in d['asm']:
                pic = f'forst-3d-{slug}-{i:02d}.webp'
                save_webp(d['asm'][n['url']], IMG / pic)
                off, wh = trim(IMG / pic)
            rows = {}
            for p in n['parts']:
                no = part_no(p['href'])
                if no in rows:
                    rows[no][2] += p['qty']
                else:
                    rows[no] = [no, p['name'], p['qty']]
            rows = list(rows.values())
            ref = {r[0]: str(k) for k, r in enumerate(rows, start=1)}
            # Where each part sits on the picture (from its highlighted view, same camera): clickable areas.
            m = []
            for base, x0, y0, x1, y1, cw, ch in (d.get('spots') or {}).get(n['url'], []):
                no = base.replace('_', '.')
                if no in ref and wh:
                    m.append([ref[no], x0 - off[0], y0 - off[1], x1 - off[0], y1 - off[1]])
            secs.append({'name': name, 'code': n.get('code', ''), 'pic': pic, 'wh': list(wh) if wh else None, 'm': m, 'parts': [[ref[r[0]]] + r for r in rows]})
        for base, url in d['part'].items():
            no = base.replace('_', '.')
            if no not in pics:
                fn = 'forst-part-' + re.sub(r'[^0-9A-Za-z.-]', '-', no) + '.webp'
                save_webp(url, IMG / fn)
                pics[no] = fn
        sections_all[slug] = secs
        print(slug, len(secs), 'sections', sum(len(s['parts']) for s in secs), 'lines', len(d['asm']), 'views', len(d['part']), 'part pictures')
    (HERE / 'sections.json').write_text(json.dumps(sections_all, indent=1, ensure_ascii=False))
    (HERE / 'part_pics.json').write_text(json.dumps(pics, indent=1, sort_keys=True))
    print('part pictures in total', len(pics))


if __name__ == '__main__':
    main(sys.argv[1:])
