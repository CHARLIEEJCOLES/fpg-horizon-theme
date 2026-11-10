import json, re, sys
from pathlib import Path
f = Path(__file__).parent / 'looked_up.json'
s = set(json.loads(f.read_text())) if f.exists() else set()
s |= set(re.findall(r'sku:([0-9A-Za-z.-]+)\*', sys.stdin.read()))
f.write_text(json.dumps(sorted(s)))
print(len(s), 'looked up')
