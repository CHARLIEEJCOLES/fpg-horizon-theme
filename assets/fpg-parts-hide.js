/*
 * Brands left out of the parts finder (section setting "Brands to leave out", data-hidden-brands).
 * After fpg-parts.js has joined the Part Finder app's brands with the makers' files (mergeMaker),
 * these brands and their machines are dropped, so they don't show in the brands grid, the search
 * or links. Kept apart from fpg-parts.js so the list's handling can change without touching it.
 * It also gives brands their logo from a maker file's "bl" (see brandLogos), e.g. Mountfield, which
 * only comes from STIGA's lists and so has no logo in the Part Finder app.
 * And it fills in stock a maker file gained after it was built (see makerListWithStock).
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
  /* If a finder got its data before this file arrived, tidy it now and redraw the page it's on. */
  for (const el of document.querySelectorAll('fpg-parts-finder')) {
    const hid = hideBrands(el);
    const logos = brandLogos(el);
    if ((hid || logos) && typeof (/** @type {any} */ (el).route) === 'function') /** @type {any} */ (el).route(false);
  }
});
