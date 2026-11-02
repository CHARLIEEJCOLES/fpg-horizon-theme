/*
 * Builds the part finder's data for Toro from what the crawl saved in the Toro dealer shop's tab
 * (shop.thetorocompany.com, IndexedDB "fpg"/"kv", key "toro"):
 *   toro  model number -> {name, mybe, from, to, cat, title, pages:[{id, name, img, small,
 *         parts:[[annotation, part no, description, qty, coords, zoomCoords]],
 *         prods:[[part no, description, discontinued 1/0, replacement id, can back-order 1/0]]}]}
 * The crawl takes the newest serial range of each machine on Toro's UK dealer catalogue.
 * Drawings are Toro's 2X GIFs (manuals.toro.com/Ill/2X/...), copied into Shopify Files as toro-<n>.gif;
 * zoomCoords are boxes on that 2X drawing. dims (key "toro-dims"): drawing id -> [width, height].
 */
window.buildToro = async ({ bid = 9701, tid0 = 97001, mid0 = 970001, per = 100, version = '1' } = {}) => {
  const data = await KV.get('toro');
  const dims = (await KV.get('toro-dims')) || {};
  /* A few drawings have no 2X file: use the 1X one (toro-dims1) and the plain coordinates. */
  const dims1 = (await KV.get('toro-dims1')) || {};
  const src = {};
  const tidy = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    const low = t.toLowerCase().replace(/\b([a-z]*\d[a-z0-9-]*)\b/g, (w) => w.toUpperCase());
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const TYPE = {
    'Walk-Power-Gas': 'Petrol lawn mower', 'Walk-Power-Battery': 'Battery lawn mower', 'Riding-mowers': 'Ride-on mower',
    'Blowers-Vacs': 'Blower', Chainsaws: 'Chainsaw', 'Hedge-Trimmers': 'Hedge trimmer', 'Trimmers-Edgers': 'Grass trimmer',
    Aerators: 'Aerator', 'Brush-Cutter': 'Brush cutter', Scarifiers: 'Scarifier', 'Single-Stage-Snow-Blowers': 'Snow thrower',
    'Material-Buggies': 'Material buggy', 'Compact-Utility-Loaders': 'Compact utility loader', 'TRX-Trenchers': 'Trencher', 'Tree-Care': 'Stump grinder',
  };
  const typeOf = (cat) => TYPE[String(cat).split('/').pop()] || tidy(String(cat).split('/').pop().replace(/-/g, ' '));
  const picId = (url) => String(url).replace(/^.*\//, '').replace(/\.[^.]+$/, '');
  const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 9e9;
  const box = (s) => String(s || '').split(',').map((v) => Math.round(Number(v)));

  const lists = {};
  const models = {};
  const typeIds = new Map();
  const tree = new Map();
  const parts = new Set();
  let nextList = 0;
  let nextModel = mid0;
  let nextType = tid0;
  const rows = Object.entries(data)
    .filter(([, v]) => v.pages?.length)
    .sort((a, b) => typeOf(a[1].cat).localeCompare(typeOf(b[1].cat)) || a[1].name.localeCompare(b[1].name, 'en', { numeric: true }));
  for (const [model, v] of rows) {
    const type = typeOf(v.cat);
    const mid = nextModel++;
    if (!typeIds.has(type)) typeIds.set(type, nextType++);
    if (!tree.has(type)) tree.set(type, []);
    tree.get(type).push([mid, `${String(v.name || v.title).replace(/[®™]/g, '').replace(/\s+/g, ' ').trim()} (${model})`]);
    const entry = [];
    for (const pg of v.pages) {
      const stock = new Map(pg.prods.map(([pn, , disc, , back]) => [pn, disc ? -1 : back ? 1 : 0]));
      const byPn = new Map();
      for (const [ann, pn, desc] of pg.parts) {
        if (!pn) continue;
        const x = byPn.get(pn) || { refs: [], desc };
        const ref = String(ann ?? '');
        if (ref && !x.refs.includes(ref)) x.refs.push(ref);
        byPn.set(pn, x);
      }
      const r = [...byPn.entries()]
        .map(([pn, x]) => {
          parts.add(pn);
          x.refs.sort((a, b) => num(a) - num(b));
          return [x.refs.join(', '), pn, tidy(x.desc), stock.get(pn) ?? 1];
        })
        .sort((a, b) => num(a[0]) - num(b[0]));
      if (!r.length) continue;
      const id = nextList++;
      const pic = picId(pg.img);
      const big = !!dims[pic] || !dims1[pic];
      src[pic] = big ? pg.img : pg.small;
      lists[id] = { n: tidy(pg.name), p: [pic], r };
      const wh = big ? dims[pic] : dims1[pic];
      if (wh) {
        const col = big ? 5 : 4;
        const m = pg.parts.filter((p) => p[col]).map((p) => [String(p[0] ?? ''), ...box(p[col])]).filter((b) => b.length === 5 && b.every((n, i) => i === 0 || Number.isFinite(n)));
        if (m.length) Object.assign(lists[id], { m, wh });
      }
      entry.push(id);
    }
    if (entry.length) models[mid] = entry;
  }
  const shards = {};
  for (const [id, l] of Object.entries(lists)) (shards[Math.floor(Number(id) / per)] ||= { lists: {} }).lists[id] = l;
  const index = {
    v: 2,
    source: 'toro',
    brand: 'Toro',
    plain: true,
    groupSmall: false,
    note: "These are Toro's own parts lists for the {model}, from Toro's UK dealer site, for the newest serial range. Match the numbers on the drawing to the Ref column. Stock is whether Toro can still supply the part when this list was last updated.",
    img: 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/toro-{id}.gif',
    shard: `fpg-maker-toro-{n}.json?v=${version}`,
    per,
    counts: { Toro: parts.size },
    b: [[bid, 'Toro', [...tree.entries()].map(([t, list]) => [typeIds.get(t), t, list])]],
    models,
    pimg: '',
    mi: {},
  };
  const pics = [...new Set(Object.values(lists).map((l) => l.p[0]))].map((id) => [id, src[id]]);
  return { index, shards, pics, stats: { models: Object.keys(models).length, lists: nextList, parts: parts.size, drawings: pics.length, withM: Object.values(lists).filter((l) => l.m).length } };
};
