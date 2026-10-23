/**
 * FP&G "My machines" page (sections/fpg-my-machines.liquid).
 *
 * A customer's machines, each with "Order parts" (straight to that machine in
 * the parts finder) and "Book a service" (the service finder, pre-filled).
 *
 * Where the list lives
 * - Signed in: the customer metafield fpg.machines (JSON), rendered into the
 *   page by Liquid. Changes are sent to the FPG Part Finder app's proxy
 *   (POST {proxy}/customer/machines), which saves them to the account. Shopify
 *   signs proxy requests with the signed-in customer, so nobody can change
 *   someone else's list. See fpg-tools/my-machines/APP-AND-POLLY.md.
 * - Machines bought from FP&G come from Polly through the same app
 *   (GET {proxy}/customer/owned-machines) and are marked "Bought from FP&G".
 * - Not signed in, or the app can't save yet: this browser (localStorage
 *   "fpg-my-machines", the same list the parts finder's "Save to my
 *   machines" button uses).
 *
 * Built to be hard to break: every change shows at once and can be undone,
 * a failed save falls back to this browser rather than losing anything,
 * bad stored data is ignored, and the add box works fully from the keyboard.
 */

/** @type {any} Shared helpers from assets/fpg-parts.js (loaded by its versioned URL). */
let lib = null;

const LOCAL_KEY = 'fpg-my-machines';
const PHOTO_KEY = 'fpg-mm-photos';
const MAX = 20;

const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esc = (/** @type {unknown} */ v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

function read(/** @type {string} */ key, /** @type {any} */ fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function write(/** @type {string} */ key, /** @type {any} */ value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing: the page still works for this visit */
  }
}

const readLocalIds = () => {
  const list = read(LOCAL_KEY, []);
  return Array.isArray(list) ? list.map(Number).filter(Number.isFinite) : [];
};

/**
 * @typedef {{ brand: string, type: string, model: string, modelId?: number, sku?: string, serial?: string, boughtOn?: string, source?: string, addedAt?: string }} Machine
 */

/** Keeps only well-formed machines, so a bad saved value can't break the page. */
function sanitise(/** @type {any} */ list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && typeof m === 'object' && String(m.model || '').trim())
    .slice(0, MAX)
    .map((m) => ({
      brand: String(m.brand || '').slice(0, 40),
      type: String(m.type || '').slice(0, 40),
      model: String(m.model || '').slice(0, 60),
      modelId: Number.isFinite(Number(m.modelId)) ? Number(m.modelId) : undefined,
      source: 'saved',
      addedAt: m.addedAt,
    }));
}

const ICON_X = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

class FpgMyMachines extends HTMLElement {
  /** @type {Machine[]} */
  saved = [];
  /** @type {Machine[]} */
  owned = [];
  /** @type {any} */
  index = null;
  signedIn = false;
  /** Whether changes are reaching the account (false = kept in this browser). */
  synced = false;
  active = -1;
  /** @type {{ list: Machine[], label: string } | null} */
  undo = null;

  get proxy() {
    return (this.dataset.proxy || '/apps/parts-finder').replace(/\/+$/, '');
  }

  async connectedCallback() {
    this.signedIn = this.dataset.signedIn === 'true';
    this.listEl = /** @type {HTMLElement} */ (this.querySelector('[data-list]'));
    this.statusEl = /** @type {HTMLElement} */ (this.querySelector('[data-status]'));
    this.input = /** @type {HTMLInputElement} */ (this.querySelector('[data-add-search]'));
    this.panel = /** @type {HTMLElement} */ (this.querySelector('[data-add-suggest]'));
    this.toast = /** @type {HTMLElement} */ (this.querySelector('[data-toast]'));
    this.quick = /** @type {HTMLElement} */ (this.querySelector('[data-quick]'));

    this.addEventListener('click', this.onClick);
    this.input?.addEventListener('input', () => this.suggest());
    this.input?.addEventListener('focus', () => this.input?.value && this.suggest());
    this.input?.addEventListener('keydown', this.onKey);
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node) || !this.querySelector('[data-addbox]')?.contains(e.target)) this.closePanel();
    });

    try {
      lib = await import(/** @type {string} */ (this.dataset.partsScript));
      this.index = await lib.loadIndex(this.dataset.index || '');
    } catch {
      this.index = { brands: [], models: [] };
    }

    if (this.signedIn) {
      try {
        this.saved = sanitise(JSON.parse(this.querySelector('[data-account-machines]')?.textContent || '[]'));
        this.synced = true;
      } catch {
        this.saved = [];
      }
      await this.mergeLocalIntoAccount();
      this.loadOwned();
    } else {
      this.saved = readLocalIds().map((id) => this.fromModelId(id)).filter(Boolean);
    }
    this.dataset.ready = 'true';
    this.render();
  }

  /* ------------------------------------------------------------ data */

  fromModelId(/** @type {number} */ id) {
    const m = this.index?.models.find((/** @type {any} */ x) => x.id === Number(id));
    if (!m) return null;
    return /** @type {Machine} */ ({ brand: m.type.brand.name, type: m.type.name, model: m.name, modelId: m.id, source: 'saved', addedAt: new Date().toISOString().slice(0, 10) });
  }

  async mergeLocalIntoAccount() {
    const add = readLocalIds()
      .map((id) => this.fromModelId(id))
      .filter((m) => m && !this.saved.some((s) => s.modelId === m.modelId));
    if (!add.length) return;
    const next = [...this.saved, .../** @type {Machine[]} */ (add)].slice(0, MAX);
    this.saved = next;
    if (await this.saveToAccount(next)) write(LOCAL_KEY, []);
    /* Account saving isn't available: keep showing them, and keep them in this browser. */ else this.synced = false;
  }

  async loadOwned() {
    try {
      const r = await fetch(`${this.proxy}/customer/owned-machines`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const data = await r.json();
      const list = Array.isArray(data?.machines) ? data.machines : [];
      this.owned = list
        .filter((/** @type {any} */ x) => x && x.name)
        .map((/** @type {any} */ x) => {
          const match = lib && this.index ? lib.findMachine(this.index, x.brand || '', `${x.brand || ''} ${x.name || ''}`) : null;
          return /** @type {Machine} */ ({
            brand: lib ? lib.brandName(x.brand || match?.type.brand.name || '') : String(x.brand || ''),
            type: match?.type.name || x.type || 'Machine',
            model: String(x.name).replace(/^(stihl|husqvarna)\s+/i, ''),
            modelId: match?.id,
            sku: x.sku,
            serial: x.serial,
            boughtOn: x.soldOn,
            source: 'purchase',
          });
        });
      this.render();
    } catch {
      /* owned machines are a bonus: the page works without them */
    }
  }

  async saveToAccount(/** @type {Machine[]} */ machines) {
    try {
      const r = await fetch(`${this.proxy}/customer/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ machines }),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Shows the change at once, then saves it. A failed account save keeps it in this browser. */
  async commit(/** @type {Machine[]} */ next) {
    this.saved = next;
    this.render();
    if (this.signedIn && this.synced) {
      if (!(await this.saveToAccount(next))) {
        this.synced = false;
        this.renderStatus();
      }
    }
    if (!this.signedIn || !this.synced) {
      write(LOCAL_KEY, next.map((m) => m.modelId).filter((x) => Number.isFinite(x)));
    }
  }

  /* ------------------------------------------------------------ links */

  partsUrl(/** @type {Machine} */ m) {
    const finder = this.dataset.finderUrl || '/pages/fpg-part-finder';
    const model = m.modelId ? this.index?.models.find((/** @type {any} */ x) => x.id === m.modelId) : null;
    if (model) return `${finder}?brand=${model.type.brand.id}&type=${model.type.id}&model=${model.id}`;
    return `${this.dataset.searchUrl || '/search'}?q=${encodeURIComponent(`${m.brand} ${m.model} parts`)}`;
  }

  serviceUrl(/** @type {Machine} */ m) {
    const base = this.dataset.serviceUrl || '/collections/servicing-repair';
    const p = new URLSearchParams({ machine: m.type || '', brand: m.brand || '', model: m.model || '' });
    if (m.serial) p.set('serial', m.serial);
    return `${base}${base.includes('?') ? '&' : '?'}${p}`;
  }

  /* ------------------------------------------------------------ photos */

  /**
   * A photo of the machine from the shop's own listing: the first product
   * whose brand and title name the same model (checked with the parts
   * finder's matcher, so a chain "for MS 261" doesn't count). Cached per model.
   */
  async photoFor(/** @type {Machine} */ m) {
    const key = `${m.brand}|${m.model}`;
    const cache = read(PHOTO_KEY, {});
    if (key in cache) return cache[key];
    let url = '';
    try {
      const q = encodeURIComponent(`${m.brand} ${m.model} ${m.type || ''}`.trim());
      const r = await fetch(`/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=10`);
      const products = (await r.json())?.resources?.results?.products || [];
      const typeWord = String(m.type || '').toLowerCase().split(/[\s&]+/)[0];
      const fits = products.filter((/** @type {any} */ p) => {
        if (!(p.image || p.featured_image?.url) || !p.title) return false;
        const found = lib && this.index ? lib.findMachine(this.index, p.vendor || m.brand, p.title) : null;
        return found ? squash(found.name) === squash(m.model) : squash(p.title).includes(squash(m.model));
      });
      const best = fits.find((/** @type {any} */ p) => typeWord && String(p.title).toLowerCase().includes(typeWord)) || fits[0];
      url = best?.image || best?.featured_image?.url || '';
    } catch {
      url = '';
    }
    cache[key] = url;
    write(PHOTO_KEY, cache);
    return url;
  }

  loadPhotos() {
    for (const card of this.querySelectorAll('[data-card]')) {
      const el = /** @type {HTMLElement} */ (card);
      const m = this.all()[Number(el.dataset.card)];
      if (!m || el.dataset.photo) continue;
      el.dataset.photo = 'pending';
      this.photoFor(m).then((url) => {
        if (!url) return;
        const stage = el.querySelector('[data-stage]');
        if (!stage) return;
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.src = `${url}${url.includes('?') ? '&' : '?'}width=520`;
        img.onload = () => {
          stage.querySelector('img')?.remove();
          stage.append(img);
          stage.classList.add('has-photo');
        };
      });
    }
  }

  /* ------------------------------------------------------------ render */

  all() {
    /** @type {Machine[]} */
    const out = [...this.owned];
    for (const s of this.saved) {
      const dupe = out.some((o) => (s.modelId && o.modelId === s.modelId && !o.serial) || (s.serial && o.serial === s.serial));
      if (!dupe) out.push(s);
    }
    return out;
  }

  renderStatus() {
    if (!this.statusEl) return;
    const n = this.all().length;
    const where = this.signedIn && this.synced ? 'Saved to your account' : this.signedIn ? 'Saved on this device' : 'Saved on this device';
    this.statusEl.innerHTML = n
      ? `<span class="fpg-mm__dot${this.signedIn && this.synced ? ' is-synced' : ''}"></span>${n} machine${n === 1 ? '' : 's'} · ${where}`
      : '';
    this.statusEl.hidden = !n;
  }

  render() {
    const machines = this.all();
    this.renderStatus();
    if (this.quick) this.quick.hidden = machines.length > 0;
    if (!this.listEl) return;
    if (!machines.length) {
      this.listEl.innerHTML = `<li class="fpg-mm__empty">
        <div class="fpg-mm__empty-art" aria-hidden="true">${['Chainsaw', 'Hedge Trimmer', 'Brushcutter'].map((t) => (lib ? lib.machineIcon(t, 44) : '')).join('')}</div>
        <h2>Add your first machine</h2>
        <p>Search for its model above. It'll sit here with one-tap links to its parts and servicing.</p>
      </li>`;
      return;
    }
    this.listEl.innerHTML = machines
      .map((m, i) => {
        const purchase = m.source === 'purchase';
        const bought = purchase
          ? `Bought from FP&G${m.boughtOn && !Number.isNaN(new Date(m.boughtOn).getTime()) ? ` · ${new Date(m.boughtOn).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}`
          : '';
        const savedIndex = this.saved.indexOf(m);
        return `<li class="fpg-mm__card" data-card="${i}">
          <div class="fpg-mm__stage" data-stage>${lib ? lib.machineIcon(m.type || '', 72) : ''}</div>
          ${
            purchase || savedIndex < 0
              ? ''
              : `<button type="button" class="fpg-mm__x" data-remove="${savedIndex}" aria-label="Remove ${esc(m.brand)} ${esc(m.model)}">${ICON_X}</button>`
          }
          <div class="fpg-mm__body">
            <p class="fpg-mm__brand">${esc(m.brand)}${m.type ? ` · ${esc(m.type)}` : ''}</p>
            <h2 class="fpg-mm__name">${esc(m.model)}</h2>
            ${bought || m.serial ? `<p class="fpg-mm__meta">${bought ? `<span class="fpg-mm__badge">${esc(bought)}</span>` : ''}${m.serial ? `<span>Serial ${esc(m.serial)}</span>` : ''}</p>` : ''}
          </div>
          <div class="fpg-mm__actions">
            <a class="fpg-mm__btn fpg-mm__btn--primary" href="${esc(this.partsUrl(m))}">Order parts</a>
            <a class="fpg-mm__btn" href="${esc(this.serviceUrl(m))}">Book a service</a>
          </div>
        </li>`;
      })
      .join('');
    this.loadPhotos();
  }

  /* ------------------------------------------------------------ add a machine */

  matches(/** @type {string} */ text) {
    const q = squash(text);
    if (!q || !this.index) return [];
    /** @type {Array<[number, any]>} */
    const scored = [];
    for (const m of this.index.models) {
      const full = squash(m.type.brand.name) + m.key;
      let score = 0;
      if (m.key === q || full === q) score = 100;
      else if (m.key.startsWith(q) || full.startsWith(q)) score = 70 - m.key.length;
      else if (m.key.includes(q)) score = 40 - m.key.length;
      if (score) scored.push([score + (m.type.brand.priority ? 5 : 0), m]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, m]) => m);
  }

  suggest() {
    if (!this.panel || !this.input) return;
    const text = this.input.value.trim();
    if (!text) return this.closePanel();
    const found = this.matches(text);
    this.active = found.length ? 0 : -1;
    this.panel.innerHTML = found.length
      ? found
          .map(
            (m, i) => `<li role="option" id="fpg-mm-o${i}" aria-selected="${i === 0}">
              <button type="button" tabindex="-1" data-add="${m.id}">
                <span class="fpg-mm__opt-icon">${lib ? lib.machineIcon(m.type.name, 24) : ''}</span>
                <span class="fpg-mm__opt-text"><strong>${esc(m.type.brand.name)} ${esc(m.name)}</strong><small>${esc(m.type.name)}</small></span>
                <span class="fpg-mm__opt-add">${this.has(m.id) ? 'Added' : ICON_PLUS}</span>
              </button>
            </li>`
          )
          .join('')
      : `<li class="fpg-mm__none">No machine called “${esc(text)}”. Check the model on its label, or <a href="${esc(this.dataset.contactUrl || '/pages/contact')}">ask us</a>.</li>`;
    this.panel.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-activedescendant', found.length ? 'fpg-mm-o0' : '');
  }

  closePanel() {
    if (this.panel) this.panel.hidden = true;
    this.input?.setAttribute('aria-expanded', 'false');
    this.input?.removeAttribute('aria-activedescendant');
  }

  onKey = (/** @type {KeyboardEvent} */ e) => {
    const options = this.panel ? [...this.panel.querySelectorAll('[role="option"]')] : [];
    if (e.key === 'Escape') {
      this.closePanel();
      return;
    }
    if (!options.length || this.panel?.hidden) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.setAttribute('aria-selected', String(i === this.active)));
      this.input?.setAttribute('aria-activedescendant', options[this.active]?.id || '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      /** @type {HTMLElement | null} */ (options[Math.max(0, this.active)]?.querySelector('button'))?.click();
    }
  };

  has(/** @type {number} */ id) {
    return this.all().some((m) => m.modelId === id);
  }

  async add(/** @type {number} */ id) {
    const m = this.fromModelId(id);
    if (this.input) this.input.value = '';
    this.closePanel();
    if (!m) return;
    if (this.has(m.modelId)) {
      this.say(`${m.brand} ${m.model} is already here.`);
      this.flashCard(m.modelId);
      return;
    }
    await this.commit([m, ...this.saved].slice(0, MAX));
    this.say(`${m.brand} ${m.model} added.`);
    this.flashCard(m.modelId);
  }

  async remove(/** @type {number} */ index) {
    const gone = this.saved[index];
    if (!gone) return;
    const before = [...this.saved];
    await this.commit(this.saved.filter((_, n) => n !== index));
    this.undo = { list: before, label: `${gone.brand} ${gone.model}` };
    this.say(`${gone.brand} ${gone.model} removed.`, true);
  }

  flashCard(/** @type {number | undefined} */ modelId) {
    const i = this.all().findIndex((m) => m.modelId === modelId);
    const card = this.querySelector(`[data-card="${i}"]`);
    if (!card) return;
    card.classList.remove('is-new');
    void (/** @type {HTMLElement} */ (card).offsetWidth);
    card.classList.add('is-new');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  say(/** @type {string} */ text, withUndo = false) {
    if (!this.toast) return;
    this.toast.innerHTML = `<span>${esc(text)}</span>${withUndo ? '<button type="button" data-undo>Undo</button>' : ''}`;
    this.toast.hidden = false;
    this.toast.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast?.classList.remove('is-on');
      this.undo = null;
    }, withUndo ? 6000 : 3000);
  }

  onClick = (/** @type {MouseEvent} */ event) => {
    const el = /** @type {HTMLElement} */ (event.target).closest('[data-add],[data-remove],[data-undo],[data-quick-add]');
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.add) this.add(Number(el.dataset.add));
    else if (el.dataset.quickAdd) {
      const m = this.index?.models.find((/** @type {any} */ x) => squash(x.type.brand.name + x.name) === squash(el.dataset.quickAdd || ''));
      if (m) this.add(m.id);
    } else if (el.dataset.remove !== undefined) this.remove(Number(el.dataset.remove));
    else if ('undo' in el.dataset && this.undo) {
      const restore = this.undo.list;
      this.undo = null;
      this.commit(restore);
      this.say('Restored.');
    }
  };
}

if (!customElements.get('fpg-my-machines')) customElements.define('fpg-my-machines', FpgMyMachines);
