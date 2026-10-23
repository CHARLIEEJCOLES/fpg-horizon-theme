/**
 * FP&G service finder (sections/fpg-service-finder.liquid).
 * Machine type -> brand -> service. The shopper's machine model, serial number
 * and notes are added to the cart line as properties so they reach the order.
 * Uses the shared helpers from assets/fpg-cart.js.
 */

const tools = () => /** @type {any} */ (window).FPGTools;

/**
 * @typedef {{id: number, title: string, price: number, available: boolean}} Variant
 * @typedef {{block: string, machine: string, brand: string, productId: number, title: string, url: string,
 *   image: string | null, option: string, variants: Variant[], guides: string[]}} Service
 */

class FpgServiceFinder extends HTMLElement {
  /** @type {Service[]} */
  services = [];
  machine = '';
  /** @type {Service | null} */
  service = null;
  /** @type {Variant | null} */
  variant = null;

  connectedCallback() {
    try {
      const raw = this.querySelector('[data-services]')?.textContent || '[]';
      this.services = JSON.parse(raw.replace(/,\s*\]/g, ']')).filter((/** @type {Service} */ s) => s.machine && s.brand);
    } catch {
      this.services = [];
    }
    this.addEventListener('click', this.#onClick);
    this.addEventListener('change', this.#onChange);
    this.querySelector('[data-form]')?.addEventListener('submit', this.#onSubmit);
    this.#renderMachines();
  }

  /** @param {string} value */
  #key(value) {
    return value.trim().toLowerCase();
  }

  #renderMachines() {
    const machines = [];
    for (const s of this.services) if (!machines.some((m) => this.#key(m) === this.#key(s.machine))) machines.push(s.machine);
    const box = this.querySelector('[data-machines]');
    if (!box) return;
    box.innerHTML = machines
      .map((machine) => {
        const brands = new Set(this.services.filter((s) => this.#key(s.machine) === this.#key(machine)).map((s) => this.#key(s.brand)));
        return `<button type="button" class="fpg-svc__choice" data-machine="${tools().escapeHtml(machine)}" aria-pressed="false">
          <span class="fpg-svc__choice-name">${tools().escapeHtml(machine)}</span>
          <span class="fpg-svc__choice-meta">${brands.size} brand${brands.size === 1 ? '' : 's'}</span>
        </button>`;
      })
      .join('');
  }

  /** @param {string} machine */
  #chooseMachine(machine) {
    this.machine = machine;
    this.#press('[data-machine]', (el) => el.dataset.machine === machine);
    const matches = this.services.filter((s) => this.#key(s.machine) === this.#key(machine));
    const box = this.querySelector('[data-brands]');
    if (box) {
      box.innerHTML = matches
        .map((s) => {
          const from = Math.min(...s.variants.map((v) => v.price));
          return `<button type="button" class="fpg-svc__choice" data-service="${tools().escapeHtml(s.block)}" aria-pressed="false">
            <span class="fpg-svc__choice-name">${tools().escapeHtml(s.brand)}</span>
            <span class="fpg-svc__choice-meta">from ${tools().money(from)} + VAT</span>
          </button>`;
        })
        .join('');
    }
    this.#show('[data-brand-step]', true);
    this.#show('[data-result]', false);
    if (matches.length === 1) this.#chooseService(matches[0].block);
    else this.querySelector('[data-brand-step]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** @param {string} block */
  #chooseService(block) {
    const service = this.services.find((s) => s.block === block);
    if (!service) return;
    this.service = service;
    this.#press('[data-service]', (el) => el.dataset.service === block);

    const image = this.querySelector('[data-result-image]');
    if (image) {
      image.innerHTML = service.image
        ? `<img src="${tools().escapeHtml(service.image)}" alt="" width="600" height="600" loading="lazy">`
        : '';
    }
    const title = this.querySelector('[data-result-title]');
    if (title) title.innerHTML = `<a href="${tools().escapeHtml(service.url)}">${tools().escapeHtml(service.title)}</a>`;

    const options = this.querySelector('[data-variants]');
    const single = service.variants.length < 2;
    if (options instanceof HTMLElement) {
      options.hidden = single;
      options.innerHTML = single
        ? ''
        : `<p class="fpg-svc__variants-label">${tools().escapeHtml(service.option || 'Option')}</p>` +
          service.variants
            .map(
              (v, i) => `<label class="fpg-svc__variant">
                <input type="radio" name="fpg-svc-variant" value="${v.id}"${i === 0 ? ' checked' : ''}${v.available ? '' : ' disabled'}>
                <span>${tools().escapeHtml(v.title)}</span>
                <span class="fpg-svc__variant-price">${tools().money(v.price)} + VAT</span>
              </label>`
            )
            .join('');
    }
    const guide = this.querySelector('[data-guide]');
    const guideImages = this.querySelector('[data-guide-images]');
    if (guide instanceof HTMLElement && guideImages) {
      guide.hidden = single || service.guides.length === 0;
      guide.removeAttribute('open');
      guideImages.innerHTML = service.guides
        .map((src) => `<a href="${tools().escapeHtml(src)}" target="_blank" rel="noopener"><img src="${tools().escapeHtml(src)}" alt="Models covered by this service" loading="lazy"></a>`)
        .join('');
    }
    this.#selectVariant(service.variants.find((v) => v.available)?.id || service.variants[0]?.id);
    this.#show('[data-result]', true);
    this.#message('');
    this.querySelector('[data-result]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** @param {number | undefined} id */
  #selectVariant(id) {
    const service = this.service;
    if (!service) return;
    this.variant = service.variants.find((v) => v.id === Number(id)) || null;
    const price = this.querySelector('[data-result-price]');
    const book = this.querySelector('[data-book]');
    const rate = Number(this.dataset.vatRate || 20);
    if (price && this.variant) {
      const vat = Math.round((this.variant.price * rate) / 100);
      price.innerHTML = `${tools().money(this.variant.price)} <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${tools().money(this.variant.price + vat)})</span>`;
    }
    if (book instanceof HTMLButtonElement) {
      book.disabled = !this.variant?.available;
      book.textContent = this.variant?.available ? 'Book this service' : 'Currently unavailable';
    }
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const machine = target?.closest('[data-machine]');
    if (machine instanceof HTMLElement) return this.#chooseMachine(machine.dataset.machine || '');
    const service = target?.closest('[data-service]');
    if (service instanceof HTMLElement) this.#chooseService(service.dataset.service || '');
  };

  /** @param {Event} event */
  #onChange = (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'fpg-svc-variant') this.#selectVariant(Number(event.target.value));
  };

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();
    const form = /** @type {HTMLFormElement} */ (event.currentTarget);
    const error = /** @type {HTMLElement | null} */ (this.querySelector('[data-error]'));
    const data = new FormData(form);
    const model = String(data.get('model') || '').trim();
    if (!this.service || !this.variant) return;
    if (!model) {
      if (error) {
        error.hidden = false;
        error.textContent = "Please tell us your machine's model so we can prepare the right parts.";
      }
      form.querySelector('[name="model"]')?.focus();
      return;
    }
    if (error) error.hidden = true;

    /** @type {Record<string, string>} */
    const properties = { Machine: `${this.service.brand} ${this.service.machine}`, Model: model };
    const serial = String(data.get('serial') || '').trim();
    const notes = String(data.get('notes') || '').trim();
    if (serial) properties['Serial number'] = serial;
    if (notes) properties.Notes = notes;

    const book = form.querySelector('[data-book]');
    if (book instanceof HTMLButtonElement) book.disabled = true;
    this.#message('Adding your service…');
    try {
      await tools().addItemsToCart([{ id: this.variant.id, quantity: 1, properties }], this);
      this.#message('Booked into your basket. Check out when you are ready and we will send your delivery label.');
      form.reset();
    } catch (err) {
      this.#message(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      if (book instanceof HTMLButtonElement) book.disabled = !this.variant?.available;
    }
  };

  /** @param {string} selector @param {(el: HTMLElement) => boolean} test */
  #press(selector, test) {
    for (const el of this.querySelectorAll(selector)) {
      el.setAttribute('aria-pressed', String(test(/** @type {HTMLElement} */ (el))));
    }
  }

  /** @param {string} selector @param {boolean} visible */
  #show(selector, visible) {
    const el = this.querySelector(selector);
    if (el instanceof HTMLElement) el.hidden = !visible;
  }

  /** @param {string} text */
  #message(text) {
    const el = this.querySelector('[data-message]');
    if (el) el.textContent = text;
  }
}

if (!customElements.get('fpg-service-finder')) customElements.define('fpg-service-finder', FpgServiceFinder);
