"""Second pass on the kit creator, servicing and hire pages (run after make_shop_tools.py).

    python3 -I make_page_refresh.py <theme dir>

- Old banners with text baked into the picture, the chalkboard pictures and the old
  intro copy are removed. Each page now opens with the FP&G page hero (new pictures).
- Kit creator: the two "minimum kit" rows keep their place but use the new kit
  pictures and the lists are real text.
- Servicing: the service finder gets machine pictures; its "included" panel is
  dropped because the hero already lists it.
- Hire: hero above the hire centre, whose own heading is hidden.
- Home page: the hire row uses the new line-up picture and a fifth help card links the kit creator.
Pictures are referenced by their Files name (shopify://shop_images/<name>).
"""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
IMG = 'shopify://shop_images/'
PHONE = 'tel:01443230000'


def load(name):
    raw = (root / 'templates' / name).read_text()
    match = re.match(r'^\s*/\*.*?\*/\s*', raw, flags=re.S)
    header = match.group(0) if match else ''
    return header, json.loads(raw[len(header):])


def save(name, header, data):
    (root / 'templates' / name).write_text(header + json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def hero(**settings):
    return {'type': 'fpg-page-hero', 'settings': settings}


def drop(tpl, *keys):
    for k in keys:
        tpl['sections'].pop(k, None)
    tpl['order'] = [k for k in tpl['order'] if k not in keys]


def put_first(tpl, key, section):
    tpl['sections'][key] = section
    tpl['order'] = [key] + [k for k in tpl['order'] if k != key]


def ul(items):
    return '<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'


# ---------------------------------------------------------------- kit creator
header, kit = load('collection.kit-creator.json')
drop(kit, 'section', 'fpg_00', 'fpg_01')
put_first(kit, 'fpg_hero', hero(
    eyebrow='Kit creator',
    heading='Build your climbing kit',
    text='<p>Put together a complete tree-climbing or aerial rescue kit from Teufelberger, Petzl, Notch, '
         'Stein, Treehog, Marlow and more. We check it against the minimum kit as you go.</p>',
    point_1='Checklist against the minimum climbing and rescue kit',
    point_2='Pick sizes and quantities as you go',
    point_3='Add the whole kit to your basket in one go',
    button_1_label='Start building', button_1_link='#kit-builder',
    button_2_label='Ask our arb team', button_2_link=PHONE,
    image=IMG + 'Arborist_Gear_Flat_Lay_in_Earthy_Tones.png', image_position='right center',
))
k = kit['sections']['fpg_kit']['settings']
k.update({'eyebrow': 'Step by step', 'heading': 'Which kit are you building?',
          'intro': '<p>Choose the kit type, then work through the steps. Your list, checklist and total update as you go.</p>'})

MIN = {
    'fpg_02': ('Arborist_Rope-Access_Gear_Flat_Lay.png', 'The minimum climbing kit', [
        'A harness that fits you',
        'Two climbing ropes: one long enough to reach the ground, one that can be shorter',
        'One lanyard, up to 5 m',
        'Three friction devices, any mix of mechanical devices and hitch cord',
        'Three to six triple-locking karabiners',
        'One throwline weight (bag and line optional)',
    ]),
    'fpg_03': ('Arborist_Climbing_Gear_Flat_Lay.png', 'Add this for a rescue kit', [
        'A bridge-to-bridge connector: a prusik loop and one karabiner, or a webbing sling and two karabiners',
        'One extra friction device',
        'One extra karabiner',
        'A set of climbing irons or spikes',
    ]),
}
for key, (image, title, items) in MIN.items():
    sec = kit['sections'][key]
    sec['blocks']['media']['settings']['image'] = IMG + image
    content = sec['blocks']['content']['blocks']
    first, second = sec['blocks']['content']['block_order'][:2]
    content[first]['settings']['text'] = f'<h2>{title}</h2>'
    content[second]['settings']['text'] = ul(items)
save('collection.kit-creator.json', header, kit)

# ---------------------------------------------------------------- servicing
header, svc = load('collection.repair-page.json')
drop(svc, 'section', 'fpg_00')
put_first(svc, 'fpg_hero', hero(
    eyebrow='Nationwide service and repair',
    text='<p>Send us your machine from anywhere in the UK. Our Treforest workshop services it with genuine '
         'parts and sends it straight back.</p>',
    point_1='Genuine replacement parts',
    point_2='Speedy completion',
    point_3='Delivery and return included',
    button_1_label='Find your service', button_1_link='#service-finder',
    button_2_label='Call the workshop', button_2_link=PHONE,
    image=IMG + 'Chainsaw_Maintenance_in_a_Warm_Workshop.png', image_position='right center',
))
finder = svc['sections']['fpg_finder']
finder['settings']['included'] = ''
PICS = {'Chainsaw': 'Studio_Chainsaw_Product_Shot.png', 'Hedge trimmer': 'Professional_Petrol_Hedge_Trimmer.png',
        'Blower': 'Orange_and_Black_Backpack_Leaf_Blower.png', 'KombiEngine': 'Modular_Garden_Multitool_Attachment_Set.png'}
seen = set()
for b in finder['blocks'].values():
    m = b['settings']['machine']
    if m in PICS and m not in seen:
        b['settings']['machine_image'] = IMG + PICS[m]
        seen.add(m)
save('collection.repair-page.json', header, svc)

# ---------------------------------------------------------------- hire
header, hire = load('collection.hire.json')
drop(hire, 'section')
put_first(hire, 'fpg_hero', hero(
    eyebrow='Machine hire',
    heading='Hire professional machinery',
    text='<p>Wood chippers, stump grinders, ride-on brush cutters and mowers, maintained by our own workshop. '
         'Collect from Treforest by the day, weekend or week.</p>',
    point_1='Day, weekend and week prices up front',
    point_2='Book online or send a quick request',
    point_3='Every machine serviced in our own workshop',
    button_1_label='See the machines', button_1_link='#hire-machines',
    button_2_label='Call about hire', button_2_link=PHONE,
    image=IMG + 'Wood_Chipping_Overlook.png', image_position='right center',
))
hire['sections']['fpg_hire']['settings'].update({'eyebrow': '', 'heading': '', 'intro': ''})
save('collection.hire.json', header, hire)

# ---------------------------------------------------------------- home page
header, home = load('index.json')
home['sections']['fpg_hire']['blocks']['media']['settings']['image'] = IMG + 'Orange_Forestry_Equipment_Display.png'
help_sec = home['sections']['fpg_help']
help_sec['blocks']['help_head']['blocks']['help_head_left']['blocks']['help_head_eyebrow']['settings']['text'] = \
    '<p>Parts · Servicing · Hire · Kit</p>'
cards = help_sec['blocks']['help_cards']
card = json.loads(json.dumps(cards['blocks']['help_3']).replace('help_3_', 'help_4_'))
card['settings']['link'] = 'shopify://collections/kit-creator'
card['blocks']['help_4_icon']['settings']['icon'] = 'check_box'
card['blocks']['help_4_title']['settings']['text'] = '<h3>Build a climbing kit</h3>'
card['blocks']['help_4_text']['settings']['text'] = '<p>Pick a harness, ropes and hardware, checked against the minimum kit.</p>'
cards['blocks']['help_4'] = card
cards['block_order'] = [k for k in cards['block_order'] if k != 'help_4'] + ['help_4']
save('index.json', header, home)

print('page refresh applied')
