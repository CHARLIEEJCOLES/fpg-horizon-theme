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
 * And a brand whose maker file says where the engine number is ("lead", Briggs & Stratton) gets an engine-number lookup above its size tiles (engineLookup),
 * and Briggs & Stratton's size tiles give way to a tile per engine series, named as on the engine (engineFamilies).
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
  const families = engineFamilies(finder, brand, rows);
  if (families) box.after(families);
  else {
    const or = document.createElement('h3');
    or.className = 'fpg-eng-or';
    or.textContent = 'Or browse by engine size';
    box.after(or);
  }
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

/*
 * Briggs & Stratton engines by the name on the engine, for engineFamilies. Sources: the Briggs & Stratton label guide and
 * engine pages (series names and model numbers) and its model-number key: the first two digits are the size in cubic
 * inches, and the fourth character says which way the crankshaft points (0-4 and A-G across, 5-9 and H-Z down).
 * "pre": engine numbers starting with these belong to the series. "test": the rule for the rest, in order.
 * Photos are Briggs & Stratton's own, copied to the shop's Files.
 */
const BS_FILES = 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/';
const BS_GROUPS = [
  { sec: 'Push mowers', key: '450e', name: '450E Series', img: 'bs-series-450e.png', pre: ['08P5', '08P6'] },
  { sec: 'Push mowers', key: '500e', name: '500E Series', img: 'bs-series-500e.png', pre: ['09P6'] },
  { sec: 'Push mowers', key: '550e', name: '550E and 575EX Series', img: 'bs-series-575ex.png', pre: ['09P7'] },
  { sec: 'Push mowers', key: '675', name: '625E, 650EXi and 675EXi Series', img: 'bs-series-675exi.png', pre: ['103M', '104M'] },
  { sec: 'Push mowers', key: '750dov', name: '750EX DOV Series', img: 'bs-series-750ex-dov.png', pre: ['093J', '1006'] },
  { sec: 'Push mowers', key: '875', name: '800E to 875EXi Series', img: 'bs-series-875exi.png', pre: ['11P9', '111P', '12R9', '12S9', '12Q9', '121R', '125P'] },
  { sec: 'Push mowers', key: '950e', name: '950E Series', pre: ['14B9'] },
  { sec: 'Push mowers', key: 'quantum', name: 'Quantum', pre: ['12H8', '123K'] },
  { sec: 'Push mowers', key: 'edge', name: 'Intek Edge-Pro', pre: ['126T'] },
  { sec: 'Push mowers', key: 'old-s', name: 'Older engines up to 165cc', note: 'Classic, Sprint, Quattro and others', test: (/** @type {number} */ cu, /** @type {boolean} */ down) => down && cu <= 10 },
  { sec: 'Push mowers', key: 'old-m', name: 'Older engines 180 to 200cc', note: 'Engine numbers starting 11 or 12', test: (/** @type {number} */ cu, /** @type {boolean} */ down) => down && cu <= 12 },
  { sec: 'Ride-on mowers', key: 'r344', name: '3105E to 3130EX Series', note: '344cc, also sold as Intek', img: 'bs-series-3130ex.png', pre: ['21R5', '21R6', '21R7', '21R8', '21R9', '21B9'] },
  { sec: 'Ride-on mowers', key: 'r500', name: '4145E to 4195E Series', note: '500cc, also sold as Intek', img: 'bs-series-4175e.png', pre: ['31R5', '31R6', '31R7', '31R8', '31R9'] },
  { sec: 'Ride-on mowers', key: 'ride1', name: 'Other single-cylinder engines', note: '210 to 560cc', test: (/** @type {number} */ cu, /** @type {boolean} */ down) => down && cu < 35 },
  { sec: 'Ride-on mowers', key: 'ride2', name: 'Twin-cylinder engines', note: '570cc and up', test: (/** @type {number} */ _cu, /** @type {boolean} */ down) => down },
  { sec: 'Tillers, generators and other machines', key: 'across', name: 'Horizontal-shaft engines', note: 'Crankshaft comes out of the side: tillers, generators, pressure washers, go-karts, log splitters', test: () => true },
];
const ENGINE_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><rect x="14" y="20" width="30" height="28" rx="4"/><path d="M18 20v-6h22v6M44 26h8v16h-8M14 30H8v10h6M22 48v6M36 48v6"/><path d="M20 27h18M20 33h18M20 39h18"/></g></svg>';

/**
 * Briggs & Stratton has thousands of engines, and its owners know them by the name on the engine cover (500E Series,
 * Quantum...) or the machine they're on, not by a size band. So instead of the size tiles, its brand page shows a tile
 * per series (with Briggs & Stratton's photo where it has one), under the kind of machine. A tile opens its engines in
 * place: small series as one list, big ones by size (the first two digits of the number), folded so the page stays short.
 * Returns the block to put under the engine-number lookup, or null for any other brand.
 */
function engineFamilies(/** @type {any} */ finder, /** @type {any} */ brand, /** @type {any[]} */ rows) {
  if (squash(brand?.name) !== 'BRIGGSSTRATTON') return null;
  /** @type {Map<string, any[]>} */
  const byGroup = new Map(BS_GROUPS.map((g) => [g.key, []]));
  /** @type {any[]} */
  const other = [];
  for (const r of rows) {
    const c = r.code;
    let g = BS_GROUPS.find((x) => x.pre?.some((p) => c.startsWith(p)));
    if (!g && /^\d\d[0-9A-Z]{4}$/.test(c)) {
      const down = /[5-9H-Z]/.test(c[3]);
      g = BS_GROUPS.find((x) => x.test?.(Number(c.slice(0, 2)), down));
    }
    if (g) /** @type {any[]} */ (byGroup.get(g.key)).push(r);
    else other.push(r);
  }
  const groups = BS_GROUPS.map((g) => ({ ...g, rows: /** @type {any[]} */ (byGroup.get(g.key)) })).filter((g) => g.rows.length);
  if (other.length) groups.push({ sec: 'Tillers, generators and other machines', key: 'other', name: 'Other engine numbers', note: 'Numbers that don’t start with a size', rows: other });
  const esc = (/** @type {string} */ s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch);
  const count = (/** @type {number} */ n) => `${n.toLocaleString('en-GB')} engine${n === 1 ? '' : 's'}`;
  const starts = (/** @type {any} */ g) => {
    if (g.note) return g.note;
    return `Engine numbers starting ${g.pre.join(', ').replace(/, ([^,]*)$/, ' or $1')}`;
  };
  if (!document.getElementById('fpg-fam-css')) {
    const css = document.createElement('style');
    css.id = 'fpg-fam-css';
    css.textContent =
      '.fpg-fam { margin: 0 0 32px; }' +
      ' .fpg-fam__intro { margin: 0 0 18px; font-size: 1.15rem; }' +
      ' .fpg-fam__sec { margin: 0 0 26px; }' +
      ' .fpg-fam__sec h4 { margin: 0 0 10px; font-size: 1rem; opacity: 0.85; }' +
      ' .fpg-fam__tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }' +
      ' .fpg-fam__tile { display: grid; grid-template-rows: auto 1fr; width: 100%; height: 100%; padding: 0; overflow: hidden; border: 1px solid rgb(0 45 55 / 0.12); border-radius: 14px; background: #fff; color: inherit; font: inherit; text-align: start; cursor: pointer; }' +
      ' .fpg-fam__tile:hover, .fpg-fam__tile:focus-visible { border-color: var(--lk-teal, #002d37); }' +
      ' .fpg-fam__pic { display: grid; place-items: center; aspect-ratio: 4 / 3; background: var(--lk-mist, #f3f6f4); color: rgb(0 45 55 / 0.45); }' +
      ' .fpg-fam__pic img { width: 82%; height: 88%; object-fit: contain; mix-blend-mode: multiply; }' +
      ' .fpg-fam__pic svg { width: 38%; height: auto; }' +
      ' .fpg-fam__txt { display: grid; align-content: start; gap: 3px; padding: 12px 14px 14px; }' +
      ' .fpg-fam__txt strong { font-size: 1.02rem; line-height: 1.25; }' +
      ' .fpg-fam__txt small { opacity: 0.75; line-height: 1.35; }' +
      ' .fpg-fam__txt em { font-style: normal; font-size: 0.88rem; font-weight: 600; color: var(--lk-teal, #002d37); margin-top: 4px; }' +
      ' .fpg-fam__panel[hidden], .fpg-fam__home[hidden] { display: none; }' +
      ' .fpg-fam__back { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 14px; padding: 8px 14px 8px 10px; border: 1px solid rgb(0 45 55 / 0.2); border-radius: 999px; background: #fff; color: inherit; font: inherit; cursor: pointer; }' +
      ' .fpg-fam__back:hover, .fpg-fam__back:focus-visible { border-color: var(--lk-teal, #002d37); }' +
      ' .fpg-fam__top { display: flex; gap: 18px; align-items: center; margin: 0 0 16px; }' +
      ' .fpg-fam__top .fpg-fam__pic { flex: none; width: 120px; border-radius: 12px; }' +
      ' .fpg-fam__top h4 { margin: 0 0 4px; font-size: 1.3rem; }' +
      ' .fpg-fam__top p { margin: 0; opacity: 0.8; }' +
      ' .fpg-fam .fpg-pf-filter { max-width: 360px; margin: 0 0 16px; background: #fff; }' +
      ' .fpg-fam__size { margin: 0 0 8px; border: 1px solid rgb(0 45 55 / 0.12); border-radius: 12px; background: #fff; }' +
      ' .fpg-fam__size > summary { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; }' +
      ' .fpg-fam__size > summary::-webkit-details-marker { display: none; }' +
      ' .fpg-fam__size > summary::after { content: "+"; font-weight: 400; font-size: 1.3rem; line-height: 1; }' +
      ' .fpg-fam__size[open] > summary::after { content: "\\2212"; }' +
      ' .fpg-fam__size > summary span { margin-inline-start: auto; font-weight: 400; opacity: 0.75; }' +
      ' .fpg-fam__size .fpg-fam__engs { padding: 0 16px 16px; }' +
      ' .fpg-fam__engs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }' +
      ' .fpg-fam__eng { padding: 7px 12px; border: 1px solid rgb(0 45 55 / 0.16); border-radius: 8px; background: var(--lk-mist, #f3f6f4); color: inherit; font: inherit; font-weight: 600; letter-spacing: 0.03em; cursor: pointer; }' +
      ' .fpg-fam__eng:hover, .fpg-fam__eng:focus-visible { border-color: var(--lk-teal, #002d37); background: #fff; }' +
      ' .fpg-fam__none { margin: 0; opacity: 0.8; }' +
      ' @media (max-width: 560px) { .fpg-fam__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .fpg-fam__txt { padding: 10px 11px 12px; } .fpg-fam__top .fpg-fam__pic { width: 84px; } }';
    document.head.append(css);
  }
  const pic = (/** @type {any} */ g) =>
    `<span class="fpg-fam__pic">${g.img ? `<img src="${BS_FILES}${g.img}?width=480" alt="" width="480" height="480" loading="lazy">` : ENGINE_ICON}</span>`;
  const sections = [...new Set(groups.map((g) => g.sec))];
  const wrap = document.createElement('section');
  wrap.className = 'fpg-fam';
  wrap.dataset.fpgFam = '';
  wrap.setAttribute('aria-labelledby', 'fpg-fam-h');
  wrap.innerHTML = `
    <div class="fpg-fam__home">
      <h3 class="fpg-fam__intro" id="fpg-fam-h">Or pick the name on your engine</h3>
      ${sections
        .map(
          (sec) => `<div class="fpg-fam__sec"><h4>${esc(sec)}</h4><ul class="fpg-fam__tiles" role="list">${groups
            .filter((g) => g.sec === sec)
            .map(
              (g) =>
                `<li><button type="button" class="fpg-fam__tile" data-fpg-fam-open="${g.key}">${pic(g)}<span class="fpg-fam__txt"><strong>${esc(g.name)}</strong><small>${esc(starts(g))}</small><em>${count(g.rows.length)}</em></span></button></li>`
            )
            .join('')}</ul></div>`
        )
        .join('')}
    </div>
    <div class="fpg-fam__panel" hidden></div>`;
  const home = /** @type {HTMLElement} */ (wrap.querySelector('.fpg-fam__home'));
  const panel = /** @type {HTMLElement} */ (wrap.querySelector('.fpg-fam__panel'));
  /* The size tiles fpg-parts.js drew are replaced by these. */
  finder.view.querySelectorAll('.fpg-pf-types').forEach((/** @type {HTMLElement} */ el) => (el.hidden = true));
  const chip = (/** @type {any} */ r) =>
    `<li><button type="button" class="fpg-fam__eng" data-go-model="${r.m.id}" title="${esc(`${r.label}${r.type ? `, type ${r.type}` : ''}`)}">${esc(r.label)}</button></li>`;
  const sortRows = (/** @type {any[]} */ l) => [...l].sort((a, b) => a.code.localeCompare(b.code, 'en'));
  const sizeLabel = (/** @type {string} */ two) => {
    const cu = Number(two);
    if (!Number.isFinite(cu) || !/^\d\d$/.test(two)) return 'Other numbers';
    return `Numbers starting ${two}: about ${Math.round((cu * 16.387) / 5) * 5}cc`;
  };
  const storeKey = `fpg-fam:${brand.id}`;
  const remember = (/** @type {string} */ v) => {
    try {
      if (v) sessionStorage.setItem(storeKey, v);
      else sessionStorage.removeItem(storeKey);
    } catch {}
  };
  const drawList = (/** @type {any} */ g, /** @type {string} */ q) => {
    const out = /** @type {HTMLElement} */ (panel.querySelector('[data-fpg-fam-list]'));
    const x = squash(q);
    const l = sortRows(x ? g.rows.filter((/** @type {any} */ r) => r.full.includes(x) || (/^\d/.test(x) && r.full.startsWith(`0${x}`))) : g.rows);
    if (!l.length) {
      out.innerHTML = `<p class="fpg-fam__none">None of these engines match ${esc(q.trim().toUpperCase())}. Try the lookup at the top, which checks every Briggs & Stratton engine.</p>`;
      return;
    }
    if (l.length <= 40 || x) {
      out.innerHTML = `<ul class="fpg-fam__engs" role="list">${l.map(chip).join('')}</ul>`;
      return;
    }
    /** @type {Map<string, any[]>} */
    const sizes = new Map();
    for (const r of l) {
      const k = r.code.slice(0, 2);
      if (!sizes.has(k)) sizes.set(k, []);
      /** @type {any[]} */ (sizes.get(k)).push(r);
    }
    out.innerHTML = [...sizes]
      .map(
        ([k, rs]) =>
          `<details class="fpg-fam__size"><summary>${esc(sizeLabel(k))}<span>${count(rs.length)}</span></summary><ul class="fpg-fam__engs" role="list">${rs.map(chip).join('')}</ul></details>`
      )
      .join('');
  };
  const open = (/** @type {string} */ key, /** @type {boolean} */ focus) => {
    const g = groups.find((x) => x.key === key);
    if (!g) return;
    panel.innerHTML = `
      <button type="button" class="fpg-fam__back" data-fpg-fam-back><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>All Briggs & Stratton engines</button>
      <div class="fpg-fam__top">${pic(g)}<div><h4 tabindex="-1">${esc(g.name)}</h4><p>${esc(starts(g))}. ${count(g.rows.length)}.</p></div></div>
      ${g.rows.length > 12 ? `<label class="fpg-pf-filter"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="visually-hidden">Narrow down these engines</span><input type="search" placeholder="Narrow down, e.g. ${esc(g.rows[0].label.slice(0, 4))}" autocomplete="off" autocapitalize="characters" spellcheck="false" data-fpg-fam-q></label>` : ''}
      <div data-fpg-fam-list></div>`;
    drawList(g, '');
    panel.querySelector('[data-fpg-fam-q]')?.addEventListener('input', (e) => drawList(g, /** @type {HTMLInputElement} */ (e.target).value));
    home.hidden = true;
    panel.hidden = false;
    panel.dataset.key = key;
    if (focus) {
      /** @type {HTMLElement | null} */ (panel.querySelector('h4'))?.focus({ preventScroll: true });
      wrap.scrollIntoView({ block: 'start' });
    }
  };
  const close = () => {
    const key = panel.dataset.key;
    panel.hidden = true;
    panel.replaceChildren();
    delete panel.dataset.key;
    home.hidden = false;
    remember('');
    /** @type {HTMLElement | null} */ (home.querySelector(`[data-fpg-fam-open="${key}"]`))?.focus({ preventScroll: true });
    wrap.scrollIntoView({ block: 'start' });
  };
  wrap.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const tile = /** @type {HTMLElement | null} */ (t.closest('[data-fpg-fam-open]'));
    if (tile) return open(String(tile.dataset.fpgFamOpen), true);
    if (t.closest('[data-fpg-fam-back]')) return close();
    /* Opening an engine from a series: coming back to the brand reopens that series. */
    if (t.closest('[data-go-model]') && panel.dataset.key) remember(panel.dataset.key);
  });
  let back = '';
  try {
    back = sessionStorage.getItem(storeKey) || '';
    sessionStorage.removeItem(storeKey);
  } catch {}
  if (back) open(back, false);
  return wrap;
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
