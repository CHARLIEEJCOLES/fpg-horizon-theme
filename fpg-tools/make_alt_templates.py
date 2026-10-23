"""Ports the live (Dawn) theme's extra templates to Horizon – FP&G.

The live theme has collection and page templates with their own content (buying guides,
brand carousels, the kit creator, servicing, shipping policy, solutions pages). Without a
template of the same name, Horizon falls back to the default template and that content
disappears. This rebuilds each one with Horizon sections in the FP&G design.

    python3 -I make_alt_templates.py <theme dir> <live templates dir> <pristine horizon dir>

Collection templates with a product grid keep the FP&G header and grid first; the guide
content follows the products (same text, same order). Landing-page templates without a
grid (combi machines, kit creator, forestry essentials) keep their carousels in order.
"""
import copy
import html
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
live = Path(sys.argv[2])
pristine = Path(sys.argv[3])

TEAL, SAGE, PALE, MIST, LINE, INK, WHITE = (
    '#002D37', '#5F7D6D', '#E2E9E5', '#F3F6F4', '#D6DED9', '#12262B', '#FFFFFF')
SHOP_HOSTS = ('https://forestparkgarden.com', 'http://forestparkgarden.com', 'https://www.forestparkgarden.com')
PLACEHOLDERS = ('Image banner', 'Give customers details about the banner image')


def load(path):
    raw = path.read_text()
    match = re.match(r'^\s*/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def schema(kind, name, base=root):
    s = (base / kind / f'{name}.liquid').read_text()
    return json.loads(s.split('{% schema %}')[1].split('{% endschema %}')[0])


# ---------------------------------------------------------------- content helpers
def plain(value):
    """Heading text without tags (Barlow headings are already bold)."""
    value = re.sub(r'<[^>]+>', '', value or '')
    return re.sub(r'\s+', ' ', html.unescape(value)).strip()


def esc(value):
    return html.escape(value, quote=False)


def tidy_html(value):
    """Rich text from Dawn: drop the tab runs left by copy-paste, keep the markup."""
    value = re.sub(r'[\t\r]+', ' ', value or '')
    value = re.sub(r'(<br\s*/?>)\s+', r'\1', value)
    value = re.sub(r'<(h[1-6]|p)>\s*</\1>', '', value)
    return value.strip()


def link(url):
    """Shop links in the editor's own format; anchors and blanks are dropped."""
    url = (url or '').strip()
    if not url or url.startswith('#'):
        return None
    for host in SHOP_HOSTS:
        if url.startswith(host):
            url = url[len(host):] or '/'
    m = re.match(r'^/(collections|pages|products|blogs)/([^/?#]+)/?$', url)
    if m:
        return f'shopify://{m.group(1)}/{m.group(2)}'
    return url


# ---------------------------------------------------------------- block builders
def text(html_value, preset='rte', color='', align='left', max_width='normal', pad_bottom=0):
    s = {'text': html_value, 'width': '100%', 'max_width': max_width, 'alignment': align,
         'type_preset': preset, 'case': 'none', 'wrap': 'pretty',
         'padding-block-start': 0, 'padding-block-end': pad_bottom}
    if color:
        s['text_color'] = color
    return {'type': 'text', 'settings': s, 'blocks': {}}


def button(label, url, style='button'):
    return {'type': 'button', 'settings': {'label': label, 'link': url, 'style_class': style,
                                           'open_in_new_tab': False, 'width': 'fit-content',
                                           'width_mobile': 'fit-content'}, 'blocks': {}}


def image(src, ratio='adapt', radius=12):
    return {'type': 'image', 'settings': {'image': src, 'image_ratio': ratio, 'width': 'fill',
                                          'width_mobile': 'fill', 'height': 'fit',
                                          'border_radius': radius}, 'blocks': {}}


def group(children, direction='column', gap=12, bg='', radius=0, pad=0, h_align='flex-start',
          v_align='flex-start', width='fill', custom_width=100, vertical_on_mobile=True):
    s = {'content_direction': direction, 'vertical_on_mobile': vertical_on_mobile,
         'horizontal_alignment': h_align, 'vertical_alignment': v_align,
         'horizontal_alignment_flex_direction_column': h_align if h_align != 'space-between' else 'flex-start',
         'vertical_alignment_flex_direction_column': 'flex-start', 'gap': gap, 'width': width,
         'custom_width': custom_width, 'width_mobile': 'fill', 'custom_width_mobile': 100, 'height': 'fit',
         'border_radius': radius, 'padding-block-start': pad, 'padding-block-end': pad,
         'padding-inline-start': pad, 'padding-inline-end': pad}
    if bg:
        s['background_color'] = bg
    return {'type': 'group', 'settings': s, 'blocks': dict(children), 'block_order': [k for k, _ in children]}


def section(children, name, bg='', gap=20, pad=(48, 48), h_align='flex-start'):
    s = {'content_direction': 'column', 'vertical_on_mobile': True, 'horizontal_alignment': h_align,
         'vertical_alignment': 'center', 'horizontal_alignment_flex_direction_column': h_align,
         'vertical_alignment_flex_direction_column': 'center', 'gap': gap, 'section_width': 'page-width',
         'padding-block-start': pad[0], 'padding-block-end': pad[1]}
    if bg:
        s['background_color'] = bg
    return {'type': 'section', 'name': name, 'blocks': dict(children),
            'block_order': [k for k, _ in children], 'settings': s}


def column(key, children, width=75):
    """A centred reading column: full width on phones, narrower on desktop."""
    return (key, group(children, gap=16, width='custom', custom_width=width))


# ---------------------------------------------------------------- Dawn section converters
def conv_rich_text(key, s, eyebrow=None):
    items, buttons = [], []
    if eyebrow:
        items.append((f'{key}_eyebrow', text(f'<p>{esc(eyebrow)}</p>', preset='h6', color=SAGE)))
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        st = b.get('settings', {})
        if b['type'] == 'heading' and plain(st.get('heading')):
            items.append((f'{key}_b{bi}', text(f'<h2>{esc(plain(st["heading"]))}</h2>', preset='h3')))
        elif b['type'] == 'caption' and plain(st.get('caption')):
            items.append((f'{key}_b{bi}', text(f'<p>{esc(plain(st["caption"]))}</p>', preset='h6', color=SAGE)))
        elif b['type'] == 'text' and plain(st.get('text')):
            items.append((f'{key}_b{bi}', text(tidy_html(st['text']))))
        elif b['type'] == 'button':
            for n in ('', '_2'):
                label, url = st.get(f'button_label{n}'), link(st.get(f'button_link{n}'))
                if label and url:
                    style = 'button' if not buttons else 'button-secondary'
                    buttons.append((f'{key}_b{bi}_btn{len(buttons)}', button(plain(label), url, style)))
    if buttons:
        items.append((f'{key}_buttons', group(buttons, direction='row', gap=12, width='fit-content',
                                              vertical_on_mobile=False)))
    if not items:
        return []
    return [(key, section([column(f'{key}_col', items)], 'Text', pad=(40, 24)))]


def conv_collapsible(key, s):
    st = s.get('settings', {})
    rows, order = {}, []
    for i, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        bs = b.get('settings', {})
        rk = f'{key}_row{i}'
        row = {'type': '_accordion-row',
               'settings': {'heading': plain(bs.get('heading')) or 'More information',
                            'open_by_default': bool(i == 0 and st.get('open_first_collapsible_row'))},
               'blocks': {}, 'block_order': []}
        if plain(bs.get('row_content')):
            row['blocks'][f'{rk}_text'] = text(tidy_html(bs['row_content']))
            row['block_order'].append(f'{rk}_text')
        rows[rk] = row
        order.append(rk)
    items = []
    if plain(st.get('caption')):
        items.append((f'{key}_caption', text(f'<p>{esc(plain(st["caption"]))}</p>', preset='h6', color=SAGE)))
    if plain(st.get('heading')):
        items.append((f'{key}_title', text(f'<h2>{esc(plain(st["heading"]))}</h2>', preset='h3')))
    items.append((f'{key}_accordion', {
        'type': 'accordion',
        'settings': {'icon': 'plus', 'dividers': True, 'divider_color': LINE, 'type_preset': 'h5',
                     'padding-block-start': 0, 'padding-block-end': 0},
        'blocks': rows, 'block_order': order}))
    return [(key, section([column(f'{key}_col', items)], 'Questions', bg=MIST))]


def conv_multicolumn(key, s):
    st = s.get('settings', {})
    cards = []
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        bs = b.get('settings', {})
        kids = []
        ck = f'{key}_b{bi}'
        if bs.get('image'):
            kids.append((f'{ck}_img', image(bs['image'])))
        if plain(bs.get('title')):
            kids.append((f'{ck}_title', text(f'<h3>{esc(plain(bs["title"]))}</h3>', preset='h5')))
        if plain(bs.get('text')):
            kids.append((f'{ck}_text', text(tidy_html(bs['text']))))
        url = link(bs.get('link'))
        if bs.get('link_label') and url:
            kids.append((f'{ck}_link', button(plain(bs['link_label']), url, 'button-secondary')))
        if kids:
            cards.append((ck, group(kids, gap=8, bg=MIST, radius=12, pad=24)))
    items = []
    if plain(st.get('title')):
        items.append((f'{key}_title', text(f'<h2>{esc(plain(st["title"]))}</h2>', preset='h3')))
    items.append((f'{key}_cards', group(cards, direction='row', gap=16)))
    url = link(st.get('button_link'))
    if st.get('button_label') and url:
        items.append((f'{key}_btn', button(plain(st['button_label']), url, 'button-secondary')))
    return [(key, section(items, 'Columns', pad=(40, 40)))]


def media_with_content(key, src, kids, media_position, name):
    content = dict(kids)
    return {
        'type': 'media-with-content', 'name': name,
        'blocks': {
            'media': {'type': '_media-without-appearance', 'static': True,
                      'settings': {'media_type': 'image', 'image': src, 'image_position': 'cover'},
                      'blocks': {}},
            'content': {'type': '_content-without-appearance', 'static': True,
                        'settings': {'horizontal_alignment_flex_direction_column': 'flex-start',
                                     'vertical_alignment_flex_direction_column': 'center', 'gap': 16},
                        'blocks': content, 'block_order': [k for k, _ in kids]},
        },
        'block_order': [],
        'settings': {'media_position': media_position, 'media_width': 'medium', 'media_height': '50svh',
                     'section_width': 'page-width', 'extend_media': False,
                     'padding-block-start': 32, 'padding-block-end': 32},
    }


def conv_multirow(key, s):
    st = s.get('settings', {})
    out = []
    left_first = st.get('image_layout', 'alternate-left') != 'alternate-right'
    n = 0
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        bs = b.get('settings', {})
        rk = f'{key}_{n}'
        kids = []
        if plain(bs.get('caption')):
            kids.append((f'{rk}_caption', text(f'<p>{esc(plain(bs["caption"]))}</p>', preset='h6', color=SAGE)))
        if plain(bs.get('heading')):
            kids.append((f'{rk}_title', text(f'<h2>{esc(plain(bs["heading"]))}</h2>', preset='h3')))
        if plain(bs.get('text')):
            kids.append((f'{rk}_text', text(tidy_html(bs['text']))))
        url = link(bs.get('button_link'))
        if bs.get('button_label') and url:
            kids.append((f'{rk}_btn', button(plain(bs['button_label']), url, 'button-secondary')))
        position = 'left' if (n % 2 == 0) == left_first else 'right'
        if bs.get('image'):
            out.append((rk, media_with_content(rk, bs['image'], kids, position, 'Picture and text')))
        elif kids:
            out.append((rk, section([column(f'{rk}_col', kids)], 'Text')))
        n += 1
    return out


def heading_row(key, title, eyebrow=None):
    left = []
    if eyebrow:
        left.append((f'{key}_eyebrow', text(f'<p>{esc(eyebrow)}</p>', preset='h6', color=SAGE)))
    left.append((f'{key}_title', text(f'<h2>{esc(title)}</h2>', preset='h3')))
    items = [(f'{key}_left', group(left, gap=4, width='fit-content'))]
    items.append((f'{key}_link', {'type': '_product-list-button', 'settings': {
        'label': 'View all', 'style_class': 'button-secondary', 'width': 'fit-content',
        'width_mobile': 'fit-content'}, 'blocks': {}}))
    head = group(items, direction='row', h_align='space-between', v_align='flex-end', gap=16,
                 vertical_on_mobile=False)
    head['type'] = '_product-list-content'
    head['static'] = True
    return head


PRODUCT_LIST = schema('sections', 'product-list', pristine)


def conv_featured_collection(key, s, bg=''):
    st = s.get('settings', {})
    handle = st.get('collection')
    if not handle:
        return []
    preset = copy.deepcopy(PRODUCT_LIST['presets'][1])
    card = preset['blocks']['static-product-card']
    card['blocks']['product-card-gallery']['settings'].update({'image_ratio': 'square', 'border_radius': 8})
    card['blocks']['product_title']['settings'].update({'font_size': '0.875rem', 'type_preset': 'custom',
                                                        'width': '100%', 'font': 'var(--font-subheading--family)'})
    card['blocks']['price']['settings'].update({'type_preset': 'paragraph'})
    card['settings']['product_card_gap'] = 8
    for b in card['blocks'].values():
        b.setdefault('blocks', {})
    title = plain(st.get('title')) or 'Products'
    settings = dict(preset['settings'])
    settings.update({'collection': handle, 'max_products': min(16, int(st.get('products_to_show') or 8)),
                     'layout_type': 'carousel', 'columns': 4, 'mobile_columns': '2',
                     'carousel_on_mobile': True, 'columns_gap': 16, 'rows_gap': 24, 'icons_style': 'arrow',
                     'icons_shape': 'circle', 'gap': 24, 'padding-block-start': 40,
                     'padding-block-end': 40})
    if bg:
        settings['background_color'] = bg
    return [(key, {'type': 'product-list', 'name': f'Products: {title}',
                   'blocks': {'static-header': heading_row(f'{key}_head', title),
                              'static-product-card': card},
                   'block_order': [], 'settings': settings})]


def conv_image_banner(key, s):
    st = s.get('settings', {})
    kids = []
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        bs = b.get('settings', {})
        value = plain(bs.get('heading') or bs.get('text') or '')
        if not value or value.startswith(PLACEHOLDERS):
            continue
        if b['type'] == 'heading':
            kids.append((f'{key}_b{bi}', text(f'<h2>{esc(value)}</h2>', preset='h2')))
        elif b['type'] == 'text':
            kids.append((f'{key}_b{bi}', text(f'<p>{esc(value)}</p>')))
    items = []
    if st.get('image'):
        items.append((f'{key}_img', image(st['image'])))
    items += kids
    if not items:
        return []
    return [(key, section(items, 'Banner', pad=(24, 8)))]


def conv_image_with_text(key, s):
    st = s.get('settings', {})
    kids = []
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if b.get('disabled'):
            continue
        bs = b.get('settings', {})
        if b['type'] == 'heading' and plain(bs.get('heading')):
            kids.append((f'{key}_b{bi}', text(f'<h2>{esc(plain(bs["heading"]))}</h2>', preset='h3')))
        elif b['type'] == 'caption' and plain(bs.get('caption')):
            kids.append((f'{key}_b{bi}', text(f'<p>{esc(plain(bs["caption"]))}</p>', preset='h6', color=SAGE)))
        elif b['type'] == 'text' and plain(bs.get('text')):
            kids.append((f'{key}_b{bi}', text(tidy_html(bs['text']))))
        elif b['type'] == 'button':
            url = link(bs.get('button_link'))
            if bs.get('button_label') and url:
                kids.append((f'{key}_b{bi}', button(plain(bs['button_label']), url)))
    position = 'left' if st.get('layout', 'image_first') == 'image_first' else 'right'
    if st.get('image'):
        return [(key, media_with_content(key, st['image'], kids, position, 'Picture and text'))]
    return [(key, section([column(f'{key}_col', kids)], 'Text'))] if kids else []


def conv_collage(key, s):
    imgs = []
    for bi, bid in enumerate(s.get('block_order', [])):
        b = s['blocks'][bid]
        if not b.get('disabled') and b['type'] == 'image' and b.get('settings', {}).get('image'):
            imgs.append((f'{key}_b{bi}', image(b['settings']['image'])))
    if not imgs:
        return []
    return [(key, section([column(f'{key}_col', imgs)], 'Pictures', pad=(8, 8)))]


def conv_collection_list(key, s, index_sections):
    st = s.get('settings', {})
    handles = [s['blocks'][b]['settings'].get('collection') for b in s.get('block_order', [])
               if not s['blocks'][b].get('disabled')]
    handles = [h for h in handles if h]
    if not handles:
        return []
    out = copy.deepcopy(index_sections['fpg_categories'])
    head = out['blocks']['cat_head']
    head['blocks']['cat_head_left']['blocks']['cat_head_title']['settings']['text'] = \
        f'<h2>{esc(plain(st.get("title")) or "Collections")}</h2>'
    head['blocks'].pop('cat_head_link')
    head['block_order'] = ['cat_head_left']
    out['settings'].update({'collection_list': handles, 'max_collections': len(handles),
                            'columns': min(5, len(handles)), 'padding-block-start': 40, 'padding-block-end': 40})
    out['name'] = 'Collections'
    return [(key, out)]


FEATURED_PRODUCT = schema('sections', 'featured-product', pristine)


def conv_featured_product(key, s):
    handle = s.get('settings', {}).get('product')
    if not handle:
        return []
    preset = copy.deepcopy(FEATURED_PRODUCT['presets'][0])
    return [(key, {'type': 'featured-product', 'name': 'Featured product', 'blocks': preset['blocks'],
                   'block_order': preset.get('block_order', []),
                   'settings': {'product': handle, 'layout': 'media-left',
                                'padding-block-start': 40, 'padding-block-end': 40}})]


def block_exists(t):
    return t.startswith('shopify://apps/') or (root / 'blocks' / f'{t}.liquid').exists()


def conv_blocks(key, s):
    """Horizon's own custom section; app blocks from Dawn's "Apps" section move into it."""
    blocks = {k: v for k, v in s.get('blocks', {}).items() if not v.get('disabled') and block_exists(v['type'])}
    order = [k for k in s.get('block_order', []) if k in blocks]
    settings = s.get('settings', {}) if s['type'] == '_blocks' else {}
    out = {'type': '_blocks', 'blocks': blocks, 'block_order': order, 'settings': settings}
    if s.get('name'):
        out['name'] = s['name']
    return [(key, out)]


# ---------------------------------------------------------------- templates
_, base_collection = load(root / 'templates' / 'collection.json')
_, base_page = load(root / 'templates' / 'page.json')
_, index = load(root / 'templates' / 'index.json')
index_sections = index['sections']


def convert(key, s, first_guide=False, bg=''):
    t = s['type']
    if t == 'rich-text':
        return conv_rich_text(key, s, eyebrow='Buying guide' if first_guide else None)
    if t == 'collapsible-content':
        return conv_collapsible(key, s)
    if t == 'multicolumn':
        return conv_multicolumn(key, s)
    if t == 'multirow':
        return conv_multirow(key, s)
    if t == 'featured-collection':
        return conv_featured_collection(key, s, bg=bg)
    if t == 'image-banner':
        return conv_image_banner(key, s)
    if t == 'image-with-text':
        return conv_image_with_text(key, s)
    if t == 'collage':
        return conv_collage(key, s)
    if t == 'collection-list':
        return conv_collection_list(key, s, index_sections)
    if t == 'featured-product':
        return conv_featured_product(key, s)
    if t in ('_blocks', 'apps'):
        return conv_blocks(key, s)
    raise SystemExit(f'no converter for {t}')


def is_stale_offer(s):
    """The forestry landing page still carries a February special offer (heading and
    featured product); a dated promotion is left out rather than carried over."""
    if s['type'] == 'featured-product':
        return True
    if s['type'] == 'rich-text':
        text = ' '.join(plain(b.get('settings', {}).get('heading', '')) for b in s.get('blocks', {}).values())
        return 'special offer' in text.lower()
    return False


def build_collection(name):
    _, src = load(live / f'collection.{name}.json')
    order = [sid for sid in src['order'] if not src['sections'][sid].get('disabled')]
    has_grid = 'product-grid' in order
    out = {'sections': {}, 'order': []}
    head_key = base_collection['order'][0]
    out['sections'][head_key] = copy.deepcopy(base_collection['sections'][head_key])
    out['order'].append(head_key)
    # Guide content follows the products; landing pages, and the servicing page (whose
    # "How it works" explains the services below it), keep the live order.
    keep_order = name in CONTENT_FIRST
    if has_grid and not keep_order:
        out['sections']['main'] = copy.deepcopy(base_collection['sections']['main'])
        out['order'].append('main')
    guide = [sid for sid in order if src['sections'][sid]['type'] != 'main-collection-banner'
             and (keep_order or sid != 'product-grid')]
    first_text = True
    shade = False
    for i, sid in enumerate(guide):
        s = src['sections'][sid]
        if is_stale_offer(s):
            continue
        key = f'fpg_{i:02d}'
        if sid == 'product-grid':
            out['sections']['main'] = copy.deepcopy(base_collection['sections']['main'])
            out['order'].append('main')
            if name == 'repair-page':
                # The second promo tile advertises this very page.
                out['sections']['main']['blocks']['fpg-promo-tile-2']['settings']['enabled'] = False
            continue
        bg = ''
        if s['type'] == 'featured-collection':
            bg = MIST if shade else ''
            shade = not shade
        is_first_guide = has_grid and not keep_order and len(guide) > 2 and first_text and s['type'] == 'rich-text'
        for k, sec in convert(key, s, first_guide=is_first_guide, bg=bg):
            out['sections'][k] = sec
            out['order'].append(k)
        if s['type'] == 'rich-text':
            first_text = False
    return out


def build_page(name):
    _, src = load(live / f'page.{name}.json')
    out = {'sections': {'main': copy.deepcopy(base_page['sections']['main'])}, 'order': ['main']}
    if src['sections'].get('main', {}).get('disabled'):
        out['sections']['main']['disabled'] = True
    rest = [sid for sid in src['order'] if sid != 'main' and not src['sections'][sid].get('disabled')]
    for i, sid in enumerate(rest):
        for k, sec in convert(f'fpg_{i:02d}', src['sections'][sid]):
            if sec['type'] == '_blocks' and not sec['blocks']:
                continue
            out['sections'][k] = sec
            out['order'].append(k)
    return out


CONTENT_FIRST = ('repair-page',)
COLLECTIONS = ['class-a-trousers', 'class-c-trousers', 'combi-machines', 'forestry-arboriculture', 'helmets',
               'kit-creator', 'petrol-chainsaws', 'pole-saws', 'power-pruners', 'repair-page', 'tool-help',
               'top-handle-chainsaw']
PAGES = ['shipping-policy', 'solutions-page', 'tall-hedges-solu', 'test-page']

for name in COLLECTIONS:
    save(root / 'templates' / f'collection.{name}.json', build_collection(name))
for name in PAGES:
    save(root / 'templates' / f'page.{name}.json', build_page(name))

LEGACY_CSS = """
{% style %}
  /* Dawn's page-width class, which the app's markup uses. */
  .fpg-legacy-page { padding-block: 32px 56px; }
  .fpg-legacy-page .page-width {
    max-width: var(--page-width);
    margin-inline: auto;
    padding-inline: var(--page-margin);
  }
  .fpg-legacy-page .ymm_pg_title:empty { display: none; }
  .fpg-legacy-page #products {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: 24px 16px;
  }
{% endstyle %}
"""
# The YMM app's results page is a Liquid template that uses the app's own snippets.
ymm = (live / 'page.ymm-custom.liquid').read_text()
(root / 'templates' / 'page.ymm-custom.liquid').write_text(
    '{%- comment -%} FP&G: Year/Make/Model app results page, copied from the Dawn theme. '
    'The app writes the matching products into #products. {%- endcomment -%}\n'
    '<div class="fpg-legacy-page">\n' + ymm.strip() + '\n</div>\n' + LEGACY_CSS)
for snip in ('ymm-searchbox.liquid', 'ymm_fields.liquid'):
    (root / 'snippets' / snip).write_text((live / snip).read_text())

print('written', len(COLLECTIONS), 'collection templates,', len(PAGES), 'page templates, YMM results page')
