import { Component } from '@theme/component';
import { morph } from '@theme/morph';
import { StandardEvents, ProductSelectEvent } from '@shopify/events';

/**
 * FP&G variant-aware block wrapper.
 *
 * Wraps FP&G product-page blocks (stock status, product notices, Cormorant,
 * variant "pairs well with"). Their content is rendered in Liquid for the
 * selected variant; when the shopper picks another variant, Horizon's variant
 * picker fetches the section HTML and fires a product select event. This
 * component finds its own block in that HTML and morphs its children, so the
 * Liquid stays the single source of truth (same pattern as product-inventory.js).
 *
 * It also owns two behaviours inside FP&G blocks:
 * - Delay notices: elements with [data-fpg-until="YYYY-MM-DD"] are shown only
 *   while today's UK date is on or before that date.
 * - Cormorant availability check: a click on [data-fpg-availability-button]
 *   asks the Cormorant server for the supplier's live availability for the SKU
 *   held on the surrounding [data-fpg-availability] element.
 *
 * Markup contract:
 *   <fpg-variant-block data-block-id="{{ block.id }}" data-product-id="{{ product.id }}">…</fpg-variant-block>
 */
class FpgVariantBlock extends Component {
  /** @type {AbortController | null} */
  #listeners = null;

  /** @type {AbortController | null} */
  #request = null;

  connectedCallback() {
    super.connectedCallback();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    const closestSection = this.closest('.shopify-section, dialog');
    closestSection?.addEventListener(StandardEvents.productSelect, this.#handleProductSelect, { signal });
    this.addEventListener('click', this.#handleClick, { signal });

    this.#applyDateRules();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#listeners?.abort();
    this.#listeners = null;
    this.#request?.abort();
    this.#request = null;
  }

  /**
   * Replaces this block's children with the freshly rendered ones for the new variant.
   * @param {ProductSelectEvent} event - The product select event.
   */
  #handleProductSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;
    if (!event.promise) return;

    event.promise
      .then(({ detail }) => {
        if (!detail?.html) return;

        const { html, newProduct } = detail;

        if (newProduct) {
          this.dataset.productId = newProduct.id;
        } else if (detail.productId && String(detail.productId) !== this.dataset.productId) {
          return;
        }

        const blockId = this.dataset.blockId;
        if (!blockId) return;

        const fresh = html.querySelector(`fpg-variant-block[data-block-id="${CSS.escape(blockId)}"]`);
        if (!fresh) return;

        this.#request?.abort();
        morph(this, fresh, { childrenOnly: true });
        this.#applyDateRules();
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[fpg-variant-block] Event promise rejected:', error);
      });
  };

  /**
   * Shows delay notices that are still current in UK time and hides their container when none are.
   */
  #applyDateRules() {
    const today = todayInLondon();

    for (const group of this.querySelectorAll('[data-fpg-dated-group]')) {
      let visible = 0;
      for (const item of group.querySelectorAll('[data-fpg-until]')) {
        const until = item.getAttribute('data-fpg-until') || '';
        const show = until >= today;
        item.hidden = !show;
        if (show) visible += 1;
      }
      if (group instanceof HTMLElement) group.hidden = visible === 0;
    }
  }

  /**
   * Routes clicks on the Cormorant availability button.
   * @param {MouseEvent} event - The click event.
   */
  #handleClick = (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest('[data-fpg-availability-button]');
    if (!(button instanceof HTMLButtonElement)) return;

    const root = button.closest('[data-fpg-availability]');
    if (!(root instanceof HTMLElement)) return;

    this.#checkAvailability(root, button);
  };

  /**
   * Asks the Cormorant server for live manufacturer availability.
   * @param {HTMLElement} root - The availability wrapper holding the data attributes.
   * @param {HTMLButtonElement} button - The button that was pressed.
   */
  async #checkAvailability(root, button) {
    const output = root.querySelector('[data-fpg-availability-result]');
    if (!(output instanceof HTMLElement)) return;

    const sku = root.dataset.sku || '';
    const supplier = root.dataset.supplier || '';
    let base = (root.dataset.endpoint || '').trim().replace(/\/+$/, '');
    if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;

    if (!base) {
      showResult(output, 'no', root.dataset.textNotConfigured || 'Availability check not configured.');
      return;
    }
    if (!sku) {
      showResult(output, 'no', root.dataset.textUnavailable || 'Currently unavailable');
      return;
    }

    this.#request?.abort();
    this.#request = new AbortController();

    button.disabled = true;
    showResult(output, 'loading', root.dataset.textChecking || 'Checking…');

    try {
      const url = new URL(`${base}/availability`);
      url.searchParams.set('supplier', supplier);
      url.searchParams.set('sku', sku);

      const response = await fetch(url, { mode: 'cors', signal: this.#request.signal });
      const data = await response.json();
      renderStatus(output, root, data?.status, data?.etaDate);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      showResult(output, 'no', root.dataset.textError || "Couldn't check availability right now");
    } finally {
      button.disabled = false;
    }
  }
}

/**
 * Today's date in Britain as YYYY-MM-DD, wherever the shopper is.
 * @returns {string}
 */
function todayInLondon() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    /** @param {string} type */
    const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}

/**
 * @param {HTMLElement} output - The result element.
 * @param {string} state - One of in, order, no, loading.
 * @param {string} text - The message to show.
 */
function showResult(output, state, text) {
  output.dataset.state = state;
  output.textContent = text;
}

/**
 * @param {HTMLElement} output - The result element.
 * @param {HTMLElement} root - The availability wrapper holding the message texts.
 * @param {string | undefined} status - Status returned by the Cormorant server.
 * @param {string | undefined} etaDate - Expected date, when the item is available to order.
 */
function renderStatus(output, root, status, etaDate) {
  if (status === 'in-stock') {
    showResult(output, 'in', root.dataset.textInStock || 'In stock');
    return;
  }

  if (status === 'available-to-order') {
    let text = root.dataset.textToOrder || 'Available to order';
    if (etaDate) {
      const date = new Date(etaDate);
      if (!Number.isNaN(date.getTime())) {
        const expected = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        text += ` — ${root.dataset.textExpected || 'expected'} ${expected}`;
      }
    }
    showResult(output, 'order', text);
    return;
  }

  if (status === 'unavailable') {
    showResult(output, 'no', root.dataset.textUnavailable || 'Currently unavailable');
    return;
  }

  showResult(output, 'no', root.dataset.textError || "Couldn't check availability right now");
}

if (!customElements.get('fpg-variant-block')) {
  customElements.define('fpg-variant-block', FpgVariantBlock);
}
