/*
 * Builds the makers' part-number lookup (assets/fpg-maker-pn-{0..N-1}.json) from the maker
 * files already in the theme, so the finder's search box can say which machines a part fits.
 * Run in a storefront tab of the theme (it reads the section's data-maker URLs).
 *
 * Each file: { key: [[part no, name, stock, replaced by, machines in total, [model ids (up to 40)]], ...] }
 * key = the part number in lower case, letters and digits only. A part number goes in file
 * pnShard(key) (a hash of the key without leading letters, mod N; the finder's pnFile() must match), so "316913" and "AK316913" land together.
 */
window.buildPN = async ({ shards = 64, cap = 40 } = {}) => {
  const urls = document.querySelector('[data-maker]').getAttribute('data-maker').trim().split(/\s+/);
  const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const pnShard = (key) => [...key.replace(/^[a-z]+/, '')].reduce((h, c) => (h * 33 + c.charCodeAt(0)) % 1000003, 7) % shards;
  /** key -> Map(part no + maker file -> {pn, name, stock, rep, mids:Set}) */
  const all = new Map();
  for (const url of urls) {
    const index = await (await fetch(url)).json();
    const base = url.replace(/[^/]*$/, '');
    /* list id -> model ids */
    const listModels = new Map();
    for (const [mid, entries] of Object.entries(index.models || {})) {
      for (const e of entries) {
        const id = String(Array.isArray(e) ? e[0] : e);
        if (!listModels.has(id)) listModels.set(id, new Set());
        listModels.get(id).add(Number(mid));
      }
    }
    const n = Math.ceil(Math.max(0, ...[...listModels.keys()].map(Number)) / index.per) + 1;
    for (let s = 0; s < n; s++) {
      const res = await fetch(base + index.shard.replace('{n}', s));
      if (!res.ok) continue;
      const { lists } = await res.json();
      for (const [id, list] of Object.entries(lists)) {
        const mids = listModels.get(String(id));
        if (!mids) continue;
        for (const [, pn, name, stock, rep] of list.r) {
          const key = squash(pn);
          if (key.length < 4) continue;
          if (!all.has(key)) all.set(key, new Map());
          const k2 = pn + '|' + url;
          const hit = all.get(key).get(k2) || { pn, name, stock, rep: rep || '', mids: new Set() };
          for (const m of mids) hit.mids.add(m);
          all.get(key).set(k2, hit);
        }
      }
    }
  }
  const files = Array.from({ length: shards }, () => ({}));
  for (const [key, hits] of all) {
    files[pnShard(key)][key] = [...hits.values()].map((h) => [h.pn, h.name, h.stock, h.rep, h.mids.size, [...h.mids].slice(0, cap)]);
  }
  return { files, stats: { parts: all.size, sizes: files.map((f) => JSON.stringify(f).length) } };
};
