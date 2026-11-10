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
    }
    out = HERE.parent.parent.parent.parent / 'assets' / 'fpg-maker-forst.json'
    out.write_text(json.dumps(maker, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(s['parts']) for m in models.values() for s in m['sections'])
    print(f'{len(models)} machines, {sum(len(m["sections"]) for m in models.values())} assemblies, {n} lines, {len(used)} part numbers, {len(h)} sold by us, {len(maker["pi"])} part pictures, {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
