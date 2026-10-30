/*
 * Builds the part finder's data for AL-KO (and the other brands on the AL-KO Gardentech UK
 * dealer site) from what the crawl saved in that tab's IndexedDB ("fpg"/"kv"):
 *   gt-tree-{brand}   [{sec, cat, art, name, years:[[value, label]]}] from the guided search
 *   gt-lists-{brand}  "art|year|serial" -> {name, label, pages:[{name, img, rows:[pos, artno, name, qty, inStock, stockQty, replaced, replacedName, artnoClean]}]} or {none:true}
 * Drawing callouts on AL-KO's pages are the part number without "AK", so that is the ref.
 */
window.buildGT = async ({ brandNo = 1, brand = 'AL-KO', slug = 'alko', bid = 9601, tid0 = 96001, mid0 = 950001, per = 200, version = '1' } = {}) => {
  const tree = await KV.get('gt-tree-' + brandNo);
  const have = await KV.get('gt-lists-' + brandNo);
  const tidy = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    const low = t.toLowerCase().replace(/\b([a-z]*\d[a-z0-9-]*)\b/g, (w) => w.toUpperCase());
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const typeName = (cat) => String(cat).replace(/\s*-\s+|\s+-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  const picId = (url) => String(url).replace(/^.*\/parts\/gif\//, '').replace(/\.gif$/i, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 9e9;

  const lists = {};
  const mmap = {};
  const typeIds = new Map();
  const tree2 = new Map();
  const parts = new Set();
  const pics = new Set();
  let nextList = 0;
  let nextModel = mid0;
  let nextType = tid0;
  const rows = [...tree].sort((a, b) => typeName(a.cat).localeCompare(typeName(b.cat)) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  for (const r of rows) {
    const ys = r.years.length ? r.years : [['010000', '']];
    const versions = ys
      .map(([val, label]) => {
        const [ay, sn] = String(val).split('@SN@');
        return { v: have[`${r.art}|${ay}|${sn || ''}`], label };
      })
      .filter((x) => x.v && !x.v.none && x.v.pages?.length);
    if (!versions.length) continue;
    const type = typeName(r.cat);
    const mid = nextModel++;
    if (!typeIds.has(type)) typeIds.set(type, nextType++);
    if (!tree2.has(type)) tree2.set(type, []);
    tree2.get(type).push([mid, r.name.replace(/\s*\[[^\]]+\]\s*$/, '').trim() + ` (${r.art})`]);
    const entry = [];
    const several = versions.length > 1;
    for (const { v, label } of versions) {
      for (const p of v.pages) {
        const byPn = new Map();
        for (const [pos, artno, name, qty, inStock, , replaced, replacedName, clean] of p.rows) {
          if (!artno) continue;
          const ref = pos || clean || '';
          const x = byPn.get(artno) || { refs: [], name, inStock, replaced, replacedName };
          if (ref && !x.refs.includes(ref)) x.refs.push(ref);
          byPn.set(artno, x);
        }
        const r2 = [...byPn.entries()]
          .map(([artno, x]) => {
            parts.add(artno);
            const nla = /^NLA\b/i.test(x.name || '');
            /* inStock: 1 in stock, -1 out (for a replaced part it is the replacement's). NLA with nothing replacing it: discontinued. */
            const stock = nla && !x.replaced ? -1 : x.inStock === 1 ? 1 : x.inStock === -1 ? 3 : 0;
            const title = x.replaced && /^(NLA\b|USE\b)/i.test(x.name || '') ? tidy(x.replacedName) : tidy(String(x.name || '').replace(/^NLA\s*-\s*/i, ''));
            const row = [x.refs.join(', '), artno, title, stock];
            if (x.replaced) row.push(x.replaced);
            return row;
          })
          .sort((a, b) => num(a[0]) - num(b[0]));
        if (!r2.length) continue;
        const id = nextList++;
        const pic = picId(p.img);
        pics.add(p.img);
        lists[id] = { n: tidy(String(p.name || '').replace(/^Page\s*\d+\s*/i, '')) || 'Parts', p: [pic], r: r2 };
        entry.push(several && label ? [id, label] : id);
      }
    }
    if (entry.length) mmap[mid] = entry;
  }
  const shards = {};
  for (const [id, l] of Object.entries(lists)) (shards[Math.floor(Number(id) / per)] ||= { lists: {} }).lists[id] = l;
  const index = {
    v: 2,
    source: 'alko',
    brand,
    plain: true,
    groupSmall: false,
    note: `These are ${brand}'s own parts lists for the {model}, from ${brand}'s UK dealer portal. Where there's one per build date, open the one that matches your machine's rating plate, then match the numbers on the drawing to the Ref column. Stock is our supplier's when this list was last updated.`,
    img: `https://cdn.shopify.com/s/files/1/0734/1477/0982/files/${slug}-{id}.gif`,
    shard: `fpg-maker-${slug}-{n}.json?v=${version}`,
    per,
    counts: { [brand]: parts.size },
    b: [[bid, brand, [...tree2.entries()].map(([t, list]) => [typeIds.get(t), t, list])]],
    models: mmap,
  };
  return { index, shards, pics: [...pics], stats: { models: Object.keys(mmap).length, lists: nextList, parts: parts.size, shards: Object.keys(shards).length, drawings: pics.size } };
};
