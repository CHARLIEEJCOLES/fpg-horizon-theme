/*
 * Brands left out of the parts finder (section setting "Brands to leave out", data-hidden-brands).
 * After fpg-parts.js has joined the Part Finder app's brands with the makers' files (mergeMaker),
 * these brands and their machines are dropped, so they don't show in the brands grid, the search
 * or links. Kept apart from fpg-parts.js so the list's handling can change without touching it.
 */
const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Drops the hidden brands from one finder's data. True if anything was dropped. */
function hideBrands(/** @type {any} */ finder) {
  const hide = new Set(
    String(finder.dataset.hiddenBrands || '')
      .split(/[\r\n,]+/)
      .map((line) => squash(line.replace(/^\s*\*/, '')))
      .filter(Boolean)
  );
  const data = finder.data;
  if (!data || !hide.size) return false;
  const gone = new Set(data.brands.filter((/** @type {any} */ b) => hide.has(squash(b.name))));
  if (!gone.size) return false;
  data.brands = data.brands.filter((/** @type {any} */ b) => !gone.has(b));
  data.models = data.models.filter((/** @type {any} */ m) => !gone.has(m.type.brand));
  return true;
}

customElements.whenDefined('fpg-parts-finder').then(() => {
  const Finder = /** @type {any} */ (customElements.get('fpg-parts-finder'));
  const merge = Finder?.prototype.mergeMaker;
  if (typeof merge !== 'function' || merge.fpgHides) return;
  /** @this {any} */
  function mergeAndHide() {
    merge.call(this);
    hideBrands(this);
  }
  mergeAndHide.fpgHides = true;
  Finder.prototype.mergeMaker = mergeAndHide;
  /* If a finder got its data before this file arrived, tidy it now and redraw the page it's on. */
  for (const el of document.querySelectorAll('fpg-parts-finder')) {
    if (hideBrands(el) && typeof (/** @type {any} */ (el).route) === 'function') /** @type {any} */ (el).route(false);
  }
});
