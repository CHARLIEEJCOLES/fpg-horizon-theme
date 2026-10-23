/**
 * FP&G hire planner (blocks/fpg-hire-calculator.liquid).
 *
 * Works out the cheapest way to cover the chosen days with the product's
 * Day, Extra Day, Weekend and Week rates, shows it with VAT, and books it
 * into the basket with the dates as line item properties. If any rate it
 * needs can't be bought online, the hire request form takes over.
 * Uses the shared helpers from assets/fpg-cart.js.
 */

const tools = () => /** @type {any} */ (window).FPGTools;
const DAY_MS = 86400000;

/** @typedef {{id: number, price: number, available: boolean} | null} Rate */
/** @typedef {{rate: Rate, label: string, qty: number}} Line */

/** @param {Date} date */
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** @param {string} value */
const parse = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const nice = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

class FpgHireCalculator extends HTMLElement {
  /** @type {{day: Rate, extra: Rate, week: Rate, weekend: Rate}} */
  rates = { day: null, extra: null, week: null, weekend: null };
  /** @type {Line[]} */
  lines = [];
  days = 0;

  connectedCallback() {
    try {
      this.rates = JSON.parse(this.querySelector('[data-rates]')?.textContent || '{}');
    } catch {
      return;
    }
    const today = iso(new Date());
    for (const input of this.querySelectorAll('[data-start], [data-end]')) {
      if (input instanceof HTMLInputElement) input.min = today;
    }
    this.addEventListener('change', () => this.#update());
    this.addEventListener('click', this.#onClick);
    if (/[?&]contact_posted=true/.test(location.search)) {
      const request = this.querySelector('[data-request]');
      if (request instanceof HTMLDetailsElement) {
        request.open = true;
        request.scrollIntoView({ block: 'center' });
      }
    }
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const quick = target?.closest('[data-quick]');
    if (quick instanceof HTMLElement) return this.#quick(quick.dataset.quick || 'day');
    if (target?.closest('[data-book]')) this.#book();
  };

  /** @param {string} kind */
  #quick(kind) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    if (kind === 'weekend') while (start.getDay() !== 6) start.setDate(start.getDate() + 1);
    const end = new Date(start);
    if (kind === 'weekend') end.setDate(end.getDate() + 1);
    if (kind === 'week') end.setDate(end.getDate() + 6);
    this.#set('[data-start]', iso(start));
    this.#set('[data-end]', iso(end));
    for (const b of this.querySelectorAll('[data-quick]')) b.setAttribute('aria-pressed', String(b === this.querySelector(`[data-quick="${kind}"]`)));
    this.#update();
  }

  /** @param {string} selector @param {string} value */
  #set(selector, value) {
    const input = this.querySelector(selector);
    if (input instanceof HTMLInputElement) input.value = value;
  }

  /**
   * Cheapest way to cover `days` days. A hire that sits inside one Saturday
   * and Sunday can use the weekend rate.
   * @param {number} days @param {Date} start
   * @returns {{lines: Line[], total: number, dailyTotal: number}}
   */
  #price(days, start) {
    const { day, extra, week, weekend } = this.rates;
    const extraPrice = extra ? extra.price : day ? day.price : 0;
    /** @type {Array<{lines: Line[], total: number}>} */
    const options = [];
    if (day) {
      const lines = [{ rate: day, label: 'Day', qty: 1 }];
      if (days > 1) lines.push({ rate: extra || day, label: extra ? 'Extra day' : 'Day', qty: days - 1 });
      options.push({ lines, total: day.price + (days - 1) * extraPrice });
    }
    if (week) {
      const weeks = Math.floor(days / 7);
      const rest = days % 7;
      if (weeks > 0) {
        const lines = [{ rate: week, label: 'Week', qty: weeks }];
        if (rest) lines.push({ rate: extra || day, label: extra ? 'Extra day' : 'Day', qty: rest });
        options.push({ lines, total: weeks * week.price + rest * extraPrice });
      }
      const whole = Math.ceil(days / 7);
      options.push({ lines: [{ rate: week, label: 'Week', qty: whole }], total: whole * week.price });
    }
    if (weekend && days <= 2 && start.getDay() === 6) {
      options.push({ lines: [{ rate: weekend, label: 'Weekend', qty: 1 }], total: weekend.price });
    }
    options.sort((a, b) => a.total - b.total);
    const dailyTotal = day ? day.price + (days - 1) * extraPrice : 0;
    return { ...(options[0] || { lines: [], total: 0 }), dailyTotal };
  }

  #update() {
    const startInput = this.querySelector('[data-start]');
    const endInput = this.querySelector('[data-end]');
    if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) return;
    const start = parse(startInput.value);
    let end = parse(endInput.value);
    if (start && (!end || end < start)) {
      endInput.value = startInput.value;
      end = start;
    }
    if (start) endInput.min = startInput.value;
    const result = this.querySelector('[data-result]');
    const bookArea = this.querySelector('[data-book-area]');
    if (!start || !end || !result) return;

    this.days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    const { lines, total, dailyTotal } = this.#price(this.days, start);
    this.lines = lines;
    const rate = Number(this.dataset.vatRate || 20);
    const vat = Math.round((total * rate) / 100);
    const m = tools().money;
    const saving = dailyTotal - total;
    const bookable = lines.length > 0 && lines.every((line) => line.rate?.available);

    result.innerHTML = `
      <p class="fpg-hire-calc__span"><strong>${this.days} day${this.days === 1 ? '' : 's'}</strong>: ${nice.format(start)} to ${nice.format(end)}</p>
      <ul class="fpg-hire-calc__lines">${lines
        .map((line) => `<li><span>${line.label}${line.qty > 1 ? ` × ${line.qty}` : ''}</span><span>${m((line.rate?.price || 0) * line.qty)}</span></li>`)
        .join('')}</ul>
      <dl class="fpg-hire-calc__total">
        <div><dt>Hire (Ex. VAT)</dt><dd>${m(total)}</dd></div>
        <div><dt>VAT (${rate}%)</dt><dd>${m(vat)}</dd></div>
        <div class="fpg-hire-calc__grand"><dt>Total</dt><dd>${m(total + vat)}</dd></div>
      </dl>
      ${saving > 0 ? `<p class="fpg-hire-calc__saving">Best price applied: you save ${m(saving)} on the daily rate.</p>` : ''}
      ${bookable ? '' : '<p class="fpg-hire-calc__ask">This machine can\'t be booked online for now. Send us a request below and we\'ll confirm availability.</p>'}`;

    if (bookArea instanceof HTMLElement) bookArea.hidden = !bookable;
    const request = this.querySelector('[data-request]');
    if (request instanceof HTMLDetailsElement && !bookable) request.open = true;
    this.#fill('[data-field-dates]', `${nice.format(start)} to ${nice.format(end)} (${this.days} day${this.days === 1 ? '' : 's'})`);
    this.#fill('[data-field-estimate]', `${m(total)} + VAT (${m(total + vat)})`);
  }

  /** @param {string} selector @param {string} value */
  #fill(selector, value) {
    const input = this.querySelector(selector);
    if (input instanceof HTMLInputElement) input.value = value;
  }

  async #book() {
    const start = parse(/** @type {HTMLInputElement} */ (this.querySelector('[data-start]')).value);
    const end = parse(/** @type {HTMLInputElement} */ (this.querySelector('[data-end]')).value);
    if (!start || !end || !this.lines.length) return;
    const properties = {
      'Hire from': nice.format(start),
      'Hire to': nice.format(end),
      'Hire length': `${this.days} day${this.days === 1 ? '' : 's'}`,
    };
    const button = this.querySelector('[data-book]');
    const message = this.querySelector('[data-message]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    if (message) message.textContent = 'Adding your hire…';
    try {
      await tools().addItemsToCart(
        this.lines.filter((l) => l.rate).map((line) => ({ id: /** @type {any} */ (line.rate).id, quantity: line.qty, properties })),
        this
      );
      if (message) message.textContent = 'Your hire is in the basket. Choose "Pickup" at checkout.';
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  }
}

if (!customElements.get('fpg-hire-calculator')) customElements.define('fpg-hire-calculator', FpgHireCalculator);
