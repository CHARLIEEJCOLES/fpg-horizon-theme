/*
 * STIGA's UK dealer portal (stiga.ev-portal.com, "STIGA Connect", eVision like FGM's). Charlie signs in;
 * paste this into that tab after opening CATALOG once. Brands under "All Brands": STIGA (node 2),
 * Mountfield (11086), Atco (23920), Alpina, Castelgarden.
 *
 *   await crawlTree(11086)      folders and machine versions -> KV tree-<root>   {id: {p, d, pid, img, e}}
 *   await crawlDocs(11086)      newest version of each machine (pickNewest) -> KV prods-<root>
 *                               [{id, docs: [{id, d, ipl, hs}]}]  (hs = the drawing's hotspot XML: ref, part no, name)
 *   await crawlDims([11086])    PNG sizes of new drawings -> KV dims  {"1836.PNG": [w, h]}
 *   await crawlPhotos(11086)    machine photo (Ressources/<n>.PNG, checked) -> KV photo-<root>
 * then build with ../fgm/build-fgm.js (source 'stiga', imgSlug 'stiga', stockFn s => s[5] === 1 ? 1 : 3).
 * Mountfield + Atco went into one file, fpg-maker-stiga-more.json (6 Nov 2026): see the call at the end.
 *
 * Drawings are public: /Virtual_DataCatalogs/GGP/GGPALL/Ressources/Png/<n>.PNG, copied into Shopify Files as
 * stiga-<n>.PNG (served as stiga-<n>.png) with fileCreate; drawings over 20 MP are shrunk to 18 MP first.
 * NavigationGetData needs productId=-1 and productSerialNumberId=-1 for folders.
 */
window.KV = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('fpg');
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async get(k) {
    const db = await this.open();
    return new Promise((r) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => r(q.result);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((r, j) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => r(true);
      t.onerror = () => j(t.error);
    });
  },
};

window.nav = async (n, p = -1) => {
  for (let a = 0; a < 4; a++) {
    const c = new AbortController();
    const to = setTimeout(() => c.abort(), 30000);
    try {
      const r = await fetch(`/Catalogs/NavigationGetData?nodeId=${n}&productId=${p}&productSerialNumber=&productSerialNumberId=-1`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        signal: c.signal,
      });
      clearTimeout(to);
      return JSON.parse(await r.text());
    } catch {
      clearTimeout(to);
      await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
    }
  }
  return null;
};

window.crawlTree = async (root) => {
  const key = 'tree-' + root;
  const nodes = (await KV.get(key)) || {};
  const done = new Set((await KV.get(key + '-done')) || []);
  const queue = [root, ...Object.entries(nodes).filter(([id, v]) => v.pid < 0 && !v.e && !done.has(Number(id))).map(([id]) => Number(id))].filter((id) => !done.has(id));
  window._crawl = { root, queued: queue.length, done: done.size, nodes: Object.keys(nodes).length, failed: [] };
  let sinceSave = 0;
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    const j = await nav(id);
    if (!j || !j.Hierarchy) {
      window._crawl.failed.push(id);
      continue;
    }
    for (const h of j.Hierarchy) {
      if (h.ParentId !== id) continue;
      nodes[h.Id] = { p: id, d: h.Description, pid: h.ProductId, img: h.ImageFileName, e: h.IsEmptyFolder };
      if (h.ProductId < 0 && !h.IsEmptyFolder && !done.has(h.Id)) queue.push(h.Id);
    }
    done.add(id);
    Object.assign(window._crawl, { queued: queue.length, done: done.size, nodes: Object.keys(nodes).length });
    if (++sinceSave >= 25) {
      sinceSave = 0;
      await KV.set(key, nodes);
      await KV.set(key + '-done', [...done]);
    }
  }
  await KV.set(key, nodes);
  await KV.set(key + '-done', [...done]);
  window._crawl.finished = true;
  return window._crawl;
};

/* One version per machine: in each model folder, the newest "(year)"; a plain name beats a "[code]" variant. */
window.pickNewest = (t) => {
  const groups = new Map();
  for (const [id, v] of Object.entries(t)) {
    if (!(v.pid > 0)) continue;
    const base = v.d.replace(/\[[^\]]*\]/g, '').replace(/\(\s*\d{4}\s*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const year = Number((v.d.match(/\((\d{4})\)/) || [])[1] || 0);
    const k = v.p + '|' + base;
    const cur = groups.get(k);
    const score = year * 10 + (/\[/.test(v.d) ? 0 : 5);
    if (!cur || score > cur.score || (score === cur.score && Number(id) > Number(cur.id))) groups.set(k, { id: Number(id), pid: v.pid, score });
  }
  return [...groups.values()];
};

window.crawlDocs = async (root) => {
  const t = await KV.get('tree-' + root);
  const pick = pickNewest(t);
  const prods = (await KV.get('prods-' + root)) || [];
  const have = new Set(prods.map((p) => p.id));
  window._docs = { root, total: pick.length, done: have.size, empty: 0, failed: [] };
  let n = 0;
  for (const m of pick) {
    if (have.has(m.id)) continue;
    const j = await nav(m.id, m.pid);
    if (!j || !j.Hierarchy) {
      window._docs.failed.push(m.id);
      continue;
    }
    const docs = j.Hierarchy.filter((x) => x.ProductDocuments)
      .flatMap((x) => x.ProductDocuments)
      .filter((d) => d.DocumentTypeId === 1 || /\.(png|jpe?g|gif)$/i.test(d.FileNameForIpl || ''))
      .map((d) => ({ id: d.Id, d: d.Description, ipl: d.FileNameForIpl, hs: d.FileHotSpot }));
    if (!docs.some((d) => d.ipl)) window._docs.empty++;
    prods.push({ id: m.id, docs });
    have.add(m.id);
    window._docs.done = have.size;
    if (++n % 25 === 0) await KV.set('prods-' + root, prods);
  }
  await KV.set('prods-' + root, prods);
  window._docs.finished = true;
  return window._docs;
};

const RES = '/Virtual_DataCatalogs/GGP/GGPALL/Ressources/';

window.pngSize = async (url) => {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { Range: 'bytes=0-63' } });
      if (!r.ok && r.status !== 206) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x89 && b[1] === 0x50) {
        const dv = new DataView(b.buffer);
        return [dv.getUint32(16), dv.getUint32(20)];
      }
      return await new Promise((res) => {
        const i = new Image();
        i.onload = () => res([i.naturalWidth, i.naturalHeight]);
        i.onerror = () => res(null);
        i.src = url;
      });
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
};

window.crawlDims = async (roots) => {
  const dims = (await KV.get('dims')) || {};
  const need = new Set();
  for (const root of roots) for (const p of (await KV.get('prods-' + root)) || []) for (const d of p.docs) if (d.ipl && !dims[d.ipl]) need.add(d.ipl);
  window._dims = { need: need.size, done: 0, bad: [] };
  const list = [...need];
  const worker = async () => {
    while (list.length) {
      const f = list.shift();
      const s = await pngSize(RES + 'Png/' + f);
      if (s) dims[f] = s;
      else window._dims.bad.push(f);
      window._dims.done++;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await KV.set('dims', dims);
  window._dims.finished = true;
  return window._dims;
};

window.crawlPhotos = async (root) => {
  const t = await KV.get('tree-' + root);
  const prods = (await KV.get('prods-' + root)) || [];
  const photos = (await KV.get('photo-' + root)) || {};
  window._ph = { root, todo: prods.length, done: 0, found: 0 };
  const list = prods.map((p) => p.id).filter((id) => !(id in photos));
  const worker = async () => {
    while (list.length) {
      const id = list.shift();
      const n = (t[id]?.img || '').match(/ThumbsFolders\/(\d+)\./i)?.[1];
      let ok = '';
      if (n) {
        try {
          const r = await fetch(RES + n + '.PNG', { method: 'HEAD' });
          if (r.ok) ok = n + '.PNG';
        } catch {
          /* no photo */
        }
      }
      photos[id] = ok;
      if (ok) window._ph.found++;
      window._ph.done++;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await KV.set('photo-' + root, photos);
  window._ph.finished = true;
  return window._ph;
};

/* Shopify staged uploads from this tab: only the key's uuid and the signature come from stagedUploadsCreate. */
window.policyFor = (key, date, ct) => {
  const day = date.slice(0, 8);
  const exp = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + 1, +date.slice(9, 11), +date.slice(11, 13), +date.slice(13, 15)))
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');
  const j = JSON.stringify({
    conditions: [
      { 'Content-Type': ct },
      { success_action_status: '201' },
      { acl: 'private' },
      ['content-length-range', 1, 20971520],
      { bucket: 'shopify-staged-uploads' },
      { key },
      { 'x-goog-date': date },
      { 'x-goog-credential': `merchant-assets@shopify-tiers.iam.gserviceaccount.com/${day}/auto/storage/goog4_request` },
      { 'x-goog-algorithm': 'GOOG4-RSA-SHA256' },
    ],
    expiration: exp,
  }).replace(/\//g, '\\/');
  return btoa(j);
};

window.postStaged = async (blob, key, sig, date, ct) => {
  const fd = new FormData();
  const day = date.slice(0, 8);
  for (const [k, v] of [
    ['Content-Type', ct],
    ['success_action_status', '201'],
    ['acl', 'private'],
    ['key', key],
    ['x-goog-date', date],
    ['x-goog-credential', `merchant-assets@shopify-tiers.iam.gserviceaccount.com/${day}/auto/storage/goog4_request`],
    ['x-goog-algorithm', 'GOOG4-RSA-SHA256'],
    ['x-goog-signature', sig],
    ['policy', policyFor(key, date, ct)],
  ])
    fd.append(k, v);
  fd.append('file', blob);
  const r = await fetch('https://shopify-staged-uploads.storage.googleapis.com/', { method: 'POST', body: fd });
  return r.status;
};

/* The Mountfield + Atco build (6 Nov 2026). Model names that repeat the brand ("MOUNTFIELD SP535") are trimmed afterwards. */
window.buildMountfieldAtco = async () => {
  const SUB = { 'Battery Lawn Mower': 'Battery lawn mower', 'Electric Lawn Mower': 'Electric lawn mower', 'Petrol Lawn Mower': 'Petrol lawn mower', 'Cylinder Mower': 'Cylinder mower' };
  const TOP = {
    'Front mowers': 'Front mower', 'Lawn Tractor': 'Ride-on mower', 'Trimmer/Brushcutter': 'Trimmer and brushcutter', Chainsaw: 'Chainsaw', Hedgecutter: 'Hedge trimmer',
    'Chippers/Shredders': 'Shredder', Blower: 'Blower', Scarifier: 'Scarifier', Tiller: 'Tiller', 'Petrol Scythe': 'Petrol scythe', Snowthrowers: 'Snow thrower', Engine: 'Engine', 'Robot Mower': 'Robot mower',
  };
  const typeFn = (f) => (f[0] === 'Lawn Mower' ? SUB[f[1]] || 'Lawn mower' : f[0] === 'Front mowers' && /deck/i.test(f[1] || '') ? 'Front mower deck' : TOP[f[0]] || f[0] || 'Other');
  const common = {
    per: 150, version: '202611060900', nameStyle: 'plain', source: 'stiga', slug: 'stiga-more', imgSlug: 'stiga', typeFn, stockFn: (s) => (s[5] === 1 ? 1 : 3),
    pimg: 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/stiga-photo-{p}?width={s}',
    note: "These are {brand}'s own parts lists for the {model}, from STIGA's UK dealer portal (STIGA makes {brand}; the newest version of each machine). Match the numbers on the drawing to the Ref column. Stock is whether STIGA can supply the part when this list was last updated.",
  };
  const m = await buildFGM({ ...common, root: 11086, brand: 'Mountfield', bid: 9802, tid0: 98101, mid0: 982001, list0: 0 });
  const a = await buildFGM({ ...common, root: 23920, brand: 'Atco', bid: 9803, tid0: 98201, mid0: 984001, list0: m.stats.lists });
  const index = { ...m.index, counts: { ...m.index.counts, ...a.index.counts }, b: [...m.index.b, ...a.index.b], models: { ...m.index.models, ...a.index.models }, mi: { ...m.index.mi, ...a.index.mi } };
  for (const [, bname, types] of index.b)
    for (const [, , list] of types)
      for (const row of list) {
        const re = new RegExp('^\\s*' + bname + '\\b[\\s\\-:]*', 'i');
        const nn = row[1].replace(re, '').trim();
        if (nn) row[1] = nn;
      }
  index.bi = brandPictures(index);
  const shards = {};
  for (const part of [m.shards, a.shards]) for (const [n, s] of Object.entries(part)) Object.assign((shards[n] ||= { lists: {} }).lists, s.lists);
  return { index, shards };
};
