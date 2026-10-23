/**
 * FP&G "Save to My machines" button on product pages
 * (blocks/fpg-parts-link.liquid). Works out which machine the product is
 * from its brand and title (the parts finder's matcher in assets/fpg-parts.js)
 * and adds it to the same list the My machines page and the parts finder use.
 * Signed-in customers get it moved onto their account the next time they open
 * My machines. Shows nothing when the product isn't a listed machine.
 */

const KEY = 'fpg-my-machines';

const readIds = () => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};

const writeIds = (/** @type {number[]} */ ids) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
};

class FpgSaveMachine extends HTMLElement {
  async connectedCallback() {
    try {
      const lib = await import(/** @type {string} */ (this.dataset.partsScript));
      const data = await lib.loadIndex(this.dataset.index || '');
      const model = lib.findMachine(data, this.dataset.vendor || '', this.dataset.title || '');
      if (!model) return;
      this.modelId = model.id;
      this.label = `${model.type.brand.name} ${model.name}`;
      this.button = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-save]'));
      this.button?.addEventListener('click', () => this.toggle());
      this.update();
      this.hidden = false;
    } catch (error) {
      console.warn('[FP&G save machine]', error);
    }
  }

  update() {
    const saved = readIds().includes(Number(this.modelId));
    this.dataset.saved = String(saved);
    if (!this.button) return;
    this.button.setAttribute('aria-pressed', String(saved));
    const text = this.button.querySelector('[data-text]');
    if (text) text.textContent = saved ? `${this.label} is in My machines` : `Save ${this.label} to My machines`;
  }

  toggle() {
    const ids = readIds();
    const id = Number(this.modelId);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];
    if (!writeIds(next)) return;
    this.update();
  }
}

if (!customElements.get('fpg-save-machine')) customElements.define('fpg-save-machine', FpgSaveMachine);
