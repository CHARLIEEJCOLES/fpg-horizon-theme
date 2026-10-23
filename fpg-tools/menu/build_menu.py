"""Turn menu_spec.MENU into the menuUpdate items.

Collections, pages and products become real resource links (type COLLECTION /
PAGE / PRODUCT with their IDs from ids.json), so Liquid sees link.type ==
'collection_link' and link.object (the breadcrumbs block relies on that), and
links follow a handle change. Outside addresses and '#' stay web-address links.

    python3 -I build_menu.py urls    -> prints every collection/page/product path (for checking)
    python3 -I build_menu.py items   -> writes items.json for menuUpdate
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from menu_spec import MENU  # noqa: E402

PREFIX = {'c': '/collections/', 'p': '/pages/', 'prod': '/products/'}
KIND = {'c': ('COLLECTION', 'Collection'), 'p': ('PAGE', 'Page'), 'prod': ('PRODUCT', 'Product')}
IDS = json.loads((Path(__file__).parent / 'ids.json').read_text())


def link(title, target):
    """menuUpdate item for one target (url is kept for de-duplication only)."""
    if target is None or target.startswith('x:'):
        return {'title': title, 'type': 'HTTP', 'url': url(target)}
    kind, handle = target.split(':', 1)
    menu_type, gid_kind = KIND[kind]
    return {'title': title, 'type': menu_type, 'resourceId': IDS[f'{gid_kind}:{handle}'], 'url': url(target)}


def url(target):
    if target is None:
        return '#'
    kind, rest = target.split(':', 1)
    return rest if kind == 'x' else PREFIX[kind] + rest


def walk(items):
    for title, target, children in items:
        yield url(target)
        yield from walk(children)


def build(items, depth=1):
    out = []
    for title, target, children in items:
        item = link(title, target)
        if children:
            kids = build(children, depth + 1)
            # Column headings only open their list on phones, so give each list an
            # "All ..." link to the heading's page (when it adds one and the list stays <= 10).
            urls = {k['url'] for k in kids}
            if depth == 2 and item['url'] not in ('#', '/collections/for-hire') and item['url'] not in urls and len(kids) < 10:
                kids.insert(0, link('All ' + title, target))
            item['items'] = kids
        out.append(item)
    return out


if sys.argv[1] == 'urls':
    print(json.dumps(sorted({u for u in walk(MENU) if u.startswith('/')})))
else:
    def strip(items):
        # menuUpdate takes either a url (HTTP) or a resourceId, not both.
        for item in items:
            if item['type'] != 'HTTP':
                item.pop('url', None)
            strip(item.get('items', []))
        return items

    Path(Path(__file__).parent / 'items.json').write_text(json.dumps(strip(build(MENU)), ensure_ascii=False))
    print('items.json written')
