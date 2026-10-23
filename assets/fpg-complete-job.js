/**
 * FP&G "Complete the job" (blocks/fpg-complete-job.liquid).
 *
 * - Keeps a running total of the ticked items (prices are stored without VAT,
 *   VAT added only on taxable items) and adds them to the basket in one go
 *   through the shared helper in assets/fpg-cart.js, so the cart drawer opens
 *   as it does for a normal Add to basket.
 * - Items with options (sizes, can sizes) have a small select; changing it
 *   updates the tick box's variant and the price.
 * - Hides items the Call for Price app marks as quote-only.
 * - On chainsaws, adds a spare chain listed as fitting the chosen bar length
 *   (helpers from assets/fpg-fit.js). Never ticked until the shopper ticks it.
 */

const CURRENCY = /** @type {any} */ (window).Shopify?.currency?.active || 'GBP';
const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: CURRENCY });
const money = (/** @type {number} */ pence) => fmt.format(pence / 100);

class FpgCompleteJob extends HTMLElement {
  vat = 20;

  connectedCallback() {
    this.vat = Number(this.dataset.vat || 20);
    this.addEventListener('change', this.#onChange);
    this.querySelector('[data-add]')?.addEventListener('click', this.#onAdd);
    window.addEventListener('load', () => this.#hideQuoteOnly(), { once: true });
    this.#hideQuoteOnly();
    if (this.dataset.chain === 'true') this.#addChain();
    this.#total();
  }

  #vatOn(/** @type {number} */ ex, /** @type {string | undefined} */ taxable) {
    return taxable === 'false' ? 0 : Math.round((ex * this.vat) / 100);
  }

  #priceHtml(/** @type {number} */ ex, /** @type {string | undefined} */ taxable) {
    if (taxable === 'false') return `${money(ex)} <span class="fpg-vat">no VAT</span>`;
    return `${money(ex)} <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(ex + this.#vatOn(ex, taxable))})</span>`;
  }

  #hideQuoteOnly() {
    const quote = String(/** @type {any} */ (window).cfp_products?.products || '').split(',');
    let visible = 0;
    for (const row of this.querySelectorAll('[data-product-id]')) {
      const hide = quote.includes(/** @type {HTMLElement} */ (row).dataset.productId || '');
      /** @type {HTMLElement} */ (row).hidden = hide;
      if (hide) {
        const tick = row.querySelector('input');
        if (tick) tick.checked = false;
      } else visible++;
    }
    const chainRow = /** @type {HTMLElement | null} */ (this.querySelector('[data-chain-row]'));
    if (chainRow && !chainRow.hidden) visible++;
    this.hidden = visible === 0;
  }

  async #addChain() {
    const row = /** @type {HTMLElement | null} */ (this.querySelector('[data-chain-row]'));
    if (!row) return;
    try {
      const fit = await import(/** @type {string} */ (this.dataset.fitScript));
      const data = await fit.loadFitData(this.dataset.fitUrl);
      const key = fit.findModel(data, this.dataset.brand || '', this.dataset.title || '');
      if (!key) return;
      const length = Number(`${this.dataset.variantTitle || ''} ${this.dataset.title || ''}`.match(/(\d{2})\s*(?:in\b|")/i)?.[1] || 0);
      const chains = fit
        .entriesFor(data, key)
        .filter((/** @type {any} */ e) => e.product.k === 'c' && !e.product.r && (!length || e.bar === length))
        .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.bar || 99) - (b.bar || 99));
      for (const entry of chains) {
        const item = await fit.loadProduct(entry.product.h);
        const v = item?.variants?.find((/** @type {any} */ x) => x.available);
        if (!item || !v) continue;
        const img = item.featured_image ? `${item.featured_image}${item.featured_image.includes('?') ? '&' : '?'}width=120` : '';
        const id = `Ctj-chain-${v.id}`;
        row.innerHTML = `
          <input type="checkbox" class="fpg-ctj__tick" id="${id}" value="${v.id}" data-price="${v.price}" data-taxable="${v.taxable}">
          <label class="fpg-ctj__img" for="${id}">${img ? `<img src="${fit.esc(img)}" alt="" width="60" height="60" loading="lazy">` : ''}</label>
          <div class="fpg-ctj__info">
            <label for="${id}" class="fpg-ctj__title">Spare chain: ${fit.esc(item.title)}</label>
            <span class="fpg-ctj__meta">Listed for the ${fit.esc(fit.modelLabel(key))}${entry.bar ? ` with a ${entry.bar}in bar` : ''}</span>
            <a class="fpg-ctj__link" href="${fit.esc(item.url)}">Details</a>
          </div>
          <span class="fpg-ctj__price" data-price-out>${this.#priceHtml(v.price, String(v.taxable))}</span>`;
        row.hidden = false;
        this.hidden = false;
        break;
      }
    } catch (error) {
      console.warn('[FP&G complete the job]', error);
    }
  }

  #onChange = (/** @type {Event} */ event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target instanceof HTMLSelectElement && target.matches('[data-variant]')) {
      const row = target.closest('.fpg-ctj__item');
      const option = target.selectedOptions[0];
      const tick = /** @type {HTMLInputElement | null} */ (row?.querySelector('.fpg-ctj__tick') || null);
      if (tick && option) {
        tick.value = option.value;
        tick.dataset.price = option.dataset.price;
        tick.dataset.taxable = option.dataset.taxable;
        const out = row?.querySelector('[data-price-out]');
        if (out) out.innerHTML = this.#priceHtml(Number(option.dataset.price), option.dataset.taxable);
      }
    }
    this.#total();
  };

  #ticked() {
    return /** @type {HTMLInputElement[]} */ ([...this.querySelectorAll('.fpg-ctj__tick')]).filter(
      (t) => t.checked && !t.closest('[hidden]')
    );
  }

  #total() {
    const ticked = this.#ticked();
    const ex = ticked.reduce((sum, t) => sum + Number(t.dataset.price || 0), 0);
    const vat = ticked.reduce((sum, t) => sum + this.#vatOn(Number(t.dataset.price || 0), t.dataset.taxable), 0);
    const out = this.querySelector('[data-total]');
    const button = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-add]'));
    if (out) {
      out.innerHTML = ticked.length
        ? `${ticked.length} item${ticked.length === 1 ? '' : 's'}: <strong>${money(ex)}</strong> + VAT (${money(ex + vat)})`
        : 'Tick the items you need';
    }
    if (button) button.disabled = ticked.length === 0;
  }

  #onAdd = async (/** @type {Event} */ event) => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const items = this.#ticked().map((t) => ({ id: Number(t.value), quantity: 1 }));
    if (!items.length) return;
    const tools = /** @type {any} */ (window).FPGTools;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      await tools.addItemsToCart(items, button);
      button.textContent = 'Added ✓';
      for (const t of this.#ticked()) t.checked = false;
    } catch (error) {
      button.textContent = 'Could not add, try again';
      console.warn('[FP&G complete the job]', error);
    }
    setTimeout(() => {
      button.textContent = label;
      this.#total();
    }, 2200);
  };
}

if (!customElements.get('fpg-complete-job')) customElements.define('fpg-complete-job', FpgCompleteJob);
