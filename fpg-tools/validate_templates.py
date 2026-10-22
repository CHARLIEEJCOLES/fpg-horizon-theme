"""Checks FP&G template JSON against the theme's block and section schemas."""
import json, os, re, sys
root = sys.argv[1]
os.chdir(root)
def schema_of(kind, t):
    p = f'{kind}/{t}.liquid'
    if not os.path.exists(p):
        return None
    s = open(p).read()
    return json.loads(s.split('{% schema %}')[1].split('{% endschema %}')[0])
problems = []
def accepted(acc, t):
    if t.startswith('shopify://apps/'):
        return '@app' in acc
    return t in acc or ('@theme' in acc and not t.startswith('_'))
def check_settings(sch, settings, path):
    defs = {x['id']: x for x in sch.get('settings', []) if 'id' in x}
    for sid, val in (settings or {}).items():
        d = defs.get(sid)
        if not d:
            problems.append(('UNKNOWN SETTING', path, sid)); continue
        if d['type'] == 'select' and val not in [o['value'] for o in d['options']]:
            problems.append(('BAD SELECT', path, sid, val))
        if d['type'] == 'range' and (not (d['min'] <= val <= d['max']) or round((val - d['min']) / d.get('step', 1), 6) % 1):
            problems.append(('BAD RANGE', path, sid, val))
def check_block(b, path):
    if b['type'].startswith('shopify://apps/'):
        return  # app block: its schema lives in the app
    sch = schema_of('blocks', b['type'])
    if sch is None:
        problems.append(('MISSING BLOCK FILE', path, b['type'])); return
    check_settings(sch, b.get('settings'), path)
    acc = [x['type'] for x in sch.get('blocks', [])]
    for k, bb in b.get('blocks', {}).items():
        if not bb.get('static') and not accepted(acc, bb['type']):
            problems.append(('NOT ACCEPTED', path + '/' + k, bb['type']))
        check_block(bb, path + '/' + k)
for f in sys.argv[2:]:
    raw = open(f).read(); raw = re.sub(r'^/\*.*?\*/', '', raw, flags=re.S); d = json.loads(raw)
    for sid, sec in d['sections'].items():
        sch = schema_of('sections', sec['type'])
        if sch is None:
            problems.append(('MISSING SECTION FILE', f, sec['type'])); continue
        check_settings(sch, sec.get('settings'), f + ':' + sid)
        acc = [x['type'] for x in sch.get('blocks', [])]
        for k, b in sec.get('blocks', {}).items():
            if not b.get('static') and not accepted(acc, b['type']):
                problems.append(('NOT ACCEPTED', f + ':' + sid + '/' + k, b['type']))
            check_block(b, f + ':' + sid + '/' + k)
print('\n'.join(map(str, problems)) or 'all templates valid')
