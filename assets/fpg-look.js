/**
 * FP&G look, round 3 (loaded by snippets/fpg-head-scripts.liquid).
 * - Parts finder: the Year/Make/Model app labels its fourth dropdown
 *   "Please Select" (it holds the part category). Rename it "Part type",
 *   and keep it renamed when the app redraws its options.
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
