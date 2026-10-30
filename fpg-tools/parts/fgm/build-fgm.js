/*
 * Builds the part finder's data for one FGM Claymore brand (Echo first) from what
 * the crawl saved in the portal tab's IndexedDB (database "fpg", store "kv"):
 *   tree-{root}   folders and machines under the brand's catalogue node
 *   prods-{root}  each machine's documents (parts-list sections with their hotspots)
 *   plo-{root}    each machine's title (with serial range) and photos
 *   ipl-{root}    parts tables for the few sections with no hotspots
 *   pricelist     FGM's price list: part number -> [desc, availability 1 normal / 2 low / 3 nil, ordered, superseded by, retail, ...]
 *   plx           single price-list rows fetched for parts missing from the bulk pull
 *   photo-{root}  machine node id -> photo file name in Ressources/
 *   dims          drawing file -> [width, height]
 * Run in the portal tab (needs KV from the crawl helpers). Returns { index, shards }.
 */
window.buildFGM = async ({ root = 4, brand = 'Echo', slug = 'echo', tid0 = 95001, mid0 = 900001, per = 200, version = '1', existing = {}, bid = 9501, types = null, nameStyle = 'echo', list0 = 0, imgSlug = '' } = {}) => {
  const nodes = await KV.get('tree-' + root);
  const prods = await KV.get('prods-' + root);
  const plo = (await KV.get('plo-' + root)) || {};
  const ipl = (await KV.get('ipl-' + root)) || {};
  const pl = (await KV.get('pricelist')).map;
  const plx = (await KV.get('plx')) || {};
  /* Machine photos: the catalogue tile's picture, full size (photo-{root}: node id -> file name, checked to exist). */
  const photos = (await KV.get('photo-' + root)) || {};
  const dims = (await KV.get('dims')) || {};
  const price = (pn) => pl[pn] || plx[pn];

  const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const tidy = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    const low = t.toLowerCase().replace(/\b([a-z]*\d[a-z0-9-]*)\b/g, (w) => w.toUpperCase());
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const parseHS = (hs) => {
    if (!hs) return [];
    const d = new DOMParser().parseFromString(hs, 'text/xml');
    return [...d.querySelectorAll('map')].map((m) => [m.getAttribute('a') || '', m.getAttribute('pid') || '', (m.getAttribute('label') || '').replace(m.getAttribute('pid') || '', '').trim()]);
  };
  const folders = (id) => {
    const out = [];
    let n = nodes[nodes[id].p];
    while (n) {
      out.unshift(n.d);
      n = nodes[n.p];
    }
    return out;
  };
  const TYPE = {
    Blowers: 'Blower', 'Brush Cutter': 'Brushcutter', 'Chain Saw': 'Chainsaw', Construction: 'Cut-off saw',
    'Dusters / Mist Blowers': 'Mist blower', 'Earth Augers': 'Earth auger', 'Engine Drills': 'Engine drill',
    'Hedge Trimmer': 'Hedge trimmer', 'Multi Tool': 'Multi-tool', Lawnmower: 'Lawn mower', Sprayers: 'Sprayer',
  };
  /* types: the brand's own folder -> type names ('Power Drive': 'Self-propelled mower'); OLDER PRODUCTS folders are skipped. */
  const typeOf = (fp) => {
    if (types) {
      const f = fp.filter((x) => !/^older products$/i.test(x));
      return types[f.slice(0, 2).join(' > ')] || types[f[0] || ''] || tidy(f[0] || brand);
    }
    if (fp[0] === 'Chain Saw' && fp[1] === 'Pole Pruner') return 'Pruner';
    if (fp[0] === 'Hedge Trimmer' && fp[1] === 'Pole') return 'Pole hedge trimmer';
    return TYPE[fp[0]] || tidy(fp[0]);
  };
  /* Availability: 1 normal or low -> we can order it in; 3 nil -> out at the supplier; NLA -> discontinued. */
  const stockOf = (pn) => {
    const r = price(pn);
    if (!r) return [0, ''];
    if (/^NLA\b/i.test(r[0] || '')) return [-1, ''];
    const sup = r[3] || '';
    const s = sup ? price(sup) : r;
    if (!s) return [0, sup];
    if (/^NLA\b/i.test(s[0] || '')) return [-1, sup];
    return [s[1] === 1 || s[1] === 2 ? 1 : s[1] === 3 ? 3 : 0, sup];
  };

  /* Machines grouped by type and model code; each version (serial range) adds its sections. */
  const models = new Map();
  for (const p of prods) {
    const node = nodes[p.id];
    if (!node) continue;
    const docs = (p.docs || []).filter((d) => /\.(png|jpe?g|gif)$/i.test(d.ipl || ''));
    if (!docs.length) continue;
    const fp = folders(p.id);
    const type = typeOf(fp);
    const info = plo[p.id] || {};
    /* "PB-2520_40_40000001", "CS-4510ES CHAIN SAWS (38000001-38999999)", "PAS-PE_999442-00875__35_35000001" */
    let code = node.d.split(/[_ ]/)[0];
    let rest = '';
    /* Brands without Echo's "CODE_xx_serial" names: the model is the words before the first year, long number or code ("575AL SP 2020 Aug 465839", "X7 GEN 2 - 2026 - 16800294", "NX90V 2691242-00"). */
    if (nameStyle === 'plain' && !/_\d+_\d{6,}$/.test(node.d)) {
      const words = node.d.replace(/\s+/g, ' ').trim().split(' ');
      const at = words.findIndex((w, i) => i > 0 && (/^\(?(19|20)\d\d\)?$/.test(w) || /^\d{6,}/.test(w) || /^-$/.test(w) || /^EE-/.test(w) || /^pre$/i.test(w) || /^\d{7}-\d+$/.test(w)));
      code = (at > 0 ? words.slice(0, at) : words).join(' ').replace(/[_\s]+$/, '');
      rest = at > 0 ? words.slice(at).join(' ').replace(/^-\s*/, '') : '';
    }
    if (/^\d+$/.test(code) || /^E[AH]-/.test(code)) {
      const t = (info.title || node.d).replace(/\s*\(.*$/, '').trim();
      const [first, ...rest] = t.split(' ');
      code = rest.length ? `${first} ${tidy(rest.join(' '))}` : first;
    }
    const range =
      (info.title || '').match(/\(([^)]+)\)\s*$/)?.[1] ||
      node.d.match(/\(([^)]+)\)\s*$/)?.[1] ||
      (node.d.match(/_(\d{6,})$/)?.[1] && !/^0+$/.test(node.d.match(/_(\d{6,})$/)[1]) ? `${node.d.match(/_(\d{6,})$/)[1]} on` : '') ||
      rest;
    const key = type + '|' + squash(code);
    if (!models.has(key)) models.set(key, { type, name: code.trim(), versions: [] });
    models.get(key).versions.push({ p, docs, range, photo: photos[p.id] || '' });
  }

  const lists = {};
  const mmap = {};
  const mi = {};
  const typeIds = new Map();
  const tree = new Map();
  const parts = new Set();
  let nextList = list0;
  let nextModel = mid0;
  let nextType = tid0;
  const sorted = [...models.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  for (const m of sorted) {
    const mid = existing[squash(m.name)] || nextModel++;
    if (!typeIds.has(m.type)) typeIds.set(m.type, nextType++);
    if (!tree.has(m.type)) tree.set(m.type, []);
    tree.get(m.type).push([mid, m.name]);
    const several = m.versions.length > 1;
    const entry = [];
    for (const v of m.versions) {
      if (v.photo && !mi[mid]) mi[mid] = v.photo;
      for (const d of v.docs) {
        let rows = parseHS(d.hs);
        if (!rows.length && ipl[d.id]?.rows) rows = ipl[d.id].rows.map((r) => [r[0], r[2], r[3]]);
        const byPn = new Map();
        for (const [ref, pn, label] of rows) {
          if (!pn) continue;
          const x = byPn.get(pn) || { refs: [], label };
          if (ref && !x.refs.includes(ref)) x.refs.push(ref);
          byPn.set(pn, x);
        }
        const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 9999;
        const r = [...byPn.entries()]
          .map(([pn, x]) => {
            x.refs.sort((a, b) => num(a) - num(b));
            parts.add(pn);
            const [stock, sup] = stockOf(pn);
            const row = [x.refs.join(', '), pn, tidy(x.label || price(pn)?.[0] || ''), stock];
            if (sup) row.push(sup);
            return row;
          })
          .sort((a, b) => num(a[0]) - num(b[0]));
        if (!r.length) continue;
        const id = nextList++;
        lists[id] = { n: tidy(d.d.replace(/^\s*\d+\s+/, '')), p: [d.ipl.replace(/\.[^.]+$/, '')], r };
        /* Clickable numbers: each hotspot's box on the drawing (dims: drawing file -> [width, height], read from the PNG header). */
        if (d.hs && dims[d.ipl]) {
          const m = [...new DOMParser().parseFromString(d.hs, 'text/xml').querySelectorAll('map')]
            .map((el) => {
              const pts = String(el.getAttribute('coord') || '').split(';').map((xy) => xy.split(',').map(Number));
              const xs = pts.map((q) => q[0]).filter(Number.isFinite);
              const ys = pts.map((q) => q[1]).filter(Number.isFinite);
              return xs.length ? [el.getAttribute('a') || '', Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
            })
            .filter(Boolean);
          if (m.length) Object.assign(lists[id], { m, wh: dims[d.ipl] });
        }
        entry.push(several ? [id, v.range ? (nameStyle === 'echo' || /^\(?[A-Z]?\d{6,}-[A-Z]?\d{6,}\)?$/.test(v.range) ? `serial ${v.range.replace('-', '–')}` : v.range) : tidy(v.p ? nodes[v.p.id].d.split('_').slice(1).join(' ') : '')] : id);
      }
    }
    if (entry.length) mmap[mid] = entry;
  }

  const shards = {};
  for (const [id, l] of Object.entries(lists)) {
    const n = Math.floor(Number(id) / per);
    (shards[n] ||= { lists: {} }).lists[id] = l;
  }
  const index = {
    v: 2,
    source: 'fgm',
    brand,
    plain: true,
    groupSmall: false,
    note: `These are ${brand}'s own parts lists for the {model}, from ${brand}'s UK distributor FGM Claymore. Where there's one per serial range, open the one that matches your machine's rating plate, then match the numbers on the drawing to the Ref column. Stock is our supplier's when this list was last updated.`,
    img: `https://cdn.shopify.com/s/files/1/0734/1477/0982/files/fgm-${imgSlug || slug}-{id}.png`,
    shard: `fpg-maker-fgm-${slug}-{n}.json?v=${version}`,
    per,
    counts: { [brand]: parts.size },
    b: [[bid, brand, [...tree.entries()].map(([t, list]) => [typeIds.get(t), t, list])]],
    models: mmap,
    pimg: 'https://fgm.ev-portal.com/Virtual_DataCatalogs/IFGM/FGM/Ressources/{p}',
    mi,
  };
  return { index, shards, stats: { models: sorted.length, lists: nextList, parts: parts.size, shards: Object.keys(shards).length } };
};
