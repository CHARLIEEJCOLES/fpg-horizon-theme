/**
 * FP&G spare parts finder (sections/fpg-part-finder.liquid) and the
 * "Parts for this machine" link on product pages (blocks/fpg-parts-link.liquid).
 *
 * Data
 * - Brands, machine types and models: assets/fpg-parts-index.json, a snapshot
 *   of the FPG Part Finder app built with fpg-tools/parts/build-parts-index.js.
 *   It makes the model search instant. The models list for a machine type is
 *   also asked of the app when a shopper opens it, so new models show up
 *   before the snapshot is rebuilt.
 * - Parts for a model: asked live of the app's proxy (getProducts), grouped
 *   in the app's sections (Carburettor, Engine, ...).
 * - Manufacturer stock: the Cormorant server's /availability check, for parts
 *   of the brands in the section setting when we have none ourselves. Only
 *   parts on screen are checked, two at a time, and answers are kept for
 *   10 minutes in the browser.
 *
 * URLs: ?brand=<id>, ?brand=<id>&type=<id>, ?brand=<id>&type=<id>&model=<id>.
 * The old app's links (?step=machineTypes|models|model&id=...) still work.
 */

const STORE_MACHINES = 'fpg-my-machines';
const STORE_STOCK = 'fpg-maker-stock';
const STOCK_LIFETIME = 10 * 60 * 1000;

/* ---------------------------------------------------------------- helpers */

export const esc = (/** @type {unknown} */ value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Natural sort, so MS 170 comes before MS 1700 and 021 before 044. */
const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/** "*Stihl" -> "STIHL". The asterisk marks the app's priority brands. */
export function brandName(/** @type {string} */ raw) {
  const name = String(raw || '').replace(/^\*/, '').trim();
  return /^stihl$/i.test(name) ? 'STIHL' : name;
}

/** STIHL 11-digit part numbers read better in their printed groups: 1141 120 0640. */
function partNumber(/** @type {string} */ sku) {
  const s = String(sku || '').trim();
  if (/^\d{11}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  if (/^[A-Z]\d{3}[0-9A-Z]{7}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  return s;
}

/** Drops the part number the titles repeat at the end, and the brand at the start. */
function cleanTitle(/** @type {string} */ title, /** @type {string} */ sku, /** @type {string} */ brand) {
  let t = String(title || '');
  if (sku) {
    const spaced = partNumber(sku).replace(/ /g, '\\s*');
    t = t.replace(new RegExp(`\\s*${sku}\\s*/\\s*${spaced}\\s*$`, 'i'), '');
    t = t.replace(new RegExp(`\\s+${sku}\\b`, 'i'), '');
  }
  if (brand) t = t.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '');
  return t.trim() || String(title || '');
}

function readStore(/** @type {string} */ key, /** @type {any} */ fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(/** @type {string} */ key, /** @type {any} */ value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the page still works, it just doesn't remember */
  }
}

/* ---------------------------------------------------------------- icons */

/* Drawn for FP&G: simple 48px line icons, one per kind of machine. */
const ICON_PATHS = {
  chainsaw:
    '<rect x="5" y="19" width="16" height="15" rx="3"/><path d="M9 19v-4h9v4"/><path d="M21 23h18a4 4 0 0 1 0 8H21"/><path d="M24 27h13" stroke-dasharray="2 2.5"/><path d="M5 26H2"/>',
  blower:
    '<circle cx="15" cy="27" r="9"/><path d="M15 23v8M11 27h8"/><path d="M23 22l19-6v7l-17 7"/><path d="M10 18c3-6 8-6 11 0"/>',
  trimmer:
    '<rect x="3" y="4" width="10" height="9" rx="2"/><path d="M11 12l26 26"/><path d="M17 22l-7 4M22 17l4-7"/><ellipse cx="40" cy="40" rx="6" ry="3"/>',
  hedge:
    '<rect x="3" y="20" width="15" height="11" rx="3"/><path d="M7 20c3-8 9-8 11 0"/><rect x="18" y="23.5" width="25" height="4" rx="1"/><path d="M22 23.5v-3M27 23.5v-3M32 23.5v-3M37 23.5v-3M22 27.5v3M27 27.5v3M32 27.5v3M37 27.5v3"/>',
  pole:
    '<rect x="3" y="35" width="10" height="9" rx="2"/><path d="M11 37L36 12"/><path d="M33 5l9 9-4 4-9-9z"/><path d="M17 31l-4-4"/>',
  cutter:
    '<circle cx="33" cy="27" r="11"/><circle cx="33" cy="27" r="2"/><path d="M24 18a12 12 0 0 1 18 0"/><rect x="3" y="21" width="14" height="13" rx="3"/><path d="M17 27h14"/><path d="M7 21c2-6 7-6 9 0"/>',
  auger:
    '<rect x="14" y="5" width="20" height="10" rx="2"/><path d="M5 11h38"/><path d="M24 15v28"/><path d="M18 21l12 4-12 4 12 4-12 4"/>',
  kombi:
    '<rect x="3" y="4" width="10" height="9" rx="2"/><path d="M11 12l26 26"/><circle cx="24" cy="25" r="3"/><path d="M17 22l-7 4"/><path d="M34 35l9 1-1 9z"/>',
  mist:
    '<rect x="8" y="8" width="16" height="26" rx="5"/><path d="M12 15h8"/><path d="M24 26c9 0 13-4 15-11"/><path d="M36 12l7 4"/><path d="M10 34v6M22 34v6"/>',
  washer:
    '<rect x="5" y="16" width="17" height="19" rx="3"/><circle cx="9" cy="39" r="3"/><circle cx="19" cy="39" r="3"/><path d="M22 23h9l11-7"/><path d="M42 13v6M45 15v4"/>',
  pump:
    '<circle cx="24" cy="27" r="10"/><circle cx="24" cy="27" r="3"/><path d="M34 27h9M14 27H5"/><path d="M10 40h28M14 37v3M34 37v3"/><path d="M19 14h10v3H19z"/>',
  mower:
    '<rect x="5" y="24" width="28" height="9" rx="3"/><circle cx="11" cy="37" r="4"/><circle cx="28" cy="37" r="4"/><path d="M30 24L42 7"/><path d="M38 7h7"/><path d="M12 24v-3h12v3"/>',
  rideon:
    '<circle cx="33" cy="35" r="7"/><circle cx="11" cy="37" r="4"/><path d="M6 33h20l4-11h9"/><path d="M28 22v-6h6"/><path d="M16 33l-2-13h-4"/><path d="M7 20h7"/>',
  robot:
    '<rect x="5" y="21" width="38" height="13" rx="4"/><circle cx="11" cy="37" r="3"/><circle cx="37" cy="37" r="3"/><path d="M24 21v-9"/><circle cx="24" cy="10" r="2"/><path d="M14 27h20"/>',
  chipper:
    '<path d="M29 15l14-7v22l-14-4z"/><rect x="8" y="18" width="21" height="14" rx="2"/><path d="M11 18L6 8h8l3 10"/><circle cx="17" cy="38" r="4"/><path d="M8 32v6h5"/>',
  grinder:
    '<circle cx="34" cy="31" r="9"/><path d="M34 20v-3M43 31h3M34 42v3M25 31h-3M40 24l2-2M40 38l2 2M28 38l-2 2"/><rect x="6" y="20" width="16" height="12" rx="2"/><path d="M22 26h6"/><path d="M8 20L4 9"/><circle cx="12" cy="37" r="4"/>',
  engine:
    '<rect x="9" y="14" width="26" height="22" rx="3"/><path d="M14 14V9h16v5"/><path d="M14 20h16M14 25h16M14 30h16"/><path d="M35 25h7"/><circle cx="5" cy="25" r="3"/><path d="M8 25h1"/>',
  tiller:
    '<circle cx="14" cy="36" r="7"/><path d="M8 30l12 12M20 30L8 42"/><rect x="18" y="20" width="14" height="11" rx="2"/><path d="M30 20L42 6"/><path d="M38 6h7"/>',
  wrench:
    '<path d="M31 6a9 9 0 0 0-8 12L7 34a4 4 0 0 0 6 6l16-16a9 9 0 0 0 12-8l-6 2-4-4z"/>',
};

const ICON_RULES = [
  [/chainsaw|chain saw/i, 'chainsaw'],
  [/pole|polesaw|pruner/i, 'pole'],
  [/hedge/i, 'hedge'],
  [/mist/i, 'mist'],
  [/blower|vacuum/i, 'blower'],
  [/brush|trimmer|strimmer/i, 'trimmer'],
  [/kombi|multi/i, 'kombi'],
  [/disc|cut-?off/i, 'cutter'],
  [/auger|drill/i, 'auger'],
  [/pressure|washer/i, 'washer'],
  [/pump/i, 'pump'],
  [/remote/i, 'robot'],
  [/ride|tractor|zero/i, 'rideon'],
  [/mower|lawn/i, 'mower'],
  [/chipper/i, 'chipper'],
  [/stump|grinder/i, 'grinder'],
  [/engine/i, 'engine'],
  [/rotavator|tiller|cultivator/i, 'tiller'],
];

export function machineIcon(/** @type {string} */ typeName, size = 48) {
  const key = ICON_RULES.find(([re]) => /** @type {RegExp} */ (re).test(typeName))?.[1] || 'wrench';
  return `<svg class="fpg-pf-icon" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[/** @type {keyof typeof ICON_PATHS} */ (key)]}</svg>`;
}

const ARROW =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ---------------------------------------------------------------- index */

/**
 * @typedef {{ id: number, name: string, raw: string, logo: string, priority: boolean, types: Type[] }} Brand
 * @typedef {{ id: number, name: string, brand: Brand, models: Model[] }} Type
 * @typedef {{ id: number, name: string, type: Type, key: string }} Model
 */

/** @type {Map<string, Promise<{ brands: Brand[], models: Model[] }>>} */
const indexCache = new Map();

export function loadIndex(/** @type {string} */ url) {
  if (!indexCache.has(url)) {
    indexCache.set(
      url,
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          /** @type {Brand[]} */
          const brands = [];
          /** @type {Model[]} */
          const models = [];
          for (const [id, raw, logo, types] of data.b) {
            /** @type {Brand} */
            const brand = { id, raw, name: brandName(raw), logo: logo ? data.img + logo : '', priority: raw.startsWith('*'), types: [] };
            for (const [tid, tname, list] of types) {
              /** @type {Type} */
              const type = { id: tid, name: tname, brand, models: [] };
              for (const [mid, mname] of list) {
                const model = { id: mid, name: mname, type, key: squash(mname) };
                type.models.push(model);
                models.push(model);
              }
              type.models.sort((a, b) => collator.compare(a.name, b.name));
              brand.types.push(type);
            }
            brands.push(brand);
          }
          /* Priority brands in the app's order (STIHL first), then the rest A to Z. */
          brands.sort((a, b) => Number(b.priority) - Number(a.priority) || (a.priority ? a.id - b.id : collator.compare(a.name, b.name)));
          return { brands, models };
        })
    );
  }
  return /** @type {Promise<{ brands: Brand[], models: Model[] }>} */ (indexCache.get(url));
}

const modelCount = (/** @type {Brand} */ b) => b.types.reduce((n, t) => n + t.models.length, 0);

/** Groups model names by their letters (MS, MSA, HS...), so long lists are easier to scan. */
function seriesOf(/** @type {string} */ name) {
  const m = name.match(/^([A-Za-z]+)[\s-]?\d/);
  if (m) return m[1].toUpperCase();
  if (/^\d/.test(name)) return '';
  return name.split(/\s/)[0].toUpperCase();
}

/* ---------------------------------------------------------------- manufacturer stock */

/** @type {Map<string, Promise<any>>} */
const stockRequests = new Map();
/** @type {Array<() => Promise<void>>} */
const stockQueue = [];
let stockRunning = 0;

function runStockQueue() {
  while (stockRunning < 2 && stockQueue.length) {
    const job = /** @type {() => Promise<void>} */ (stockQueue.shift());
    stockRunning++;
    job().finally(() => {
      stockRunning--;
      runStockQueue();
    });
  }
}

/** Asks the Cormorant server once per supplier and SKU, queued two at a time. */
function makerStock(/** @type {string} */ base, /** @type {string} */ supplier, /** @type {string} */ sku) {
  const key = `${supplier}|${sku}`;
  const saved = readStore(STORE_STOCK, {});
  if (saved[key] && Date.now() - saved[key].at < STOCK_LIFETIME) return Promise.resolve(saved[key]);
  if (!stockRequests.has(key)) {
    stockRequests.set(
      key,
      new Promise((resolve) => {
        stockQueue.push(async () => {
          try {
            const url = new URL(`${base.replace(/\/+$/, '')}/availability`);
            url.searchParams.set('supplier', supplier);
            url.searchParams.set('sku', sku);
            const data = await fetch(url, { mode: 'cors' }).then((r) => r.json());
            if (['in-stock', 'available-to-order', 'unavailable'].includes(data?.status)) {
              const answer = { status: data.status, eta: data.etaDate || null, at: Date.now() };
              const all = readStore(STORE_STOCK, {});
              all[key] = answer;
              writeStore(STORE_STOCK, all);
              resolve(answer);
            } else resolve(null);
          } catch {
            resolve(null);
          }
        });
        runStockQueue();
      })
    );
  }
  return /** @type {Promise<any>} */ (stockRequests.get(key));
}

/* ---------------------------------------------------------------- finder */

class FpgPartsFinder extends HTMLElement {
  /** @type {{ brands: Brand[], models: Model[] } | null} */
  data = null;
  /** @type {IntersectionObserver | null} */
  observer = null;
  vat = 20;
  /** @type {AbortController | null} */
  request = null;

  get proxy() {
    return (this.dataset.proxy || '/apps/parts-finder').replace(/\/+$/, '');
  }

  async connectedCallback() {
    this.vat = Number(this.dataset.vat || 20);
    this.view = /** @type {HTMLElement} */ (this.querySelector('[data-view]'));
    this.crumbs = /** @type {HTMLElement} */ (this.querySelector('[data-crumbs]'));
    this.input = /** @type {HTMLInputElement} */ (this.querySelector('[data-search]'));
    this.suggest = /** @type {HTMLElement} */ (this.querySelector('[data-suggest]'));
    this.mine = /** @type {HTMLElement} */ (this.querySelector('[data-mine]'));

    this.addEventListener('click', this.onClick);
    this.input?.addEventListener('input', () => this.showSuggestions());
    this.input?.addEventListener('keydown', this.onSearchKey);
    this.input?.addEventListener('focus', () => this.showSuggestions());
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node) || !this.querySelector('[data-searchbox]')?.contains(e.target)) this.hideSuggestions();
    });
    window.addEventListener('popstate', () => this.route(false));

    try {
      this.data = await loadIndex(this.dataset.index || '');
    } catch {
      this.view.innerHTML = this.errorHtml('The parts list did not load.');
      return;
    }
    this.renderMine();
    this.route(false);
  }

  /* ---------- routing */

  params() {
    const p = new URLSearchParams(location.search);
    const step = p.get('step');
    const id = p.get('id');
    if (step && id) {
      if (step === 'machineTypes') return { brand: id };
      if (step === 'models') return { type: id };
      if (step === 'model') return { model: id };
    }
    return { brand: p.get('brand'), type: p.get('type'), model: p.get('model') };
  }

  /** @param {{ brand?: number|null, type?: number|null, model?: number|null }} to */
  go(to, push = true) {
    const p = new URLSearchParams();
    if (to.brand) p.set('brand', String(to.brand));
    if (to.type) p.set('type', String(to.type));
    if (to.model) p.set('model', String(to.model));
    const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
    if (push) history.pushState(null, '', url);
    this.route(true);
  }

  route(scroll = true) {
    if (!this.data) return;
    const { brand: bId, type: tId, model: mId } = this.params();
    const { brands } = this.data;
    let brand = brands.find((b) => String(b.id) === String(bId)) || null;
    let type = null;
    let model = null;
    if (mId) {
      model = this.data.models.find((m) => String(m.id) === String(mId)) || null;
      if (model) {
        type = model.type;
        brand = type.brand;
      }
    }
    if (!type && tId) {
      for (const b of brands) {
        const t = b.types.find((x) => String(x.id) === String(tId));
        if (t) {
          type = t;
          brand = b;
        }
      }
    }
    this.request?.abort();
    this.observer?.disconnect();
    if (model) this.renderModel(model);
    else if (mId) this.renderUnknownModel(Number(mId));
    else if (type) this.renderModels(type);
    else if (brand) this.renderTypes(brand);
    else this.renderBrands();
    this.renderCrumbs(brand, type, model);
    this.dataset.step = model || mId ? 'model' : type ? 'models' : brand ? 'types' : 'brands';
    if (scroll) {
      const top = this.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
      /** @type {HTMLElement | null} */ (this.view.querySelector('[data-focus]'))?.focus({ preventScroll: true });
    }
  }

  renderCrumbs(/** @type {Brand|null} */ brand, /** @type {Type|null} */ type, /** @type {Model|null} */ model) {
    if (!this.crumbs) return;
    if (!brand) {
      this.crumbs.hidden = true;
      return;
    }
    const items = [`<button type="button" data-go-home>All brands</button>`];
    items.push(type ? `<button type="button" data-go-brand="${brand.id}">${esc(brand.name)}</button>` : `<span aria-current="page">${esc(brand.name)}</span>`);
    if (type) items.push(model ? `<button type="button" data-go-type="${type.id}">${esc(type.name)}</button>` : `<span aria-current="page">${esc(type.name)}</span>`);
    if (model) items.push(`<span aria-current="page">${esc(model.name)}</span>`);
    this.crumbs.innerHTML = `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
    this.crumbs.hidden = false;
  }

  /* ---------- step 1: brands */

  renderBrands() {
    const { brands } = /** @type {any} */ (this.data);
    const listed = brands.filter((/** @type {Brand} */ b) => modelCount(b) > 0);
    const featured = listed.filter((/** @type {Brand} */ b) => b.priority);
    const others = listed.filter((/** @type {Brand} */ b) => !b.priority);
    const unlisted = brands.filter((/** @type {Brand} */ b) => modelCount(b) === 0);
    const dealer = this.dataset.dealerLabel || 'Approved dealer';
    const dealerBrands = String(this.dataset.dealerBrands || 'STIHL')
      .split(',')
      .map((s) => squash(s))
      .filter(Boolean);

    const featuredHtml = featured
      .map((/** @type {Brand} */ b) => {
        const types = b.types.filter((t) => t.models.length).slice(0, 6);
        return `
        <article class="fpg-pf-feature">
          <button type="button" class="fpg-pf-feature__main" data-go-brand="${b.id}">
            <span class="fpg-pf-feature__logo">${b.logo ? `<img src="${esc(b.logo)}&width=360" alt="" loading="lazy" width="180" height="90">` : ''}</span>
            <span class="fpg-pf-feature__text">
              ${dealer && dealerBrands.includes(squash(b.name)) ? `<span class="fpg-pf-badge">${esc(dealer)}</span>` : ''}
              <strong>${esc(b.name)} parts</strong>
              <small>${modelCount(b)} machines listed</small>
            </span>
            <span class="fpg-pf-feature__go">${ARROW}</span>
          </button>
          <ul class="fpg-pf-feature__types" role="list">
            ${types.map((t) => `<li><button type="button" data-go-type="${t.id}">${machineIcon(t.name, 22)}<span>${esc(t.name)}</span></button></li>`).join('')}
          </ul>
        </article>`;
      })
      .join('');

    const othersHtml = others
      .map(
        (/** @type {Brand} */ b) => `
        <li><button type="button" class="fpg-pf-brand" data-go-brand="${b.id}">
          <span class="fpg-pf-brand__logo">${b.logo ? `<img src="${esc(b.logo)}&width=240" alt="" loading="lazy" width="120" height="60">` : ''}</span>
          <span class="fpg-pf-brand__name">${esc(b.name)}</span>
          <small>${modelCount(b)} machine${modelCount(b) === 1 ? '' : 's'}</small>
        </button></li>`
      )
      .join('');

    const unlistedNames = unlisted.map((/** @type {Brand} */ b) => esc(b.name)).join(', ');

    this.view.innerHTML = `
      <h2 class="fpg-pf-h" tabindex="-1" data-focus>Choose your machine's brand</h2>
      <div class="fpg-pf-features">${featuredHtml}</div>
      ${others.length ? `<h3 class="fpg-pf-sub">Other brands we stock parts for</h3><ul class="fpg-pf-brands" role="list">${othersHtml}</ul>` : ''}
      ${
        unlisted.length
          ? `<p class="fpg-pf-note">We can also order parts for ${unlistedNames}. These aren't listed online yet, so ${this.contactHtml('get in touch')} with your model and serial number.</p>`
          : ''
      }`;
  }

  /* ---------- step 2: machine types */

  renderTypes(/** @type {Brand} */ brand) {
    const types = brand.types.filter((t) => t.models.length);
    this.view.innerHTML = `
      <div class="fpg-pf-head">
        ${brand.logo ? `<span class="fpg-pf-head__logo"><img src="${esc(brand.logo)}&width=240" alt="" width="120" height="60"></span>` : ''}
        <div>
          <h2 class="fpg-pf-h" tabindex="-1" data-focus>${esc(brand.name)}: what kind of machine?</h2>
          <p class="fpg-pf-lead">${modelCount(brand)} machines listed across ${types.length} type${types.length === 1 ? '' : 's'}.</p>
        </div>
      </div>
      ${
        types.length
          ? `<ul class="fpg-pf-types" role="list">${types
              .map(
                (t) => `
            <li><button type="button" class="fpg-pf-type" data-go-type="${t.id}">
              <span class="fpg-pf-type__icon">${machineIcon(t.name)}</span>
              <strong>${esc(t.name)}</strong>
              <small>${t.models.length} model${t.models.length === 1 ? '' : 's'}</small>
            </button></li>`
              )
              .join('')}</ul>`
          : `<p class="fpg-pf-note">We haven't listed ${esc(brand.name)} machines online yet. ${this.contactHtml('Get in touch')} with your model and serial number and we'll find the part.</p>`
      }`;
  }

  /* ---------- step 3: models */

  renderModels(/** @type {Type} */ type) {
    const draw = () => {
      const groups = new Map();
      for (const m of type.models) {
        const s = seriesOf(m.name);
        if (!groups.has(s)) groups.set(s, []);
        groups.get(s).push(m);
      }
      const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : collator.compare(a, b)));
      const many = keys.length > 1 && type.models.length > 12;
      const body = keys
        .map(
          (k) => `
          <div class="fpg-pf-series" data-series>
            ${many ? `<h3 class="fpg-pf-series__h">${k ? esc(k) : 'Other models'}</h3>` : ''}
            <ul class="fpg-pf-models" role="list">
              ${groups
                .get(k)
                .map((/** @type {Model} */ m) => `<li data-model-name="${esc(m.key)}"><button type="button" class="fpg-pf-model" data-go-model="${m.id}">${esc(m.name)}</button></li>`)
                .join('')}
            </ul>
          </div>`
        )
        .join('');
      this.view.innerHTML = `
        <div class="fpg-pf-head">
          <span class="fpg-pf-head__icon">${machineIcon(type.name)}</span>
          <div>
            <h2 class="fpg-pf-h" tabindex="-1" data-focus>Which ${esc(type.brand.name)} ${esc(type.name.toLowerCase())}?</h2>
            <p class="fpg-pf-lead">The model is on the machine's label, usually near the handle or on the engine cover.</p>
          </div>
        </div>
        ${
          type.models.length > 12
            ? `<label class="fpg-pf-filter">${SEARCH_ICON}<span class="visually-hidden">Filter models</span><input type="search" placeholder="Filter ${type.models.length} models" data-model-filter autocomplete="off"></label>`
            : ''
        }
        <div data-model-list>${body}</div>
        <p class="fpg-pf-empty" data-model-none hidden>No model matches that. ${this.contactHtml('Ask us')} and we'll check.</p>`;
      this.view.querySelector('[data-model-filter]')?.addEventListener('input', (e) => {
        const q = squash(/** @type {HTMLInputElement} */ (e.target).value);
        let shown = 0;
        for (const li of this.view.querySelectorAll('[data-model-name]')) {
          const hit = !q || /** @type {HTMLElement} */ (li).dataset.modelName?.includes(q);
          /** @type {HTMLElement} */ (li).hidden = !hit;
          if (hit) shown++;
        }
        for (const s of this.view.querySelectorAll('[data-series]')) {
          /** @type {HTMLElement} */ (s).hidden = !s.querySelector('[data-model-name]:not([hidden])');
        }
        /** @type {HTMLElement} */ (this.view.querySelector('[data-model-none]')).hidden = shown > 0;
      });
    };
    draw();

    /* Pick up models added in the app since the snapshot was built. */
    fetch(`${this.proxy}/getModels?machineTypeId=${encodeURIComponent(type.id)}`)
      .then((r) => r.json())
      .then((/** @type {any[]} */ live) => {
        if (!Array.isArray(live) || this.dataset.step !== 'models' || this.params().type !== String(type.id)) return;
        let added = false;
        for (const m of live) {
          if (m.active === false || type.models.some((x) => x.id === m.id)) continue;
          const model = { id: m.id, name: String(m.name).trim(), type, key: squash(m.name) };
          type.models.push(model);
          this.data?.models.push(model);
          added = true;
        }
        if (added) {
          type.models.sort((a, b) => collator.compare(a.name, b.name));
          draw();
        }
      })
      .catch(() => {});
  }

  /* ---------- step 4: parts for one model */

  renderUnknownModel(/** @type {number} */ id) {
    /* A model newer than the snapshot: still show its parts. */
    const brand = /** @type {Brand} */ ({ id: 0, name: '', raw: '', logo: '', priority: false, types: [] });
    const type = /** @type {Type} */ ({ id: 0, name: 'machine', brand, models: [] });
    const name = new URLSearchParams(location.search).get('name') || 'this model';
    this.renderModel({ id, name, type, key: squash(name) });
  }

  async renderModel(/** @type {Model} */ model) {
    const brand = model.type.brand;
    const saved = this.isSaved(model.id);
    this.view.innerHTML = `
      <div class="fpg-pf-machine">
        <span class="fpg-pf-machine__icon">${machineIcon(model.type.name, 56)}</span>
        <div class="fpg-pf-machine__text">
          <p class="fpg-pf-machine__kicker">${esc(brand.name)} ${esc(model.type.name)}</p>
          <h2 class="fpg-pf-h" tabindex="-1" data-focus>${esc(model.name)} parts</h2>
          <p class="fpg-pf-lead" data-summary aria-live="polite">Loading parts…</p>
        </div>
        <div class="fpg-pf-machine__actions">
          ${model.type.id ? `<button type="button" class="fpg-pf-btn fpg-pf-btn--ghost" data-save="${model.id}" aria-pressed="${saved}">${saved ? 'Saved to my machines' : 'Save to my machines'}</button>` : ''}
          ${model.type.id ? `<button type="button" class="fpg-pf-btn fpg-pf-btn--ghost" data-go-type="${model.type.id}">Change model</button>` : ''}
        </div>
      </div>
      <div class="fpg-pf-tools" data-tools hidden>
        <label class="fpg-pf-filter">${SEARCH_ICON}<span class="visually-hidden">Search these parts</span><input type="search" placeholder="Search by part name or number" data-part-filter autocomplete="off"></label>
        <label class="fpg-pf-toggle"><input type="checkbox" data-instock> <span>In stock with us</span></label>
      </div>
      <nav class="fpg-pf-sections" data-sections aria-label="Parts sections" hidden></nav>
      <div data-parts>${this.skeletonHtml()}</div>
      <p class="fpg-pf-empty" data-parts-none hidden>No parts match. Try fewer words, or ${this.contactHtml('ask us')}.</p>`;

    this.request = new AbortController();
    /** @type {any[]} */
    let groups;
    try {
      groups = await fetch(`${this.proxy}/getProducts?modelId=${encodeURIComponent(model.id)}`, { signal: this.request.signal }).then((r) => r.json());
    } catch (error) {
      if (/** @type {any} */ (error)?.name === 'AbortError') return;
      /** @type {HTMLElement} */ (this.view.querySelector('[data-parts]')).innerHTML = this.errorHtml('The parts for this machine did not load.');
      return;
    }
    if (!Array.isArray(groups)) groups = [];
    groups = groups.filter((g) => g?.products?.length);
    groups.sort((a, b) => Number(/service/i.test(b.categoryName)) - Number(/service/i.test(a.categoryName)));

    const total = groups.reduce((n, g) => n + g.products.length, 0);
    const summary = /** @type {HTMLElement} */ (this.view.querySelector('[data-summary]'));
    if (!total) {
      summary.textContent = 'No parts listed online for this machine yet.';
      /** @type {HTMLElement} */ (this.view.querySelector('[data-parts]')).innerHTML = `
        <div class="fpg-pf-help fpg-pf-help--inline">
          <p><strong>We can still get the part.</strong> Send us the model and serial number, or the part number from your manual, and we'll check price and stock with ${esc(brand.name || 'the maker')}.</p>
          ${this.contactHtml('Ask about a part', true)}
        </div>`;
      return;
    }
    const inStock = groups.reduce((n, g) => n + g.products.filter((/** @type {any} */ p) => p.inventoryQuantity > 0).length, 0);
    summary.textContent = `${total} parts in ${groups.length} section${groups.length === 1 ? '' : 's'}, ${inStock} in stock with us now.`;

    const supplier = this.supplierFor(brand.name);
    const sectionsNav = /** @type {HTMLElement} */ (this.view.querySelector('[data-sections]'));
    sectionsNav.innerHTML = `<ul role="list">${groups
      .map((g, i) => `<li><a href="#fpg-pf-s${i}" data-jump="${i}">${esc(g.categoryName.replace(/\s+/g, ' '))} <span>${g.products.length}</span></a></li>`)
      .join('')}</ul>`;
    sectionsNav.hidden = groups.length < 2;
    /** @type {HTMLElement} */ (this.view.querySelector('[data-tools]')).hidden = false;

    /** @type {HTMLElement} */ (this.view.querySelector('[data-parts]')).innerHTML = groups
      .map(
        (g, i) => `
        <section class="fpg-pf-group" id="fpg-pf-s${i}" data-group aria-labelledby="fpg-pf-s${i}-h">
          <h3 class="fpg-pf-group__h" id="fpg-pf-s${i}-h">${esc(g.categoryName.replace(/\s+/g, ' '))} <span data-group-count>${g.products.length}</span></h3>
          <ul class="fpg-pf-parts" role="list">${g.products.map((/** @type {any} */ p) => this.partHtml(p, brand.name, supplier)).join('')}</ul>
        </section>`
      )
      .join('');

    this.hideQuoteOnly();
    window.addEventListener('load', () => this.hideQuoteOnly(), { once: true });

    const filter = /** @type {HTMLInputElement} */ (this.view.querySelector('[data-part-filter]'));
    const stockOnly = /** @type {HTMLInputElement} */ (this.view.querySelector('[data-instock]'));
    const apply = () => this.filterParts(filter.value, stockOnly.checked);
    filter.addEventListener('input', apply);
    stockOnly.addEventListener('change', apply);

    if (supplier && this.dataset.polly) this.watchMakerStock(supplier);
  }

  partHtml(/** @type {any} */ p, /** @type {string} */ brand, /** @type {string} */ supplier) {
    const title = cleanTitle(p.title, p.sku, brand);
    const ex = Math.round(Number(p.price || 0) * 100);
    const inc = Math.round(ex * (1 + this.vat / 100));
    const variant = String(p.variantId || '').replace('gid://shopify/ProductVariant/', '');
    const productId = String(p.shopifyId || '').replace('gid://shopify/Product/', '');
    const qty = Number(p.inventoryQuantity || 0);
    const orderable = qty > 0 || p.inventoryPolicy === 'CONTINUE';
    const stock =
      qty > 0
        ? `<span class="fpg-pf-stock fpg-pf-stock--in">${qty} in stock</span>`
        : orderable
          ? `<span class="fpg-pf-stock fpg-pf-stock--order">Order in</span>`
          : `<span class="fpg-pf-stock fpg-pf-stock--out">Out of stock</span>`;
    const img = p.url && p.url.trim() ? `${p.url.trim()}${p.url.includes('?') ? '&' : '?'}width=360` : '';
    const search = squash(`${title} ${p.sku} ${partNumber(p.sku)}`);
    return `
      <li class="fpg-pf-part" data-part data-search="${esc(search)}" data-qty="${qty}" data-product-id="${esc(productId)}"${qty <= 0 && orderable && supplier && p.sku && String(p.title).toLowerCase().includes(supplier.replace(/-/g, ' ')) ? ` data-sku="${esc(p.sku)}"` : ''}>
        <a class="fpg-pf-part__img" href="/products/${encodeURIComponent(p.handle)}" tabindex="-1" aria-hidden="true">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy" width="180" height="180">` : machineIcon('wrench', 40)}
        </a>
        <div class="fpg-pf-part__body">
          <a class="fpg-pf-part__title" href="/products/${encodeURIComponent(p.handle)}">${esc(title)}</a>
          ${p.sku ? `<span class="fpg-pf-part__no">Part no. ${esc(partNumber(p.sku))}</span>` : ''}
          <div class="fpg-pf-part__stock">${stock}<span class="fpg-pf-maker" data-maker hidden></span></div>
        </div>
        <div class="fpg-pf-part__foot">
          <span class="fpg-pf-part__price"><strong>${money(ex)}</strong> <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(inc)})</span></span>
          ${
            orderable && variant
              ? `<button type="button" class="fpg-pf-add" data-add="${esc(variant)}">Add to basket</button>`
              : `<button type="button" class="fpg-pf-add" disabled>Sold out</button>`
          }
        </div>
      </li>`;
  }

  filterParts(/** @type {string} */ text, /** @type {boolean} */ stockOnly) {
    const q = squash(text);
    let shown = 0;
    for (const group of this.view.querySelectorAll('[data-group]')) {
      let inGroup = 0;
      for (const part of group.querySelectorAll('[data-part]')) {
        const el = /** @type {HTMLElement} */ (part);
        if (el.dataset.quote === 'true') continue;
        const hit = (!q || (el.dataset.search || '').includes(q)) && (!stockOnly || Number(el.dataset.qty) > 0);
        el.hidden = !hit;
        if (hit) inGroup++;
      }
      /** @type {HTMLElement} */ (group).hidden = inGroup === 0;
      const count = group.querySelector('[data-group-count]');
      if (count) count.textContent = String(inGroup);
      shown += inGroup;
    }
    /** @type {HTMLElement} */ (this.view.querySelector('[data-parts-none]')).hidden = shown > 0;
    const nav = /** @type {HTMLElement | null} */ (this.view.querySelector('[data-sections]'));
    if (nav) {
      this.view.querySelectorAll('[data-group]').forEach((g, i) => {
        const link = nav.querySelector(`[data-jump="${i}"]`)?.parentElement;
        if (link) link.hidden = /** @type {HTMLElement} */ (g).hidden;
      });
    }
  }

  /** Parts the Call for Price app marks as quote-only are hidden, as elsewhere on the site. */
  hideQuoteOnly() {
    const quote = String(/** @type {any} */ (window).cfp_products?.products || '').split(',').filter(Boolean);
    if (!quote.length) return;
    for (const part of this.view.querySelectorAll('[data-part]')) {
      const el = /** @type {HTMLElement} */ (part);
      if (quote.includes(el.dataset.productId || '')) {
        el.dataset.quote = 'true';
        el.hidden = true;
      }
    }
  }

  supplierFor(/** @type {string} */ brand) {
    const list = String(this.dataset.pollyVendors || 'STIHL, Husqvarna')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const b = String(brand || '').toLowerCase();
    return list.find((name) => b.includes(name))?.replace(/\s+/g, '-') || '';
  }

  watchMakerStock(/** @type {string} */ supplier) {
    const base = String(this.dataset.polly || '');
    const brand = brandName(supplier);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = /** @type {HTMLElement} */ (entry.target);
          this.observer?.unobserve(el);
          const out = /** @type {HTMLElement | null} */ (el.querySelector('[data-maker]'));
          if (!out) continue;
          out.hidden = false;
          out.dataset.state = 'loading';
          out.textContent = `Checking ${brand}…`;
          makerStock(base, supplier, el.dataset.sku || '').then((answer) => {
            if (!answer || answer.status === 'unavailable') {
              out.hidden = true;
              return;
            }
            if (answer.status === 'in-stock') {
              out.dataset.state = 'in';
              out.textContent = `${brand} has it: adds 24–48 hrs`;
              out.title = `We don't have this on the shelf, but ${brand} does. We'll order it in for you, which adds 24–48 hours to delivery.`;
              return;
            }
            const date = answer.eta ? new Date(answer.eta) : null;
            out.dataset.state = 'order';
            out.textContent =
              date && !Number.isNaN(date.getTime())
                ? `Due from ${brand} ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : `On order from ${brand}`;
          });
        }
      },
      { rootMargin: '200px 0px' }
    );
    for (const el of this.view.querySelectorAll('[data-sku]')) this.observer.observe(el);
  }

  /* ---------- clicks */

  onClick = async (/** @type {MouseEvent} */ event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    const el = t.closest('[data-go-home],[data-go-brand],[data-go-type],[data-go-model],[data-add],[data-save],[data-forget],[data-jump],[data-retry],[data-suggest-go]');
    if (!(el instanceof HTMLElement)) return;
    const d = el.dataset;
    if ('goHome' in d) return this.go({});
    if (d.goBrand) return this.go({ brand: Number(d.goBrand) });
    if (d.goType) {
      const type = this.data?.brands.flatMap((b) => b.types).find((x) => String(x.id) === d.goType);
      return this.go({ brand: type?.brand.id, type: Number(d.goType) });
    }
    if (d.goModel) {
      const model = this.data?.models.find((m) => String(m.id) === d.goModel);
      this.hideSuggestions();
      return this.go({ brand: model?.type.brand.id, type: model?.type.id, model: Number(d.goModel) });
    }
    if (d.suggestGo) {
      location.href = d.suggestGo;
      return;
    }
    if ('retry' in d) return this.route(false);
    if (d.jump) {
      event.preventDefault();
      const target = this.view.querySelector(`#fpg-pf-s${d.jump}`);
      const top = (target?.getBoundingClientRect().top || 0) + window.scrollY - 150;
      window.scrollTo({ top, behavior: 'smooth' });
      return;
    }
    if (d.save) return this.toggleSave(Number(d.save), el);
    if (d.forget) return this.forget(Number(d.forget));
    if (d.add) return this.add(el, d.add);
  };

  async add(/** @type {HTMLElement} */ button, /** @type {string} */ variant) {
    const b = /** @type {HTMLButtonElement} */ (button);
    const label = b.textContent;
    b.disabled = true;
    b.textContent = 'Adding…';
    try {
      const tools = /** @type {any} */ (window).FPGTools;
      if (tools?.addItemsToCart) await tools.addItemsToCart([{ id: Number(variant), quantity: 1 }], b);
      else {
        const r = await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(variant), quantity: 1 }) });
        if (!r.ok) throw new Error((await r.json()).description || 'Could not add');
      }
      b.textContent = 'Added ✓';
      b.dataset.state = 'added';
    } catch (error) {
      b.textContent = 'Could not add';
      console.warn('[FP&G parts finder]', error);
    }
    setTimeout(() => {
      b.textContent = label;
      b.disabled = false;
      delete b.dataset.state;
    }, 2000);
  }

  /* ---------- my machines */

  isSaved(/** @type {number} */ id) {
    return readStore(STORE_MACHINES, []).includes(id);
  }

  toggleSave(/** @type {number} */ id, /** @type {HTMLElement} */ button) {
    let list = readStore(STORE_MACHINES, []).filter((/** @type {number} */ x) => x !== id);
    const saving = button.getAttribute('aria-pressed') !== 'true';
    if (saving) list = [id, ...list].slice(0, 20);
    writeStore(STORE_MACHINES, list);
    button.setAttribute('aria-pressed', String(saving));
    button.textContent = saving ? 'Saved to my machines' : 'Save to my machines';
    this.renderMine();
  }

  forget(/** @type {number} */ id) {
    writeStore(
      STORE_MACHINES,
      readStore(STORE_MACHINES, []).filter((/** @type {number} */ x) => x !== id)
    );
    this.renderMine();
    const save = this.view.querySelector(`[data-save="${id}"]`);
    if (save) {
      save.setAttribute('aria-pressed', 'false');
      save.textContent = 'Save to my machines';
    }
  }

  renderMine() {
    if (!this.mine || !this.data) return;
    const ids = readStore(STORE_MACHINES, []);
    const models = ids.map((/** @type {number} */ id) => this.data?.models.find((m) => m.id === id)).filter(Boolean);
    const page = esc(this.dataset.machinesUrl || '/pages/my-machines');
    this.mine.hidden = false;
    this.mine.innerHTML = models.length
      ? `<a class="fpg-pf-mine__label" href="${page}">My machines</a><ul role="list">${models
          .map(
            (/** @type {Model} */ m) => `<li class="fpg-pf-chip">
              <button type="button" data-go-model="${m.id}">${machineIcon(m.type.name, 18)}<span>${esc(m.type.brand.name)} ${esc(m.name)}</span></button>
              <button type="button" class="fpg-pf-chip__x" data-forget="${m.id}" aria-label="Remove ${esc(m.type.brand.name)} ${esc(m.name)} from my machines">×</button>
            </li>`
          )
          .join('')}</ul>`
      : `<a class="fpg-pf-mine__empty" href="${page}">${machineIcon('', 18)}<span>Save the machines you own for one-tap parts and servicing</span><span aria-hidden="true">→</span></a>`;
  }

  /* ---------- search box */

  matches(/** @type {string} */ text) {
    const q = squash(text);
    if (!q || !this.data) return [];
    /** @type {Array<[number, Model]>} */
    const scored = [];
    for (const m of this.data.models) {
      const brandKey = squash(m.type.brand.name);
      const full = brandKey + m.key;
      let score = 0;
      if (m.key === q || full === q) score = 100;
      else if (m.key.startsWith(q) || full.startsWith(q)) score = 70 - m.key.length;
      else if (m.key.includes(q)) score = 40 - m.key.length;
      if (score) scored.push([score + (m.type.brand.priority ? 5 : 0), m]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, m]) => m);
  }

  showSuggestions() {
    if (!this.suggest || !this.input) return;
    const text = this.input.value.trim();
    if (!text) return this.hideSuggestions();
    const found = this.matches(text);
    const looksLikePart = /\d{3,}/.test(text.replace(/\s/g, '')) && text.replace(/\D/g, '').length >= 7;
    const normalise = /** @type {any} */ (window).fpgNormaliseSearch;
    const query = (typeof normalise === 'function' && normalise(text)) || text;
    const searchUrl = `${this.dataset.searchUrl || '/search'}?q=${encodeURIComponent(query)}`;
    const items = found.map(
      (m) => `<li role="option" id="fpg-pf-o${m.id}"><button type="button" data-go-model="${m.id}" tabindex="-1">
        ${machineIcon(m.type.name, 22)}<span><strong>${esc(m.type.brand.name)} ${esc(m.name)}</strong><small>${esc(m.type.name)}</small></span></button></li>`
    );
    items.push(
      `<li role="option" id="fpg-pf-oq"><button type="button" data-suggest-go="${esc(searchUrl)}" tabindex="-1">${SEARCH_ICON}<span><strong>${
        looksLikePart ? 'Search part number' : 'Search the shop for'
      } “${esc(text)}”</strong><small>${looksLikePart ? 'Finds the exact part, however it is spaced' : 'Parts, machines and accessories'}</small></span></button></li>`
    );
    this.suggest.innerHTML = items.join('');
    this.suggest.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.active = -1;
  }

  hideSuggestions() {
    if (this.suggest) this.suggest.hidden = true;
    this.input?.setAttribute('aria-expanded', 'false');
    this.input?.removeAttribute('aria-activedescendant');
  }

  active = -1;

  onSearchKey = (/** @type {KeyboardEvent} */ e) => {
    if (!this.suggest || this.suggest.hidden) return;
    const options = [...this.suggest.querySelectorAll('[role="option"]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle('is-active', i === this.active));
      this.input?.setAttribute('aria-activedescendant', options[this.active]?.id || '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = options[this.active >= 0 ? this.active : 0];
      /** @type {HTMLElement | null} */ (pick?.querySelector('button'))?.click();
    } else if (e.key === 'Escape') this.hideSuggestions();
  };

  /* ---------- bits */

  contactHtml(/** @type {string} */ label, button = false) {
    const url = this.dataset.contactUrl || '/pages/contact';
    return `<a href="${esc(url)}" class="${button ? 'fpg-pf-btn' : 'fpg-pf-link'}">${esc(label)}</a>`;
  }

  errorHtml(/** @type {string} */ text) {
    return `<div class="fpg-pf-help fpg-pf-help--inline"><p>${esc(text)} Check your connection and try again.</p><button type="button" class="fpg-pf-btn" data-retry>Try again</button></div>`;
  }

  skeletonHtml() {
    return `<ul class="fpg-pf-parts fpg-pf-parts--loading" role="list" aria-hidden="true">${'<li class="fpg-pf-part fpg-pf-part--ghost"><span></span><span></span><span></span></li>'.repeat(8)}</ul>`;
  }
}

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: /** @type {any} */ (window).Shopify?.currency?.active || 'GBP' });
const money = (/** @type {number} */ pence) => fmt.format(pence / 100);

if (!customElements.get('fpg-parts-finder')) customElements.define('fpg-parts-finder', FpgPartsFinder);

/* ---------------------------------------------------------------- product page link */

/**
 * Finds the machine a product is for from its brand and title, using the
 * longest model name that appears in the title as a whole word ("MS 261" in
 * "STIHL MS 261 C-M Chainsaw"), and links to that machine's parts.
 */
export function findMachine(/** @type {{ brands: Brand[] }} */ data, /** @type {string} */ vendor, /** @type {string} */ title) {
  const v = squash(vendor);
  const brand = data.brands.find((b) => squash(b.name) === v || (v && squash(b.name).startsWith(v)) || (v && v.startsWith(squash(b.name))));
  if (!brand) return null;
  const text = ` ${String(title || '').toUpperCase()} `;
  /** @type {Model | null} */
  let best = null;
  for (const type of brand.types) {
    for (const m of type.models) {
      if (/^\d{1,2}$/.test(m.name)) continue; /* "36", "55": too likely to match sizes */
      const pattern = m.name
        .toUpperCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+|-/g, '[\\s-]*');
      if (new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(text)) {
        if (!best || m.key.length > best.key.length) best = m;
      }
    }
  }
  return best;
}

class FpgPartsLink extends HTMLElement {
  async connectedCallback() {
    try {
      const data = await loadIndex(this.dataset.index || '');
      const model = findMachine(data, this.dataset.vendor || '', this.dataset.title || '');
      if (!model) return;
      const url = new URL(this.dataset.finder || '/pages/fpg-part-finder', location.origin);
      url.searchParams.set('brand', String(model.type.brand.id));
      url.searchParams.set('type', String(model.type.id));
      url.searchParams.set('model', String(model.id));
      const a = /** @type {HTMLAnchorElement | null} */ (this.querySelector('a'));
      if (!a) return;
      a.href = url.pathname + url.search;
      const name = this.querySelector('[data-name]');
      if (name) name.textContent = `${model.type.brand.name} ${model.name}`;
      const icon = this.querySelector('[data-icon]');
      if (icon) icon.innerHTML = machineIcon(model.type.name, 30);
      this.hidden = false;
    } catch (error) {
      console.warn('[FP&G parts link]', error);
    }
  }
}

if (!customElements.get('fpg-parts-link')) customElements.define('fpg-parts-link', FpgPartsLink);
