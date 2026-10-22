"""Builds FP&G templates for Horizon from Horizon's own files.

Writes into the theme folder given as argv[1]:
- templates/product.json, product.quote-needed.json, product.ticket-number.json
- templates/page.bar-and-chain-finder.json, page.product-parts-page.json
- sections/footer-group.json (FP&G store info row, FP&G footer menus)

Reads the pristine Horizon copy from argv[2] so it can be re-run safely.

App blocks (Hulk Discounts offer table, Year Make Model search, Part Finder)
use the same IDs and settings as the live Dawn theme. Offline Theme Check
can't see installed apps, so it reports them as missing blocks; Shopify
accepts them on upload.
"""
import copy
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pristine = Path(sys.argv[2])

# App blocks, copied from the live theme's templates.
HULK_OFFERS = {
    'type': 'shopify://apps/hulk-discounts/blocks/offer_table_block/25745434-52e7-4378-88f1-890df18a0110',
    'settings': {},
}
YMM_SEARCH = {
    'type': 'shopify://apps/c-year-make-model-search/blocks/ymm-searchbox-basic/ce35ea35-ef50-4f43-8cb6-7c34cae4c285',
    'settings': {'searchbox_title': 'Search By Year, Make and Model', 'searchbox_style': 'horizontal'},
}
PART_FINDER = {
    'type': 'shopify://apps/part-finder/blocks/display/d5714e12-8620-41c6-84b3-8d4fd1667e0a',
    'settings': {'proxy_subpath': 'parts-finder', 'proxy_prefix': 'apps'},
}


def load(path):
    raw = path.read_text()
    match = re.match(r'^/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(path, header, data):
    path.write_text(header + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def schema(block_type):
    source = (root / 'blocks' / f'{block_type}.liquid').read_text()
    return json.loads(source.split('{% schema %}')[1].split('{% endschema %}')[0])


def check_orders(blocks, order, path):
    """Every non-static child listed exactly once, recursively."""
    assert len(order) == len(set(order)), f'duplicate in {path}'
    expected = {key for key, block in blocks.items() if not block.get('static')}
    listed = set(order)
    assert listed <= set(blocks), f'{path}: listed but missing {listed - set(blocks)}'
    assert expected <= listed, f'{path}: blocks missing from block_order {expected - listed}'
    for key, block in blocks.items():
        if block.get('blocks'):
            check_orders(block['blocks'], block.get('block_order', []), f'{path}/{key}')


def text_block(text, preset='paragraph', case='none'):
    return {
        'type': 'text',
        'settings': {
            'text': text,
            'width': '100%',
            'max_width': 'normal',
            'alignment': 'left',
            'type_preset': preset,
            'case': case,
        },
        'blocks': {},
    }


def from_preset(preset, replacements):
    """Turns a block preset into template JSON: adds block_order and swaps t: text for real text."""
    block = {'type': preset['type'], 'settings': dict(preset.get('settings', {})), 'blocks': {}}
    if preset.get('static'):
        block['static'] = True
    if preset.get('name'):
        block['name'] = preset['name']
    for key, value in list(block['settings'].items()):
        if isinstance(value, str) and value.startswith('t:'):
            block['settings'][key] = replacements[value]
    for key, child in preset.get('blocks', {}).items():
        block['blocks'][key] = from_preset(child, replacements)
    block['block_order'] = [key for key, child in preset.get('blocks', {}).items() if not child.get('static')]
    return block


def complementary_block():
    preset = copy.deepcopy(schema('product-recommendations')['presets'][0])
    preset['type'] = 'product-recommendations'
    preset.pop('name', None)
    block = from_preset(preset, {'t:html_defaults.may_also_like': '<h3>Pairs well with</h3>'})
    block['settings'].update({'recommendation_type': 'complementary', 'max_products': 4})
    return block


# ---------------------------------------------------------------- product templates
product_header, product_base = load(pristine / 'templates' / 'product.json')


def build_product(kind):
    data = copy.deepcopy(product_base)
    details = data['sections']['main']['blocks']['product-details']
    blocks = details['blocks']

    # Header group: vendor (upper case, as now) above the title, SKU under the price.
    header_group = blocks['group_icgrde']
    header_group['blocks']['fpg_vendor'] = text_block('<p>{{ closest.product.vendor }}</p>', case='uppercase')
    header_group['block_order'] = ['fpg_vendor', 'text_xpVMaM', 'price_tVjtKg']
    if kind != 'hire':
        header_group['blocks']['fpg_sku'] = {'type': 'sku', 'settings': {}, 'blocks': {}}
        header_group['block_order'].append('fpg_sku')

    blocks['buy_buttons_eYQEYi']['settings']['show_pickup_availability'] = True

    notices_settings = {'shipping_link': 'shopify://pages/shipping-policy'}
    if kind == 'hire':
        notices_settings.update(
            {
                'show_personal_use': False,
                'large_tag': '',
                'collection_text': "Hire items are collection only. Orders with this item must select 'Pickup in store'",
            }
        )
    blocks['fpg_notices'] = {'type': 'fpg-product-notices', 'settings': notices_settings, 'blocks': {}}
    blocks['fpg_spec_tabs'] = {'type': 'fpg-spec-tabs', 'settings': {}, 'blocks': {}}
    blocks['fpg_hulk_offers'] = copy.deepcopy(HULK_OFFERS)

    if kind == 'hire':
        blocks['fpg_hire_rates'] = {'type': 'fpg-hire-rates', 'settings': {}, 'blocks': {}}
        del blocks['variant_picker_R3rGDr']
        details['block_order'] = [
            'group_icgrde',
            'fpg_hire_rates',
            'divider_VJhene',
            'fpg_hulk_offers',
            'fpg_notices',
            'buy_buttons_eYQEYi',
            'text_aEtTtq',
            'fpg_spec_tabs',
        ]
    else:
        # Old theme: "Low stock" only at 1 left.
        blocks['fpg_stock'] = {'type': 'fpg-stock-status', 'settings': {'low_stock_threshold': 1}, 'blocks': {}}
        blocks['fpg_cormorant'] = {'type': 'fpg-cormorant', 'settings': {}, 'blocks': {}}
        blocks['fpg_pairs'] = {'type': 'fpg-variant-pairs', 'settings': {}, 'blocks': {}}
        blocks['fpg_complementary'] = complementary_block()
        details['block_order'] = [
            'group_icgrde',
            'divider_VJhene',
            'variant_picker_R3rGDr',
            'fpg_notices',
            'fpg_stock',
            'fpg_hulk_offers',
        ]
        if kind == 'ticket':
            blocks['fpg_ticket_number'] = {
                'type': 'product-custom-property',
                'settings': {
                    'property_heading': 'Ticket number',
                    'property_description': 'Enter your 6 or 7 digit ticket number to add this to your cart',
                    'property_key': 'Ticket Number',
                    'input_type': 'text',
                    'max_length': 25,
                    'required': True,
                    'placeholder': 'Ticket Number',
                },
                'blocks': {},
            }
            details['block_order'].append('fpg_ticket_number')
        details['block_order'] += [
            'buy_buttons_eYQEYi',
            'fpg_cormorant',
            'fpg_pairs',
            'fpg_complementary',
            'text_aEtTtq',
            'fpg_spec_tabs',
        ]

    check_orders(blocks, details['block_order'], f'{kind}:product-details')
    return data


for name, kind in [
    ('product.json', 'standard'),
    ('product.quote-needed.json', 'hire'),
    ('product.ticket-number.json', 'ticket'),
]:
    data = build_product(kind)
    save(root / 'templates' / name, product_header, data)
    print('wrote', name, data['sections']['main']['blocks']['product-details']['block_order'])


# ---------------------------------------------------------------- page templates
page_header, page_base = load(pristine / 'templates' / 'page.json')


def plain_section(blocks):
    """A Horizon section holding the given blocks in order."""
    return {
        'type': 'section',
        'blocks': dict(blocks),
        'block_order': [key for key, _ in blocks],
        'settings': {},
    }


def centred(block):
    block['settings']['alignment'] = 'center'
    return block


# As on the live site, the page's own title and content are hidden on both finder pages.
bar_chain = copy.deepcopy(page_base)
bar_chain['sections']['main']['disabled'] = True
bar_chain['sections']['fpg_intro'] = plain_section(
    [
        ('fpg_heading', centred(text_block('<h1><strong>Common Parts Look Up</strong></h1>', preset='h2'))),
        ('fpg_byline', centred(text_block('<p>By Forest Park and Garden</p>', case='uppercase'))),
    ]
)
bar_chain['sections']['fpg_finder'] = plain_section([('fpg_ymm_search', copy.deepcopy(YMM_SEARCH))])
bar_chain['sections']['fpg_outro'] = plain_section(
    [
        (
            'fpg_text',
            centred(
                text_block(
                    '<p>To use our new Common Parts Look Up provide simple details of any <strong>STIHL, HUSQVARNA, '
                    'Echo, Mitox, OLEO-MAC or Performance Power </strong>product and you will be provided with the '
                    'correct parts for the product which can be purchased here <strong>online now!</strong></p>'
                )
            ),
        )
    ]
)
bar_chain['order'] = ['main', 'fpg_intro', 'fpg_finder', 'fpg_outro']
for section_id, section in bar_chain['sections'].items():
    check_orders(section.get('blocks', {}), section.get('block_order', []), f'bar-chain:{section_id}')
save(root / 'templates' / 'page.bar-and-chain-finder.json', page_header, bar_chain)
print('wrote page.bar-and-chain-finder.json')

part_finder = copy.deepcopy(page_base)
part_finder['sections']['main']['disabled'] = True
part_finder['sections']['fpg_part_finder'] = plain_section([('fpg_part_finder_app', copy.deepcopy(PART_FINDER))])
part_finder['order'] = ['main', 'fpg_part_finder']
for section_id, section in part_finder['sections'].items():
    check_orders(section.get('blocks', {}), section.get('block_order', []), f'part-finder:{section_id}')
save(root / 'templates' / 'page.product-parts-page.json', page_header, part_finder)
print('wrote page.product-parts-page.json')


# ---------------------------------------------------------------- footer group
footer_header, footer = load(pristine / 'sections' / 'footer-group.json')
main_footer = footer['sections']['footer']

store_row = copy.deepcopy(main_footer)
# The footer section only accepts Horizon's own blocks, so the store info sits in a Group.
store_group = copy.deepcopy(main_footer['blocks']['group_wErUQf'])
store_group['blocks'] = {'fpg_store_info': {'type': 'fpg-store-info', 'settings': {}, 'blocks': {}}}
store_group['block_order'] = ['fpg_store_info']
store_group.pop('name', None)
store_row['blocks'] = {'fpg_store_group': store_group}
store_row['block_order'] = ['fpg_store_group']
store_row['settings']['padding-block-end'] = 0
footer['sections']['fpg_store'] = store_row

# The current site's footer menus: footer, footer-2, footer-3 (policies sit in the utilities row).
main_footer['blocks']['menu_main']['settings']['menu'] = 'footer-2'
main_footer['blocks']['menu_footer_3'] = copy.deepcopy(main_footer['blocks']['menu_footer'])
main_footer['blocks']['menu_footer_3']['settings']['menu'] = 'footer-3'
main_footer['block_order'].append('menu_footer_3')

# Social links as on the live theme (Theme settings > Social media there).
footer['sections']['utilities']['blocks']['social_icons']['settings'] = {
    'facebook_url': 'https://www.facebook.com/forestparkandgarden',
    'instagram_url': 'https://www.instagram.com/forestparkgarden',
    'youtube_url': 'https://www.youtube.com/channel/UCr5dTuiDN2TnXuPl0UGb2iA',
    'twitter_url': 'https://twitter.com/forestparkgarde',
}

footer['order'] = ['fpg_store', 'footer', 'utilities']
for section_id, section in footer['sections'].items():
    check_orders(section.get('blocks', {}), section.get('block_order', []), f'footer:{section_id}')
save(root / 'sections' / 'footer-group.json', footer_header, footer)
print('wrote footer-group.json', footer['order'])
