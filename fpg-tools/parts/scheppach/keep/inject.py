"""Writes keep.json's machine ids into assets/fpg-parts-hide.js (between keep:start and keep:end)."""
import json, re
from pathlib import Path
HERE = Path(__file__).parent
js = HERE.parents[3] / 'assets' / 'fpg-parts-hide.js'
ids = json.loads((HERE / 'keep.json').read_text())
s = js.read_text()
s = re.sub(r'/\* keep:start \*/\n.*?\n/\* keep:end \*/', '/* keep:start */\nconst KEEP_MODELS = { 10: ' + json.dumps(ids, separators=(',', ':')) + ' };\n/* keep:end */', s, flags=re.S)
js.write_text(s)
print(len(ids), 'Scheppach machines kept')
