/*
 * Brands left out of the parts finder (section setting "Brands to leave out", data-hidden-brands).
 * After fpg-parts.js has joined the Part Finder app's brands with the makers' files (mergeMaker),
 * these brands and their machines are dropped, so they don't show in the brands grid, the search
 * or links. Kept apart from fpg-parts.js so the list's handling can change without touching it.
 * It also gives brands their logo from a maker file's "bl" (see brandLogos), e.g. Mountfield, which
 * only comes from STIGA's lists and so has no logo in the Part Finder app.
 * And it fills in stock a maker file gained after it was built (see makerListWithStock).
 * And it adds a second part-number lookup for maker files added since the main one (makerPartHitsPlus).
 */
const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Drops the hidden brands from one finder's data. True if anything was dropped. */
function hideBrands(/** @type {any} */ finder) {
  const hide = new Set(
    String(finder.dataset.hiddenBrands || '')
      .split(/[\r\n,]+/)
      .map((line) => squash(line.replace(/^\s*\*/, '')))
      .filter(Boolean)
  );
  const data = finder.data;
  if (!data || !hide.size) return false;
  const gone = new Set(data.brands.filter((/** @type {any} */ b) => hide.has(squash(b.name))));
  if (!gone.size) return false;
  data.brands = data.brands.filter((/** @type {any} */ b) => !gone.has(b));
  data.models = data.models.filter((/** @type {any} */ m) => !gone.has(m.type.brand));
  return true;
}

/**
 * Logos for brands the Part Finder app has none for (a maker file's bl: brand name -> logo address).
 * Without one, fpg-parts.js shows a photo of one of the brand's machines instead. True if a logo was set.
 */
function brandLogos(/** @type {any} */ finder) {
  const data = finder.data;
  if (!data || !Array.isArray(finder.makers)) return false;
  let changed = false;
  for (const maker of finder.makers) {
    for (const [name, url] of Object.entries(maker?.bl || {})) {
      const brand = data.brands.find((/** @type {any} */ b) => squash(b.name) === squash(name));
      if (brand && !brand.logo && url) {
        brand.logo = String(url);
        delete brand.photo;
        changed = true;
      }
    }
  }
  return changed;
}

/** @type {Map<string, Promise<Record<string, number> | null>>} */
const stockFiles = new Map();
/** A maker file's extra stock file, fetched once per page. */
function stockFile(/** @type {any} */ maker) {
  const url = String(maker.url || '').replace(/[^/]*$/, '') + String(maker.stock);
  if (!stockFiles.has(url))
    stockFiles.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  return /** @type {Promise<Record<string, number> | null>} */ (stockFiles.get(url));
}

/** @type {Map<string, Promise<Record<string, any[]> | null>>} */
const pn2Files = new Map();
function pn2File(/** @type {string} */ url) {
  if (!pn2Files.has(url))
    pn2Files.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  return /** @type {Promise<Record<string, any[]> | null>} */ (pn2Files.get(url));
}

customElements.whenDefined('fpg-parts-finder').then(() => {
  const Finder = /** @type {any} */ (customElements.get('fpg-parts-finder'));
  const merge = Finder?.prototype.mergeMaker;
  if (typeof merge !== 'function' || merge.fpgHides) return;
  /** @this {any} */
  function mergeAndHide() {
    merge.call(this);
    hideBrands(this);
    brandLogos(this);
  }
  mergeAndHide.fpgHides = true;
  Finder.prototype.mergeMaker = mergeAndHide;
  /* Stock found after a maker file was built (a maker file's "stock": a file of part number -> 1 can order, 2 due in,
     3 out at the supplier, next to the index) fills in the parts that file lists as not on the price list (0). */
  const list = Finder.prototype.makerList;
  if (typeof list === 'function' && !list.fpgStock) {
    /** @this {any} */
    async function makerListWithStock(/** @type {number} */ id) {
      const res = await list.call(this, id);
      const maker = this.modelMaker?.get(String(id)) || this.maker;
      const extra = maker?.stock ? await stockFile(maker) : null;
      if (extra) for (const sec of res?.sections || []) for (const p of sec.parts || []) if (!p.makerStock && extra[p.partNumber]) p.makerStock = Number(extra[p.partNumber]);
      return res;
    }
    makerListWithStock.fpgStock = true;
    Finder.prototype.makerList = makerListWithStock;
  }
  /* A second part-number lookup for maker files added after the main one was built (fpg-maker-pn2-{0..15}.json,
     next to fpg-maker-pn-0.json, same format and hashing, 16 files): its hits join the main lookup's. */
  const hits = Finder.prototype.makerPartHits;
  if (typeof hits === 'function' && !hits.fpgPn2) {
    /** @this {any} */
    async function makerPartHitsPlus(/** @type {string} */ text) {
      const main = (await hits.call(this, text)) || [];
      const first = String(this.dataset.makerPn || '');
      const q = squash(text).toLowerCase();
      if (!first || !this.data || q.length < 5 || (q.match(/\d/g) || []).length < 4) return main;
      const n = [...q.replace(/^[a-z]+/, '')].reduce((h, c) => (h * 33 + c.charCodeAt(0)) % 1000003, 7) % 16;
      const file = await pn2File(first.replace('fpg-maker-pn-0.json', `fpg-maker-pn2-${n}.json`));
      const byId = new Map(this.data.models.map((/** @type {any} */ m) => [String(m.id), m]));
      /* A part both lookups know (one STIGA makes for Mountfield too) becomes one hit listing both makers' machines. */
      const seen = new Map(main.map((/** @type {any} */ h) => [h.pn, h]));
      const more = [];
      for (const [key, list] of Object.entries(file || {})) {
        const lead = key.length - q.length;
        if (key !== q && !(lead > 0 && lead <= 3 && key.endsWith(q) && /^[a-z]+$/.test(key.slice(0, lead)))) continue;
        for (const [pn, name, stock, rep, total, mids] of /** @type {any[]} */ (list)) {
          const machines = mids.map((/** @type {any} */ id) => byId.get(String(id))).filter(Boolean);
          if (!machines.length) continue;
          const stockText = stock === 1 ? 'We can order it in' : stock === 2 ? 'Can order in' : stock === 3 ? 'Out of stock at our supplier' : stock === -1 ? `Discontinued${rep ? ` · now ${rep}` : ''}` : '';
          const known = seen.get(pn);
          if (known) {
            const ids = new Set(known.machines.map((/** @type {any} */ m) => m.id));
            known.machines = [...known.machines, ...machines.filter((/** @type {any} */ m) => !ids.has(m.id))];
            known.total = Math.max(known.total + total, known.machines.length);
            if (!known.stockText && stockText) known.stockText = stockText;
            continue;
          }
          more.push({ pn, name, stockText, rep, total: Math.max(total, machines.length), machines });
        }
      }
      return [...main, ...more].sort((a, b) => b.total - a.total).slice(0, 4);
    }
    makerPartHitsPlus.fpgPn2 = true;
    Finder.prototype.makerPartHits = makerPartHitsPlus;
  }
  /* If a finder got its data before this file arrived, tidy it now and redraw the page it's on. */
  for (const el of document.querySelectorAll('fpg-parts-finder')) {
    const hid = hideBrands(el);
    const logos = brandLogos(el);
    if ((hid || logos) && typeof (/** @type {any} */ (el).route) === 'function') /** @type {any} */ (el).route(false);
  }
});
