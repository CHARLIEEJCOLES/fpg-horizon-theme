"""Round 3 look changes to the JSON templates and section groups (23 Oct 2026).

- Home page: new FP&G help cards and brand strip sections replace the Horizon
  group-block versions; backgrounds alternate and spacing is even.
- Product pages: key specs strip under the title.
- Collection pages: sub-category chips under the title band.
- Footer group: the FP&G footer replaces Horizon's footer, store info and utilities.

Run from the theme root: python3 -I fpg-tools/make_look_round3.py
"""
import json
import re

def load(path):
    text = open(path).read()
    head = text[: text.index('{')]
    return head, json.loads(text[text.index('{'):])

def save(path, head, data):
    open(path, 'w').write(head + json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def text_of(html):
    return re.sub(r'<[^>]+>', '', html).replace('&amp;', '&').strip()

# ---------- Home page ----------
head, d = load('templates/index.json')
S = d['sections']

if 'fpg_help' in S:
    old = S['fpg_help']['blocks']['help_cards']
    icons = {'clipboard': 'part', 'ruler': 'chain', 'stopwatch': 'service', 'truck': 'hire', 'check_box': 'kit'}
    blocks, order = {}, []
    for key in old['block_order']:
        b = old['blocks'][key]
        bl = b['blocks']
        keys = b['block_order']
        icon = bl[keys[0]]['settings'].get('icon')
        blocks[key] = {
            'type': 'card',
            'settings': {
                'icon': icons.get(icon, 'search'),
                'title': text_of(bl[keys[1]]['settings']['text']),
                'text': text_of(bl[keys[2]]['settings']['text']),
                'link': b['settings'].get('link', ''),
            },
        }
        order.append(key)
    S['fpg_help_cards'] = {
        'type': 'fpg-help-cards',
        'blocks': blocks,
        'block_order': order,
        'settings': {
            'eyebrow': 'Parts · Servicing · Hire · Kit',
            'heading': 'How can we help?',
            'padding-block-start': 64,
            'padding-block-end': 64,
        },
    }
    del S['fpg_help']

if 'fpg_brands' in S and S['fpg_brands']['type'] == 'marquee':
    old = S['fpg_brands']
    names = {
        'brand_stihl': 'STIHL', 'brand_husqvarna': 'Husqvarna', 'brand_echo': 'ECHO', 'brand_mitox': 'Mitox',
        'brand_oregon': 'Oregon', 'brand_bulldog': 'Bulldog', 'brand_greenmech': 'GreenMech', 'brand_darlac': 'Darlac',
        'brand_ohashi': 'Ohashi', 'brand_toro': 'Toro', 'brand_ferris': 'Ferris', 'brand_etesia': 'Etesia',
    }
    blocks = {}
    for key in old['block_order']:
        st = old['blocks'][key]['settings']
        blocks[key] = {
            'type': 'brand',
            'settings': {'name': names.get(key, ''), 'logo': st.get('image_upload', ''), 'link': st.get('link', '')},
        }
    S['fpg_brand_strip'] = {
        'type': 'fpg-brands',
        'blocks': blocks,
        'block_order': list(old['block_order']),
        'settings': {
            'eyebrow': 'Approved dealer',
            'heading': 'Brands we stock',
            'speed': 60,
            'background_color': '#002D37',
            'padding-block-start': 56,
            'padding-block-end': 56,
        },
    }
    del S['fpg_brands']
    S.pop('fpg_brands_head', None)

d['order'] = [
    'fpg_hero', 'fpg_usps', 'fpg_help_cards', 'fpg_finder', 'fpg_categories', 'fpg_offers',
    'fpg_service', 'fpg_brand_strip', 'fpg_hire', 'fpg_new', 'fpg_training',
]
assert set(d['order']) <= set(S), set(d['order']) - set(S)
for k in list(S):
    if k not in d['order']:
        raise SystemExit(f'unplaced section {k}')

# Even spacing: 64px for the main content bands.
for k in ['fpg_finder', 'fpg_categories', 'fpg_offers', 'fpg_service', 'fpg_hire', 'fpg_new']:
    S[k]['settings']['padding-block-start'] = 64
    S[k]['settings']['padding-block-end'] = 64
S['fpg_training']['settings']['padding-block-start'] = 48
S['fpg_training']['settings']['padding-block-end'] = 48
save('templates/index.json', head, d)

# ---------- Product pages: key specs under the title ----------
for path in ['templates/product.json', 'templates/product.quote-needed.json']:
    try:
        head, d = load(path)
    except FileNotFoundError:
        continue
    details = d['sections']['main']['blocks'].get('product-details')
    if not details:
        continue
    for gk, g in details['blocks'].items():
        if g['type'] == 'group' and any(b['type'] == 'price' for b in g.get('blocks', {}).values()):
            if 'fpg_key_specs' not in g['blocks']:
                g['blocks']['fpg_key_specs'] = {'type': 'fpg-key-specs', 'settings': {}}
                order = g['block_order']
                after = 'fpg_countdown' if 'fpg_countdown' in order else order[-1]
                order.insert(order.index(after) + 1, 'fpg_key_specs')
            break
    save(path, head, d)

# ---------- Collection page: sub-category chips ----------
# Superseded: the chips now come from the breadcrumbs block inside every title
# band (blocks/fpg-breadcrumbs.liquid), so collection.json no longer gets its own
# section. Kept as a no-op for the record.
head, d = load('templates/collection.json')
if False and 'fpg_subcats' not in d['sections']:
    d['sections']['fpg_subcats'] = {
        'type': 'fpg-subcats',
        'settings': {
            'menu': 'horizon-main-menu',
            'label': 'Shop by type',
            'background_color': '#E2E9E5',
            'padding-block-start': 0,
            'padding-block-end': 28,
        },
    }
    d['order'].insert(d['order'].index('main'), 'fpg_subcats')
    # The title band loses its bottom padding so the chips sit inside it.
    d['sections']['section']['settings']['padding-block-end'] = 16
save('templates/collection.json', head, d)

# ---------- Footer group ----------
head, d = load('sections/footer-group.json')
S = d['sections']
if 'fpg_footer' not in S:
    S['fpg_footer'] = {
        'type': 'fpg-footer',
        'settings': {
            'show_newsletter': True,
            'news_heading': 'Join our email list',
            'news_text': 'Get exclusive deals and early access to new products.',
            'about': 'Approved STIHL dealer in Treforest. Machinery, genuine parts, PPE, hire and workshop servicing for forestry, arb and grounds care.',
            'phone': '01443 230000',
            'email': 'sales@fpandg.com',
            'visit_heading': 'Visit us',
            'address': 'Coed Court\nTreforest Ind. Est.\nPontypridd CF37 5SW',
            'hours': 'Mon–Fri 8am–5pm\nSat–Sun closed',
            'directions_url': 'https://www.google.com/maps/search/?api=1&query=Forest+Park+%26+Garden+Coed+Court+Treforest',
            'shop_heading': 'Shop',
            'shop_menu': 'horizon-main-menu',
            'help_item': 'Help',
            'more_heading': 'More',
            'more_menu': 'footer',
            'more_menu_2': 'footer-2',
            'facebook': 'https://www.facebook.com/forestparkandgarden',
            'instagram': 'https://www.instagram.com/forestparkgarden',
            'youtube': 'https://www.youtube.com/channel/UCr5dTuiDN2TnXuPl0UGb2iA',
            'twitter': 'https://twitter.com/forestparkgarde',
            'show_payment': True,
        },
    }
    for k in ['fpg_store', 'footer', 'utilities']:
        S.pop(k, None)
    d['order'] = ['fpg_footer'] + [k for k in d['order'] if k in S and k != 'fpg_footer']
save('sections/footer-group.json', head, d)
print('done')

print("done (chips come from the breadcrumbs block)")
