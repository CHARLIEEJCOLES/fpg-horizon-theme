/*
 * Builds the part finder's data for Briggs & Stratton from what the crawl of Henton & Chattell's dealer
 * site (hcuk.co, PartsHome -> PartSearchARI) saved in that tab's IndexedDB ("fpg"/"kv"):
 *   bs-pick       [[model, H&C type id, "model-type-trim" label]]  one type per engine model
 *   bs-m-<model>  {id, k, secs:[{n: section name, img: ARI drawing URL, r: [[item, part no, description, qty]]}]}
 * H&C's pages have no drawing hotspots, so these lists have no clickable numbers (no m/wh).
 * Drawings are ARI's (cdn.datamanager.arinet.com/image/BRG/<guid>/Max), copied into Shopify Files as bs-<guid>.png.
 */
window.buildBS = async ({ bid = 9901, tid0 = 99001, mid0 = 990001, per = 150, version = '1', only = null } = {}) => {
  const pick = await KV.get('bs-pick');
  const tidy = (s) => {
    const t = String(s || '')
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
    const low = t.toLowerCase().replace(/\b([a-z]*\d[a-z0-9-]*)\b/g, (w) => w.toUpperCase());
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const guid = (url) => (String(url).match(/\/BRG\/([0-9a-f-]{36})\//i) || [])[1] || '';
  const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 9e9;
  /* H&C lists B&S engines and a few B&S-branded machines; the label says which. */
  const typeOf = (label) => (/\bPSI\b/i.test(label) ? 'Pressure washer' : /generator|\bwatts?\b/i.test(label) ? 'Generator' : 'Engine');
  const lists = {};
  const models = {};
  const tree = new Map();
  const typeIds = new Map();
  const parts = new Set();
  const pics = new Map();
  let nextList = 0;
  const stable = new Map([...pick].map((p) => p[0]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((m, i) => [m, i]));
  const rows = pick.filter(([m]) => !only || only.has(m)).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
  for (const [model, , label] of rows) {
    const v = await KV.get('bs-m-' + model);
    if (!v || !v.secs?.length) continue;
    const entry = [];
    for (const s of v.secs) {
      const g = guid(s.img);
      if (!g || !s.r?.length) continue;
      const byPn = new Map();
      for (const [item, pn, desc] of s.r) {
        if (!pn) continue;
        const x = byPn.get(pn) || { refs: [], desc };
        const ref = String(item ?? '').trim();
        if (ref && !x.refs.includes(ref)) x.refs.push(ref);
        byPn.set(pn, x);
      }
      const r = [...byPn.entries()]
        .map(([pn, x]) => {
          parts.add(pn);
          x.refs.sort((a, b) => num(a) - num(b));
          /* Henton & Chattell show no stock on these pages: 0 = ask us. */
          return [x.refs.join(', '), pn, tidy(x.desc), 0];
        })
        .sort((a, b) => num(a[0]) - num(b[0]));
      if (!r.length) continue;
      const id = nextList++;
      pics.set(g, s.img);
      lists[id] = { n: tidy(s.n) || 'Parts', p: [g], r };
      entry.push(id);
    }
    if (!entry.length) continue;
    const type = typeOf(label);
    if (!typeIds.has(type)) typeIds.set(type, tid0 + ['Engine', 'Generator', 'Pressure washer'].indexOf(type));
    if (!tree.has(type)) tree.set(type, []);
    /* Model ids stay the same between partial and full builds, so saved machines and links keep working. */
    const mid = mid0 + stable.get(model);
    const typeNo = String(v.k || label).split(' ')[0].split('-').slice(1).join('-');
    tree.get(type).push([mid, typeNo ? `${model} (type ${typeNo})` : model]);
    models[mid] = entry;
  }
  const shards = {};
  for (const [id, l] of Object.entries(lists)) (shards[Math.floor(Number(id) / per)] ||= { lists: {} }).lists[id] = l;
  const index = {
    v: 2,
    source: 'bs',
    brand: 'Briggs & Stratton',
    plain: true,
    groupSmall: false,
    note: "These are Briggs & Stratton's own parts lists for the {model}, from our supplier Henton & Chattell. We've used one type number per engine model, and parts can differ between types, so check the model and type numbers stamped on your engine and ask us if yours is different. Match the numbers on the drawing to the Ref column.",
    img: 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/bs-{id}.png',
    shard: `fpg-maker-bs-{n}.json?v=${version}`,
    per,
    counts: { 'Briggs & Stratton': parts.size },
    b: [[bid, 'Briggs & Stratton', [...tree.entries()].map(([t, list]) => [typeIds.get(t), t, list])]],
    models,
    pimg: '',
    mi: {},
  };
  return { index, shards, pics: [...pics.entries()], stats: { models: Object.keys(models).length, lists: nextList, parts: parts.size, drawings: pics.size, shards: Object.keys(shards).length } };
};
