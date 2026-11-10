"""Shopify search strings to look up our products for every Forst part number in sections.json.

Prints one search per line (vendor:Forst AND (sku:A* OR sku:B* ...)), 60 part numbers each; the
wildcard catches our suffixed SKUs (12-13-003.P). Results go into shop_skus.json as {sku: handle}.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
secs = json.loads((HERE / ('sections_v2.json' if (HERE / 'sections_v2.json').exists() else 'sections.json')).read_text())
known = json.loads((HERE / 'shop_skus.json').read_text()) if (HERE / 'shop_skus.json').exists() else {}
looked = set(json.loads((HERE / 'looked_up.json').read_text())) if (HERE / 'looked_up.json').exists() else set()
nos = sorted({r[1].split('.')[0] for s in secs.values() for sec in s for r in sec['parts']})
import re
norm = lambda k: re.sub(r'[^0-9a-z]', '', k.lower())
have = {norm(k) for k in known}
todo = [n for n in nos if n not in looked and norm(n) not in have]
for i in range(0, len(todo), 30):
    print('vendor:Forst AND (' + ' OR '.join(sorted({f"sku:{re.sub(r'(\d)[A-Z]+$', r'\1', n)}*" for n in todo[i:i + 30]})) + ')')
print(f'# {len(todo)} part numbers to look up, {len(nos)} in all', file=__import__('sys').stderr)
