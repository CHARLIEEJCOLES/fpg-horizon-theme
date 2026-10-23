/**
 * FP&G climbing kit builder (sections/fpg-kit-builder.liquid).
 *
 * Keeps the shopper's kit (variant, quantity) in memory and in localStorage,
 * shows a checklist against the chosen kit type's minimum, keeps totals
 * (prices are stored without VAT), and adds the whole kit to the cart with
 * one request. The cart drawer is told through Horizon's cart event so it
 * refreshes and opens as it does for a normal "Add to cart".
 */

/** Shared helpers from assets/fpg-cart.js (loaded first by the section). */
const tools = () => /** @type {any} */ (window).FPGTools;
const money = (/** @type {number} */ pence) => tools().money(pence);
const escapeHtml = (/** @type {string} */ value) => tools().escapeHtml(value);
const escapeAttr = escapeHtml;
const isQuoteOnly = (/** @type {string} */ id) => tools().isQuoteOnly(id);

class FpgKitBuilder extends HTMLElement {
  /** @type {{mode: string, lines: Record<string, any>}} */
  state = { mode: '1', lines: {} };
  #vatRate = 20;
  #panels = /** @type {HTMLElement[]} */ ([]);

  connectedCallback() {
    this.#vatRate = Number(this.dataset.vatRate || 20);
    this.#panels = Array.from(this.querySelectorAll('.fpg-kit__panel'));
    this.#load();
    this.addEventListener('click', this.#onClick);
    this.addEventListener('change', this.#onChange);
    for (const item of this.querySelectorAll('.fpg-kit__item')) this.#prepareItem(/** @type {HTMLElement} */ (item));
    window.addEventListener('load', () => this.#markQuoteOnly(), { once: true });
    this.#setMode(this.state.mode);
    this.#observeSummary();
    this.render();
  }

  // ---------------------------------------------------------------- state
  #load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.dataset.storageKey || '') || 'null');
      if (saved && typeof saved === 'object' && saved.lines) this.state = { mode: String(saved.mode || '1'), lines: saved.lines };
    } catch {
      /* storage unavailable: start empty */
    }
  }

  #save() {
    try {
      localStorage.setItem(this.dataset.storageKey || '', JSON.stringify(this.state));
    } catch {
      /* storage unavailable: the kit lasts for this visit only */
    }
  }

  // ---------------------------------------------------------------- items
  /** @param {HTMLElement} item */
  #variants(item) {
    if (!item._variants) {
      try {
        item._variants = JSON.parse(item.querySelector('[data-variants]')?.textContent || '[]');
      } catch {
        item._variants = [];
      }
    }
    return /** @type {Array<{id: number, title: string, price: number, available: boolean}>} */ (item._variants);
  }

  /** @param {HTMLElement} item */
  #selected(item) {
    const variants = this.#variants(item);
    const select = item.querySelector('[data-variant]');
    const id = select instanceof HTMLSelectElement ? Number(select.value) : variants.find((v) => v.available)?.id;
    return variants.find((v) => v.id === id) || variants[0];
  }

  /** @param {HTMLElement} item */
  #prepareItem(item) {
    if (isQuoteOnly(item.dataset.productId || '')) this.#quoteOnly(item);
  }

  #markQuoteOnly() {
    for (const item of this.querySelectorAll('.fpg-kit__item')) {
      if (isQuoteOnly(/** @type {HTMLElement} */ (item).dataset.productId || '')) this.#quoteOnly(/** @type {HTMLElement} */ (item));
    }
  }

  /** @param {HTMLElement} item */
  #quoteOnly(item) {
    if (item.dataset.quote) return;
    item.dataset.quote = 'true';
    const price = item.querySelector('[data-price]');
    const controls = item.querySelector('[data-controls]');
    if (price) price.textContent = 'Price on request';
    if (controls) {
      const link = document.createElement('a');
      link.className = 'button button-secondary fpg-kit__quote';
      link.href = item.dataset.url || '#';
      link.textContent = 'Ask for a price';
      controls.replaceChildren(link);
    }
  }

  /** @param {HTMLElement} item */
  #updateItemPrice(item) {
    const variant = this.#selected(item);
    const price = item.querySelector('[data-price]');
    if (!variant || !price || item.dataset.quote) return;
    const vat = Math.round((variant.price * this.#vatRate) / 100);
    price.innerHTML = `${money(variant.price)} <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(variant.price + vat)})</span>`;
    const add = item.querySelector('[data-add]');
    if (add instanceof HTMLButtonElement) {
      add.disabled = !variant.available;
      add.textContent = variant.available ? 'Add to kit' : 'Sold out';
    }
  }

  /** @param {HTMLElement} item */
  #addItem(item) {
    const variant = this.#selected(item);
    if (!variant?.available) return;
    const qtyInput = item.querySelector('[data-qty]');
    const qty = Math.max(1, Math.min(99, Number(qtyInput instanceof HTMLInputElement ? qtyInput.value : 1) || 1));
    const panel = item.closest('.fpg-kit__panel');
    const key = String(variant.id);
    const existing = this.state.lines[key];
    this.state.lines[key] = {
      id: variant.id,
      productId: item.dataset.productId,
      step: Number(panel instanceof HTMLElement ? panel.dataset.step : 0),
      title: item.dataset.title,
      variant: variant.title === 'Default Title' ? '' : variant.title,
      price: variant.price,
      image: item.dataset.image,
      url: item.dataset.url,
      qty: Math.min(99, (existing?.qty || 0) + qty),
    };
    this.#save();
    this.render();
    const add = item.querySelector('[data-add]');
    if (add) {
      add.textContent = 'Added ✓';
      window.setTimeout(() => this.#updateItemPrice(item), 1200);
    }
  }

  // ---------------------------------------------------------------- events
  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const item = /** @type {HTMLElement | null} */ (target.closest('.fpg-kit__item'));

    const tab = target.closest('[data-step-tab]');
    if (tab instanceof HTMLElement) return this.#showStep(Number(tab.dataset.stepTab));

    const go = target.closest('[data-go]');
    if (go instanceof HTMLElement) {
      this.#showStep(Number(go.dataset.go));
      this.querySelector('.fpg-kit__panels')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const mode = target.closest('[data-mode]');
    if (mode instanceof HTMLElement) return this.#setMode(mode.dataset.mode || '1');

    const step = target.closest('[data-qty-step]');
    if (step instanceof HTMLElement && item) {
      const input = item.querySelector('[data-qty]');
      if (input instanceof HTMLInputElement) {
        input.value = String(Math.max(1, Math.min(99, (Number(input.value) || 1) + Number(step.dataset.qtyStep))));
      }
      return;
    }

    if (target.closest('[data-add]') && item) return this.#addItem(item);

    const lineButton = target.closest('[data-line-action]');
    if (lineButton instanceof HTMLElement) {
      const key = lineButton.dataset.key || '';
      const line = this.state.lines[key];
      if (!line) return;
      const action = lineButton.dataset.lineAction;
      if (action === 'remove') delete this.state.lines[key];
      if (action === 'plus') line.qty = Math.min(99, line.qty + 1);
      if (action === 'minus') line.qty <= 1 ? delete this.state.lines[key] : (line.qty -= 1);
      this.#save();
      return this.render();
    }

    if (target.closest('[data-clear]')) {
      this.state.lines = {};
      this.#save();
      return this.render();
    }

    if (target.closest('[data-add-kit]')) this.#addKit();
  };

  /** @param {Event} event */
  #onChange = (event) => {
    const item = event.target instanceof Element ? event.target.closest('.fpg-kit__item') : null;
    if (item instanceof HTMLElement && event.target instanceof HTMLSelectElement) this.#updateItemPrice(item);
  };

  /** @param {number} index */
  #showStep(index) {
    const count = this.#panels.length;
    if (!count) return;
    const active = Math.max(0, Math.min(count - 1, index));
    this.#panels.forEach((panel, i) => (panel.hidden = i !== active));
    for (const tab of this.querySelectorAll('[data-step-tab]')) {
      const isActive = Number(/** @type {HTMLElement} */ (tab).dataset.stepTab) === active;
      tab.setAttribute('aria-current', isActive ? 'step' : 'false');
      if (isActive) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  /** @param {string} mode */
  #setMode(mode) {
    this.state.mode = mode === '2' && this.getAttribute('data-kit-label-2') ? '2' : '1';
    for (const button of this.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.mode === this.state.mode));
    }
    this.#save();
    this.render();
  }

  // ---------------------------------------------------------------- summary
  #observeSummary() {
    const summary = this.querySelector('.fpg-kit__summary');
    const bar = this.querySelector('[data-bar]');
    if (!summary || !bar || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(([entry]) => bar.classList.toggle('is-hidden', entry.isIntersecting)).observe(summary);
  }

  render() {
    const lines = Object.entries(this.state.lines);
    const mode = this.state.mode;
    const perStep = new Map();
    let exTotal = 0;
    let count = 0;
    for (const [, line] of lines) {
      perStep.set(line.step, (perStep.get(line.step) || 0) + line.qty);
      exTotal += line.price * line.qty;
      count += line.qty;
    }

    // Checklist and step badges
    const checklist = this.querySelector('[data-checklist]');
    let needed = 0;
    let met = 0;
    const rows = [];
    for (const panel of this.#panels) {
      const step = Number(panel.dataset.step);
      const min = Number(panel.getAttribute(`data-min-${mode}`) || 0);
      const have = perStep.get(step) || 0;
      const state = this.querySelector(`[data-step-state="${step}"]`);
      const need = panel.querySelector('[data-need]');
      if (min > 0) {
        needed += 1;
        if (have >= min) met += 1;
        rows.push(
          `<li class="fpg-kit__check${have >= min ? ' is-done' : ''}"><span aria-hidden="true">${have >= min ? '✓' : '○'}</span> ${escapeHtml(panel.dataset.title || '')} <span class="fpg-kit__check-count">${Math.min(have, min)} of ${min}</span></li>`
        );
      }
      if (state) {
        state.textContent = have >= min && min > 0 ? '✓' : have > 0 ? String(have) : min > 0 ? `0/${min}` : '';
        state.className = `fpg-kit__step-state${have >= min && min > 0 ? ' is-done' : have > 0 ? ' has-items' : ''}`;
      }
      if (need) {
        need.textContent =
          min > 0
            ? `The minimum ${this.#kitLabel().toLowerCase()} needs ${min}. You have ${have}.`
            : `Optional for the ${this.#kitLabel().toLowerCase()}.${have ? ` You have ${have}.` : ''}`;
      }
    }
    if (checklist) checklist.innerHTML = rows.join('');
    const progressText = this.querySelector('[data-progress-text]');
    const progressBar = /** @type {HTMLElement | null} */ (this.querySelector('[data-progress-bar]'));
    if (progressText) progressText.textContent = `${this.#kitLabel()}: ${met} of ${needed} essentials covered`;
    if (progressBar) progressBar.style.width = `${needed ? Math.round((met / needed) * 100) : 0}%`;

    // Lines
    const list = this.querySelector('[data-lines]');
    if (list) {
      list.innerHTML = lines
        .sort((a, b) => a[1].step - b[1].step)
        .map(
          ([key, line]) => `<li class="fpg-kit__line">
            ${line.image ? `<img src="${escapeAttr(line.image)}" alt="" width="48" height="48" loading="lazy">` : '<span></span>'}
            <span class="fpg-kit__line-info"><a href="${escapeAttr(line.url || '#')}">${escapeHtml(line.title || '')}</a>${line.variant ? `<span>${escapeHtml(line.variant)}</span>` : ''}<span class="fpg-kit__line-price">${money(line.price * line.qty)} + VAT</span></span>
            <span class="fpg-kit__line-qty">
              <button type="button" data-line-action="minus" data-key="${key}" aria-label="One fewer ${escapeAttr(line.title || '')}">&minus;</button>
              <span>${line.qty}</span>
              <button type="button" data-line-action="plus" data-key="${key}" aria-label="One more ${escapeAttr(line.title || '')}">+</button>
            </span>
            <button type="button" class="fpg-kit__line-remove" data-line-action="remove" data-key="${key}" aria-label="Remove ${escapeAttr(line.title || '')}">&times;</button>
          </li>`
        )
        .join('');
    }
    const empty = this.querySelector('[data-empty]');
    if (empty instanceof HTMLElement) empty.hidden = lines.length > 0;
    const clear = this.querySelector('[data-clear]');
    if (clear instanceof HTMLElement) clear.hidden = lines.length === 0;

    // Totals
    const vat = Math.round((exTotal * this.#vatRate) / 100);
    this.#text('[data-total-ex]', money(exTotal));
    this.#text('[data-total-vat]', money(vat));
    this.#text('[data-total-inc]', money(exTotal + vat));
    this.#text('[data-bar-total]', money(exTotal + vat));
    this.#text('[data-bar-count]', `${count} item${count === 1 ? '' : 's'}`);
    const bar = this.querySelector('[data-bar]');
    if (bar instanceof HTMLElement) bar.hidden = count === 0;
    const addKit = this.querySelector('[data-add-kit]');
    if (addKit instanceof HTMLButtonElement) {
      addKit.disabled = count === 0;
      addKit.textContent = count ? `Add kit to basket (${count})` : 'Add kit to basket';
    }

    // "In your kit" note on each product
    for (const item of this.querySelectorAll('.fpg-kit__item')) {
      const el = /** @type {HTMLElement} */ (item);
      const inKit = lines.filter(([, line]) => String(line.productId) === el.dataset.productId).reduce((n, [, l]) => n + l.qty, 0);
      const note = el.querySelector('[data-in-kit]');
      el.classList.toggle('is-in-kit', inKit > 0);
      if (note instanceof HTMLElement) {
        note.hidden = inKit === 0;
        note.textContent = inKit ? `✓ ${inKit} in your kit` : '';
      }
    }
  }

  #kitLabel() {
    return (this.state.mode === '2' ? this.getAttribute('data-kit-label-2') : this.getAttribute('data-kit-label-1')) || 'Kit';
  }

  /** @param {string} selector @param {string} value */
  #text(selector, value) {
    const el = this.querySelector(selector);
    if (el) el.textContent = value;
  }

  async #addKit() {
    const lines = Object.values(this.state.lines);
    if (!lines.length) return;
    const button = this.querySelector('[data-add-kit]');
    const message = this.querySelector('[data-message]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    if (message) message.textContent = 'Adding your kit…';
    try {
      await tools().addItemsToCart(
        lines.map((line) => ({ id: line.id, quantity: line.qty, properties: { _Kit: this.#kitLabel() } })),
        this
      );
      if (message) message.textContent = 'Your kit is in the basket.';
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  }
}

if (!customElements.get('fpg-kit-builder')) customElements.define('fpg-kit-builder', FpgKitBuilder);
