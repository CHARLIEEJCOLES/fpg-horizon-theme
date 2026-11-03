/*
 * Crawls a brand on the AL-KO Gardentech UK dealer site (www.gardentech-dealer.co.uk, Charlie signs in)
 * into that tab's IndexedDB ("fpg"/"kv"), for build-alko.js / buildMitox below.
 * Paste into the signed-in tab's console (or the browser pane), then:
 *   await crawlTree('2195')   // Mitox; brands: 1 AL-KO, 2195 Mitox, 3507 MTX, 3528 Weibang, 2381 Brill, 2233 Kawasaki
 *   await crawlLists('2195')  // one parts list per machine and build year, all drawings' pages in one call
 *   await crawlDims()         // drawing sizes from the GIF headers (needed for clickable numbers)
 *   const built = await buildMitox()  // index + shards for assets/fpg-maker-mitox*.json
 *
 * Notes (3 Nov 2026):
 * - The guided search is gsearch.php (POST sel0..sel4: brand, section, category, machine, build year).
 * - showProduct_AJAXpartsList.php?actualPage=0&artno=&artyear=&serialno= returns every page:
 *   pagename, imgpath, rows (pos, artno, artnoClean, name, quantity, inStock 1/-1, replaced, price) and
 *   map (rect boxes: listpos = the row's pos). Dealer prices are left out on purpose (trade cost).
 * - Machines with no build year in the guided search may still need one: when 010000 gives a 500,
 *   /trade/shop/api/search/quicksearch.php?term=<art>&resulttypes=machines gives the right artyear.
 * - Drawings are public (no sign-in), so Shopify fileCreate can take them straight from the portal URL.
 *   Drawings over 20 MP (six Mitox brushcutter pages) are shrunk to 18 MP PNGs in the browser and uploaded
 *   through a staged upload; their lists point at the PNG's full CDN address.
 */
window.KV = window.KV || {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('fpg', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv').objectStore('kv').get(k);
      t.onsuccess = () => res(t.result);
      t.onerror = () => rej(t.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  },
};

window.gs = async (s) => {
  const body = new URLSearchParams();
  for (let i = 0; i < 5; i++) body.set('sel' + i, s[i] ?? 0);
  const h = await fetch('/trade/shop/parts/gsearch.php', { method: 'POST', body, credentials: 'include' }).then((r) => r.text());
  const doc = new DOMParser().parseFromString(h, 'text/html');
  const out = {};
  for (let i = 0; i < 5; i++) {
    const sel = doc.querySelector('#sel' + i);
    out[i] = sel ? [...sel.options].filter((o) => o.value !== '0').map((o) => [o.value, o.text.trim()]) : [];
  }
  return out;
};

window.crawlTree = async (brand) => {
  const rows = [];
  const s0 = await gs([brand]);
  for (const [sec, secName] of s0[1]) {
    const s1 = await gs([brand, sec]);
    for (const [cat, catName] of s1[2]) {
      const s2 = await gs([brand, sec, cat]);
      for (const [art, name] of s2[3]) {
        const s3 = await gs([brand, sec, cat, art]);
        rows.push({ sec: secName, cat: catName, art, name, years: s3[4] });
      }
    }
  }
  await KV.set('gt-tree-' + brand, rows);
  return rows.length;
};

const pagesOf = (j) =>
  (j.pages || []).map((p) => ({
    name: p.pagename,
    img: p.imgpath,
    rows: (p.rows || []).map((w) => [w.pos, w.artno, w.name, w.quantity, w.inStock, w.stockQuantity, w.replaced, w.replacedName, w.artnoClean]),
    map: (p.map || []).filter((m) => m.type === 'rect' && m.pos).map((m) => [m.partno || m.listpos, ...m.pos]),
  }));

window.crawlLists = async (brand, { workers = 5 } = {}) => {
  const tree = await KV.get('gt-tree-' + brand);
  const have = (await KV.get('gt-lists-' + brand)) || {};
  const jobs = [];
  for (const r of tree) {
    const ys = r.years.length ? r.years : [['010000', '']];
    for (const [val, label] of ys) {
      const [ay, sn] = String(val).split('@SN@');
      const key = `${r.art}|${ay}|${sn || ''}`;
      if (!have[key]) jobs.push({ r, ay, sn: sn || '', label, key, noYear: !r.years.length });
    }
  }
  const st = { jobs: jobs.length, done: 0, fail: [] };
  const get = async (art, ay, sn) => {
    const q = `artno=${encodeURIComponent(art)}&artyear=${ay}&serialno=${encodeURIComponent(sn)}`;
    const resp = await fetch('/trade/shop/parts/showProduct_AJAXpartsList.php?actualPage=0&' + q, { signal: AbortSignal.timeout(40000) });
    return resp.ok ? pagesOf(await resp.json()) : null;
  };
  const one = async (jb) => {
    for (let a = 0; a < 2; a++) {
      try {
        let pages = await get(jb.r.art, jb.ay, jb.sn);
        if (!pages && jb.noYear) {
          const j = await fetch('/trade/shop/api/search/quicksearch.php?term=' + encodeURIComponent(jb.r.art) + '&rcount=10&resulttypes=machines').then((x) => x.json());
          for (const d of (j.data || []).flatMap((g) => (g.typ === 'machines' ? g.data : [])).filter((d) => d.parent_article === jb.r.art)) {
            pages = await get(jb.r.art, d.artyear, d.serial || '');
            if (pages) break;
          }
        }
        if (pages) {
          have[jb.key] = pages.length ? { name: jb.r.name, label: jb.label, pages } : { none: true };
          st.done++;
          return;
        }
      } catch {
        await new Promise((s) => setTimeout(s, 1000));
      }
    }
    st.fail.push(jb.key);
  };
  const q = [...jobs];
  await Promise.all(Array.from({ length: workers }, async () => { while (q.length) await one(q.shift()); }));
  await KV.set('gt-lists-' + brand, have);
  return st;
};

window.crawlDims = async (brands = ['2195', '3507']) => {
  const dims = (await KV.get('gt-dims')) || {};
  const imgs = new Set();
  for (const b of brands) for (const x of Object.values((await KV.get('gt-lists-' + b)) || {})) for (const p of x.pages || []) imgs.add(p.img);
  const todo = [...imgs].filter((u) => !dims[u]);
  const one = async (u) => {
    const img = new Image();
    img.src = u.replace(/^\/\/[^/]+/, '');
    await img.decode().catch(() => {});
    if (img.naturalWidth) dims[u] = [img.naturalWidth, img.naturalHeight];
  };
  const q = [...todo];
  await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) await one(q.shift()); }));
  await KV.set('gt-dims', dims);
  return { todo: todo.length, missing: todo.filter((u) => !dims[u]) };
};

/* Mitox (and its MTX mowers) in one maker file, assets/fpg-maker-mitox.json + -0…3.json. */
window.buildMitox = async ({ brands = [['2195', 'Mitox', 9602], ['3507', 'MTX', 9603]], slug = 'mitox', tid0 = 96501, mid0 = 958001, per = 200, version = '1' } = {}) => {
  const dims = (await KV.get('gt-dims')) || {};
  const tidy = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    const low = t.toLowerCase().replace(/\b([a-z]*\d[a-z0-9.\-]*)\b/g, (w) => w.toUpperCase());
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  const typeName = (cat) => {
    let t = String(cat).replace(/\s+/g, ' ').trim();
    const m = t.match(/^(.+?)\s*-\s+(.+)$/) || t.match(/^(.+?)\s+-\s*(.+)$/);
    if (m) t = `${m[2]} ${m[1].toLowerCase()}`;
    t = t.replace(/hedgetrimmer/i, 'hedge trimmer').replace(/\bmulti tool\b/i, 'multi-tool');
    t = t.replace(/^(Chainsaws|Cultivators|Log Splitters|Blower \/ vacuums)$/i, (w) => w.replace(/s$/i, ''));
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  };
  const picId = (url) => String(url).replace(/^.*\/parts\/gif\//, '').replace(/\.gif$/i, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 9e9;
  const lists = {}, mmap = {}, typeIds = new Map(), parts = new Set(), pics = new Set(), b = [], counts = {};
  let nextList = 0, nextModel = mid0, nextType = tid0;
  for (const [brandNo, brand, bid] of brands) {
    const tree = await KV.get('gt-tree-' + brandNo);
    const have = await KV.get('gt-lists-' + brandNo);
    const tree2 = new Map();
    const bparts = new Set();
    const rows = [...tree].sort((a, c) => typeName(a.cat).localeCompare(typeName(c.cat)) || a.name.localeCompare(c.name, 'en', { numeric: true }));
    for (const r of rows) {
      const ys = r.years.length ? r.years : [['010000', '']];
      const versions = ys
        .map(([val, label]) => { const [ay, sn] = String(val).split('@SN@'); return { v: have[`${r.art}|${ay}|${sn || ''}`], label }; })
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
          if (!/\.gif$/i.test(p.img || '')) continue;
          const byPn = new Map();
          for (const [pos, artno, name, , inStock, , replaced, replacedName, clean] of p.rows) {
            if (!artno) continue;
            const ref = pos || clean || '';
            const x = byPn.get(artno) || { refs: [], name, inStock, replaced, replacedName };
            if (ref && !x.refs.includes(ref)) x.refs.push(ref);
            byPn.set(artno, x);
          }
          const r2 = [...byPn.entries()]
            .map(([artno, x]) => {
              parts.add(artno);
              bparts.add(artno);
              const nla = /^NLA\b/i.test(x.name || '');
              const stock = nla && !x.replaced ? -1 : x.inStock === 1 ? 1 : x.inStock === -1 ? 3 : 0;
              const title = x.replaced && /^(NLA\b|USE\b)/i.test(x.name || '') ? tidy(x.replacedName) : tidy(String(x.name || '').replace(/^NLA\s*-\s*/i, ''));
              const row = [x.refs.join(', '), artno, title, stock];
              if (x.replaced) row.push(x.replaced);
              return row;
            })
            .sort((a, c) => num(a[0]) - num(c[0]));
          if (!r2.length) continue;
          const id = nextList++;
          pics.add(p.img);
          lists[id] = { n: tidy(String(p.name || '').replace(/^Page\s*\d+\s*/i, '')) || 'Parts', p: [picId(p.img)], r: r2 };
          if (Array.isArray(p.map) && p.map.length && dims[p.img]) Object.assign(lists[id], { m: p.map, wh: dims[p.img] });
          entry.push(several && label ? [id, label] : id);
        }
      }
      if (entry.length) mmap[mid] = entry;
    }
    counts[brand] = bparts.size;
    b.push([bid, brand, [...tree2.entries()].map(([t, list]) => [typeIds.get(t), t, list])]);
  }
  /* Drawings over Shopify's 20-megapixel limit are uploaded as 18 MP PNGs under the same name. */
  for (const l of Object.values(lists)) {
    l.p = l.p.map((p) => {
      const u = [...pics].find((x) => picId(x) === p);
      const d = dims[u];
      return d && d[0] * d[1] > 20e6 ? `https://cdn.shopify.com/s/files/1/0734/1477/0982/files/${slug}-${p}.png` : p;
    });
  }
  const shards = {};
  for (const [id, l] of Object.entries(lists)) (shards[Math.floor(Number(id) / per)] ||= { lists: {} }).lists[id] = l;
  const index = {
    v: 2,
    source: 'gardentech',
    brand: 'Mitox',
    plain: true,
    groupSmall: false,
    note: "These are {brand}'s own parts lists for the {model}, from AL-KO Gardentech UK's dealer portal (the UK distributor). Match the numbers on the drawing to the Ref column. Stock is our supplier's when this list was last updated.",
    img: `https://cdn.shopify.com/s/files/1/0734/1477/0982/files/${slug}-{id}.gif`,
    shard: `fpg-maker-${slug}-{n}.json?v=${version}`,
    per,
    counts,
    b,
    models: mmap,
  };
  return { index, shards, pics: [...pics], stats: { models: Object.keys(mmap).length, lists: nextList, parts: parts.size, shards: Object.keys(shards).length, drawings: pics.size, counts } };
};
