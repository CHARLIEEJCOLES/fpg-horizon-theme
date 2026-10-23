/**
 * FP&G "what fits" tools for chains, guide bars and bar-and-chain kits.
 *
 * Data: assets/fpg-fit-data.json, built from the products' own titles and the
 * "Fit Guide" lists in their descriptions (fpg-tools/fit/build-fit-data.js).
 * Prices, pictures and stock are always read live from the shop
 * (/products/<handle>.js), so the data file only says what fits what.
 *
 * Elements:
 * - <fpg-fit-finder>  finder by machine or by the numbers stamped on the bar
 *                      (sections/fpg-fit-finder.liquid)
 * - <fpg-fit-product> on a chain/bar page: what it fits and a "check your
 *                      machine" box; on a chainsaw page: chains and bars that
 *                      fit it (blocks/fpg-fits.liquid)
 * - <fpg-fit-search>  on the search page, when the search is a machine model:
 *                      a shortcut to the chains and bars that fit it
 *                      (sections/fpg-help-panel.liquid)
 *
 * Also exports helpers used by assets/fpg-complete-job.js.
 * Styles: assets/fpg-fit.css.
 */

const ROOT = /** @type {any} */ (window).Shopify?.routes?.root || '/';
const CURRENCY = /** @type {any} */ (window).Shopify?.currency?.active || 'GBP';
const moneyFormat = new Intl.NumberFormat('en-GB', { style: 'currency', currency: CURRENCY });

export const money = (/** @type {number} */ pence) => moneyFormat.format(pence / 100);
export const esc = (/** @type {any} */ value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

export const PITCH_LABEL = {
  '1/4 P': '1/4" P (Picco)',
  '1/4': '1/4"',
  '3/8 P': '3/8" P / Low Profile / Mini',
  '.325 Mini': '.325" Mini',
  '.325': '.325"',
  '3/8': '3/8"',
  '.404': '.404"',
};
const PITCH_ORDER = Object.keys(PITCH_LABEL);
const KIND_LABEL = { c: 'Chain', b: 'Guide bar', k: 'Bar & chain kit' };
const KIND_PLURAL = { c: ['chain', 'chains'], b: ['guide bar', 'guide bars'], k: ['kit', 'kits'] };

/** @type {Promise<any> | null} */
let dataPromise = null;
/** @param {string} url */
export function loadFitData(url) {
  if (!dataPromise) {
    dataPromise = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fit data'))))
      .then((data) => {
        // Models that fit the same products share one list in the file ("lists"); expand them.
        if (Array.isArray(data.lists)) {
          for (const key of Object.keys(data.models)) data.models[key] = data.lists[data.models[key]] || [];
        }
        return data;
      });
  }
  return dataPromise;
}

/** @type {Map<string, Promise<any>>} */
const productCache = new Map();
/** @param {string} handle */
export function loadProduct(handle) {
  if (!productCache.has(handle)) {
    productCache.set(
      handle,
      fetch(`${ROOT}products/${encodeURIComponent(handle)}.js`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return /** @type {Promise<any>} */ (productCache.get(handle));
}

/** "MS 261 C" -> regex that also matches "MS261C", "MS 261 C-M" but not "MS 2610". */
function modelRegex(/** @type {string} */ model) {
  const tokens = model.match(/[A-Z]+|\d+/gi) || [];
  return new RegExp(`(^|[^A-Z0-9])${tokens.join('[\\s-]*')}(?![A-Z0-9])`, 'i');
}

/**
 * The longest model of this brand named in the text, e.g. "STIHL|MS 261 C".
 * @param {any} data @param {string} brand @param {string} text
 */
export function findModel(data, brand, text) {
  let best = '';
  for (const key of Object.keys(data.models)) {
    const [b, m] = key.split('|');
    if (brand && b.toLowerCase() !== brand.toLowerCase()) continue;
    if (m.length > (best.split('|')[1] || '').length && modelRegex(m).test(text)) best = key;
  }
  return best;
}

/**
 * Keys whose model is what the shopper typed ("ms261" finds "STIHL|MS 261"),
 * exact matches first, then the longest match per brand.
 * @param {any} data @param {string} typed
 */
export function matchingKeys(data, typed) {
  const exact = Object.keys(data.models).filter((k) => k.split('|')[1] === typed);
  if (exact.length) return exact;
  const brands = [...new Set(Object.keys(data.models).map((k) => k.split('|')[0]))];
  return brands
    .map((b) => findModel(data, b, typed))
    .filter((k) => k && (k.split('|')[1].match(/[A-Z]+|\d+/gi) || []).join('') === (typed.match(/[A-Z]+|\d+/gi) || []).join(''));
}

/**
 * How a model key reads to shoppers. Some fit guides list newer STIHL saws
 * without their prefix ("162", "172"); those are the MS 162 and MS 172.
 * @param {string} key "Brand|Model"
 */
export function modelLabel(key) {
  const [brand, model] = key.split('|');
  return `${brand} ${brand === 'STIHL' && /^1[5-9]\d$/.test(model) ? `MS ${model}` : model}`;
}

/** Entries for a model key: [{ i, product, bar }] */
export function entriesFor(/** @type {any} */ data, /** @type {string} */ key) {
  return (data.models[key] || []).map(([i, bar]) => ({ i, product: data.products[i], bar: bar || data.products[i].b || null }));
}

/** Readable spec line for a data product. */
export function specLine(/** @type {any} */ p) {
  const bits = [];
  if (p.b && p.k !== 'c') bits.push(`${p.b}in`);
  if (p.p) bits.push(`${PITCH_LABEL[p.p] || p.p} pitch`);
  if (p.g) bits.push(`${p.g}mm gauge`);
  if (p.l) bits.push(`${p.l} drive links`);
  if (p.r) bits.push('100ft reel');
  return bits.join(' · ');
}

/** Price with VAT, matching the rest of the shop: "£X + VAT (£Y)". */
export function priceHtml(/** @type {any} */ variant, vatRate = 20) {
  const ex = variant.price;
  const vat = variant.taxable === false ? 0 : Math.round((ex * vatRate) / 100);
  return `${money(ex)} <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(ex + vat)})</span>`;
}

function isQuoteOnly(/** @type {any} */ id) {
  return String(/** @type {any} */ (window).cfp_products?.products || '')
    .split(',')
    .includes(String(id));
}

/**
 * A product card for fit results.
 * @param {any} entry { product: data product, bar } @param {any} item /products/x.js
 */
function cardHtml(entry, item, vatRate, note = '') {
  const v = item.variants.find((x) => x.available) || item.variants[0];
  const img = item.featured_image ? `${item.featured_image}${item.featured_image.includes('?') ? '&' : '?'}width=240` : '';
  const quote = isQuoteOnly(item.id);
  const action = quote
    ? `<a class="fpg-fit-card__btn fpg-fit-card__btn--ghost" href="${esc(item.url)}">Call for price</a>`
    : v.available
      ? `<button type="button" class="fpg-fit-card__btn" data-fpg-add="${v.id}">Add to basket</button>`
      : `<span class="fpg-fit-card__out">Sold out</span>`;
  return `<li class="fpg-fit-card">
    <a class="fpg-fit-card__img" href="${esc(item.url)}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy" width="120" height="120">` : ''}</a>
    <div class="fpg-fit-card__body">
      <span class="fpg-fit-card__kind">${KIND_LABEL[entry.product.k]}${note ? ` · ${esc(note)}` : ''}</span>
      <a class="fpg-fit-card__title" href="${esc(item.url)}">${esc(item.title)}</a>
      <span class="fpg-fit-card__spec">${esc(specLine(entry.product))}</span>
      ${quote ? '' : `<span class="fpg-fit-card__price">${priceHtml(v, vatRate)}</span>`}
    </div>
    <div class="fpg-fit-card__action">${action}</div>
  </li>`;
}

/** Renders cards for entries into a list element, in order, skipping products that no longer exist. */
async function renderCards(/** @type {HTMLElement} */ list, /** @type {any[]} */ entries, vatRate, noteFor = (e) => '') {
  const items = await Promise.all(entries.map((e) => loadProduct(e.product.h)));
  const html = entries.map((e, n) => (items[n] ? cardHtml(e, items[n], vatRate, noteFor(e)) : '')).join('');
  list.innerHTML = html;
  return items.filter(Boolean).length;
}

/** Click handler for [data-fpg-add] buttons inside a host element. */
function handleAdd(/** @type {HTMLElement} */ host) {
  host.addEventListener('click', async (event) => {
    const button = /** @type {HTMLElement} */ (event.target)?.closest?.('[data-fpg-add]');
    if (!(button instanceof HTMLButtonElement)) return;
    const tools = /** @type {any} */ (window).FPGTools;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      if (!tools) throw new Error('cart helper missing');
      await tools.addItemsToCart([{ id: Number(button.dataset.fpgAdd), quantity: 1 }], button);
      button.textContent = 'Added ✓';
    } catch (error) {
      button.textContent = 'Try again';
      console.warn('[FP&G fit]', error);
    }
    setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
    }, 2200);
  });
}

const sortEntries = (/** @type {any[]} */ entries) =>
  entries.sort((a, b) => (a.bar || 99) - (b.bar || 99) || 'ckb'.indexOf(a.product.k) - 'ckb'.indexOf(b.product.k) || (a.product.l || 0) - (b.product.l || 0));

/** Unique by product index, keeping the first (shortest bar after sorting). */
const uniqueEntries = (/** @type {any[]} */ entries) => {
  const seen = new Set();
  return entries.filter((e) => (seen.has(e.i) ? false : (seen.add(e.i), true)));
};

// ------------------------------------------------------------------ finder
class FpgFitFinder extends HTMLElement {
  /** @type {any} */ data = null;
  /** @type {any[]} */ results = [];
  kind = 'all';
  shown = 12;
  vat = 20;

  async connectedCallback() {
    this.vat = Number(this.dataset.vat || 20);
    handleAdd(this);
    this.addEventListener('click', this.#onClick);
    this.addEventListener('change', this.#onChange);
    this.addEventListener('input', this.#onInput);
    try {
      this.data = await loadFitData(this.dataset.url || '');
    } catch {
      this.hidden = true;
      return;
    }
    this.#fillBrands();
    this.#fillNumbers();
    this.#applyUrl();
  }

  /** @param {string} sel */
  $(sel) {
    return /** @type {any} */ (this.querySelector(sel));
  }

  #fillBrands() {
    const brands = [...new Set(Object.keys(this.data.models).map((k) => k.split('|')[0]))];
    const order = ['STIHL', 'Husqvarna'];
    brands.sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9) || a.localeCompare(b));
    this.$('[data-brand]').innerHTML =
      '<option value="">Choose a brand</option>' + brands.map((b) => `<option>${esc(b)}</option>`).join('');
  }

  #fillModels(/** @type {string} */ brand) {
    const models = Object.keys(this.data.models)
      .filter((k) => k.startsWith(`${brand}|`))
      .map((k) => k.split('|')[1]);
    this.$('[data-model-list]').innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join('');
    const input = this.$('[data-model]');
    input.disabled = !brand;
    input.placeholder = brand ? `e.g. ${models.find((m) => /\d{3}/.test(m)) || models[0] || ''}` : 'Choose a brand first';
  }

  #fillNumbers() {
    const chains = this.data.products.filter((p) => p.k === 'c' && !p.r);
    const pitches = [...new Set(chains.map((p) => p.p).filter(Boolean))].sort((a, b) => PITCH_ORDER.indexOf(a) - PITCH_ORDER.indexOf(b));
    this.$('[data-pitch]').innerHTML =
      '<option value="">Pitch</option>' + pitches.map((p) => `<option value="${esc(p)}">${esc(PITCH_LABEL[p] || p)}</option>`).join('');
    this.#refreshNumberOptions();
  }

  #refreshNumberOptions() {
    const pitch = this.$('[data-pitch]').value;
    const gaugeSel = this.$('[data-gauge]');
    const linksSel = this.$('[data-links]');
    const chains = this.data.products.filter((p) => p.k === 'c' && !p.r && (!pitch || p.p === pitch));
    const gauges = [...new Set(chains.map((p) => p.g).filter(Boolean))].sort();
    const keepG = gaugeSel.value;
    gaugeSel.innerHTML = '<option value="">Gauge</option>' + gauges.map((g) => `<option value="${g}">${g} mm</option>`).join('');
    if (gauges.includes(keepG)) gaugeSel.value = keepG;
    const g = gaugeSel.value;
    const links = [...new Set(chains.filter((p) => !g || p.g === g).map((p) => p.l).filter(Boolean))].sort((a, b) => a - b);
    const keepL = linksSel.value;
    linksSel.innerHTML = '<option value="">Drive links</option>' + links.map((l) => `<option value="${l}">${l}</option>`).join('');
    if (links.map(String).includes(keepL)) linksSel.value = keepL;
  }

  #applyUrl() {
    const params = new URLSearchParams(location.search);
    const fit = params.get('fit');
    if (fit && this.data.models[fit]) {
      const [brand, model] = fit.split('|');
      this.#open();
      this.#setMode('machine');
      this.$('[data-brand]').value = brand;
      this.#fillModels(brand);
      this.$('[data-model]').value = model;
      this.#searchMachine();
      this.scrollIntoView({ block: 'start' });
    } else if (params.get('pitch')) {
      this.#open();
      this.#setMode('numbers');
      this.$('[data-pitch]').value = params.get('pitch');
      this.#refreshNumberOptions();
      if (params.get('gauge')) this.$('[data-gauge]').value = params.get('gauge');
      this.#refreshNumberOptions();
      if (params.get('links')) this.$('[data-links]').value = params.get('links');
      this.#searchNumbers();
    }
  }

  #open() {
    const details = this.$('details');
    if (details) details.open = true;
  }

  #setMode(/** @type {string} */ mode) {
    for (const tab of this.querySelectorAll('[data-mode]')) {
      const on = /** @type {HTMLElement} */ (tab).dataset.mode === mode;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of this.querySelectorAll('[data-panel]')) {
      /** @type {HTMLElement} */ (panel).hidden = /** @type {HTMLElement} */ (panel).dataset.panel !== mode;
    }
  }

  #onClick = (/** @type {Event} */ event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const tab = target.closest('[data-mode]');
    if (tab instanceof HTMLElement) {
      this.#setMode(tab.dataset.mode || 'machine');
      return;
    }
    const kind = target.closest('[data-kind]');
    if (kind instanceof HTMLElement) {
      this.kind = kind.dataset.kind || 'all';
      this.shown = 12;
      this.#render();
      return;
    }
    if (target.closest('[data-more]')) {
      this.shown += 12;
      this.#render();
    }
  };

  #onChange = (/** @type {Event} */ event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.matches('[data-brand]')) {
      this.#fillModels(/** @type {HTMLSelectElement} */ (target).value);
      this.$('[data-model]').value = '';
      this.$('[data-model]').focus();
    } else if (target.matches('[data-model]')) {
      this.#searchMachine();
    } else if (target.matches('[data-pitch], [data-gauge]')) {
      this.#refreshNumberOptions();
      this.#searchNumbers();
    } else if (target.matches('[data-links]')) {
      this.#searchNumbers();
    }
  };

  #onInput = (/** @type {Event} */ event) => {
    const target = /** @type {HTMLInputElement} */ (event.target);
    if (!target.matches('[data-model]')) return;
    const brand = this.$('[data-brand]').value;
    if (this.data.models[`${brand}|${target.value.trim().toUpperCase()}`]) this.#searchMachine();
  };

  #searchMachine() {
    const brand = this.$('[data-brand]').value;
    const typed = this.$('[data-model]').value.trim().toUpperCase();
    if (!brand || !typed) return;
    let key = `${brand}|${typed}`;
    if (!this.data.models[key]) key = findModel(this.data, brand, typed);
    if (!key) {
      this.results = [];
      this.#status(
        `We don't have fit details for “${esc(brand)} ${esc(typed)}” yet. Try the numbers stamped on your bar, or <a href="tel:+441443230000">call 01443 230000</a> and we'll find it for you.`
      );
      this.#render();
      return;
    }
    this.$('[data-model]').value = key.split('|')[1];
    this.results = uniqueEntries(sortEntries(entriesFor(this.data, key)));
    this.label = `the ${modelLabel(key)}`;
    this.kind = 'all';
    this.shown = 12;
    this.#render();
  }

  #searchNumbers() {
    const p = this.$('[data-pitch]').value;
    const g = this.$('[data-gauge]').value;
    const l = Number(this.$('[data-links]').value || 0);
    if (!p || !g) {
      this.results = [];
      this.#status(p ? 'Now choose the gauge.' : '');
      this.#render(false);
      return;
    }
    this.results = this.data.products
      .map((product, i) => ({ i, product, bar: product.b || null }))
      .filter(({ product }) => product.p === p && product.g === g && (!l || !product.l || product.l === l))
      .filter(({ product }) => !(product.k === 'c' && l && !product.l));
    sortEntries(this.results);
    this.label = `${PITCH_LABEL[p] || p} pitch, ${g}mm gauge${l ? `, ${l} drive links` : ''}`;
    this.kind = 'all';
    this.shown = 12;
    this.#render();
  }

  #status(/** @type {string} */ html) {
    this.$('[data-status]').innerHTML = html;
  }

  async #render(withStatus = true) {
    const list = this.$('[data-results]');
    const tabs = this.$('[data-kinds]');
    const more = this.$('[data-more]');
    if (!this.results.length) {
      list.innerHTML = '';
      tabs.hidden = true;
      more.hidden = true;
      return;
    }
    const counts = { c: 0, b: 0, k: 0 };
    for (const e of this.results) counts[e.product.k]++;
    if (withStatus) {
      const parts = Object.entries(counts)
        .filter(([, n]) => n)
        .map(([k, n]) => `${n} ${KIND_PLURAL[k][n === 1 ? 0 : 1]}`);
      this.#status(`<strong>${parts.join(', ')}</strong> fit ${esc(this.label)}.`);
    }
    tabs.hidden = false;
    for (const b of tabs.querySelectorAll('[data-kind]')) {
      const k = /** @type {HTMLElement} */ (b).dataset.kind || 'all';
      /** @type {HTMLElement} */ (b).hidden = k !== 'all' && !counts[k];
      b.setAttribute('aria-pressed', String(k === this.kind));
    }
    const filtered = this.results.filter((e) => this.kind === 'all' || e.product.k === this.kind);
    const page = filtered.slice(0, this.shown);
    list.setAttribute('aria-busy', 'true');
    await renderCards(list, page, this.vat, (e) => (e.bar && e.product.k === 'c' ? `for a ${e.bar}in bar` : ''));
    list.removeAttribute('aria-busy');
    more.hidden = filtered.length <= this.shown;
  }
}

// ---------------------------------------------------------- product block
class FpgFitProduct extends HTMLElement {
  static observedAttributes = ['data-variant-title'];
  /** @type {any} */ data = null;

  async connectedCallback() {
    handleAdd(this);
    this.addEventListener('change', this.#onCheck);
    this.addEventListener('submit', (e) => e.preventDefault());
    try {
      this.data = await loadFitData(this.dataset.url || '');
    } catch {
      return;
    }
    this.#render();
  }

  attributeChangedCallback() {
    // The variant wrapper morphs this element (attributes, then children, which
    // empties the body), so render again once that has finished.
    if (this.data) setTimeout(() => this.#render(), 0);
  }

  #render() {
    const data = this.data;
    const index = data.products.findIndex((p) => p.h === this.dataset.handle);
    if (index >= 0) this.#renderAccessory(index);
    else if (this.dataset.machine === 'true') this.#renderMachine();
  }

  /** On a chain, bar or kit: specs, the machines it fits, and a check box. */
  #renderAccessory(/** @type {number} */ index) {
    const p = this.data.products[index];
    const fits = {};
    for (const [key, list] of Object.entries(this.data.models)) {
      for (const [i, bar] of /** @type {any[]} */ (list)) {
        if (i !== index) continue;
        const brand = key.split('|')[0];
        const group = `${brand}${bar ? ` with a ${bar}in bar` : ''}`;
        (fits[group] = fits[group] || []).push(modelLabel(key).slice(brand.length + 1));
      }
    }
    const groups = Object.entries(fits);
    const spec = specLine(p);
    if (!groups.length && !spec) return;
    const total = groups.reduce((n, [, m]) => n + m.length, 0);
    const body = this.querySelector('[data-body]');
    if (!body) return;
    body.innerHTML = `
      ${spec ? `<p class="fpg-fits__spec"><span>${{ c: 'Chain', b: 'Bar', k: 'Kit' }[p.k]} size:</span> <strong>${esc(spec)}</strong></p>` : ''}
      ${
        groups.length
          ? `<div class="fpg-fits__list${total > 14 ? ' is-long' : ''}">
              ${groups.map(([g, models]) => `<p><strong>${esc(g)}:</strong> ${models.map(esc).join(', ')}</p>`).join('')}
            </div>
            ${total > 14 ? '<button type="button" class="fpg-fits__toggle" data-toggle aria-expanded="false">Show all machines</button>' : ''}
            <form class="fpg-fits__check" data-check>
              <label for="FpgFitCheck-${esc(this.dataset.blockId)}">Check your machine</label>
              <div><input id="FpgFitCheck-${esc(this.dataset.blockId)}" list="FpgFitModels-${esc(this.dataset.blockId)}" placeholder="e.g. MS 261" autocomplete="off" data-check-input>
              <datalist id="FpgFitModels-${esc(this.dataset.blockId)}">${Object.keys(this.data.models).map((k) => `<option value="${esc(k.split('|')[1])}">${esc(k.replace('|', ' '))}</option>`).join('')}</datalist></div>
              <p class="fpg-fits__result" data-check-result role="status"></p>
            </form>`
          : ''
      }
      <a class="fpg-fits__link" href="${esc(this.dataset.finderUrl)}${p.p && p.g ? `?pitch=${encodeURIComponent(p.p)}&gauge=${encodeURIComponent(p.g)}${p.l ? `&links=${p.l}` : ''}` : ''}#fpg-fit">Find chains and bars with the same fit</a>`;
    this.hidden = false;
    body.querySelector('[data-toggle]')?.addEventListener('click', (e) => {
      const list = body.querySelector('.fpg-fits__list');
      const open = list?.classList.toggle('is-open');
      /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-expanded', String(Boolean(open)));
      /** @type {HTMLElement} */ (e.currentTarget).textContent = open ? 'Show fewer' : 'Show all machines';
    });
    this.dataset.index = String(index);
  }

  #onCheck = (/** @type {Event} */ event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    if (!input.matches('[data-check-input]') || !this.data) return;
    const out = this.querySelector('[data-check-result]');
    if (!out) return;
    const typed = input.value.trim().toUpperCase();
    if (!typed) {
      out.textContent = '';
      return;
    }
    const index = Number(this.dataset.index);
    const keys = matchingKeys(this.data, typed);
    const hits = keys.flatMap((k) => this.data.models[k].filter(([i]) => i === index).map(([, bar]) => ({ k, bar })));
    out.className = `fpg-fits__result ${hits.length ? 'is-yes' : 'is-no'}`;
    out.innerHTML = hits.length
      ? `✓ Listed for the ${esc(modelLabel(hits[0].k))}${hits[0].bar ? ` with a ${hits[0].bar}in bar` : ''}.`
      : keys.length
        ? `✗ Not listed for the ${esc(modelLabel(keys[0]))}. <a href="${esc(this.dataset.finderUrl)}?fit=${encodeURIComponent(keys[0])}#fpg-fit">See what fits it</a>.`
        : `We don't have fit details for “${esc(typed)}”. Check the numbers on your bar or call 01443 230000.`;
  };

  /** On a chainsaw: chains and bars that fit it, matching the chosen bar length when the variant says one. */
  async #renderMachine() {
    const key = findModel(this.data, this.dataset.brand || '', this.dataset.title || '');
    if (!key) return;
    const length = Number(((this.dataset.variantTitle || '') + ' ' + (this.dataset.title || '')).match(/(\d{2})\s*(?:in\b|")/i)?.[1] || 0);
    let entries = sortEntries(entriesFor(this.data, key));
    const chains = entries.filter((e) => e.product.k === 'c' && (!length || e.bar === length));
    const bars = entries.filter((e) => e.product.k !== 'c' && (!length || !e.bar || e.bar === length));
    const pick = uniqueEntries([...chains.slice(0, 3), ...bars.slice(0, 1), ...chains.slice(3, 4)]).slice(0, 4);
    if (!pick.length) return;
    const body = this.querySelector('[data-body]');
    if (!body) return;
    const total = uniqueEntries(entries).length;
    const model = modelLabel(key);
    body.innerHTML = `
      <p class="fpg-fits__lead">Spare chains and bars listed for the <strong>${esc(model)}</strong>${length ? ` with a ${length}in bar` : ''}:</p>
      <ul class="fpg-fit-results fpg-fit-results--compact" role="list" data-list></ul>
      <a class="fpg-fits__link" href="${esc(this.dataset.finderUrl)}?fit=${encodeURIComponent(key)}#fpg-fit">See all ${total} that fit the ${esc(model)}</a>`;
    const count = await renderCards(/** @type {HTMLElement} */ (body.querySelector('[data-list]')), pick, Number(this.dataset.vat || 20), (e) =>
      e.bar && e.product.k === 'c' ? `${e.bar}in bar` : ''
    );
    this.hidden = count === 0;
  }
}

// ------------------------------------------------------------ search card
class FpgFitSearch extends HTMLElement {
  async connectedCallback() {
    const terms = (this.dataset.terms || '').toUpperCase();
    if (!terms) return;
    let data;
    try {
      data = await loadFitData(this.dataset.url || '');
    } catch {
      return;
    }
    const key = findModel(data, '', terms);
    if (!key) return;
    // A bare number ("50", "450") only counts as a model when the brand is in the search too.
    const [brand, modelName] = key.split('|');
    if (/^\d+$/.test(modelName) && !terms.includes(brand.toUpperCase())) return;
    const entries = uniqueEntries(entriesFor(data, key));
    const chains = entries.filter((e) => e.product.k === 'c').length;
    const bars = entries.length - chains;
    const model = modelLabel(key);
    this.innerHTML = `<a class="fpg-fit-search" href="${esc(this.dataset.finderUrl)}?fit=${encodeURIComponent(key)}#fpg-fit">
      <span class="fpg-fit-search__icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h11a3 3 0 0 0 0-6H4z"/><path d="M4 9v6"/><circle cx="15" cy="12" r="1.2"/></svg></span>
      <span><strong>Chains and bars for the ${esc(model)}</strong><small>${chains} chain${chains === 1 ? '' : 's'}${bars ? ` and ${bars} bar${bars === 1 ? '' : 's'} or kit${bars === 1 ? '' : 's'}` : ''} listed as fitting</small></span>
      <span class="fpg-fit-search__go" aria-hidden="true">→</span>
    </a>`;
    this.hidden = false;
  }
}

if (!customElements.get('fpg-fit-finder')) customElements.define('fpg-fit-finder', FpgFitFinder);
if (!customElements.get('fpg-fit-product')) customElements.define('fpg-fit-product', FpgFitProduct);
if (!customElements.get('fpg-fit-search')) customElements.define('fpg-fit-search', FpgFitSearch);
