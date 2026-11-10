"""Adds to each captured section (sections_v2.json) where its picture sits on the catalogue's full view (off) and
which view that is (grp: assemblies of one catalogue group are drawn from the same camera, on the same image; two
sections share a grp when their full views are the same picture to within a grey level).
build_svt.py uses the two to make a drawing's neighbours clickable: parts that are drawn on it but listed under
another assembly. Read from the raw captures, with the same framing rule as process_v2.save_view; a section whose
saved size disagrees with that rule is left without (and reported), so nothing is placed by guesswork.
Run: python3 offsets.py   (after process_v2.py, before build_svt.py)"""
import json, re
import numpy as np
from pathlib import Path
from process_v2 import part_no, data_image

HERE = Path(__file__).parent
secs_all = json.loads((HERE / 'sections_v2.json').read_text())
ok = bad = 0
for slug, secs in secs_all.items():
    raw = HERE / 'raw' / f'svt2-{slug}.json'
    if not raw.exists():
        print('no raw capture for', slug)
        continue
    d = json.loads(raw.read_text())
    nodes = {}

    def walk(n):
        if n.get('error') or (n['path'] and n['path'][-1].startswith('Copy_of_')):
            return
        if n['parts']:
            nodes[tuple(n['path'])] = n
        for c in n['children']:
            walk(c)
    walk(d['tree'])
    size, views = {}, []  # views: a small grey copy of each distinct full view
    for s in secs:
        s.pop('off', None)
        s.pop('grp', None)
        n = nodes.get(tuple(s.get('path') or []))
        if not n or not s.get('pic') or n['url'] not in d['asm']:
            continue
        rows = {part_no(p['href']) for p in n['parts']}
        mine = [sp for sp in d['spots'].get(n['url'], []) if sp[0].replace('_', '.') in rows]
        if not mine:
            continue
        if n['url'] not in size:
            full = data_image(d['asm'][n['url']])
            small = np.asarray(full.convert('L').resize((96, 69))).astype(int)
            hit = next((k for k, v in enumerate(views) if np.abs(v - small).mean() < 1.0), None)
            if hit is None:
                views.append(small)
                hit = len(views) - 1
            size[n['url']] = (full.size, hit)
        (W, H), view = size[n['url']]
        x0 = min(sp[1] for sp in mine); y0 = min(sp[2] for sp in mine)
        x1 = max(sp[3] for sp in mine); y1 = max(sp[4] for sp in mine)
        w, h = x1 - x0, y1 - y0
        pw, ph = max(w * 0.05, (480 - w) / 2, 24), max(h * 0.05, (360 - h) / 2, 24)
        box = (int(max(0, x0 - pw)), int(max(0, y0 - ph)), int(min(W, x1 + pw)), int(min(H, y1 + ph)))
        if [box[2] - box[0], box[3] - box[1]] != list(s.get('wh') or []):
            bad += 1
            continue
        s['off'] = [box[0], box[1]]
        s['grp'] = view
        ok += 1
(HERE / 'sections_v2.json').write_text(json.dumps(secs_all, indent=1, ensure_ascii=False))
print(f'{ok} sections placed, {bad} left out (saved size differs from the capture)')
