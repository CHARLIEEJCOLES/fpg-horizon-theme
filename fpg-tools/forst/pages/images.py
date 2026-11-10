"""The Först pictures the pages use: our file name in Shopify Files -> where it came from on forstglobal.com."""
import json, re
from data import W, FEATURES, MACHINES, RANGE_HERO, LOGO

def ext(u):
    return re.search(r'\.(jpe?g|png|webp|svg)$', u).group(1).replace('jpeg', 'jpg')

def feature_name(key):
    return f"fpgf-feat-{key}.{ext(FEATURES[key][2])}"

def names(m):
    """A machine's hero, cut-out and gallery file names (at most six gallery pictures)."""
    out = {}
    if m.get('hero'):
        out['hero'] = (f"fpgf-{m['slug']}-hero.{ext(m['hero'])}", m['hero'])
    if m.get('cut'):
        out['cut'] = (f"fpgf-{m['slug']}-cut.{ext(m['cut'])}", m['cut'])
    out['gallery'] = [(f"fpgf-{m['slug']}-g{i}.{ext(g)}", g) for i, g in enumerate(m.get('gallery', [])[:6], start=1)]
    return out

def all_images():
    out = {'fpgf-range-hero.jpg': RANGE_HERO, 'fpgf-logo.svg': LOGO}
    # Features that share a Först picture share one file.
    seen = {}
    for k, (_, _, src) in FEATURES.items():
        seen.setdefault(src, feature_name(k))
    for src, name in seen.items():
        out[name] = src
    for m in MACHINES:
        n = names(m)
        for key in ('hero', 'cut'):
            if key in n:
                out[n[key][0]] = n[key][1]
        for name, src in n['gallery']:
            out[name] = src
    return out

def feature_file(key):
    src = FEATURES[key][2]
    for k, (_, _, s) in FEATURES.items():
        if s == src:
            return feature_name(k)

if __name__ == '__main__':
    imgs = all_images()
    json.dump({k: W + v for k, v in imgs.items()}, open('images.json', 'w'), indent=1)
    print(len(imgs))
