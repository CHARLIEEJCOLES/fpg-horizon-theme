/**
 * FP&G design behaviours. Loaded on every page from snippets/fpg-head-scripts.liquid.
 * No dependencies, so it doesn't rely on Horizon's import map.
 *
 * - <fpg-back-to-top>       round "back to top" button (sections/fpg-back-to-top.liquid)
 * - <fpg-countdown>         promotion countdown in UK time (blocks/fpg-countdown.liquid)
 * - <fpg-recently-viewed>   "Recently viewed" row on product pages (sections/fpg-recently-viewed.liquid)
 * - Menu promo cards copied into the desktop menu dropdowns (sections/fpg-menu-promos.liquid)
 * - Gentle fade-up of page sections as they scroll into view (skipped in the theme editor and
 *   for shoppers who ask for reduced motion; content is never hidden without this script).
 */

const UK_TIME_ZONE = 'Europe/London';
const VIEWED_KEY = 'fpg:recently-viewed';
const VIEWED_MAX = 20;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs once the page has loaded and the browser has a quiet moment. @param {() => void} fn */
const afterLoad = (fn) => {
  const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 2500 }) : window.setTimeout(fn, 200));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
};
const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ */
/* Back to top                                                         */
/* ------------------------------------------------------------------ */

class FpgBackToTop extends HTMLElement {
  /** @type {AbortController | null} */
  #listeners = null;
  #ticking = false;

  connectedCallback() {
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    window.addEventListener('scroll', this.#onScroll, { passive: true, signal });
    this.querySelector('button')?.addEventListener('click', this.#onClick, { signal });
    this.#update();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#listeners = null;
  }

  #onScroll = () => {
    if (this.#ticking) return;
    this.#ticking = true;
    requestAnimationFrame(() => {
      this.#ticking = false;
      this.#update();
    });
  };

  #update() {
    // Phones: appear later, so the arrow doesn't sit over the page from the first scroll.
    const base = Number(this.dataset.threshold || 700);
    const threshold = window.matchMedia('(max-width: 749px)').matches ? base * 2.5 : base;
    this.toggleAttribute('data-visible', window.scrollY > threshold);
  }

  #onClick = () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    const target = document.getElementById('MainContent');
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  };
}

/* ------------------------------------------------------------------ */
/* Countdown (UK time)                                                 */
/* ------------------------------------------------------------------ */

/**
 * How far UK local time is ahead of UTC at a given instant, in milliseconds.
 * @param {number} epoch
 */
function ukOffset(epoch) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epoch));
  const get = (/** @type {string} */ type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/**
 * Converts a UK date ("YYYY-MM-DD") and time ("HH:MM") into a timestamp.
 * @param {string} date
 * @param {string} time
 */
function ukToEpoch(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) return NaN;
  const t = /^(\d{1,2}):(\d{2})$/.exec((time || '23:59').trim()) || [null, '23', '59'];
  const wallClock = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let epoch = wallClock - ukOffset(wallClock);
  const check = ukOffset(epoch);
  if (wallClock - check !== epoch) epoch = wallClock - check;
  return epoch;
}

class FpgCountdown extends HTMLElement {
  /** @type {number | undefined} */
  #timer;
  #end = NaN;

  connectedCallback() {
    this.#end = ukToEpoch(this.dataset.date || '', this.dataset.time || '23:59');
    if (Number.isNaN(this.#end)) return;
    this.#tick();
    this.#timer = window.setInterval(() => this.#tick(), 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this.#timer);
  }

  #tick() {
    const left = this.#end - Date.now();
    if (left <= 0) {
      window.clearInterval(this.#timer);
      this.#finish();
      return;
    }
    const total = Math.floor(left / 1000);
    const days = Math.floor(total / 86400);
    const values = {
      d: String(days),
      h: pad2(Math.floor((total % 86400) / 3600)),
      m: pad2(Math.floor((total % 3600) / 60)),
      s: pad2(total % 60),
    };
    for (const [unit, value] of Object.entries(values)) {
      const el = this.querySelector(`[data-unit="${unit}"]`);
      if (el && el.textContent !== value) el.textContent = value;
    }
    const dayWrap = this.querySelector('[data-unit-wrap="d"]');
    if (dayWrap instanceof HTMLElement) dayWrap.hidden = days === 0;
    this.dataset.state = 'running';
    this.hidden = false;
  }

  #finish() {
    if (this.dataset.expired === 'message') {
      this.dataset.state = 'finished';
      this.hidden = false;
    } else {
      this.hidden = true;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Recently viewed                                                     */
/* ------------------------------------------------------------------ */

/** @returns {string[]} */
function readViewed() {
  try {
    const list = JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]');
    return Array.isArray(list) ? list.map(String).filter((id) => /^\d+$/.test(id)) : [];
  } catch {
    return [];
  }
}

/** @param {string[]} list */
function writeViewed(list) {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(list.slice(0, VIEWED_MAX)));
  } catch {
    /* storage unavailable (private mode): the row simply stays hidden */
  }
}

/**
 * Products set to "Request Quote" in the Call for Price app keep their price hidden.
 * The app only knows Horizon's own product cards, so the fetched cards are handled here,
 * using the app's own product list and button wording.
 * @param {HTMLElement} card
 * @param {string} id
 */
function hideQuotePrice(card, id) {
  /** @type {any} */
  const win = window;
  const list = String(win.cfp_products?.products || '').split(',');
  if (!list.includes(id)) return;
  const price = card.querySelector('.fpg-mini-card__price');
  const href = card.querySelector('a')?.getAttribute('href');
  if (!price) return;
  const label = String(win.cfp_configuration?.callforprice_label || '').trim() || 'Request a quote';
  const link = document.createElement('a');
  link.className = 'fpg-mini-card__quote';
  link.href = href || '#';
  link.textContent = label;
  price.replaceChildren(link);
}

class FpgRecentlyViewed extends HTMLElement {
  connectedCallback() {
    const current = this.dataset.productId || '';
    const limit = Number(this.dataset.limit || 8);
    const viewed = readViewed();
    const others = viewed.filter((id) => id !== current).slice(0, limit);

    if (current && !window.Shopify?.designMode) writeViewed([current, ...viewed.filter((id) => id !== current)]);
    // The row sits at the foot of the page, so its search waits until the page has loaded.
    if (others.length) afterLoad(() => this.#render(others));
  }

  /** @param {string[]} ids */
  async #render(ids) {
    const track = this.querySelector('[data-fpg-rv-track]');
    if (!track) return;

    const url = new URL(this.dataset.searchUrl || '/search', window.location.origin);
    url.searchParams.set('q', ids.map((id) => `id:${id}`).join(' OR '));
    url.searchParams.set('type', 'product');
    url.searchParams.set('section_id', 'fpg-recently-viewed');

    try {
      const response = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!response.ok) return;
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      /** @type {Map<string, Element>} */
      const cards = new Map();
      for (const card of doc.querySelectorAll('[data-fpg-rv-card]')) {
        if (card instanceof HTMLElement && card.dataset.productId) cards.set(card.dataset.productId, card);
      }
      track.replaceChildren();
      for (const id of ids) {
        const card = cards.get(id);
        if (!card) continue;
        const copy = /** @type {HTMLElement} */ (document.importNode(card, true));
        hideQuotePrice(copy, id);
        track.append(copy);
      }
      if (track.children.length > 0) this.hidden = false;
    } catch (error) {
      console.warn('[fpg-recently-viewed]', error);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fade-up on scroll                                                   */
/* ------------------------------------------------------------------ */

function initReveal() {
  const root = document.documentElement;
  if (root.classList.contains('shopify-design-mode') || window.Shopify?.designMode) return;
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;

  const viewportHeight = window.innerHeight;
  const sections = Array.from(document.querySelectorAll('#MainContent > .shopify-section')).filter(
    (section) => section.getBoundingClientRect().top > viewportHeight * 0.9
  );
  if (!sections.length) return;

  for (const section of sections) section.classList.add('fpg-reveal');
  root.classList.add('fpg-reveal-ready');

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target;
        section.classList.add('is-visible');
        observer.unobserve(section);
        // Drop the transform once the animation is done so sticky/fixed children behave normally.
        section.addEventListener('transitionend', () => section.classList.add('is-settled'), { once: true });
        window.setTimeout(() => section.classList.add('is-settled'), 900);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
  );

  for (const section of sections) observer.observe(section);
}

/* ------------------------------------------------------------------ */
/* Menu promos (sections/fpg-menu-promos.liquid)                       */
/* ------------------------------------------------------------------ */

/**
 * Copies the matching promo card into a top-level menu item's desktop dropdown.
 * Horizon's header can redraw its menu after the page loads, so the card is
 * (re)added whenever a menu item is hovered or focused.
 * @param {Element} item - A top-level .menu-list__list-item
 */
function ensureMenuPromo(item) {
  const grid = item.querySelector('.mega-menu__grid');
  if (!grid || grid.querySelector(':scope > .fpg-menu-promo')) return;
  const title = item.querySelector('.menu-list__link-title')?.textContent?.trim().toLowerCase();
  if (!title) return;
  const template = document.querySelector(`template[data-fpg-menu-promo="${CSS.escape(title)}"]`);
  if (!(template instanceof HTMLTemplateElement)) return;
  const card = template.content.firstElementChild?.cloneNode(true);
  if (!(card instanceof HTMLElement)) return;
  card.dataset.fpgInjected = '';
  for (const img of card.querySelectorAll('img[data-fpg-src]')) {
    if (img.dataset.fpgSrcset) img.setAttribute('srcset', img.dataset.fpgSrcset);
    img.setAttribute('src', img.dataset.fpgSrc || '');
    img.removeAttribute('data-fpg-srcset');
    img.removeAttribute('data-fpg-src');
  }
  grid.append(card);
  if (card.dataset.fpgReplaces) standIn(grid, card.dataset.fpgReplaces);
}

/**
 * A parts panel stands in for one of the dropdown's columns on desktop ("Find a Part"),
 * so its links aren't listed twice. The column is hidden and the grid loses its track.
 * @param {Element} grid
 * @param {string} title
 */
function standIn(grid, title) {
  const column = [...grid.querySelectorAll('.mega-menu__column')].find(
    (col) => col.querySelector('.mega-menu__link')?.textContent?.trim().toLowerCase() === title
  );
  if (!(column instanceof HTMLElement) || !(grid instanceof HTMLElement)) return;
  const spanOf = (/** @type {Element} */ col) => Number(col.className.match(/mega-menu__column--span-(\d)/)?.[1] || 1);
  const others = [...grid.querySelectorAll('.mega-menu__column')].filter((col) => col !== column);
  if (!others.length) return;
  const used = String(others.reduce((n, col) => n + spanOf(col), 0));
  const list = column.closest('[data-menu-list-id]');
  column.dataset.fpgStoodIn = '';
  column.hidden = true;
  /* The remaining columns and the panel share the width, with no empty tracks between them. */
  for (const el of [grid, list]) {
    if (!(el instanceof HTMLElement)) continue;
    el.dataset.fpgStandIn = '';
    el.style.setProperty('--menu-columns-desktop', used);
  }
}

function undoStandIns() {
  for (const column of document.querySelectorAll('[data-fpg-stood-in]')) {
    if (!(column instanceof HTMLElement)) continue;
    column.hidden = false;
    delete column.dataset.fpgStoodIn;
  }
  for (const grid of document.querySelectorAll('[data-fpg-stand-in]')) {
    if (!(grid instanceof HTMLElement)) continue;
    grid.style.removeProperty('--menu-columns-desktop');
    delete grid.dataset.fpgStandIn;
  }
}

/*
 * The cards only show in the desktop dropdowns (fpg-design.css), so phones never place them.
 * Shoppers get a card when they first hover or tab to its menu item, so its picture isn't
 * downloaded with the page; the theme editor places them all straight away for previewing.
 */
const desktopMenu = window.matchMedia('(min-width: 990px)');

function initMenuPromos() {
  for (const old of document.querySelectorAll('.fpg-menu-promo[data-fpg-injected]')) old.remove();
  undoStandIns();
  if (!desktopMenu.matches || !window.Shopify?.designMode) return;
  for (const item of document.querySelectorAll('#header-component .menu-list__list-item')) ensureMenuPromo(item);
}

/** @param {Event} event */
function onMenuIntent(event) {
  if (!desktopMenu.matches) return;
  const item = event.target instanceof Element ? event.target.closest('#header-component .menu-list__list-item') : null;
  if (item) ensureMenuPromo(item);
}

document.addEventListener('pointerover', onMenuIntent, { passive: true });
document.addEventListener('focusin', onMenuIntent);
window.addEventListener('load', initMenuPromos, { once: true });
desktopMenu.addEventListener('change', initMenuPromos);

/* ------------------------------------------------------------------ */

if (!customElements.get('fpg-back-to-top')) customElements.define('fpg-back-to-top', FpgBackToTop);
if (!customElements.get('fpg-countdown')) customElements.define('fpg-countdown', FpgCountdown);
if (!customElements.get('fpg-recently-viewed')) customElements.define('fpg-recently-viewed', FpgRecentlyViewed);

function init() {
  initMenuPromos();
  initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Theme editor: redraw the menu promos when their section or the header is edited.
document.addEventListener('shopify:section:load', initMenuPromos);
document.addEventListener('shopify:section:unload', () => window.setTimeout(initMenuPromos, 0));
