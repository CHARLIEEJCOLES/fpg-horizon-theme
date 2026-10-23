/**
 * FP&G look, round 3 (loaded by snippets/fpg-head-scripts.liquid).
 * - Parts finder: the Year/Make/Model app labels its fourth dropdown
 *   "Please Select" (it holds the part category). Rename it "Part type",
 *   and keep it renamed when the app redraws its options.
 * - Phone menu footer: copies the template from sections/fpg-phone-bar.liquid
 *   into the menu drawer and fills in today's opening status.
 * - Sticky Add to basket bar: hidden on products the Call for Price app
 *   marks as quote-only, so the bar never shows a price the page hides.
 */

const RENAMES = [['Please Select', 'Part type']];

/** @param {ParentNode} root */
function renameFinderFields(root) {
  for (const label of root.querySelectorAll('.ymm_label')) {
    for (const [from, to] of RENAMES) {
      if (label.textContent?.trim() === from) label.textContent = to;
    }
  }
  for (const option of root.querySelectorAll('select.ymm-filter option')) {
    for (const [from, to] of RENAMES) {
      const old = `Select ${from}`;
      if (option.textContent?.trim() === old) option.textContent = `Select ${to.toLowerCase()}`;
    }
  }
}

function watchFinder() {
  const form = document.getElementById('ymm_form');
  if (!form) return false;
  renameFinderFields(form);
  new MutationObserver(() => renameFinderFields(form)).observe(form, { childList: true, subtree: true });
  return true;
}

// The app builds its form after load, so look for it for a few seconds.
if (!watchFinder()) {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (watchFinder() || tries > 20) clearInterval(timer);
  }, 500);
}

function hideStickyForQuotes() {
  const sticky = document.querySelector('sticky-add-to-cart');
  if (!(sticky instanceof HTMLElement)) return;
  /** @type {any} */
  const win = window;
  const list = String(win.cfp_products?.products || '').split(',');
  if (list.includes(String(sticky.dataset.productId))) sticky.hidden = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideStickyForQuotes);
} else {
  hideStickyForQuotes();
}
window.addEventListener('load', hideStickyForQuotes);

/* ------------------------------------------------------------------ */
/* Round 4: phone menu footer (template in sections/fpg-phone-bar.liquid) */
/* ------------------------------------------------------------------ */

/** Opening status in UK time: Mon–Fri 8am–5pm. */
function fpgOpenStatus() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (/** @type {string} */ type) => parts.find((p) => p.type === type)?.value || '';
  const day = get('weekday');
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day);
  const open = weekday && minutes >= 480 && minutes < 1020;
  let text = 'Closed, opens 8am tomorrow';
  if (open) text = 'Open now until 5pm';
  else if (weekday && minutes < 480) text = 'Opens today at 8am';
  else if (day === 'Fri' || day === 'Sat' || day === 'Sun') text = 'Closed, opens Monday 8am';
  return { open, text };
}

/** @param {ParentNode} root */
function applyOpenStatus(root) {
  const { open, text } = fpgOpenStatus();
  for (const el of root.querySelectorAll('[data-fpg-open-status]')) el.textContent = text;
  for (const dot of root.querySelectorAll('[data-fpg-open-dot]')) dot.classList.toggle('is-open', open);
}

function addDrawerHelp() {
  const template = document.getElementById('fpg-drawer-help');
  const target = document.querySelector('.menu-drawer__utility-links');
  if (!(template instanceof HTMLTemplateElement) || !target || target.querySelector('.fpg-drawerhelp')) return;
  const help = template.content.firstElementChild?.cloneNode(true);
  if (!(help instanceof HTMLElement)) return;
  applyOpenStatus(help);
  target.append(help);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addDrawerHelp);
} else {
  addDrawerHelp();
}
// Horizon can redraw the header; add the footer again when the menu is opened.
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('.header__icon--menu, [aria-controls*="menu-drawer" i], summary')) {
    window.setTimeout(addDrawerHelp, 0);
  }
});
document.addEventListener('shopify:section:load', addDrawerHelp);
