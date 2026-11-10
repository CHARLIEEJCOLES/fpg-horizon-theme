"""Writes keep.json's machine ids (and keep_meta.json's parts count) into assets/fpg-parts-hide.js (between keep:start and keep:end)."""
import json, re
from pathlib import Path
HERE = Path(__file__).parent
js = HERE.parents[3] / 'assets' / 'fpg-parts-hide.js'
ids = json.loads((HERE / 'keep.json').read_text())
parts = json.loads((HERE / 'keep_meta.json').read_text())['parts']  # different part numbers in the kept machines' lists (counted in the browser)
s = js.read_text()
s = re.sub(r'/\* keep:start \*/\n.*?\n/\* keep:end \*/', '/* keep:start */\nconst KEEP_MODELS = { 10: ' + json.dumps(ids, separators=(',', ':')) + ' };\nconst KEEP_PARTS = { 10: ' + str(parts) + ' };\n/* keep:end */', s, flags=re.S)
js.write_text(s)
print(len(ids), 'Scheppach machines kept')
