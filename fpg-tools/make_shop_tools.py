"""Wires the FP&G shopping tools into the theme's templates.

    python3 -I make_shop_tools.py <theme dir>

- collection.kit-creator: the kit builder replaces the 14 carousels (a "browse every range"
  list keeps the links); the minimum-kit picture rows stay underneath.
- collection.repair-page: the service finder sits under the banner, above the services.
- collection.hire (new): hire centre for the For Hire collection.
- product.quote-needed and product: the hire planner under the hire rates / price
  (it renders nothing on products without Day/Week/Weekend variants).
"""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
SAGE, MIST = '#5F7D6D', '#F3F6F4'


def load(name):
    raw = (root / 'templates' / name).read_text()
    match = re.match(r'^\s*/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(name, header, data):
    (root / 'templates' / name).write_text(header + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


# ---------------------------------------------------------------- kit creator
STEPS = [
    ('Harness', 'A sit harness or saddle that fits you.', 'climbing-harnesess', None, 1, 1),
    ('Climbing rope', 'One long enough to reach the ground, plus a second that can be shorter.', 'rope', None, 2, 2),
    ('Lanyard', 'Steel core or soft, up to 5 m.', 'steel-core-lanyards', 'soft-lanyards', 1, 1),
    ('Friction devices', 'Any mix of mechanical devices and friction cord.', 'mechanical-devices', 'hitch-cord', 3, 4),
    ('Karabiners', 'Triple-locking. Three to six for a climbing kit.', 'karabiners', None, 3, 6),
    ('Throwline', 'A throwline weight. A bag and line are optional.', 'throwline-bags-cubes', None, 1, 1),
    ('Rescue connector', 'A bridge-to-bridge connector: prusik loop or webbing sling.', 'rescue-accessories',
     'accessories-for-lanyards-1', 0, 1),
    ('Climbing spikes', 'A set of climbing irons or spikes.', 'spikes', None, 0, 1),
    ('Helmet', 'Not part of the minimum list, but strongly recommended.', 'helmets', None, 0, 0),
    ('Pulleys and cambium savers', 'Optional extras for rigging and protecting the tree.', 'pulleys-1', 'cambium-savers', 0, 0),
    ('Storage and tool strops', 'Bags to carry it all and strops for your saw.', 'climbing-bags-storage',
     'tool-strops-lanyards', 0, 0),
]

header, kit = load('collection.kit-creator.json')
steps = {}
for i, (title, help_text, coll, coll2, m1, m2) in enumerate(STEPS):
    s = {'title': title, 'help': help_text, 'collection': coll, 'min_kit_1': m1, 'min_kit_2': m2}
    if coll2:
        s['collection_2'] = coll2
    steps[f'step_{i + 1}'] = {'type': 'step', 'settings': s}
kit['sections']['fpg_kit'] = {
    'type': 'fpg-kit-builder',
    'blocks': steps,
    'block_order': list(steps),
    'settings': {
        'eyebrow': 'Kit creator', 'heading': 'Build your climbing kit',
        'intro': '<p>Work through each step, pick the kit you want and add it to your list. The checklist shows '
                 'what the minimum kit still needs, and you can add everything to your basket in one go.</p>',
        'kit_1_name': 'Climbing kit', 'kit_2_name': 'Climbing and rescue kit', 'products_per_step': 24,
        'padding-block-start': 32, 'padding-block-end': 48,
    },
}
carousels = [k for k in kit['order'] if kit['sections'][k]['type'] == 'product-list']
handles = [kit['sections'][k]['settings']['collection'] for k in carousels]
ranges = json.loads(json.dumps(load('index.json')[1]['sections']['fpg_categories']))
head = ranges['blocks']['cat_head']
head['blocks']['cat_head_left']['blocks']['cat_head_title']['settings']['text'] = '<h2>Browse every range</h2>'
head['blocks']['cat_head_left']['blocks']['cat_head_title']['settings']['type_preset'] = 'h3'
head['blocks'].pop('cat_head_link', None)
head['block_order'] = ['cat_head_left']
ranges['settings'].update({'collection_list': handles, 'max_collections': len(handles), 'columns': 5,
                           'padding-block-start': 40, 'padding-block-end': 56, 'background_color': MIST})
ranges['name'] = 'Browse every range'
for k in carousels:
    del kit['sections'][k]
kit['sections']['fpg_ranges'] = ranges
# Banner as a 16:9 strip so the builder is near the top.
for k, s in kit['sections'].items():
    if s.get('name') == 'Banner':
        for b in s['blocks'].values():
            if b['type'] == 'image':
                b['settings']['image_ratio'] = 'landscape'
order = [k for k in kit['order'] if k not in carousels]
intro_at = order.index('fpg_01') + 1
order[intro_at:intro_at] = ['fpg_kit']
order.append('fpg_ranges')
kit['order'] = order
save('collection.kit-creator.json', header, kit)

# ---------------------------------------------------------------- servicing
header, svc = load('collection.repair-page.json')
SERVICES = [
    ('stihl-chainsaw-service', 'Chainsaw', 'STIHL'),
    ('husqvarna-chainsaw-service', 'Chainsaw', 'Husqvarna'),
    ('echo-chainsaw-service-copy', 'Chainsaw', 'Mitox'),
    ('scheppach-chainsaw-service', 'Chainsaw', 'Scheppach'),
    ('stihl-hedge-trimmer-service', 'Hedge trimmer', 'STIHL'),
    ('husqvarna-hedge-trimmer-service', 'Hedge trimmer', 'Husqvarna'),
    ('stihl-blower-service', 'Blower', 'STIHL'),
    ('husqvarna-blower-service', 'Blower', 'Husqvarna'),
    ('stihl-kombi-engine-service', 'KombiEngine', 'STIHL'),
    ('stihl-kombi-engine-service-copy', 'KombiEngine', 'Husqvarna'),
]
blocks = {f'service_{i + 1}': {'type': 'service', 'settings': {'product': h, 'machine': m, 'brand': b}}
          for i, (h, m, b) in enumerate(SERVICES)}
svc['sections']['fpg_finder'] = {
    'type': 'fpg-service-finder', 'blocks': blocks, 'block_order': list(blocks),
    'settings': {'padding-block-start': 40, 'padding-block-end': 48},
}
# The finder's "How it works" replaces the old accordion (two of its rows were empty).
svc['sections'].pop('fpg_01', None)
order = [k for k in svc['order'] if k != 'fpg_01']
order.insert(order.index('fpg_00') + 1, 'fpg_finder')
svc['order'] = order
main = svc['sections']['main']
svc['sections']['main']['settings']['padding-block-start'] = 24
save('collection.repair-page.json', header, svc)

# ---------------------------------------------------------------- hire collection
header, base = load('collection.json')
hire = {'sections': {'section': base['sections']['section'],
                     'fpg_hire': {'type': 'fpg-hire-centre', 'settings': {'padding-block-start': 40,
                                                                           'padding-block-end': 56}}},
        'order': ['section', 'fpg_hire']}
save('collection.hire.json', '', hire)

# ---------------------------------------------------------------- hire planner on product pages
CALC = {'type': 'fpg-hire-calculator', 'settings': {'heading': 'Plan your hire', 'replace_buy_buttons': True,
                                                     'show_request': True}, 'blocks': {}}
for name, after in (('product.quote-needed.json', 'fpg_hire_rates'), ('product.json', 'group_icgrde')):
    header, tpl = load(name)
    details = tpl['sections']['main']['blocks']['product-details']
    details['blocks']['fpg_hire_calc'] = CALC
    order = [k for k in details['block_order'] if k != 'fpg_hire_calc']
    order.insert(order.index(after) + 1, 'fpg_hire_calc')
    details['block_order'] = order
    save(name, header, tpl)

print('kit builder, service finder, hire centre and hire planner wired in')
