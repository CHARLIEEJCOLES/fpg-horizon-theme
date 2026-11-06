/*
 * Brands left out of the parts finder (section setting "Brands to leave out", data-hidden-brands).
 * After fpg-parts.js has joined the Part Finder app's brands with the makers' files (mergeMaker),
 * these brands and their machines are dropped, so they don't show in the brands grid, the search
 * or links. Kept apart from fpg-parts.js so the list's handling can change without touching it.
 * It also gives brands their logo from a maker file's "bl" (see brandLogos), e.g. Mountfield, which
 * only comes from STIGA's lists and so has no logo in the Part Finder app.
 * And it fills in stock a maker file gained after it was built (see makerListWithStock).
 * And it adds a second part-number lookup for maker files added since the main one (makerPartHitsPlus).
 * And the mouse wheel zooms a parts drawing (zoomWithWheel).
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

/**
 * Mouse zoom on a parts drawing. fpg-parts.js's viewer zooms only on Ctrl + wheel (and by its - / + / Fit buttons),
 * so a plain wheel scrolled the drawing instead. Here the wheel (and a trackpad pinch) over the drawing zooms in and out
 * around the pointer, a double-click zooms in there (or back to fit when fully in), and Shift + wheel still scrolls
 * sideways. Dragging moves a zoomed drawing as before. Each zoom is handed to the viewer's own Ctrl + wheel handler
 * (one 1.25x step), after enough wheel movement to make a notch, so a trackpad zooms smoothly rather than racing.
 */
function zoomWithWheel() {
  if (/** @type {any} */ (window).fpgWheelZoom) return;
  /** @type {any} */ (window).fpgWheelZoom = true;
  /* Says so under the drawing, for a mouse or trackpad. */
  const css = document.createElement('style');
  css.textContent =
    '@media (hover: hover) and (pointer: fine) {' +
    ' .fpg-pf-v__hint:not(:empty)::after { content: " Scroll to zoom, drag to move."; opacity: 0.75; }' +
    ' .fpg-pf-v [data-v-scroll][data-zoomed="false"] img { cursor: zoom-in; } }';
  document.head.append(css);
  const ours = new WeakSet();
  let acc = 0;
  let last = 0;
  /** One viewer zoom step at the pointer: dir < 0 zooms in. */
  const step = (/** @type {Element} */ target, /** @type {number} */ dir, /** @type {number} */ x, /** @type {number} */ y) => {
    const ev = new WheelEvent('wheel', { deltaY: dir * 100, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true });
    ours.add(ev);
    target.dispatchEvent(ev);
  };
  document.addEventListener(
    'wheel',
    (e) => {
      if (ours.has(e) || e.shiftKey || !(e.target instanceof Element)) return;
      const scroll = e.target.closest('.fpg-pf-v [data-v-scroll]');
      if (!scroll) return;
      e.preventDefault();
      e.stopPropagation();
      /* Lines and pages to pixels; a pinch sends small deltas, so it counts for more. */
      const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
      if (e.timeStamp - last > 300) acc = 0;
      last = e.timeStamp;
      acc += px;
      while (Math.abs(acc) >= 80) {
        const dir = Math.sign(acc);
        acc -= dir * 80;
        step(e.target, dir, e.clientX, e.clientY);
      }
      /* A single small notch (some mice send under 80) still zooms once. */
      if (Math.abs(px) >= 30 && Math.abs(px) < 80 && Math.abs(acc) === Math.abs(px)) {
        acc = 0;
        step(e.target, Math.sign(px), e.clientX, e.clientY);
      }
    },
    { capture: true, passive: false }
  );
  document.addEventListener('dblclick', (e) => {
    if (!(e.target instanceof Element) || e.target.closest('[data-hot], a, button')) return;
    const scroll = e.target.closest('.fpg-pf-v [data-v-scroll]');
    if (!(scroll instanceof HTMLElement)) return;
    e.preventDefault();
    const dialog = scroll.closest('dialog') || document;
    const zoomIn = /** @type {HTMLButtonElement | null} */ (dialog.querySelector('[data-v-zoom="1"]'));
    if (zoomIn?.disabled) return /** @type {HTMLElement | null} */ (dialog.querySelector('[data-v-zoom="0"]'))?.click();
    for (let i = 0; i < 3; i++) step(e.target, -1, e.clientX, e.clientY);
  });
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
  zoomWithWheel();
  /* If a finder got its data before this file arrived, tidy it now and redraw the page it's on. */
  for (const el of document.querySelectorAll('fpg-parts-finder')) {
    const hid = hideBrands(el);
    const logos = brandLogos(el);
    if ((hid || logos) && typeof (/** @type {any} */ (el).route) === 'function') /** @type {any} */ (el).route(false);
  }
});
