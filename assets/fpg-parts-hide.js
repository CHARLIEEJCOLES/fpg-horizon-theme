/*
 * Brands left out of the parts finder (section setting "Brands to leave out", data-hidden-brands).
 * After fpg-parts.js has joined the Part Finder app's brands with the makers' files (mergeMaker),
 * these brands and their machines are dropped, so they don't show in the brands grid, the search
 * or links. Kept apart from fpg-parts.js so the list's handling can change without touching it.
 * It also gives brands their logo from a maker file's "bl" (see brandLogos), e.g. Mountfield, which
 * only comes from STIGA's lists and so has no logo in the Part Finder app.
 * And it fills in stock a maker file gained after it was built (see makerListWithStock).
 * And it adds a second part-number lookup for maker files added since the main one (makerPartHitsPlus).
 * And the mouse wheel zooms a parts drawing (zoomWithWheel), and the basket − / + answers at once (quickStep).
 * And a maker file can order its machine types ("to") and group long model lists by how the number starts ("series").
 * And opening a brand, type or machine jumps to the top of the finder instead of gliding up from the footer (routeToTop).
 * And a brand whose maker file says where the engine number is ("lead", Briggs & Stratton) gets an engine-number lookup above its size tiles (engineLookup).
 * Stock lights and our Brightpearl prices are in fpg-maker-prices.js, loaded from here (bump v on each upload).
 */
import(new URL('fpg-maker-prices.js?v=3', import.meta.url).href).catch(() => {});
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

/**
 * A maker file can set the order of its brand's machine types ("to": type names, in order). fpg-parts.js sorts types
 * A to Z, which for Briggs & Stratton's engine sizes would put "over 500cc" before "up to 200cc".
 */
function typeOrder(/** @type {any} */ finder) {
  const data = finder.data;
  if (!data || !Array.isArray(finder.makers)) return false;
  let changed = false;
  for (const maker of finder.makers) {
    if (!Array.isArray(maker?.to)) continue;
    const rank = (/** @type {any} */ t) => {
      const i = maker.to.indexOf(t.name);
      return i < 0 ? maker.to.length : i;
    };
    for (const [, name] of maker.b || []) {
      const brand = data.brands.find((/** @type {any} */ b) => b.name === name);
      if (!brand) continue;
      const before = brand.types.map((/** @type {any} */ t) => t.id).join();
      brand.types.sort((/** @type {any} */ a, /** @type {any} */ b) => rank(a) - rank(b));
      if (brand.types.map((/** @type {any} */ t) => t.id).join() !== before) changed = true;
    }
  }
  return changed;
}

/**
 * Long lists of model numbers with no letters in front (Briggs & Stratton's 09P702, 21R707...) come out of fpg-parts.js
 * as one block. A maker file's "series" (a number of characters) groups them under headings by how the number starts
 * (09P..., 21R...), the way STIHL's MS, FS and HS lists are grouped. Models alone in their group go under "Other models".
 */
function seriesGroups(/** @type {any} */ finder, /** @type {any} */ type) {
  const maker = (finder.makers || []).find((/** @type {any} */ m) => m?.series && (m.b || []).some((/** @type {any} */ b) => b[1] === type?.brand?.name));
  const list = /** @type {HTMLElement | null} */ (finder.view?.querySelector('[data-model-list]'));
  if (!maker || !list || list.dataset.fpgSeries) return;
  /* Where to find the model number, when the maker file says ("lead"); engines carry it on the engine, not a machine label. */
  const lead = finder.view.querySelector('.fpg-pf-lead');
  if (lead && maker.lead) lead.textContent = String(maker.lead);
  const items = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('li[data-model-name]')]);
  if (items.length <= 12) return;
  const n = Number(maker.series) || 3;
  /** @type {Map<string, HTMLElement[]>} */
  const groups = new Map();
  for (const li of items) {
    const k = String(li.dataset.modelName || '').slice(0, n);
    if (!groups.has(k)) groups.set(k, []);
    /** @type {HTMLElement[]} */ (groups.get(k)).push(li);
  }
  /** @type {HTMLElement[]} */
  const other = [];
  for (const [k, l] of [...groups]) {
    if (l.length > 1) continue;
    other.push(...l);
    groups.delete(k);
  }
  if (groups.size < 2) return;
  const ulClass = list.querySelector('ul')?.className || 'fpg-pf-models';
  const block = (/** @type {string} */ title, /** @type {HTMLElement[]} */ lis) => {
    const div = document.createElement('div');
    div.className = 'fpg-pf-series';
    div.dataset.series = '';
    const h = document.createElement('h3');
    h.className = 'fpg-pf-series__h';
    h.append(`${title} `);
    const count = document.createElement('span');
    count.textContent = String(lis.length);
    h.append(count);
    const ul = document.createElement('ul');
    ul.className = ulClass;
    ul.setAttribute('role', 'list');
    ul.append(...lis);
    div.append(h, ul);
    return div;
  };
  /* Character by character, so 09P, 090 and 092 sit together (a numeric sort reads "021" as 21 and puts it after 12E). */
  const blocks = [...groups.keys()].sort().map((k) => block(`${k}…`, /** @type {HTMLElement[]} */ (groups.get(k))));
  if (other.length) blocks.push(block('Other models', other));
  list.replaceChildren(...blocks);
  list.dataset.fpgSeries = 'true';
}

/**
 * Engine-number lookup on a brand page whose maker file says where the number is ("lead", Briggs & Stratton).
 * With thousands of engines, picking a size and scrolling isn't a way to find yours: the number on the engine is.
 * A box above the size tiles matches what's typed against every engine of the brand, however it's written:
 * "09P702", "9P702" (leading 0 left off), "09P702-0001-H1" or "09P7020001H1" (model, type and code run together).
 * The best 12 show as buttons fpg-parts.js opens like any model (data-go-model); Enter opens the only or exact one.
 */
function engineLookup(/** @type {any} */ finder, /** @type {any} */ brand) {
  const maker = (finder.makers || []).find((/** @type {any} */ m) => m?.lead && (m.b || []).some((/** @type {any} */ b) => b[1] === brand?.name));
  const head = finder.view?.querySelector('.fpg-pf-head');
  if (!maker || !head || finder.view.querySelector('[data-fpg-engine]')) return;
  const models = (finder.data?.models || []).filter((/** @type {any} */ m) => m.type?.brand === brand);
  if (models.length < 50) return;
  /* "09P702 (type 0001)" -> code 09P702, type 0001. */
  const rows = models.map((/** @type {any} */ m) => {
    const [, code = m.name, type = ''] = String(m.name).match(/^(\S+)(?:\s*\(type\s*([^)]*)\))?/i) || [];
    return { m, label: code, type, code: squash(code), full: squash(code) + squash(type) };
  });
  if (!document.getElementById('fpg-engine-css')) {
    const css = document.createElement('style');
    css.id = 'fpg-engine-css';
    css.textContent =
      '.fpg-eng { margin: 0 0 28px; padding: 22px 24px; border-radius: 18px; background: var(--lk-mist, #f3f6f4); }' +
      ' .fpg-eng__h { margin: 0 0 4px; font-size: 1.15rem; }' +
      ' .fpg-eng__hint { margin: 0 0 14px; opacity: 0.8; max-width: 62ch; }' +
      ' .fpg-eng .fpg-pf-filter { max-width: 460px; background: #fff; }' +
      ' .fpg-eng .fpg-pf-filter input { font-size: 1.1rem; letter-spacing: 0.04em; text-transform: uppercase; }' +
      ' .fpg-eng .fpg-pf-filter input::placeholder { text-transform: none; letter-spacing: 0; }' +
      ' .fpg-eng__status { margin: 12px 0 0; font-size: 0.95rem; }' +
      ' .fpg-eng__status:empty { display: none; }' +
      ' .fpg-eng .fpg-pf-filter svg { flex: none; }' +
      ' .fpg-eng__hits { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }' +
      ' .fpg-eng__hit { display: grid; gap: 2px; width: 100%; padding: 12px 14px; border: 1px solid rgb(0 45 55 / 0.12); border-radius: 12px; background: #fff; color: inherit; font: inherit; text-align: start; cursor: pointer; }' +
      ' .fpg-eng__hit:hover, .fpg-eng__hit:focus-visible { border-color: var(--lk-teal, #002d37); }' +
      ' .fpg-eng__hit strong { font-size: 1.05rem; letter-spacing: 0.03em; }' +
      ' .fpg-eng__hit small { opacity: 0.75; }' +
      ' .fpg-eng-or { margin: 0 0 12px; font-size: 1rem; }';
    document.head.append(css);
  }
  const box = document.createElement('section');
  box.className = 'fpg-eng';
  box.dataset.fpgEngine = '';
  box.setAttribute('aria-labelledby', 'fpg-eng-h');
  box.innerHTML = `
    <h3 class="fpg-eng__h" id="fpg-eng-h">Find your engine by its model number</h3>
    <p class="fpg-eng__hint"></p>
    <label class="fpg-pf-filter"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="visually-hidden">Engine model number</span><input type="search" placeholder="Model number, e.g. 09P702" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" data-fpg-engine-q aria-describedby="fpg-eng-s"></label>
    <p class="fpg-eng__status" id="fpg-eng-s" role="status"></p>
    <ul class="fpg-eng__hits" role="list" data-fpg-engine-hits hidden></ul>`;
  /** @type {HTMLElement} */ (box.querySelector('.fpg-eng__hint')).textContent = String(maker.lead);
  head.after(box);
  const h2 = head.querySelector('.fpg-pf-h');
  if (h2) h2.textContent = `${brand.name}: find your engine`;
  const or = document.createElement('h3');
  or.className = 'fpg-eng-or';
  or.textContent = 'Or browse by engine size';
  box.after(or);
  const input = /** @type {HTMLInputElement} */ (box.querySelector('[data-fpg-engine-q]'));
  const status = /** @type {HTMLElement} */ (box.querySelector('.fpg-eng__status'));
  const list = /** @type {HTMLElement} */ (box.querySelector('[data-fpg-engine-hits]'));
  const esc = (/** @type {string} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
  /** Best matches first: the model number exactly, then model + type + code typed in full, then numbers that start with it. */
  const find = (/** @type {string} */ raw) => {
    const q = squash(raw);
    if (q.length < 2) return [];
    const qs = /^\d/.test(q) ? [q, `0${q}`] : [q];
    /** @type {[number, any][]} */
    const hits = [];
    for (const r of rows) {
      let rank = -1;
      for (const x of qs) {
        if (r.code === x) rank = Math.max(rank, 3);
        else if (x.length > r.code.length && x.startsWith(r.code) && r.code.length >= 5) rank = Math.max(rank, 2);
        else if (r.full.startsWith(x)) rank = Math.max(rank, 1);
      }
      if (rank >= 0) hits.push([rank, r]);
    }
    return hits.sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code, 'en', { numeric: true })).map(([rank, r]) => ({ rank, ...r }));
  };
  let last = /** @type {any[]} */ ([]);
  const show = () => {
    const raw = input.value;
    last = find(raw);
    const shown = last.slice(0, 12);
    list.innerHTML = shown
      .map(
        (/** @type {any} */ h) =>
          `<li><button type="button" class="fpg-eng__hit" data-go-model="${h.m.id}"><strong>${esc(h.label)}</strong><small>${h.type ? `Type ${esc(h.type)} · ` : ''}${esc(h.m.type?.name || '')}</small></button></li>`
      )
      .join('');
    list.hidden = !shown.length;
    const q = squash(raw);
    if (q.length < 2) status.textContent = '';
    else if (!last.length)
      status.textContent = `We don't have an engine numbered ${raw.trim().toUpperCase()}. Check the number on the engine (letters like O and 0 are easy to mix up), or send us a photo of the label and we'll find your parts.`;
    else if (last.length > shown.length) status.textContent = `${last.length.toLocaleString('en-GB')} engines start with that. Keep typing to narrow it down, or pick yours below.`;
    else status.textContent = last.length === 1 ? 'This is the one. Open it to see its parts.' : `${last.length} engines match.`;
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const pick = last.length === 1 ? last[0] : last[0]?.rank >= 2 && last[1]?.rank !== last[0].rank ? last[0] : null;
    if (!pick) return;
    e.preventDefault();
    /** @type {HTMLElement | null} */ (list.querySelector(`[data-go-model="${pick.m.id}"]`))?.click();
  });
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
    typeOrder(this);
  }
  mergeAndHide.fpgHides = true;
  Finder.prototype.mergeMaker = mergeAndHide;
  const models = Finder.prototype.renderModels;
  if (typeof models === 'function' && !models.fpgSeries) {
    /** @this {any} */
    function renderModelsInSeries(/** @type {any} */ type) {
      const out = models.call(this, type);
      seriesGroups(this, type);
      return out;
    }
    renderModelsInSeries.fpgSeries = true;
    Finder.prototype.renderModels = renderModelsInSeries;
  }
  const types = Finder.prototype.renderTypes;
  if (typeof types === 'function' && !types.fpgEngine) {
    /** @this {any} */
    function renderTypesWithLookup(/** @type {any} */ brand) {
      const out = types.call(this, brand);
      engineLookup(this, brand);
      return out;
    }
    renderTypesWithLookup.fpgEngine = true;
    Finder.prototype.renderTypes = renderTypesWithLookup;
  }
  /* Opening a brand, type or machine from far down a long page (the brands grid) left the shorter new page showing its
     footer for a moment, then glided up slowly (the theme scrolls smoothly). Now it jumps straight to the finder's top. */
  const route = Finder.prototype.route;
  if (typeof route === 'function' && !route.fpgJump) {
    /** @this {any} */
    function routeToTop(scroll = true) {
      const out = route.call(this, scroll);
      if (scroll) {
        const top = this.getBoundingClientRect().top + window.scrollY - 90;
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' });
      }
      return out;
    }
    routeToTop.fpgJump = true;
    Finder.prototype.route = routeToTop;
  }
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
  /* Faster − / + on a part's basket quantity. fpg-parts.js waited for the basket to answer after every click
     (buttons greyed out, about a second each). Here the number changes at once, clicks can follow each other
     straight away, and only the final quantity is sent, 350 ms after the last click (one request for 1 -> 5).
     The basket's answer then corrects the number if the shop can't supply that many. */
  const step = Finder.prototype.stepQuantity;
  if (typeof step === 'function' && !step.fpgQuick) {
    /** @type {WeakMap<HTMLElement, {want: number, timer: number, busy: boolean, again: boolean}>} */
    const pending = new WeakMap();
    /** @this {any} */
    function quickStep(/** @type {HTMLElement} */ button) {
      const box = /** @type {HTMLElement | null} */ (button.closest('[data-buy]'));
      const variant = box?.dataset.buy || '';
      const line = this.basket?.get(variant);
      if (!box || !line) return step.call(this, button);
      const p = pending.get(box) || { want: line.quantity, timer: 0, busy: false, again: false };
      pending.set(box, p);
      /* Keeps fpg-parts.js from redrawing this box with the old number while clicks are still coming. */
      box.dataset.busy = 'true';
      p.want = Math.max(0, p.want + Number(button.dataset.qtyStep));
      const n = box.querySelector('.fpg-pf-qty__n');
      if (n) n.innerHTML = p.want ? `<strong>${p.want}</strong> in basket` : 'Removing…';
      const minus = /** @type {HTMLButtonElement | null} */ (box.querySelector('[data-qty-step="-1"]'));
      if (minus) {
        minus.disabled = p.want === 0;
        minus.setAttribute('aria-label', p.want <= 1 ? 'Remove from basket' : 'One fewer');
      }
      const send = async () => {
        if (p.busy) return void (p.again = true);
        p.busy = true;
        p.again = false;
        const want = p.want;
        const key = this.basket.get(variant)?.key || line.key;
        try {
          const tools = /** @type {any} */ (window).FPGTools;
          const cart = tools?.setLineQuantity
            ? await tools.setLineQuantity(key, want, box)
            : await fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: key, quantity: want }) }).then((r) => r.json());
          p.busy = false;
          if (p.again || p.want !== want) return void send();
          pending.delete(box);
          delete box.dataset.busy;
          this.setBasket(cart);
          const got = this.basket.get(variant)?.quantity || 0;
          if (want > 0 && got < want) {
            const shown = box.querySelector('.fpg-pf-qty__n');
            if (shown) shown.innerHTML = `<strong>${got}</strong> in basket (all we have)`;
          }
        } catch (error) {
          p.busy = false;
          pending.delete(box);
          delete box.dataset.busy;
          box.innerHTML = this.buyInner(variant);
          console.warn('[FP&G parts finder]', error);
        }
      };
      clearTimeout(p.timer);
      p.timer = window.setTimeout(send, 350);
    }
    quickStep.fpgQuick = true;
    Finder.prototype.stepQuantity = quickStep;
  }
  zoomWithWheel();
  /* If a finder got its data before this file arrived, tidy it now and redraw the page it's on. */
  for (const el of document.querySelectorAll('fpg-parts-finder')) {
    const hid = hideBrands(el);
    const logos = brandLogos(el);
    const order = typeOrder(el);
    if ((hid || logos || order) && typeof (/** @type {any} */ (el).route) === 'function') /** @type {any} */ (el).route(false);
  }
});
