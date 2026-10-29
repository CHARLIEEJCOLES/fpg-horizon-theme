/**
 * Shared helpers for the FP&G shopping tools (kit builder, service finder,
 * hire calculator). Exposed on window.FPGTools so each tool's script can use
 * them without relying on the theme's import map. Load this module before
 * the tool's own script.
 */

const CURRENCY = window.Shopify?.currency?.active || 'GBP';
const moneyFormat = new Intl.NumberFormat('en-GB', { style: 'currency', currency: CURRENCY });

/** @param {number} pence */
const money = (pence) => moneyFormat.format(pence / 100);

/** @param {string} value */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/**
 * Adds several variants to the cart in one request and tells the theme's
 * cart drawer and cart icon, the same way Horizon's own product form does.
 * @param {Array<{id: number, quantity: number, properties?: Record<string, string>}>} items
 * @param {HTMLElement} source - Element the cart event is dispatched from
 */
async function addItemsToCart(items, source) {
  /** @type {any} */
  const win = window;
  const routes = win.Theme?.routes || {};
  const addUrl = routes.cart_add_url || '/cart/add.js';
  const cartUrl = `${routes.cart_url || '/cart'}.js`;
  const sections = Array.from(document.querySelectorAll('cart-items-component'))
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : ''))
    .filter(Boolean)
    .join(',');

  /** @type {any} */
  let events = null;
  try {
    events = await import('@shopify/events');
  } catch {
    events = null;
  }
  const deferred = events?.CartLinesUpdateEvent?.createPromise?.();
  if (deferred) {
    source.dispatchEvent(
      new events.CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferred.promise,
      })
    );
  }

  try {
    const response = await fetch(addUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items, sections }),
    });
    const result = await response.json();
    const cart = await fetch(cartUrl, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    deferred?.resolve({
      cart: events.CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        items: cart.items,
        source: 'fpg-tools',
        sourceId: source.id || 'fpg-tools',
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        sections: result.sections,
        didError: Boolean(result.status),
      },
    });
    if (result.status) throw new Error(result.description || result.message || 'Could not add to the basket.');
    return cart;
  } catch (error) {
    deferred?.reject?.(error);
    throw error;
  }
}

/**
 * Sets one basket line's quantity (0 removes it) and tells the theme's cart
 * drawer and cart icon, the same way Horizon's cart does.
 * @param {string} key - The line's key from /cart.js
 * @param {number} quantity
 * @param {HTMLElement} source - Element the cart event is dispatched from
 */
async function setLineQuantity(key, quantity, source) {
  /** @type {any} */
  const win = window;
  const routes = win.Theme?.routes || {};
  const changeUrl = routes.cart_change_url || '/cart/change.js';
  const sections = Array.from(document.querySelectorAll('cart-items-component'))
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : ''))
    .filter(Boolean)
    .join(',');

  /** @type {any} */
  let events = null;
  try {
    events = await import('@shopify/events');
  } catch {
    events = null;
  }
  const deferred = events?.CartLinesUpdateEvent?.createPromise?.();
  if (deferred) {
    source.dispatchEvent(
      new events.CartLinesUpdateEvent({
        action: quantity > 0 ? 'update' : 'remove',
        context: 'product',
        lines: [{ id: key, quantity }],
        promise: deferred.promise,
      })
    );
  }

  try {
    const response = await fetch(changeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity, sections, sections_url: window.location.pathname }),
    });
    const cart = await response.json();
    if (!response.ok || cart.status || cart.errors) throw new Error(cart.description || cart.message || cart.errors || 'Could not change the basket.');
    deferred?.resolve({
      cart: events.CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: {
        items: cart.items,
        source: 'fpg-tools',
        sourceId: source.id || 'fpg-tools',
        itemCount: cart.item_count,
        sections: cart.sections,
        didError: false,
      },
    });
    return cart;
  } catch (error) {
    deferred?.reject?.(error);
    throw error;
  }
}

/**
 * True when the Call for Price app hides this product's price.
 * @param {string} productId
 */
function isQuoteOnly(productId) {
  /** @type {any} */
  const win = window;
  return String(win.cfp_products?.products || '')
    .split(',')
    .includes(String(productId));
}

/** @type {any} */ (window).FPGTools = { money, escapeHtml, addItemsToCart, setLineQuantity, isQuoteOnly };
