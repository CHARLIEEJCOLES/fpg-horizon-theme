"""Marks which Forst drawings can be shown as "parts only" in the parts finder.

A drawing is marked (section field cs, one 0/1 per picture) only when the traced part shapes cover at least
85% of what is drawn on it; fading or cropping the rest of any other drawing would hide real parts.
Run after build_svt.py: it rewrites assets/fpg-maker-forst.json in place and prints the tally.
"""
import json, os, re
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')
MAKER = os.path.join(ROOT, 'assets', 'fpg-maker-forst.json')
IMG = os.path.join(os.path.dirname(__file__), 'img2')
LIMIT = 85

m = json.load(open(MAKER))
yes = total = 0
for mod in m['models'].values():
    for sec in mod['sections']:
        flags = []
        for i, pic in enumerate(sec['pics']):
            fn = os.path.join(IMG, pic.split('/')[-1].split('?')[0])
            cover = 0
            if os.path.exists(fn) and sec.get('ms') and sec['ms'][i]:
                w, h = sec['whs'][i]
                a = np.array(Image.open(fn).convert('RGBA').resize((w, h))).astype(int)
                ink = (a[..., 3] > 40) & ((255 - a[..., :3]).max(axis=2) > 28)
                mask = Image.new('L', (w, h), 0)
                draw = ImageDraw.Draw(mask)
                for b in sec['ms'][i]:
                    for sub in re.findall(r'M[^M]+', b[5] if len(b) > 5 and b[5] else ''):
                        pts = [tuple(map(float, p)) for p in re.findall(r'(-?[\d.]+) (-?[\d.]+)', sub)]
                        if len(pts) > 2:
                            draw.polygon(pts, fill=255)
                cover = 100 * (ink & (np.array(mask) > 0)).sum() / (ink.sum() or 1)
            flags.append(1 if cover >= LIMIT else 0)
            total += 1
            yes += flags[-1]
        sec['cs'] = flags
json.dump(m, open(MAKER, 'w'), separators=(',', ':'), ensure_ascii=False)
print(f'{yes} of {total} drawings marked parts-only')
