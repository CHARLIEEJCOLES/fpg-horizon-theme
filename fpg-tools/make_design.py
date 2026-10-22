"""FP&G visual redesign for Horizon (theme "Horizon – FP&G").

Run after make_templates.py:
    python3 make_design.py theme /root/ref/horizon

Writes into the theme folder:
- config/settings_data.json   colours, type, buttons, cards, inputs, badges
- sections/header-group.json  teal announcement bar, two-row header with teal menu bar
- templates/index.json        new homepage
- templates/collection.json   collection page with sidebar filters and FP&G cards
- templates/product*.json     vendor eyebrow and a click & collect / advice row under Buy

Design system
- Deep teal  #002D37  structure: menu bar, footer, primary buttons, dark bands
- Sage       #5F7D6D  accents: eyebrows, icons, secondary buttons
- Pale sage  #E2E9E5  soft bands (USP strip, collection header)
- Mist       #F3F6F4  cards and tiles
- Line       #D6DED9  borders and dividers
- Ink        #12262B  text
- Sale red   #C7362B  sale and clearance badges only
- Headings Barlow 700, body Inter, 6px buttons, 12px cards
"""
import copy
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pristine = Path(sys.argv[2])

TEAL, SAGE, PALE, MIST, LINE, INK, RED, WHITE = (
    '#002D37', '#5F7D6D', '#E2E9E5', '#F3F6F4', '#D6DED9', '#12262B', '#C7362B', '#FFFFFF')


def load(path):
    raw = path.read_text()
    match = re.match(r'^/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(path, header, data):
    path.write_text(header + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def img(name):
    return f'shopify://shop_images/{name}'


# ---------------------------------------------------------------- block helpers
def text(html, preset='rte', color='', align='left', width='100%', max_width='normal', case='none',
         pad_bottom=0, font=None, size=''):
    s = {'text': html, 'width': width, 'max_width': max_width, 'alignment': align,
         'type_preset': preset, 'case': case, 'wrap': 'pretty',
         'padding-block-start': 0, 'padding-block-end': pad_bottom}
    if color:
        s['text_color'] = color
    if font:
        s['font'] = font
    if size:
        s['font_size'] = size
    return {'type': 'text', 'settings': s, 'blocks': {}}


def button(label, link, style='button', bg='', fg='', border='', new_tab=False):
    s = {'label': label, 'link': link, 'style_class': style, 'open_in_new_tab': new_tab,
         'width': 'fit-content', 'width_mobile': 'fit-content'}
    if style == 'button-custom':
        s.update({'custom_button_background': bg, 'custom_button_text': fg, 'custom_button_border': border or bg})
    return {'type': 'button', 'settings': s, 'blocks': {}}


def icon(name, color=SAGE, width=28):
    return {'type': 'icon', 'settings': {'icon': name, 'width': width, 'icon_color': color}, 'blocks': {}}


def logo_icon(file, link):
    return {'type': 'icon', 'settings': {'icon': 'none', 'image_upload': img(file), 'width': 120, 'link': link},
            'blocks': {}}


def group(children, direction='column', gap=12, bg='', radius=0, pad=0, pad_x=None, link='',
          h_align='flex-start', v_align='center', width='fill', width_mobile='fill', custom_width=100,
          custom_width_mobile=100, vertical_on_mobile=True, height='fit', border=None):
    s = {'content_direction': direction, 'vertical_on_mobile': vertical_on_mobile,
         'horizontal_alignment': h_align, 'vertical_alignment': v_align,
         'horizontal_alignment_flex_direction_column': h_align if h_align != 'space-between' else 'flex-start',
         'vertical_alignment_flex_direction_column': 'flex-start' if direction == 'column' else 'center',
         'gap': gap, 'width': width, 'custom_width': custom_width, 'width_mobile': width_mobile,
         'custom_width_mobile': custom_width_mobile, 'height': height,
         'border_radius': radius, 'padding-block-start': pad, 'padding-block-end': pad,
         'padding-inline-start': pad if pad_x is None else pad_x,
         'padding-inline-end': pad if pad_x is None else pad_x}
    if bg:
        s['background_color'] = bg
    if link:
        s['link'] = link
    if border:
        s.update({'border': 'solid', 'border_width': 1, 'border_opacity': 100, 'border_color': border})
    blocks = {k: v for k, v in children}
    return {'type': 'group', 'settings': s, 'blocks': blocks, 'block_order': [k for k, _ in children]}


def section(children, bg='', direction='column', gap=24, pad=(56, 56), width='page-width',
            h_align='flex-start', v_align='center', vertical_on_mobile=True, name=None):
    s = {'content_direction': direction, 'vertical_on_mobile': vertical_on_mobile,
         'horizontal_alignment': h_align, 'vertical_alignment': v_align,
         'horizontal_alignment_flex_direction_column': h_align if h_align != 'space-between' else 'flex-start',
         'vertical_alignment_flex_direction_column': 'center', 'gap': gap, 'section_width': width,
         'padding-block-start': pad[0], 'padding-block-end': pad[1]}
    if bg:
        s['background_color'] = bg
    out = {'type': 'section', 'blocks': {k: v for k, v in children},
           'block_order': [k for k, _ in children], 'settings': s}
    if name:
        out['name'] = name
    return out


def heading_row(key, title, button_label=None, button_link=None, eyebrow=None):
    """Section heading: optional eyebrow and title on the left, a text link on the right."""
    left = []
    if eyebrow:
        left.append((f'{key}_eyebrow', text(f'<p>{eyebrow}</p>', preset='h6', color=SAGE)))
    left.append((f'{key}_title', text(f'<h2>{title}</h2>', preset='h2')))
    items = [(f'{key}_left', group(left, gap=4, width='fit-content', width_mobile='fill'))]
    if button_label:
        items.append((f'{key}_link', button(button_label, button_link, style='button-secondary')))
    return (key, group(items, direction='row', h_align='space-between', v_align='flex-end',
                       vertical_on_mobile=False, gap=16))


# ---------------------------------------------------------------- settings_data
sd_header, settings_data = load(root / 'config' / 'settings_data.json')
cur = settings_data['current']
cur.update({
    'color_palette': {'background': WHITE, 'foreground': INK, 'color1': TEAL, 'color2': LINE,
                      'color3': SAGE, 'color4': PALE, 'color5': MIST, 'color6': RED},
    'page_background_color': '{{ settings.color_palette.background }}',
    'page_text_color': '{{ settings.color_palette.foreground }}',
    'page_width': 'normal',
    # Type: Barlow headings (workwear/signage feel), Inter body
    'type_heading_font': 'barlow_n7', 'type_accent_font': 'barlow_n6',
    'type_body_font': 'inter_n4', 'type_subheading_font': 'inter_n5',
    'type_size_paragraph': '16', 'type_line_height_paragraph': 'body-normal',
    'type_font_h1': 'heading', 'type_size_h1': '56', 'type_line_height_h1': 'display-tight',
    'type_letter_spacing_h1': 'heading-tight', 'type_case_h1': 'none',
    'type_font_h2': 'heading', 'type_size_h2': '40', 'type_line_height_h2': 'display-tight',
    'type_letter_spacing_h2': 'heading-tight', 'type_case_h2': 'none',
    'type_font_h3': 'heading', 'type_size_h3': '24', 'type_line_height_h3': 'display-normal',
    'type_letter_spacing_h3': 'heading-normal', 'type_case_h3': 'none',
    'type_font_h4': 'heading', 'type_size_h4': '20', 'type_line_height_h4': 'display-normal',
    'type_letter_spacing_h4': 'heading-normal', 'type_case_h4': 'none',
    'type_font_h5': 'subheading', 'type_size_h5': '16', 'type_line_height_h5': 'display-normal',
    'type_letter_spacing_h5': 'heading-normal', 'type_case_h5': 'none',
    'type_font_h6': 'accent', 'type_size_h6': '12', 'type_line_height_h6': 'display-normal',
    'type_letter_spacing_h6': 'heading-loose', 'type_case_h6': 'uppercase',
    # Motion and cards
    'page_transition_enabled': False, 'transition_to_main_product': False, 'card_hover_effect': 'lift',
    'show_second_image_on_hover': True, 'product_card_carousel': False,
    'quick_add': True, 'mobile_quick_add': False,
    'quick_add_background': WHITE, 'quick_add_text': INK,
    'card_corner_radius': 12, 'product_corner_radius': 8, 'card_title_case': 'default',
    # Badges
    'badge_position': 'top-left', 'badge_corner_radius': 4,
    'badge_sale_background_color': RED, 'badge_sale_text_color': WHITE,
    'badge_sold_out_background_color': INK, 'badge_sold_out_text_color': WHITE,
    'badge_font_family': 'subheading', 'badge_text_transform': 'none',
    # Buttons
    'palette_primary_button_background': TEAL, 'palette_primary_button_text': WHITE,
    'palette_primary_button_border': TEAL, 'primary_button_border_width': 0,
    'button_border_radius_primary': 6, 'type_font_button_primary': 'body', 'button_text_case_primary': 'default',
    'palette_secondary_button_background': 'rgba(0,0,0,0)', 'palette_secondary_button_text': TEAL,
    'palette_secondary_button_border': TEAL, 'secondary_button_border_width': 1,
    'button_border_radius_secondary': 6, 'type_font_button_secondary': 'body',
    'button_text_case_secondary': 'default', 'pills_border_radius': 6,
    # Inputs, drawers, popovers
    'palette_input_background': WHITE, 'palette_input_text': INK, 'palette_input_border': '#C9D3CE',
    'input_border_width': 1, 'inputs_border_radius': 6,
    'drawer_background_color': WHITE, 'drawer_text_color': INK, 'drawer_border_color': LINE,
    'popover_background_color': WHITE, 'popover_text_color': INK, 'popover_border_radius': 12,
    'popover_border_color': LINE, 'popover_border_width': 1, 'popover_drop_shadow': True,
    # Variant pickers
    'palette_variant_background': WHITE, 'palette_variant_text': INK, 'palette_variant_border': '#C9D3CE',
    'palette_selected_variant_background': TEAL, 'palette_selected_variant_text': WHITE,
    'palette_selected_variant_border': TEAL, 'variant_button_border_width': 1, 'variant_button_radius': 6,
    # Logo
    'logo_height': 44, 'logo_height_mobile': 32,
    # Cart
    'cart_price_font': 'subheading', 'empty_cart_button_link': '/collections/all-chainsaws',
})
save(root / 'config' / 'settings_data.json', sd_header, settings_data)
print('settings_data: palette, type, buttons, cards')

# ---------------------------------------------------------------- header
hg_header, hg = load(root / 'sections' / 'header-group.json')
ann = hg['sections']['header_announcements_9jGBFp']
base_ann = ann['blocks']['announcement_BxgCk9']
announcements = [
    ('announcement_BxgCk9', '<strong>Common Parts Look Up:</strong> find the right chain, bar and filters for your machine',
     'shopify://pages/bar-and-chain-finder'),
    ('announcement_dealer', 'Approved STIHL dealer · Coed Court, Treforest', 'shopify://pages/contact'),
    ('announcement_services', 'Click & collect · Workshop servicing · Machine hire', 'shopify://collections/for-hire'),
]
ann['blocks'] = {}
for key, words, link in announcements:
    block = copy.deepcopy(base_ann)
    block['settings'].update({'text': words, 'link': link, 'text_color': WHITE, 'font_size': '0.75rem',
                              'font': 'var(--font-body--family)', 'letter_spacing': 'normal', 'case': 'none'})
    ann['blocks'][key] = block
ann['block_order'] = [a[0] for a in announcements]
ann['settings'].update({'background_color': TEAL, 'divider_width': 0, 'speed': 6,
                        'padding-block-start': 10, 'padding-block-end': 10})

hdr = hg['sections']['header_section']
hdr['settings'].update({
    'logo_position': 'left', 'menu_position': 'left', 'menu_row': 'bottom',
    'show_search': True, 'search_position': 'right', 'search_row': 'top',
    'show_country': False, 'show_language': False,
    'section_width': 'page-width', 'section_height': 'standard', 'enable_sticky_header': 'scroll-up',
    'divider_width': 0, 'border_width': 0,
    'actions_display_style': 'icon',
    'background_color_top': WHITE, 'text_color_top': INK,
    'background_color_bottom': TEAL, 'text_color_bottom': WHITE,
    'bubble_style': 'custom', 'bubble_background_color': SAGE, 'bubble_text_color': WHITE,
})
hdr['blocks']['header-menu']['settings'].update({
    'menu': 'horizon-main-menu', 'menu_style': 'text', 'menu_font_style': 'regular',
    'type_font_primary_link': 'subheading', 'type_font_primary_size': '0.875rem', 'type_case_primary_link': 'none',
    'background_color': WHITE, 'text_color': INK, 'navigation_bar': False,
    'drawer_accordion': True, 'drawer_accordion_expand_first': False, 'drawer_dividers': True,
})
save(root / 'sections' / 'header-group.json', hg_header, hg)
print('header: teal announcement bar, teal menu row')

# ---------------------------------------------------------------- homepage
index_header, _ = load(pristine / 'templates' / 'index.json')
S = {}

# 1. Hero
S['fpg_hero'] = {
    'type': 'hero',
    'blocks': {
        'hero_content': group([
            ('hero_eyebrow', text('<p>Approved STIHL dealer · Treforest, South Wales</p>', preset='h6', color=PALE)),
            ('hero_title', text('<h2>Professional kit for forestry, arb and grounds care</h2>', preset='h1',
                                color=WHITE, max_width='narrow')),
            ('hero_text', text('<p>Machinery, genuine parts, PPE and workshop servicing, with straight advice from '
                               'people who know the kit.</p>', preset='rte', color=WHITE, max_width='normal')),
            ('hero_buttons', group([
                ('hero_btn_parts', button('Find a part', 'shopify://pages/fpg-part-finder', 'button-custom',
                                          bg=WHITE, fg=TEAL)),
                ('hero_btn_shop', button('Shop chainsaws', 'shopify://collections/all-chainsaws', 'button-custom',
                                         bg=SAGE, fg=WHITE)),
            ], direction='row', gap=12, width='fit-content', width_mobile='fill', vertical_on_mobile=False)),
        ], gap=16, width='custom', custom_width=60, width_mobile='fill'),
    },
    'block_order': ['hero_content'],
    'settings': {
        'media_type_1': 'image', 'image_1': img('img_3ecf4803-96fe-4485-965a-74b9142bc686.jpg'),
        'content_direction': 'column', 'horizontal_alignment_flex_direction_column': 'flex-start',
        'vertical_alignment_flex_direction_column': 'center', 'gap': 16,
        'section_width': 'page-width', 'section_height': 'large',
        'toggle_overlay': True, 'overlay_color': '#002D37A6', 'overlay_style': 'solid',
        'padding-block-start': 64, 'padding-block-end': 64,
    },
}

# 2. Trust strip
usps = [('check_box', 'Approved STIHL dealer'), ('map_pin', 'Click & collect in Treforest'),
        ('clipboard', 'Workshop servicing & repairs'), ('chat_bubble', 'Expert advice: 01443 230000')]
S['fpg_usps'] = section(
    [(f'usp_{i}', group([(f'usp_{i}_icon', icon(name, TEAL, 22)),
                         (f'usp_{i}_text', text(f'<p><strong>{words}</strong></p>', preset='paragraph',
                                                size='0.875rem'))],
                        direction='row', gap=10, width='fit-content', width_mobile='fill', vertical_on_mobile=False))
     for i, (name, words) in enumerate(usps)],
    bg=PALE, direction='row', gap=16, pad=(18, 18), h_align='space-between', name='Trust strip')

# 3. How can we help
helps = [
    ('clipboard', 'Find a part', 'Parts diagrams and genuine spares for STIHL, Husqvarna and more.',
     'shopify://pages/fpg-part-finder'),
    ('ruler', 'Common parts look up', 'Chains, bars, filters and plugs matched to your machine.',
     'shopify://pages/bar-and-chain-finder'),
    ('stopwatch', 'Book a service', 'Servicing and repairs in our Treforest workshop.',
     'shopify://collections/servicing-repair'),
    ('truck', 'Hire a machine', 'Chippers, stump grinders, mowers and more, by the day or week.',
     'shopify://collections/for-hire'),
]
cards = []
for i, (ic, title, words, link) in enumerate(helps):
    cards.append((f'help_{i}', group([
        (f'help_{i}_icon', icon(ic, TEAL, 32)),
        (f'help_{i}_title', text(f'<h3>{title}</h3>', preset='h4')),
        (f'help_{i}_text', text(f'<p>{words}</p>', preset='rte', size='0.875rem')),
        (f'help_{i}_more', text('<p><strong>Go →</strong></p>', preset='paragraph', color=SAGE, size='0.875rem')),
    ], gap=10, bg=MIST, radius=12, pad=24, link=link, height='fill', v_align='flex-start')))
S['fpg_help'] = section([
    heading_row('help_head', 'How can we help?', eyebrow='Parts · Servicing · Hire'),
    ('help_cards', group(cards, direction='row', gap=16, h_align='flex-start', v_align='flex-start')),
], pad=(56, 24), name='How can we help')

# 4. Shop by category
categories = ['all-chainsaws', 'all-lawnmowers', 'automowers', 'garden-tractors',
              'hedge-trimmers-cordless', 'brushcutters-strimmers-petrol', 'wood-chippers', 'all-clothing-and-ppe']
S['fpg_categories'] = {
    'type': 'collection-list',
    'blocks': {
        'cat_head': heading_row('cat_head', 'Shop by category', 'All products', 'shopify://collections/all')[1],
        'static-collection-card': {
            'type': '_collection-card', 'static': True,
            'settings': {'placement': 'below_image', 'horizontal_alignment': 'flex-start',
                         'vertical_alignment': 'flex-start', 'collection_card_gap': 12,
                         'border': 'none', 'border_radius': 12},
            'blocks': {
                'collection-card-image': {'type': '_collection-card-image', 'static': True,
                                          'settings': {'image_ratio': 'square', 'border': 'none',
                                                       'border_radius': 12}, 'blocks': {}},
                'collection-title': {'type': 'collection-title',
                                     'settings': {'type_preset': 'h4', 'width': '100%', 'alignment': 'left',
                                                  'background': False, 'padding-block-start': 0,
                                                  'padding-block-end': 0, 'padding-inline-start': 0,
                                                  'padding-inline-end': 0}, 'blocks': {}},
            },
            'block_order': ['collection-title'],
        },
    },
    'block_order': ['cat_head'],
    'settings': {'collection_list': categories, 'layout_type': 'grid', 'carousel_on_mobile': False,
                 'columns': 4, 'mobile_columns': '2', 'columns_gap': 16, 'rows_gap': 24, 'max_collections': 8,
                 'section_width': 'page-width', 'gap': 24, 'padding-block-start': 32, 'padding-block-end': 56},
}


def product_list(key, collection, title, link_label, eyebrow=None, bg='', layout='carousel'):
    sch = (pristine / 'sections' / 'product-list.liquid').read_text()
    sch = json.loads(sch.split('{% schema %}')[1].split('{% endschema %}')[0])
    preset = copy.deepcopy(sch['presets'][1])
    card = preset['blocks']['static-product-card']
    card['blocks']['product-card-gallery']['settings'].update({'image_ratio': 'square', 'border_radius': 8})
    card['blocks']['product_title']['settings'].update({'font_size': '0.875rem', 'type_preset': 'custom',
                                                        'width': '100%', 'font': 'var(--font-subheading--family)'})
    card['blocks']['price']['settings'].update({'type_preset': 'paragraph'})
    card['settings']['product_card_gap'] = 8
    for b in card['blocks'].values():
        b.setdefault('blocks', {})
    head = heading_row(f'{key}_head', title, link_label, f'shopify://collections/{collection}', eyebrow)[1]
    head['type'] = '_product-list-content'
    head['static'] = True
    # The "view all" link uses the list's own button block, which links to the chosen collection.
    head['blocks'][f'{key}_head_link']['type'] = '_product-list-button'
    head['blocks'][f'{key}_head_link']['settings'].pop('link')
    blocks = {'static-header': head, 'static-product-card': card}
    settings = dict(preset['settings'])
    settings.update({'collection': collection, 'max_products': 8, 'layout_type': layout, 'columns': 4,
                     'mobile_columns': '2', 'carousel_on_mobile': True, 'columns_gap': 16, 'rows_gap': 24,
                     'icons_style': 'arrow', 'icons_shape': 'circle', 'gap': 24,
                     'padding-block-start': 56, 'padding-block-end': 56})
    if bg:
        settings['background_color'] = bg
    return {'type': 'product-list', 'blocks': blocks, 'block_order': [], 'settings': settings}


# 5. Offers
S['fpg_offers'] = product_list('offers', 'current-promotions', 'Offers & promotions', 'View all offers',
                               eyebrow='This month', bg=MIST)


def feature(key, image_file, eyebrow, title, words, buttons, media_position='left', bg=''):
    btns = []
    for i, (label, link, style) in enumerate(buttons):
        btns.append((f'{key}_btn{i}', button(label, link, style)))
    content_blocks = {
        f'{key}_eyebrow': text(f'<p>{eyebrow}</p>', preset='h6', color=SAGE),
        f'{key}_title': text(f'<h2>{title}</h2>', preset='h2', max_width='narrow'),
        f'{key}_text': text(f'<p>{words}</p>', preset='rte', max_width='narrow'),
        f'{key}_buttons': group(btns, direction='row', gap=12, width='fit-content', vertical_on_mobile=False),
    }
    out = {
        'type': 'media-with-content',
        'blocks': {
            'media': {'type': '_media-without-appearance', 'static': True,
                      'settings': {'media_type': 'image', 'image': img(image_file), 'image_position': 'cover'},
                      'blocks': {}},
            'content': {'type': '_content-without-appearance', 'static': True,
                        'settings': {'horizontal_alignment_flex_direction_column': 'flex-start',
                                     'vertical_alignment_flex_direction_column': 'center', 'gap': 16},
                        'blocks': content_blocks, 'block_order': list(content_blocks)},
        },
        'block_order': [],
        'settings': {'media_position': media_position, 'media_width': 'medium', 'media_height': '60svh',
                     'section_width': 'page-width', 'extend_media': False,
                     'padding-block-start': 56, 'padding-block-end': 56},
    }
    if bg:
        out['settings']['background_color'] = bg
    return out


# 6. Servicing
S['fpg_service'] = feature(
    'service', 'img_065124c2-16c4-4599-9cd7-98f3c2b57e5c.jpg', 'Workshop',
    'Servicing and repairs in Treforest',
    'We service and repair everything from chainsaws and hedge trimmers to robotic and ride-on mowers, '
    'using genuine parts. Book online or call us on 01443 230000.',
    [('Book a service', 'shopify://collections/servicing-repair', 'button'),
     ('Parts diagrams', 'shopify://pages/parts-finder', 'button-secondary')])

# 7. Brands
S['fpg_brands_head'] = section(
    [('brands_title', text('<h2>Brands we stock</h2>', preset='h3', align='center', width='100%'))],
    pad=(40, 8), h_align='center', name='Brands heading')
brands = [('Stihl_Logo_WhiteOnOrange_svg_42e7043e-acc2-426a-8126-a5f03a44a2d3.png', 'stihl'),
          ('husqvarna_logo.png', 'husqvarna'), ('echo_logo.png', 'echo'), ('mitox_logo.png', 'mitox'),
          ('oregon.png', 'oregon'), ('bulldog-tools-logo.webp', 'bulldog'), ('Greenmech.png', 'greenmech'),
          ('darlac.png', 'darlac'), ('Ohashi.png', 'ohashi'), ('Toro.png', 'toro'), ('Ferris.png', 'ferris'),
          ('Etesia.png', 'etesia')]
S['fpg_brands'] = {
    'type': 'marquee',
    'blocks': {f'brand_{h}': logo_icon(f, f'shopify://collections/{h}') for f, h in brands},
    'block_order': [f'brand_{h}' for _, h in brands],
    'settings': {'movement_direction': 'normal', 'padding-block-start': 16, 'padding-block-end': 48,
                 'gap_between_elements': 56},
}

# 8. Hire
S['fpg_hire'] = feature(
    'hire', 'img_f544e3ea-5ad0-4650-b4a8-1b68c6f1fe14.jpg', 'Machine hire',
    'Hire professional machinery',
    'Wood chippers, stump grinders, tracked carriers, mowers and more. Collect from Treforest by the day, '
    'weekend or week.',
    [('View hire range', 'shopify://collections/for-hire', 'button'),
     ('Ask about hire', 'shopify://pages/contact', 'button-secondary')],
    media_position='right', bg=MIST)

# 9. New in
S['fpg_new'] = product_list('new', 'new-products', 'New in', 'View all', eyebrow='Just landed')

# 10. Training band
S['fpg_training'] = section([
    ('training_text', group([
        ('training_eyebrow', text('<p>FPG Training</p>', preset='h6', color=SAGE)),
        ('training_title', text('<h2>Get qualified with NPTC and City &amp; Guilds courses</h2>', preset='h3')),
    ], gap=6, width='fit-content', width_mobile='fill')),
    ('training_btn', button('Visit FPG Training', 'https://fpgtraining.co.uk/', 'button', new_tab=True)),
], bg=PALE, direction='row', h_align='space-between', pad=(40, 40), name='Training band')

order = ['fpg_hero', 'fpg_usps', 'fpg_help', 'fpg_categories', 'fpg_offers', 'fpg_service',
         'fpg_brands_head', 'fpg_brands', 'fpg_hire', 'fpg_new', 'fpg_training']
save(root / 'templates' / 'index.json', index_header, {'sections': S, 'order': order})
print('index:', order)

# ---------------------------------------------------------------- collection page
col_header, col = load(pristine / 'templates' / 'collection.json')
head = col['sections']['section']
head['settings'].update({'background_color': PALE, 'padding-block-start': 40, 'padding-block-end': 32, 'gap': 8})
title_key, desc_key = head['block_order']
head['blocks'][title_key]['settings'].update({'type_preset': 'h2', 'width': '100%'})
head['blocks'][desc_key]['settings'].update({'max_width': 'normal', 'width': '100%'})
main = col['sections']['main']
main['blocks']['filters']['settings'].update({'filter_style': 'vertical', 'enable_filtering': True,
                                              'enable_sorting': True, 'enable_grid_density': True})
pc = main['blocks']['product-card']
pc['settings'].update({'product_card_gap': 8})
for key, b in pc['blocks'].items():
    if b['type'] == '_product-card-gallery':
        b['settings'].update({'image_ratio': 'square', 'border_radius': 8})
    if b['type'] == 'product-title':
        b['settings'].update({'type_preset': 'custom', 'font_size': '0.875rem', 'width': '100%',
                              'font': 'var(--font-subheading--family)'})
    if b['type'] == 'price':
        b['settings'].update({'type_preset': 'paragraph'})
pc['blocks']['card_vendor'] = text('<p>{{ closest.product.vendor }}</p>', preset='h6', color=SAGE)
order_ = pc['block_order']
order_.insert(order_.index(next(k for k in order_ if pc['blocks'][k]['type'] == 'product-title')), 'card_vendor')
main['settings'].update({'product_card_size': 'medium', 'columns_gap_horizontal': 16, 'columns_gap_vertical': 24,
                         'padding-block-start': 24, 'padding-block-end': 56})
save(root / 'templates' / 'collection.json', col_header, col)
print('collection: sidebar filters, vendor eyebrow, square cards')

# ---------------------------------------------------------------- product templates
for name in ['product.json', 'product.quote-needed.json', 'product.ticket-number.json']:
    p_header, data = load(root / 'templates' / name)
    details = data['sections']['main']['blocks']['product-details']
    blocks = details['blocks']
    blocks['group_icgrde']['blocks']['fpg_vendor']['settings'].update(
        {'type_preset': 'h6', 'text_color': SAGE, 'case': 'uppercase'})
    blocks['fpg_trust'] = group([
        ('trust_collect', group([('trust_collect_icon', icon('map_pin', TEAL, 20)),
                                 ('trust_collect_text', text('<p>Click &amp; collect in Treforest</p>',
                                                             preset='paragraph', size='0.875rem'))],
                                direction='row', gap=8, vertical_on_mobile=False)),
        ('trust_advice', group([('trust_advice_icon', icon('chat_bubble', TEAL, 20)),
                                ('trust_advice_text', text('<p>Questions? Call us on <a href="tel:+441443230000">'
                                                           '01443 230000</a></p>', preset='paragraph',
                                                           size='0.875rem'))],
                               direction='row', gap=8, vertical_on_mobile=False)),
    ], gap=8, bg=MIST, radius=12, pad=16)
    order_ = details['block_order']
    order_.insert(order_.index('buy_buttons_eYQEYi') + 1, 'fpg_trust')
    data['sections']['product_recommendations_qggXJq']['settings'].update({'padding-block-start': 56})
    save(root / 'templates' / name, p_header, data)
print('product templates: vendor eyebrow, trust row')
