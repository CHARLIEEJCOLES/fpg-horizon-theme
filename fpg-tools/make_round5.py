"""Round 5 template changes (23 Oct 2026).

- Collection pages: the FP&G chain & bar finder between the title band and the
  products. It only shows on the chain, bar and kit collections (set in the
  section), folded up until opened.
- Product pages: "Complete the job" under the buy buttons; "What it fits"
  where Horizon's "Pairs well with" carousel was (that carousel is switched
  off, not deleted; Complete the job uses the same Search & Discovery picks).

Run from the theme root: python3 -I fpg-tools/make_round5.py
"""
import json


def load(path):
    text = open(path).read()
    head = text[: text.index('{')]
    return head, json.loads(text[text.index('{'):])


def save(path, head, data):
    open(path, 'w').write(head + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


# ---------- Collection page: finder ----------
head, d = load('templates/collection.json')
if 'fpg_fit' not in d['sections']:
    d['sections']['fpg_fit'] = {'type': 'fpg-fit-finder', 'settings': {'padding-block-start': 8, 'padding-block-end': 8}}
    d['order'].insert(d['order'].index('main'), 'fpg_fit')
save('templates/collection.json', head, d)

# ---------- Product page ----------
STIHL_SAW = ['109833', '98027', 'stihl-function-basic-helmet-set', 'stihl-work-gloves-dynamic-protect-ms', '100591']
STIHL_BATTERY = ['98027', 'stihl-function-basic-helmet-set', 'stihl-work-gloves-dynamic-protect-ms']
HUSQ_SAW = ['74706', '74175', 'husqvarna-classic-forest-helmet', 'husqvarna-functional-gloves-with-saw-protection', 'husqvarna-combi-can-5l-2-5l']
STIHL_HEDGE = ['110293', 'stihl-superclean', '109833', '103101']
STIHL_CUTTER = ['109833', '103624', '103101', '97027']
STIHL_BLOWER = ['109833', '107853', '103101']

RULES = [
    ('Chainsaw', 'STIHL', '', 'MSA,MSE,GTA,GS 4', STIHL_SAW),
    ('Chainsaw,Power Pruner,Pole Saw', 'STIHL', 'MSA,GTA,HTA', '', STIHL_BATTERY),
    ('Chainsaw', 'Husqvarna', '', '0i ,1i ,2i ,5i ,aspire,battery', HUSQ_SAW),
    ('Hedge Trimmer,Long Reach Hedge Trimmer', 'STIHL', '', 'HSA,HLA,HSE', STIHL_HEDGE),
    ('Brushcutter', 'STIHL', '', 'FSA,FSE', STIHL_CUTTER),
    ('Blower', 'STIHL', '', 'BGA,BGE,SHA,SHE', STIHL_BLOWER),
]

for path in ['templates/product.json']:
    head, d = load(path)
    details = d['sections']['main']['blocks']['product-details']
    blocks, order = details['blocks'], details['block_order']
    if 'fpg_complete_job' not in blocks:
        settings = {}
        for n, (types, vendor, has, nots, products) in enumerate(RULES, start=1):
            settings[f'rule_{n}_types'] = types
            settings[f'rule_{n}_vendor'] = vendor
            if has:
                settings[f'rule_{n}_title_has'] = has
            if nots:
                settings[f'rule_{n}_title_not'] = nots
            settings[f'rule_{n}_products'] = products
        blocks['fpg_complete_job'] = {'type': 'fpg-complete-job', 'settings': settings}
        order.insert(order.index('fpg_trust') + 1, 'fpg_complete_job')
    if 'fpg_fits' not in blocks:
        blocks['fpg_fits'] = {'type': 'fpg-fits', 'settings': {}}
        order.insert(order.index('fpg_complementary'), 'fpg_fits')
    if 'fpg_complementary' in blocks:
        blocks['fpg_complementary']['disabled'] = True
    save(path, head, d)

print('round 5 templates updated')
