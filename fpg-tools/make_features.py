"""FP&G feature pack: wires the new FP&G blocks and sections into the templates.

Run after make_templates.py and make_design.py:
    python3 make_features.py theme

Adds
- Homepage: search bar with popular links in the hero (replaces the two hero buttons),
  a "Common parts look up" band with the Year/Make/Model search, logo tiles,
  a countdown slot under the Offers heading (hidden until a date is set)
- Collection page: breadcrumbs above the title, two promo tiles in the product grid
- Product pages: breadcrumbs, offer countdown slot, "Notify me" for sold-out variants,
  payment icons in the trust panel, a "Recently viewed" row
- Footer group: back-to-top button, and three menu promo cards (Parts & Servicing,
  Garden & Tree Machinery, Clothing & PPE) that fpg-design.js copies into the menu dropdowns
"""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])

TEAL, SAGE, PALE, MIST, LINE, INK, WHITE = '#002D37', '#5F7D6D', '#E2E9E5', '#F3F6F4', '#D6DED9', '#12262B', '#FFFFFF'
MENU = 'horizon-main-menu'
SERVICE_IMG = 'shopify://shop_images/img_065124c2-16c4-4599-9cd7-98f3c2b57e5c.jpg'
HIRE_IMG = 'shopify://shop_images/img_f544e3ea-5ad0-4650-b4a8-1b68c6f1fe14.jpg'
PPE_IMG = 'shopify://shop_images/img_3ecf4803-96fe-4485-965a-74b9142bc686.jpg'

src = (Path(__file__).parent / 'make_templates.py').read_text()
YMM_TYPE = re.search(r"YMM_SEARCH = \{\s*'type': '([^']+)'", src).group(1)


def load(path):
    raw = path.read_text()
    match = re.match(r'^/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(path, header, data):
    path.write_text(header + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def text(html, preset='rte', color='', align='left', size='', max_width='normal'):
    s = {'text': html, 'width': '100%', 'max_width': max_width, 'alignment': align, 'type_preset': preset,
         'wrap': 'pretty', 'padding-block-start': 0, 'padding-block-end': 0}
    if color:
        s['text_color'] = color
    if size:
        s['font_size'] = size
    return {'type': 'text', 'settings': s, 'blocks': {}}


def crumbs():
    return {'type': 'fpg-breadcrumbs', 'settings': {'menu': MENU, 'fallback_collection': True,
                                                    'alignment': 'left', 'structured_data': True}, 'blocks': {}}


def countdown(style='boxes'):
    return {'type': 'fpg-countdown', 'settings': {'label': 'Offer ends in', 'end_date': '', 'end_time': '23:59',
                                                  'when_finished': 'hide', 'style': style,
                                                  'alignment': 'start'}, 'blocks': {}}


def insert_after(order, after, key):
    if key in order:
        order.remove(key)
    order.insert(order.index(after) + 1, key)


promos = [
    ('Parts & Servicing', SERVICE_IMG, 'Workshop', 'Book a service',
     'Servicing and repairs in our Treforest workshop, using genuine parts.', 'Book now',
     'shopify://collections/servicing-repair'),
    ('Garden & Tree Machinery', HIRE_IMG, 'Machine hire', 'Hire professional machinery',
     'Chippers, stump grinders, tracked carriers and more, by the day or week.', 'View hire range',
     'shopify://collections/for-hire'),
    ('Clothing & PPE', PPE_IMG, 'Stay safe', 'Chainsaw PPE and workwear',
     'Helmets, gloves, chainsaw trousers and boots for every job.', 'Shop PPE',
     'shopify://collections/all-clothing-and-ppe'),
]

# ---------------------------------------------------------------- homepage
ix_header, ix = load(root / 'templates' / 'index.json')
S = ix['sections']

# Hero: search bar with popular links instead of the two buttons.
hero = S['fpg_hero']['blocks']['hero_content']
hero['blocks'].pop('hero_buttons', None)
hero['block_order'] = [k for k in hero['block_order'] if k != 'hero_buttons']
hero['blocks']['hero_search'] = {
    'type': 'fpg-search-bar',
    'settings': {
        'placeholder': 'Search products, part numbers or models', 'button_label': 'Search', 'style': 'dark',
        'chips_label': 'Popular:',
        'chip_1_label': 'Chainsaw chains', 'chip_1_link': 'shopify://collections/chainsaw-chains',
        'chip_2_label': 'Chainsaw bars', 'chip_2_link': 'shopify://collections/chainsaw-bars',
        'chip_3_label': 'Cutting line', 'chip_3_link': 'shopify://collections/cutting-line',
        'chip_4_label': 'Service kits', 'chip_4_link': 'shopify://collections/chainsaw-service-kits',
        'chip_5_label': 'Chain oil', 'chip_5_link': 'shopify://collections/chain-oil',
    },
    'blocks': {},
}
hero['block_order'].append('hero_search')
hero['settings']['gap'] = 18

# Common parts look up band with the Year/Make/Model search.
ymm = {'type': YMM_TYPE, 'settings': {'searchbox_title': 'Search By Year, Make and Model',
                                      'searchbox_style': 'horizontal'}}
S['fpg_finder'] = {
    'type': 'section',
    'name': 'Common parts look up',
    'blocks': {
        'finder_head': {
            'type': 'group',
            'settings': {'content_direction': 'column', 'horizontal_alignment_flex_direction_column': 'center',
                         'vertical_alignment_flex_direction_column': 'center', 'gap': 8, 'width': 'fill',
                         'width_mobile': 'fill', 'height': 'fit'},
            'blocks': {
                'finder_eyebrow': text('<p>Common parts look up</p>', preset='h6', color=SAGE, align='center'),
                'finder_title': text('<h2>Find the parts that fit your machine</h2>', preset='h2', align='center'),
                'finder_text': text('<p>Choose the make, type and model to see the chains, bars, filters and plugs '
                                    'that fit.</p>', align='center', max_width='narrow'),
            },
            'block_order': ['finder_eyebrow', 'finder_title', 'finder_text'],
        },
        'finder_box': {
            'type': 'group',
            'settings': {'content_direction': 'column', 'horizontal_alignment_flex_direction_column': 'center',
                         'vertical_alignment_flex_direction_column': 'center', 'gap': 0, 'width': 'fill',
                         'width_mobile': 'fill', 'height': 'fit', 'border_radius': 16, 'background_color': WHITE,
                         'padding-block-start': 24, 'padding-block-end': 28, 'padding-inline-start': 28,
                         'padding-inline-end': 28, 'border': 'solid', 'border_width': 1, 'border_opacity': 100,
                         'border_color': LINE},
            'blocks': {'finder_ymm': ymm},
            'block_order': ['finder_ymm'],
        },
    },
    'block_order': ['finder_head', 'finder_box'],
    'settings': {'content_direction': 'column', 'horizontal_alignment_flex_direction_column': 'center',
                 'vertical_alignment_flex_direction_column': 'center', 'gap': 28, 'section_width': 'page-width',
                 'background_color': PALE, 'padding-block-start': 56, 'padding-block-end': 56},
}

# Countdown slot under the Offers heading (hidden until an end date is set in the editor).
offers_left = S['fpg_offers']['blocks']['static-header']['blocks']['offers_head_left']
offers_left['blocks']['offers_countdown'] = countdown('pill')
offers_left['block_order'].append('offers_countdown')

# Brand logos sit in tiles now, so they need less space between them.
S['fpg_brands']['settings']['gap_between_elements'] = 16

order = ix['order']
insert_after(order, 'fpg_help', 'fpg_finder')
save(root / 'templates' / 'index.json', ix_header, ix)
print('index:', order)

# ---------------------------------------------------------------- collection page
col_header, col = load(root / 'templates' / 'collection.json')
head = col['sections']['section']
head['blocks']['fpg_crumbs'] = crumbs()
head['block_order'] = ['fpg_crumbs'] + [k for k in head['block_order'] if k != 'fpg_crumbs']
head['settings']['padding-block-start'] = 24
main = col['sections']['main']
main['blocks']['fpg-promo-tile-1'] = {
    'type': 'fpg-promo-tile', 'static': True,
    'settings': {'enabled': True, 'position': 6, 'eyebrow': 'Need a hand?', 'heading': 'Talk to our team',
                 'text': 'Not sure which model or part you need? Call 01443 230000 or visit us at Coed Court, '
                         'Treforest.',
                 'button_label': 'Contact us', 'link': 'shopify://pages/contact',
                 'background_color': TEAL, 'text_color': WHITE},
    'blocks': {},
}
main['blocks']['fpg-promo-tile-2'] = {
    'type': 'fpg-promo-tile', 'static': True,
    'settings': {'enabled': True, 'position': 15, 'image': SERVICE_IMG, 'eyebrow': 'Workshop',
                 'heading': 'Servicing and repairs', 'text': 'Keep your kit running with a service in our '
                                                             'Treforest workshop.',
                 'button_label': 'Book a service', 'link': 'shopify://collections/servicing-repair',
                 'background_color': TEAL, 'text_color': WHITE},
    'blocks': {},
}
save(root / 'templates' / 'collection.json', col_header, col)
print('collection: breadcrumbs, promo tiles at 6 and 15')

# ---------------------------------------------------------------- product templates
for name in ['product.json', 'product.quote-needed.json', 'product.ticket-number.json']:
    p_header, data = load(root / 'templates' / name)
    secs = data['sections']
    secs['fpg_crumbs'] = {
        'type': 'section', 'name': 'Breadcrumbs',
        'blocks': {'fpg_crumbs_block': crumbs()}, 'block_order': ['fpg_crumbs_block'],
        'settings': {'content_direction': 'column', 'horizontal_alignment_flex_direction_column': 'flex-start',
                     'vertical_alignment_flex_direction_column': 'center', 'gap': 0, 'section_width': 'page-width',
                     'padding-block-start': 16, 'padding-block-end': 0},
    }
    secs['fpg_recent'] = {
        'type': 'fpg-recently-viewed',
        'settings': {'eyebrow': 'Pick up where you left off', 'heading': 'Recently viewed', 'max_products': 8,
                     'padding-block-start': 40, 'padding-block-end': 56},
    }
    data['order'] = ['fpg_crumbs'] + [k for k in data['order'] if k not in ('fpg_crumbs', 'fpg_recent')] + [
        'fpg_recent']

    details = secs['main']['blocks']['product-details']
    blocks = details['blocks']
    header_group = blocks['group_icgrde']
    header_group['blocks']['fpg_countdown'] = countdown('pill')
    price_key = next(k for k, b in header_group['blocks'].items() if b['type'] == 'price')
    insert_after(header_group['block_order'], price_key, 'fpg_countdown')

    trust = blocks['fpg_trust']
    trust['blocks']['trust_payments'] = {'type': 'payment-icons', 'settings': {'gap': 6,
                                                                               'padding-block-start': 4},
                                         'blocks': {}}
    trust['block_order'].append('trust_payments')

    if 'fpg_stock' in blocks:
        blocks['fpg_back_in_stock'] = {'type': 'fpg-back-in-stock', 'settings': {'preview_in_editor': True},
                                       'blocks': {}}
        insert_after(details['block_order'], 'fpg_stock', 'fpg_back_in_stock')
    save(root / 'templates' / name, p_header, data)
print('product templates: breadcrumbs, countdown slot, notify me, payment icons, recently viewed')

# ---------------------------------------------------------------- footer group: back to top
fg_header, fg = load(root / 'sections' / 'footer-group.json')
fg['sections']['fpg_back_to_top'] = {'type': 'fpg-back-to-top',
                                     'settings': {'position': 'right', 'bottom_offset': 96, 'threshold': 700}}
promo_blocks = {}
for i, (menu, image, eyebrow, heading, words, label, link) in enumerate(promos, start=1):
    promo_blocks[f'promo_{i}'] = {'type': 'promo', 'settings': {
        'menu_title': menu, 'image': image, 'eyebrow': eyebrow, 'heading': heading, 'text': words,
        'label': label, 'link': link}}
fg['sections']['fpg_menu_promos'] = {'type': 'fpg-menu-promos', 'blocks': promo_blocks,
                                     'block_order': list(promo_blocks), 'settings': {}}
fg['order'] = [k for k in fg['order'] if k not in ('fpg_back_to_top', 'fpg_menu_promos')] + [
    'fpg_back_to_top', 'fpg_menu_promos']
save(root / 'sections' / 'footer-group.json', fg_header, fg)
print('footer group: back to top, 3 menu promos')
