/*
 * FP&G parts finder: stock lights, and our own prices on the makers' parts lists.
 * Loaded by fpg-parts-hide.js (import), so it needs no change to the section.
 *
 * 1. Stock lights. Every stock badge (.fpg-pf-stock) gets a traffic light, from what the badge says:
 *    green  in stock with us, or our supplier has it ("We can order it in")
 *    amber  we can get it but it isn't on a shelf yet ("Order in", "Can order in", "Not sold online" / ask us)
 *    red    out of stock at our supplier, out of stock with us and not orderable, or discontinued
 *
 * 2. Our prices. Rows in the drawing viewer for parts that aren't Shopify products (the "Ask for a price" / "Ask us"
 *    rows) get FP&G's own selling price for the part number (or for the part that replaced it): Brightpearl's FPG
 *    RETAIL price where it has one, otherwise the supplier's trade price plus our markup (+£6 under £10, +£10 to £50,
 *    +£15 to £120, +£20 above), worked out before the file is written. The file never holds trade or cost prices.
 *    Data: Content > Files > fpg-bp-prices.json  { "at": "2026-11-06", "p": { "PARTNO": pence incl. VAT } }
 *    Read through the shop's own /cdn/shop/files/ path with a 10-minute key: Shopify's CDN keeps serving the first copy
 *    it saw for an address, so a replaced file (the scheduled refresh) shows within 10 minutes.
 *    Scheppach and Echo rows are left to fpg-scheppach-prices.js first; a row it found no price for can get ours.
 */

/* ---------- 1. Stock lights ---------- */
const lightOf = (/** @type {Element} */ badge) => {
  const text = (badge.textContent || '').trim();
  if (/^(out of stock|discontinued)/i.test(text)) return 'red';
  if (/^we can order it in$/i.test(text) || /\bin stock$/i.test(text)) return 'green';
  return 'amber';
};

const light = (/** @type {ParentNode} */ root) => {
  for (const badge of root.querySelectorAll('.fpg-pf-stock')) {
    const was = badge.getAttribute('data-light');
    const now = lightOf(badge);
    if (was !== now) badge.setAttribute('data-light', now);
  }
};

const css = document.createElement('style');
css.textContent = `
  .fpg-pf-stock[data-light]::before { width: 9px; height: 9px; flex: none; box-shadow: 0 0 0 2px rgb(255 255 255 / 0.85); }
  .fpg-pf-stock[data-light='green']::before { background: #1f9d45; box-shadow: 0 0 0 2px rgb(255 255 255 / 0.85), 0 0 6px rgb(31 157 69 / 0.6); }
  .fpg-pf-stock[data-light='amber']::before { background: #f0a000; box-shadow: 0 0 0 2px rgb(255 255 255 / 0.85), 0 0 6px rgb(240 160 0 / 0.55); }
  .fpg-pf-stock[data-light='red']::before { background: #d6362a; box-shadow: 0 0 0 2px rgb(255 255 255 / 0.85), 0 0 6px rgb(214 54 42 / 0.5); }
  .fpg-pf-stock[data-light='green'] { background: #e6f4ea; color: #1c6b34; }
  .fpg-pf-stock[data-light='amber'] { background: #fbf1de; color: #7a5000; }
  .fpg-pf-stock[data-light='red'] { background: #fbeceb; color: #9b2c22; }
  .fpg-pf-part__price--bp { animation: fpg-bp-fade 0.3s ease-out; }
  @keyframes fpg-bp-fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .fpg-pf-part__price--bp { animation: none; } }
`;
document.head.append(css);

/* ---------- 2. Our prices ---------- */
/** @type {Record<string, number> | null} */
let prices = null;
/** @type {Promise<any> | null} */
let loading = null;
const pricesUrl = () => `/cdn/shop/files/fpg-bp-prices.json?t=${Math.floor(Date.now() / 600000)}`;
const load = () =>
  loading ||
  (loading = fetch(pricesUrl())
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => (prices = data?.p || {}))
    .catch(() => (prices = {})));

const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const money = (/** @type {number} */ pence) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const vatRate = (/** @type {Element} */ row) => Number(row.closest('fpg-parts-finder')?.getAttribute('data-vat') || 20);

/* fpg-parts.js writes a part number as "Part no. OLD" or "Part no. OLD · now NEW". */
const numbersOf = (/** @type {Element} */ row) => {
  const text = (row.querySelector('.fpg-pf-vrow__no')?.textContent || '').replace(/^\s*Part no\.\s*/, '');
  const [no, rest] = text.split('·');
  const now = ((rest || '').match(/\bnow\s+([^\s·]+)/) || [])[1] || '';
  return [no.trim(), now.trim()].filter(Boolean);
};

const priceFor = (/** @type {string[]} */ nos) => {
  for (const no of nos) {
    const p = prices?.[no] ?? prices?.[squash(no)];
    if (p) return p;
  }
  return 0;
};

const askLink = (/** @type {Element} */ buy) => [...buy.querySelectorAll('a, button')].find((el) => /Ask (us|for a price)/.test(el.textContent || ''));

const price = (/** @type {Element} */ row) => {
  const buy = row.querySelector('.fpg-pf-vrow__buy');
  if (!buy) return;
  /* A Shopify product (Add to basket), a price already shown, or the Scheppach script still checking. */
  if (buy.querySelector('[data-add], [data-buy], .fpg-pf-part__price, .fpg-pf-checking')) return;
  const inc = priceFor(numbersOf(row));
  row.setAttribute('data-fpg-bp', inc ? 'shown' : 'none');
  if (!inc) return;
  const ex = Math.round(inc / (1 + vatRate(row) / 100));
  const span = document.createElement('span');
  span.className = 'fpg-pf-part__price fpg-pf-part__price--maker fpg-pf-part__price--bp';
  span.innerHTML = `<strong>${money(ex)}</strong> <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(inc)})</span>`;
  const ask = askLink(buy);
  if (ask) {
    ask.textContent = (ask.textContent || '').replace(/Ask (us|for a price)/, 'Ask us to order');
    ask.before(span);
  } else buy.append(span);
  /* We sell it, so "Not sold online" becomes "Order in" (amber). */
  const badge = buy.querySelector('.fpg-pf-stock');
  if (badge && /not sold online/i.test(badge.textContent || '')) badge.textContent = 'Order in';
};

let queued = false;
const scan = () => {
  queued = false;
  light(document);
  const rows = [...document.querySelectorAll('.fpg-pf-v__list .fpg-pf-vrow:not([data-fpg-bp])')];
  if (!rows.length) return;
  if (!prices) {
    load().then(scan);
    return;
  }
  rows.forEach(price);
  light(document);
};
const schedule = () => {
  if (queued) return;
  queued = true;
  setTimeout(scan, 120);
};

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
schedule();
