"""Build assets/fpg-maker-forst.json: the Forst ST6P's parts lists and drawings for the parts finder.

Inputs (this folder): st6p-parts.json (parse_st6p.py), balloons.json (balloons_st6p.py),
shop_handles.json (our product for each part number, from the Admin API: products by SKU, 9 Nov 2026).
The drawings are img/forst-st6p-<nn>.png, copied to Shopify Files under the same names.
The machine is the Part Finder app's "ST6P 37HP Briggs & Stratton" (model 1097), so the maker's
lists show alongside the parts we already list for it.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
FILES = 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/'
MODEL = '1097'
# Part numbers the manual prints slightly differently from our SKU: manual -> (our handle, our SKU).
ALIASES = {
    '12-19-132-D': ('6546', '12-19-132'),
    '12-19-133-D': ('forst-12-19-133', '12-19-133'),
    '12-13-018': ('forst-12-13-018-p', '12-13-018.P'),
    '12-13-005': ('forst-12-13-005-p', '12-13-005.P'),
    '12-10-182.P': ('forst-12-10-182', '12-10-182'),
    '12-99-008.1': ('forst-12-99-008', '12-99-008'),
}


def main():
    parts = json.loads((HERE / 'st6p-parts.json').read_text())
    balloons = json.loads((HERE / 'balloons.json').read_text())
    handles = json.loads((HERE / 'shop_handles.json').read_text())
    sections = []
    for i, sec in enumerate(parts, start=1):
        b = balloons.get(str(i), {})
        sections.append({
            'name': sec['name'],
            'pics': [f'{FILES}forst-st6p-{i:02d}.png'],
            # [ref, part number, name, maker's stock (0: not listed), replaced by, quantity on the machine]
            'parts': [[r[0], r[1], r[2], 0, '', r[3]] for r in sec['parts'] if r[1]],
            'm': b.get('m', []),
            'wh': b.get('wh'),
        })
    h = {no: [handle, no] for no, handle in handles.items()}
    h.update({no: list(v) for no, v in ALIASES.items()})
    used = {r[1] for s in sections for r in s['parts']}
    maker = {
        'v': 2,
        'brand': 'Forst',
        'source': 'forst-manual',
        'plain': True,
        'note': "These are {brand}'s own parts lists for the ST6P, from its user manual (revision 3, 2018). Match the numbers on the drawing to the Ref column; the parts we sell can go straight in the basket.",
        'models': {MODEL: {'sections': sections}},
        'h': {k: v for k, v in sorted(h.items()) if k in used},
    }
    out = HERE.parent.parent.parent / 'assets' / 'fpg-maker-forst.json'
    out.write_text(json.dumps(maker, ensure_ascii=False, separators=(',', ':')))
    n = sum(len(s['parts']) for s in sections)
    print(f'{len(sections)} sections, {n} rows, {len(used)} part numbers, {len(maker["h"])} sold by us, {sum(len(s["m"]) for s in sections)} clickable numbers -> {out}')


if __name__ == '__main__':
    main()
