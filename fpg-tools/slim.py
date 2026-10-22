"""Drop block/section settings that equal the schema default (Shopify applies defaults itself)."""
import json, re, sys, functools
from pathlib import Path
theme = Path(sys.argv[1])

@functools.lru_cache(None)
def defaults(kind, t):
    p = theme / kind / f'{t}.liquid'
    if not p.exists():
        return None
    s = p.read_text()
    sch = json.loads(s.split('{% schema %}')[1].split('{% endschema %}')[0])
    return {x['id']: x['default'] for x in sch.get('settings', []) if 'id' in x and 'default' in x}

def slim_settings(settings, dflt):
    if dflt is None:
        return settings
    return {k: v for k, v in settings.items() if not (k in dflt and dflt[k] == v and not isinstance(v, str) or (k in dflt and dflt[k] == v and isinstance(v, str) and not v.startswith('t:')))}

def walk_block(b):
    if b['type'].startswith('shopify://'):
        return
    b['settings'] = slim_settings(b.get('settings', {}), defaults('blocks', b['type']))
    for c in b.get('blocks', {}).values():
        walk_block(c)

def slim(d):
    secs = d.get('sections', {})
    for s in secs.values():
        s['settings'] = slim_settings(s.get('settings', {}), defaults('sections', s['type']))
        for b in s.get('blocks', {}).values():
            walk_block(b)
    return d

if __name__ == '__main__':
    for f in sys.argv[2:]:
        raw = (theme / f).read_text(); d = json.loads(re.sub(r'^/\*.*?\*/\s*', '', raw, flags=re.S))
        out = json.dumps(slim(d), separators=(',', ':'), ensure_ascii=False)
        Path('upload/design/' + f.replace('/', '__')).write_text(out)
        print(f, len(out))
