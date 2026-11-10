"""Build assets/fpg-maker-forst.json from Forst's own 3D parts catalogue (forst.svt-app.com).

Inputs (this folder): sections.json and part_pics.json (process_svt.py), shop_skus.json (our Forst
products by SKU: {sku: handle}, from the Admin API). Pictures are in Shopify Files under their own names.
Each Part Finder app machine gets the catalogue's assemblies for the same machine.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
FILES = 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/'
# Catalogue machine -> Part Finder app model id.
MODELS = {
    'st6d-24-kubota': ('1085', 'ST6D 24 Kubota'),
    'st6d-42-doosan': ('1096', 'ST6D 42 Doosan'),
    '24a000-st6p': ('1097', 'ST6P 37 Briggs & Stratton'),
    'st8d-55-doosan': ('1095', 'ST8D 55 Doosan'),
    'tr6d-42-doosan': ('1110', 'TR6D 42 Doosan'),
    'tr6d-24-kubota': ('1099', 'TR6D 24 Kubota'),
    'tr6p-37': ('1098', 'TR6P 37 Briggs & Stratton'),
    'tr8d-55': ('1087', 'TR8D 55 Doosan'),
    'xr8d-55-doosan': ('1089', 'XR8D 55 Doosan'),
}


def our_sku(no, skus):
    """Our SKU for a Forst part number: the same (any letter case), or with/without a trailing .P/.B style suffix."""
    low = {norm(k): k for k in skus}
    for cand in (no, re.sub(r'\.[A-Z]+$', '', no), no + '.P', no + '.B'):
        if norm(cand) in low:
            return low[norm(cand)]
    return None


def norm(sku):
    """A SKU without case or punctuation, so 12-19-051B, 12-19-051.B and D1855 / D18.55 meet."""
    return re.sub(r'[^0-9a-z]', '', sku.lower())


# Each machine's card on Forst's page of the finder: parts finder id -> its short name, engine, group, our product photo and product.
CARDS = {
    '1097': {'name': 'ST6P', 'line': '37hp Briggs & Stratton petrol', 'group': 'Wheeled chippers', 'pic': 'Forst-ST6P-Main.png', 'handle': 'forst-st6p-wheeled-woodchipper'},
    '1085': {'name': 'ST6D 24', 'line': '24hp Kubota diesel', 'group': 'Wheeled chippers', 'pic': 'ST6D-42-ST6D-24-FEAT.jpg', 'handle': 'forst-st6d24-wheeled-woodchipper'},
    '1096': {'name': 'ST6D 42', 'line': '42hp Doosan diesel', 'group': 'Wheeled chippers', 'pic': 'ST6D-42-ST6D-24-FEAT_c721c205-e059-4832-9d50-457813174acc.jpg', 'handle': 'forst-st6d42-wheeled-woodchipper'},
    '1095': {'name': 'ST8D', 'line': '55hp Doosan diesel', 'group': 'Wheeled chippers', 'pic': 'ST8D-Feature.jpg', 'handle': 'forst-st8d-wheeled-woodchipper'},
    '1098': {'name': 'TR6P', 'line': '37hp Briggs & Stratton petrol', 'group': 'Tracked chippers', 'pic': 'TR6-Hero-No-BG_Update2022-scaled.jpg', 'handle': 'forst-tr6p-tracked-woodchipper'},
    '1099': {'name': 'TR6D 24', 'line': '24hp Kubota diesel', 'group': 'Tracked chippers', 'pic': 'TR6d-comp-feat_1eb9ac86-f581-4b24-aaa3-404d404a79c3.jpg', 'handle': 'forst-tr6d24-tracked-woodchipper'},
    '1110': {'name': 'TR6D 42', 'line': '42hp Doosan diesel', 'group': 'Tracked chippers', 'pic': 'TR6d-comp-feat_1c2dbab9-09a5-4648-a177-74e40e3ffc49.jpg', 'handle': 'forst-tr6d42-tracked-woodchipper'},
    '1087': {'name': 'TR8D', 'line': '55hp Doosan diesel', 'group': 'Tracked chippers', 'pic': 'TR8D55-feat.jpg', 'handle': 'forst-tr8d-tracked-woodchipper'},
    '1089': {'name': 'XR8D', 'line': '55hp Doosan diesel', 'group': 'Tracked chippers', 'pic': 'Forst-XR8-Main.png', 'handle': 'forst-xr8d-tracked-woodchipper'},
}
CUTS = {'1097': 'fpgf-st6p-cut.png', '1085': 'fpgf-st6d-24-cut.png', '1096': 'fpgf-st6d-42-cut.png', '1095': 'fpgf-st8d-cut.png', '1098': 'fpgf-tr6p-cut.png', '1099': 'fpgf-tr6d-24-cut.png', '1110': 'fpgf-tr6d-42-cut.png', '1087': 'fpgf-tr8d-cut.png', '1089': 'fpgf-xr8d-cut.png'}
MIN_LINES = 12


def group_small(secs):
    """Sections with fewer than MIN_LINES parts go into their parent group (made if the parent has no parts of its
    own), deepest first, so no list is a handful of parts. The merged section keeps every drawing (one per group,
    each with its own clickable shapes) and lists all their parts once, numbered afresh."""
    groups = {}
    for s in secs:
        key = tuple(s.get('path') or [s['name']])
        groups[key] = {'path': list(key), 'code': s.get('code', ''), 'draws': [s]}
    lines = lambda g: len({r[1] for d in g['draws'] for r in d['parts']})
    for depth in range(max((len(k) for k in groups), default=0), 1, -1):
        for key in sorted(k for k in list(groups) if len(k) == depth):
            g = groups[key]
            if lines(g) >= MIN_LINES:
                continue
            parent = key[:-1]
            if parent not in groups:
                groups[parent] = {'path': list(parent), 'code': '', 'draws': []}
            groups[parent]['draws'].extend(g['draws'])
            del groups[key]
    # A small top-level group with groups below it joins the first of them (its drawings first).
    for key in sorted(k for k in list(groups) if len(k) == 1):
        g = groups[key]
        below = sorted(k for k in groups if len(k) > 1 and k[0] == key[0])
        if lines(g) < MIN_LINES and below:
            groups[below[0]]['draws'][:0] = g['draws']
            del groups[key]
    order = {tuple(s.get('path') or [s['name']]): i for i, s in enumerate(secs)}
    out = []
    for key in sorted(groups, key=lambda k: min([order.get(k, 1e9)] + [order[tuple(d.get('path') or [d['name']])] for d in groups[k]['draws']])):
        g = groups[key]
        draws = sorted(g['draws'], key=lambda d: order[tuple(d.get('path') or [d['name']])])
        rows, refmap = {}, {}
        for d in draws:
            for ref, no, name, qty in d['parts']:
                if no in rows:
                    rows[no][3] += qty
                else:
                    rows[no] = [None, no, name, qty]
        for k, no in enumerate(rows, start=1):
            rows[no][0] = str(k)
        pics, ms, whs = [], [], []
        for d in draws:
            if not d.get('pic'):
                continue
            old = {ref: no for ref, no, _, _ in d['parts']}
            pics.append(d['pic'])
            ms.append([[rows[old[e[0]]][0]] + e[1:] for e in (d.get('m') or []) if e[0] in old])
            whs.append(d.get('wh'))
        p = g['path']
        name = ' › '.join(p[-2:]) if p else 'Machine'
        out.append({'name': name, 'code': g['code'] or (draws[0].get('code', '') if len(draws) == 1 else ''), 'pics': pics, 'ms': ms, 'whs': whs,
                    'parts': list(rows.values())})
    return out


def main():
    # Version 2 captures (exact part outlines, high resolution) where there are any.
    v = '_v2' if (HERE / 'sections_v2.json').exists() else ''
    sections = json.loads((HERE / f'sections{v}.json').read_text())
    pics = json.loads((HERE / f'part_pics{v}.json').read_text())
    skus = json.loads((HERE / 'shop_skus.json').read_text()) if (HERE / 'shop_skus.json').exists() else {}
    models, used = {}, set()
    for slug, secs in sections.items():
        if slug not in MODELS:
            continue
        mid, _ = MODELS[slug]
        out = []
        if all(s.get('path') is not None for s in secs):
            for g in group_small(secs):
                out.append({
                    'name': g['name'] + (f" ({g['code']})" if g['code'] else ''),
                    'pics': [FILES + p for p in g['pics']],
                    # [ref, part number, name, maker's stock (0: not listed), replaced by, quantity on the machine]
                    'parts': [[ref, no, name, 0, '', qty] for ref, no, name, qty in g['parts']],
                    'ms': g['ms'],
                    'whs': g['whs'],
                })
                used.update(r[1] for r in g['parts'])
            models[mid] = {'sections': out}
            continue
        for s in secs:
            out.append({
                'name': s['name'] + (f" ({s['code']})" if s.get('code') else ''),
                'pics': [FILES + s['pic']] if s.get('pic') else [],
                # [ref, part number, name, maker's stock (0: not listed), replaced by, quantity on the machine]
                'parts': [[ref, no, name, 0, '', qty] for ref, no, name, qty in s['parts']],
                'm': s.get('m') or [],
                'wh': s.get('wh'),
            })
            used.update(r[1] for r in s['parts'])
        models[mid] = {'sections': out}
    h = {}
    for no in sorted(used):
        sku = our_sku(no, skus)
        if sku:
            h[no] = [skus[sku], sku]
    maker = {
        'v': 2,
        'brand': 'Forst',
        'source': 'forst-3d',
        'plain': True,
        'note': "{brand}'s own parts catalogue for this machine, assembly by assembly. Click a part on the 3D view to find it in the list; the parts we sell can go straight in the basket.",
        'pimg': FILES + '{p}?width={s}',
        'pi': {no: fn for no, fn in pics.items() if no in used},
        'models': models,
        'h': h,
        # The brand's page in the finder: a photo card per machine (our own product photos), and the same photo on the machine's page.
        'lead': "Pick your chipper to open Forst's own 3D parts drawings. Click a part on the drawing to see its price and add it to the basket.",
        # Cards show Först's cut-out of the machine (Shopify Files, fpgf-<slug>-cut.*) on a studio panel.
        'cards': {mid: {**c, 'pic': CUTS.get(mid, c['pic'])} for mid, c in CARDS.items()},
        'skin': 'forst',  # the site takes Först's colours on these pages (assets/fpg-design.css)
        'mi': {mid: c['pic'] for mid, c in CARDS.items()},
        # The brands page quotes this: every Forst part number across the machines' lists.
        'counts': {'Forst': len({r[1] for m in models.values() for sec in m['sections'] for r in sec['parts']})},
    }
    out = HERE.parent.parent.parent.parent / 'assets' / 'fpg-maker-forst.json'
    out.write_text(json.dumps(maker, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(s['parts']) for m in models.values() for s in m['sections'])
    for mid, m in models.items():
        sizes = sorted(len(s['parts']) for s in m['sections'])
        print(f"  model {mid}: {len(sizes)} sections, smallest {sizes[:5]}")
    print(f'{len(models)} machines, {sum(len(m["sections"]) for m in models.values())} assemblies, {n} lines, {len(used)} part numbers, {len(h)} sold by us, {len(maker["pi"])} part pictures, {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
