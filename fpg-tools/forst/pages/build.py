"""Builds the Först pages' theme files from data.py:

  snippets/fpg-forst-m-<slug>.liquid   one machine's page (hero, features, gallery, spec, service kit, parts, enquiry)
  sections/fpg-forst-machine.liquid    picks the snippet for the product being shown
  sections/fpg-forst-range.liquid      the range page (all machines, comparison, technology, kits, enquiry)

Hand-written and left alone: snippets/fpg-forst-kit-row.liquid, snippets/fpg-forst-enquiry.liquid,
assets/fpg-forst.css, assets/fpg-forst.js, templates/product.forst.json, templates/page.forst.json.
Parts counts and drawing thumbnails come from assets/fpg-maker-forst.json, so run this after build_svt.py.
"""
import html, json
from pathlib import Path
from data import FEATURES, KIT_PARTS, KITS, OLDER_KITS, MACHINES, LEGACY
from images import names, feature_file

ROOT = Path(__file__).resolve().parents[3]
FILES = 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/'
FINDER = '/pages/fpg-part-finder'
maker = json.loads((ROOT / 'assets' / 'fpg-maker-forst.json').read_text())
ALL = MACHINES + LEGACY
BY_SLUG = {m['slug']: m for m in ALL}
# On a draft theme the machine pages are reached with ?view=forst (the products aren't switched to the template until go-live).
VIEW = "{% if theme.role != 'main' %}?view=forst{% endif %}"
ARROW = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

e = html.escape


def img(name, widths, sizes, alt='', cls='', w=None, h=None, lazy=True):
    """An <img> from Shopify Files with a srcset."""
    src = FILES + name
    srcset = ', '.join(f'{src}?width={x} {x}w' for x in widths)
    return (f'<img{f" class=\"{cls}\"" if cls else ""} src="{src}?width={widths[min(1, len(widths) - 1)]}" srcset="{srcset}" sizes="{sizes}" alt="{e(alt)}"'
            f'{f" width=\"{w}\" height=\"{h}\"" if w else ""}{" loading=\"lazy\"" if lazy else " fetchpriority=\"high\""} decoding="async">')


def product_url(m):
    return f"/products/{m['handle']}{VIEW}"


def finder_url(m):
    return f"{FINDER}?model={m['finder']}" if m.get('finder') else f'{FINDER}?brand=16'


def parts_facts(m):
    """(parts, drawings, first drawing pictures) from the parts finder's Först file, when the machine is in it."""
    secs = (maker['models'].get(str(m.get('finder'))) or {}).get('sections') or []
    if not secs:
        return None
    parts = len({p[1] for s in secs for p in s['parts']})
    pics = [p for s in secs for p in s.get('pics', [])]
    names_ = [s['name'].split(' › ')[-1].split(' (')[0] for s in secs]
    return parts, len(pics), pics[:4], names_[:4]


def kit_rows(kit_key):
    oil, items = KITS[kit_key]
    rows = []
    for sku, qty in items:
        label, note, handle = KIT_PARTS[sku]
        rows.append("{%- render 'fpg-forst-kit-row', handle: '" + handle + "', sku: '" + sku + "', label: '" + label.replace("'", '’') + "', note: '" + note.replace("'", '’') + "', qty: " + str(qty) + " -%}")
    return oil, rows


def crumbs(m=None):
    out = ['<nav class="fpg-fo-crumbs" aria-label="Breadcrumb"><ol>', '<li><a href="/">Home</a></li>']
    if m:
        out.append("<li><a href=\"{{ range_url }}\">Först woodchippers</a></li>")
        out.append(f'<li aria-current="page">{e(m["name"])}</li>')
    else:
        out.append('<li aria-current="page">Först woodchippers</li>')
    out.append('</ol></nav>')
    return ''.join(out)


def machine_snippet(m):
    n = names(m)
    name = m['name']
    legacy = not m.get('hero')
    o = []
    o.append("{%- doc -%}\n  The Först " + name + " page. Built by fpg-tools/forst/pages/build.py from data.py: edit there, not here.\n\n  @param {object} product - The product\n  @param {string} range_url - The Först range page\n{%- enddoc -%}")
    o.append('<article class="fpg-fo" data-fpg-skin="forst" data-fo-machine="' + e(name) + '">')

    # ---- hero
    cut = img(n['cut'][0], [640, 960, 1406], '(min-width: 990px) 52vw, 92vw', alt=f'Först {name} woodchipper', w=1406, h=955, lazy=False) if 'cut' in n else \
        "{%- if product.featured_image -%}<img class=\"fpg-fo-hero__own\" src=\"{{ product.featured_image | image_url: width: 1000 }}\" alt=\"{{ product.title | escape }}\" width=\"1000\" height=\"1000\" fetchpriority=\"high\">{%- endif -%}"
    o.append('<header class="fpg-fo-hero"><div class="fpg-fo-wrap">')
    o.append(crumbs(m))
    o.append('<div class="fpg-fo-hero__grid"><div class="fpg-fo-hero__text">')
    o.append(f'<img class="fpg-fo-hero__logo" src="{FILES}fpgf-logo.svg" alt="Först" width="116" height="27">')
    o.append(f'<h1 class="fpg-fo-hero__h"><span class="fpg-fo-hero__model">{e(name)}</span> <span class="fpg-fo-hero__kind">Först {e(m["title"])}</span></h1>')
    o.append(f'<p class="fpg-fo-hero__pitch">{e(m["pitch"])}</p>')
    o.append('<div class="fpg-fo-hero__cta"><a class="fpg-fo-btn fpg-fo-btn--go" href="#enquire">Get a quote or book a demo</a>'
             "<a class=\"fpg-fo-btn fpg-fo-btn--line\" href=\"tel:{{ shop.phone | default: '01443230000' | remove: ' ' }}\">Call {{ shop.phone | default: '01443 230000' }}</a></div>")
    o.append("{%- assign avail = product.metafields.custom.availability.value -%}{%- if avail != blank -%}<p class=\"fpg-fo-hero__stock{% if avail contains 'In stock' %} is-in{% endif %}\">{{ avail | escape }}{% if avail contains 'In stock' %} at Treforest{% endif %}</p>{%- endif -%}")
    o.append('</div>')
    o.append(f'<div class="fpg-fo-hero__pic">{cut}</div></div>')
    o.append('<dl class="fpg-fo-facts">' + ''.join(f'<div><dt>{e(lbl)}</dt><dd>{e(val)}</dd></div>' for val, lbl in m['facts']) + '</dl>')
    o.append('</div></header>')

    # ---- jump links
    pf = parts_facts(m)
    jumps = [('#features', 'Features')]
    if n['gallery']:
        jumps.append(('#photos', 'Photos'))
    jumps.append(('#spec', 'Specification'))
    if m.get('kit'):
        jumps.append(('#service-kit', 'Service kit'))
    jumps.append(('#parts', 'Parts'))
    jumps.append(('#enquire', 'Enquire'))
    o.append('<nav class="fpg-fo-jump" aria-label="On this page"><div class="fpg-fo-wrap"><ul>' + ''.join(f'<li><a href="{h}">{t}</a></li>' for h, t in jumps) + '</ul></div></nav>')

    # ---- features
    o.append(f'<section class="fpg-fo-sec" id="features"><div class="fpg-fo-wrap"><h2 class="fpg-fo-h2">How the {e(name)} is built</h2><ul class="fpg-fo-feats" role="list">')
    for k in m['features']:
        title, text, _ = FEATURES[k]
        o.append('<li class="fpg-fo-feat">' + img(feature_file(k), [400, 768], '(min-width: 990px) 30vw, (min-width: 600px) 46vw, 92vw', w=768, h=576)
                 + f'<div><h3>{e(title)}</h3><p>{e(text)}</p></div></li>')
    o.append('</ul></div></section>')

    # ---- photos: the wide working shot, then the gallery
    if not legacy:
        o.append('<section class="fpg-fo-sec fpg-fo-sec--dark" id="photos"><div class="fpg-fo-wrap">')
        o.append(f'<h2 class="fpg-fo-h2">The {e(name)} at work</h2>')
        o.append('<div class="fpg-fo-shots">')
        shots = [n['hero']] + n['gallery']
        for i, (fn, _) in enumerate(shots):
            big = i == 0
            o.append(f'<a class="fpg-fo-shot{" fpg-fo-shot--wide" if big else ""}" href="{FILES}{fn}?width=2048" data-fo-shot>'
                     + img(fn, [480, 800, 1400] if big else [400, 800], '(min-width: 990px) 60vw, 92vw' if big else '(min-width: 990px) 30vw, 46vw', alt=f'Först {name}, photo {i + 1}', w=2048, h=1200 if big else 1536)
                     + '</a>')
        o.append('</div><p class="fpg-fo-credit">Photos: Först.</p></div></section>')

    # ---- specification and the machines next to it
    sibs = [x for x in MACHINES if x['kind'] == m['kind'] and x['slug'] != m['slug']]
    o.append(f'<section class="fpg-fo-sec" id="spec"><div class="fpg-fo-wrap fpg-fo-spec"><div><h2 class="fpg-fo-h2">{e(name)} specification</h2><dl class="fpg-fo-dl">')
    for k, v in m['spec']:
        o.append(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>')
    o.append('</dl><p class="fpg-fo-small">Figures are Först’s published specification. Ask us to confirm anything that matters for your job before you order.</p></div>')
    if sibs:
        o.append(f'<aside class="fpg-fo-alt"><h3>Other {e(m["kind"])} Först chippers</h3><div class="fpg-fo-scroll"><table><thead><tr><th scope="col">Model</th><th scope="col">Opening</th><th scope="col">Engine</th><th scope="col">Weight</th></tr></thead><tbody>')
        o.append(f'<tr class="is-this"><th scope="row">{e(name)}</th><td>{e(m["cap"])}</td><td>{e(m["power"])} {e(m["fuel"].lower())}</td><td>{e(m["weight"])}</td></tr>')
        for x in sibs:
            o.append(f'<tr><th scope="row"><a href="{product_url(x)}">{e(x["name"])}</a></th><td>{e(x["cap"])}</td><td>{e(x["power"])} {e(x["fuel"].lower())}</td><td>{e(x["weight"])}</td></tr>')
        o.append("</tbody></table></div><a class=\"fpg-fo-link\" href=\"{{ range_url }}#compare\">Compare the whole range " + ARROW + "</a></aside>")
    o.append('</div></section>')

    # ---- service kit
    if m.get('kit'):
        oil, rows = kit_rows(m['kit'])
        o.append(f'<section class="fpg-fo-sec fpg-fo-sec--tint" id="service-kit"><div class="fpg-fo-wrap"><div class="fpg-fo-kit__head"><div><h2 class="fpg-fo-h2">{e(name)} service kit</h2>'
                 f'<p class="fpg-fo-lead">The filters and service parts this machine takes, from our own stock list. Engine oil: <strong>{e(oil)}</strong>.</p></div>'
                 '<button type="button" class="fpg-fo-btn fpg-fo-btn--dark" data-fo-add-all hidden>Add the whole kit to basket</button></div>')
        o.append('<ul class="fpg-fo-kit" role="list" data-fo-kit>' + '\n'.join(rows) + '</ul>')
        o.append('<p class="fpg-fo-small" data-fo-kit-status role="status"></p></div></section>')

    # ---- parts
    o.append('<section class="fpg-fo-sec" id="parts"><div class="fpg-fo-wrap fpg-fo-parts"><div>')
    if pf:
        parts, drawings, pics, pnames = pf
        o.append(f'<h2 class="fpg-fo-h2">Every {e(name)} part, on Först’s own drawings</h2>'
                 f'<p class="fpg-fo-lead">{parts} parts across {drawings} exploded drawings. Click a part on the drawing to see our price and stock, then add it to the basket.</p>'
                 f'<a class="fpg-fo-btn fpg-fo-btn--dark" href="{finder_url(m)}">Open the {e(name)} parts drawings</a></div>')
        o.append('<ul class="fpg-fo-draws" role="list">' + ''.join(
            f'<li><a href="{finder_url(m)}"><img src="{p}?width=480" alt="{e(name)} parts drawing: {e(t)}" loading="lazy" width="480" height="360"><span>{e(t)}</span></a></li>' for p, t in zip(pics, pnames)) + '</ul>')
    else:
        o.append(f'<h2 class="fpg-fo-h2">Parts for the {e(name)}</h2>'
                 '<p class="fpg-fo-lead">We list more than 3,600 Först parts. Search by part number, or send us the machine’s serial number and we’ll find the part.</p>'
                 f'<a class="fpg-fo-btn fpg-fo-btn--dark" href="{finder_url(m)}">Find Först parts</a></div>')
    o.append('</div></section>')

    # ---- enquiry
    o.append("{%- render 'fpg-forst-enquiry', machine: '" + name + "', heading: 'Ask about the " + name + "' -%}")

    # ---- the rest of the range
    o.append('<section class="fpg-fo-sec fpg-fo-sec--tint"><div class="fpg-fo-wrap"><h2 class="fpg-fo-h2">More from Först</h2><ul class="fpg-fo-more" role="list">')
    for x in MACHINES:
        if x['slug'] == m['slug']:
            continue
        o.append(f'<li><a href="{product_url(x)}">' + img(names(x)['cut'][0], [320, 640], '(min-width: 990px) 16vw, 44vw', w=1406, h=955)
                 + f'<strong>{e(x["name"])}</strong><span>{e(x["cap"])} · {e(x["power"])} {e(x["fuel"].lower())}</span></a></li>')
    o.append('</ul></div></section>')
    o.append('</article>')
    return '\n'.join(o)


def range_section():
    o = []
    o.append("{%- comment -%}\n  The Först range page: every chipper we sell, compared, with Först's technology, service kits, parts and an\n  enquiry form. Built by fpg-tools/forst/pages/build.py from data.py: edit there, not here.\n{%- endcomment -%}")
    o.append("{{ 'fpg-forst.css' | asset_url | stylesheet_tag }}")
    o.append('<div class="fpg-fo fpg-fo--range" data-fpg-skin="forst">')
    o.append('<header class="fpg-fo-rhero">' + img('fpgf-range-hero.jpg', [800, 1400, 2048], '100vw', cls='fpg-fo-rhero__bg', w=2048, h=1536, lazy=False)
             + '<div class="fpg-fo-wrap">' + crumbs()
             + f'<img class="fpg-fo-hero__logo" src="{FILES}fpgf-logo.svg" alt="Först" width="116" height="27">'
             '<h1 class="fpg-fo-rhero__h">Först woodchippers</h1>'
             '<p class="fpg-fo-rhero__p">Sales, servicing, service kits and every part, from Forest Park &amp; Garden in Treforest. Ten machines from 6 to 8 inches, wheeled and tracked.</p>'
             '<div class="fpg-fo-hero__cta"><a class="fpg-fo-btn fpg-fo-btn--go" href="#enquire">Get a quote or book a demo</a>'
             f'<a class="fpg-fo-btn fpg-fo-btn--line" href="{FINDER}?brand=16">Find Först parts</a></div></div></header>')

    for kind, title, lead in (('wheeled', 'Wheeled chippers', 'Road-tow machines, from the 745 kg ST6P to the 8-inch ST8D.'), ('tracked', 'Tracked chippers', 'For gardens, slopes and sites a truck can’t reach, up to the bank-climbing XR8D.')):
        o.append(f'<section class="fpg-fo-sec" id="{kind}"><div class="fpg-fo-wrap"><h2 class="fpg-fo-h2">{title}</h2><p class="fpg-fo-lead">{lead}</p><ul class="fpg-fo-range" role="list">')
        for m in [x for x in MACHINES if x['kind'] == kind]:
            o.append('<li class="fpg-fo-card"><a class="fpg-fo-card__pic" href="' + product_url(m) + '" tabindex="-1" aria-hidden="true">'
                     + img(names(m)['cut'][0], [480, 800], '(min-width: 990px) 30vw, 92vw', w=1406, h=955) + '</a>'
                     f'<div class="fpg-fo-card__body"><h3><a href="{product_url(m)}">{e(m["name"])}</a></h3><p>{e(m["title"][0].upper() + m["title"][1:])}</p>'
                     f'<dl><div><dt>Opening</dt><dd>{e(m["cap"])}</dd></div><div><dt>Engine</dt><dd>{e(m["power"])} {e(m["engine"].split(" V-twin")[0].replace("Briggs & Stratton ", ""))}</dd></div><div><dt>Weight</dt><dd>{e(m["weight"])}</dd></div></dl>'
                     f'<div class="fpg-fo-card__links"><a class="fpg-fo-btn fpg-fo-btn--dark fpg-fo-btn--sm" href="{product_url(m)}">See the {e(m["name"])}</a>'
                     f'<a href="{product_url(m)}#service-kit">Service kit</a><a href="{finder_url(m)}">Parts</a></div></div></li>')
        o.append('</ul></div></section>')

    # comparison
    cols = [('Opening', 'cap'), ('Engine', None), ('Fuel', 'fuel'), ('Weight', 'weight'), ('Width', 'width'), ('Length, hopper up', 'length'), ('Height', 'height'), ('Tank', 'tank')]
    o.append('<section class="fpg-fo-sec fpg-fo-sec--dark" id="compare"><div class="fpg-fo-wrap"><h2 class="fpg-fo-h2">The range, side by side</h2><div class="fpg-fo-scroll"><table class="fpg-fo-compare"><thead><tr><th scope="col">Model</th>'
             + ''.join(f'<th scope="col">{c}</th>' for c, _ in cols) + '</tr></thead><tbody>')
    for m in MACHINES:
        cells = []
        for c, k in cols:
            cells.append(f'<td>{e(m["power"] + " " + m["engine"].replace("Briggs & Stratton ", "").replace(" V-twin", "")) if k is None else e(m[k])}</td>')
        o.append(f'<tr><th scope="row"><a href="{product_url(m)}">{e(m["name"])}</a><span>{e(m["kind"])}</span></th>' + ''.join(cells) + '</tr>')
    o.append('</tbody></table></div><p class="fpg-fo-small">Figures are Först’s published specifications.</p></div></section>')

    # technology
    o.append('<section class="fpg-fo-sec" id="technology"><div class="fpg-fo-wrap"><h2 class="fpg-fo-h2">What every Först shares</h2><ul class="fpg-fo-feats fpg-fo-feats--3" role="list">')
    for k in ('grip8', 'fly8', 'auto'):
        title, text, _ = FEATURES[k]
        if k == 'fly8':
            text = 'The flywheel throws the chip instead of blowing it, with twin blades and rear draught fins. Wet, green material is far less likely to block the chute.'
        o.append('<li class="fpg-fo-feat">' + img(feature_file(k), [400, 768], '(min-width: 990px) 30vw, 92vw', w=768, h=576) + f'<div><h3>{e(title)}</h3><p>{e(text)}</p></div></li>')
    o.append('</ul><p class="fpg-fo-lead fpg-fo-lead--after">Först has built chippers in Britain since 2013 and is a Made in Britain member. Machines carry Först’s three-year warranty.</p></div></section>')

    # parts and kits
    total_parts = maker.get('counts', {}).get('Forst', 0)
    o.append('<section class="fpg-fo-sec fpg-fo-sec--tint" id="parts"><div class="fpg-fo-wrap"><div class="fpg-fo-duo">'
             f'<div class="fpg-fo-panel"><h2 class="fpg-fo-h2">Parts on Först’s own drawings</h2><p>{len(maker["models"])} machines, {total_parts} part numbers. Pick the machine, click the part on the exploded drawing, and see our price and stock.</p>'
             f'<a class="fpg-fo-btn fpg-fo-btn--dark" href="{FINDER}?brand=16">Open the Först parts finder</a></div>'
             '<div class="fpg-fo-panel"><h2 class="fpg-fo-h2">A service kit for every machine</h2><p>Air, oil, fuel and hydraulic filters, plugs and bearings, listed machine by machine with our prices.</p><ul class="fpg-fo-kitlinks" role="list">'
             + ''.join(f'<li><a href="{product_url(m)}#service-kit">{e(m["name"])}</a></li>' for m in ALL if m.get('kit')) + '</ul></div></div>')
    # kits for machines without a page
    o.append('<details class="fpg-fo-older"><summary>Service parts for earlier machines and the Cadet</summary><div class="fpg-fo-scroll"><table><thead><tr><th scope="col">Machine</th><th scope="col">Oil</th><th scope="col">Service parts</th></tr></thead><tbody>')
    for label, key in OLDER_KITS:
        oil, items = KITS[key]
        o.append(f'<tr><th scope="row">{e(label)}</th><td>{e(oil)}</td><td>' + ', '.join(
            f'{e(KIT_PARTS[s][0])} <a href="/products/{KIT_PARTS[s][2]}">{e(s)}</a>{" × " + str(q) if q > 1 else ""}' for s, q in items) + '</td></tr>')
    o.append('</tbody></table></div></details></div></section>')

    o.append("{%- render 'fpg-forst-enquiry', machine: '', heading: 'Talk to us about a Först' -%}")
    o.append('</div>')
    o.append("<script src=\"{{ 'fpg-forst.js' | asset_url }}\" type=\"module\" async></script>")
    o.append('{% schema %}\n{\n  "name": "FP&G Först range",\n  "tag": "section",\n  "class": "fpg-forst-section",\n  "settings": [],\n  "presets": [{ "name": "FP&G Först range" }]\n}\n{% endschema %}')
    return '\n'.join(o)


def machine_section():
    o = ["{%- comment -%}\n  A Först chipper's page (templates/product.forst.json). Each machine's content is its own snippet, built by\n  fpg-tools/forst/pages/build.py; this section picks the one for the product. A Först product without a snippet\n  gets the range page link and the enquiry form.\n{%- endcomment -%}",
         "{{ 'fpg-forst.css' | asset_url | stylesheet_tag }}",
         "{%- liquid\n  assign range_url = section.settings.range_url | default: '/pages/forst-woodchippers'\n  if theme.role != 'main' and section.settings.range_url == blank\n    assign range_url = '/pages/contact?view=forst'\n  endif\n-%}",
         "{%- render 'fpg-product-jsonld', product: product -%}",
         '{%- case product.handle -%}']
    for m in ALL:
        o.append("  {%- when '" + m['handle'] + "' -%}\n    {%- render 'fpg-forst-m-" + m['slug'] + "', product: product, range_url: range_url -%}")
    o.append("  {%- else -%}\n    <div class=\"fpg-fo\" data-fpg-skin=\"forst\"><div class=\"fpg-fo-wrap fpg-fo-sec\"><h1 class=\"fpg-fo-h2\">{{ product.title | escape }}</h1><div class=\"rte\">{{ product.description }}</div><p><a class=\"fpg-fo-link\" href=\"{{ range_url }}\">See the Först range</a></p></div>{%- render 'fpg-forst-enquiry', machine: product.title, heading: 'Ask about this machine' -%}</div>")
    o.append('{%- endcase -%}')
    o.append("<script src=\"{{ 'fpg-cart.js' | asset_url }}\" type=\"module\"></script>")
    o.append("<script src=\"{{ 'fpg-forst.js' | asset_url }}\" type=\"module\"></script>")
    o.append('{% schema %}\n{\n  "name": "FP&G Först machine",\n  "tag": "section",\n  "class": "fpg-forst-section",\n  "settings": [\n    { "type": "url", "id": "range_url", "label": "Först range page", "info": "Where \\"Först woodchippers\\" in the breadcrumb goes. Empty: /pages/forst-woodchippers." }\n  ]\n}\n{% endschema %}')
    return '\n'.join(o)


def main():
    for m in ALL:
        (ROOT / 'snippets' / f"fpg-forst-m-{m['slug']}.liquid").write_text(machine_snippet(m) + '\n')
    (ROOT / 'sections' / 'fpg-forst-machine.liquid').write_text(machine_section() + '\n')
    (ROOT / 'sections' / 'fpg-forst-range.liquid').write_text(range_section() + '\n')
    print(len(ALL), 'machine pages,', 'range page')


if __name__ == '__main__':
    main()
