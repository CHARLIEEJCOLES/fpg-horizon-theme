"""Add Admin API lookups to shop_skus.json ({sku: handle}). Input lines: 'sku handle', or just 'sku' when the
handle is the usual forst-<sku> (handleized)."""
import json, re, sys
from pathlib import Path
HERE = Path(__file__).parent
f = HERE / 'shop_skus.json'
d = json.loads(f.read_text()) if f.exists() else {}
for line in sys.stdin.read().split('\n'):
    p = line.split()
    if not p:
        continue
    sku = p[0]
    d[sku] = p[1] if len(p) > 1 else 'forst-' + re.sub(r'[^a-z0-9]+', '-', sku.lower()).strip('-')
f.write_text(json.dumps(d, indent=0, sort_keys=True))
print(len(d), 'SKUs known')
