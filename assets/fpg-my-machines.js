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
 */

/* Shared helpers from assets/fpg-parts.js, imported by its versioned URL
   (data-parts-script) so the browser loads it once. */
/** @type {any} */
let lib = null;
const machineIcon = (/** @type {string} */ t, /** @type {number} */ size) => lib.machineIcon(t, size);
const esc = (/** @type {unknown} */ v) => lib.esc(v);

const LOCAL_KEY = 'fpg-my-machines';

const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => Number.isFinite(Number(x))).map(Number) : [];
  } catch {
    return [];
  }
}

function writeLocal(/** @type {number[]} */ ids) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {
    /* private browsing: the page still works for this visit */
  }
}

/**
 * @typedef {{ brand: string, type: string, model: string, modelId?: number, sku?: string, serial?: string, boughtOn?: string, source?: string, addedAt?: string }} Machine
 */

class FpgMyMachines extends HTMLElement {
  /** @type {Machine[]} */
  saved = [];
  /** @type {Machine[]} */
  owned = [];
  /** @type {any} */
  index = null;
  signedIn = false;
  accountSaves = false;

  get proxy() {
    return (this.dataset.proxy || '/apps/parts-finder').replace(/\/+$/, '');
  }

  async connectedCallback() {
    this.signedIn = this.dataset.signedIn === 'true';
    this.list = /** @type {HTMLElement} */ (this.querySelector('[data-list]'));
    this.note = /** @type {HTMLElement} */ (this.querySelector('[data-note]'));
    this.input = /** @type {HTMLInputElement} */ (this.querySelector('[data-add-search]'));
    this.suggest = /** @type {HTMLElement} */ (this.querySelector('[data-add-suggest]'));

    this.addEventListener('click', this.onClick);
    this.input?.addEventListener('input', () => this.showSuggestions());
    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        /** @type {HTMLElement | null} */ (this.suggest?.querySelector('button'))?.click();
      }
      if (e.key === 'Escape') this.suggest && (this.suggest.hidden = true);
    });

    try {
      lib = await import(/** @type {string} */ (this.dataset.partsScript));
      this.index = await lib.loadIndex(this.dataset.index || '');
    } catch {
      this.index = { brands: [], models: [] };
      lib = lib || {
        machineIcon: () => '',
        esc: (/** @type {unknown} */ v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
        findMachine: () => null,
        brandName: (/** @type {string} */ v) => v,
      };
    }

    if (this.signedIn) {
      try {
        const raw = this.querySelector('[data-account-machines]')?.textContent || '[]';
        const parsed = JSON.parse(raw);
        this.saved = Array.isArray(parsed) ? parsed : [];
        this.accountSaves = true;
      } catch {
        this.saved = [];
      }
      await this.mergeLocalIntoAccount();
      this.loadOwned();
    } else {
      this.saved = readLocal()
        .map((id) => this.fromModelId(id))
        .filter(Boolean);
    }
    this.render();
  }

  /* ---------- data */

  fromModelId(/** @type {number} */ id) {
    const m = this.index?.models.find((x) => x.id === Number(id));
    if (!m) return null;
    return /** @type {Machine} */ ({ brand: m.type.brand.name, type: m.type.name, model: m.name, modelId: m.id, source: 'saved', addedAt: new Date().toISOString().slice(0, 10) });
  }

  /** Machines saved on this device before signing in are added to the account once. */
  async mergeLocalIntoAccount() {
    const local = readLocal();
    if (!local.length) return;
    const add = local
      .map((id) => this.fromModelId(id))
      .filter((m) => m && !this.saved.some((s) => s.modelId === m.modelId));
    if (!add.length) return;
    const next = [...this.saved, .../** @type {Machine[]} */ (add)];
    if (await this.saveToAccount(next)) {
      this.saved = next;
      writeLocal([]);
    }
  }

  async loadOwned() {
    try {
      const r = await fetch(`${this.proxy}/customer/owned-machines`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const data = await r.json();
      const list = Array.isArray(data?.machines) ? data.machines : [];
      this.owned = list.map((/** @type {any} */ x) => {
        const match = this.index ? lib.findMachine(this.index, x.brand || '', `${x.brand || ''} ${x.name || ''}`) : null;
        return /** @type {Machine} */ ({
          brand: lib.brandName(x.brand || match?.type.brand.name || ''),
          type: match?.type.name || x.type || 'Machine',
          model: String(x.name || match?.name || '').replace(/^(stihl|husqvarna)\s+/i, ''),
          modelId: match?.id,
          sku: x.sku,
          serial: x.serial,
          boughtOn: x.soldOn,
          source: 'purchase',
        });
      });
      this.render();
    } catch {
      /* no owned machines shown: the rest of the page still works */
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

  async commit(/** @type {Machine[]} */ next) {
    if (this.signedIn && this.accountSaves) {
      const ok = await this.saveToAccount(next);
      if (!ok) {
        /* Account saving isn't available: keep it in this browser instead. */
        this.accountSaves = false;
        this.flash('Saved on this device.');
      }
    }
    this.saved = next;
    if (!this.signedIn || !this.accountSaves) {
      writeLocal(next.map((m) => m.modelId).filter((x) => Number.isFinite(x)).map(Number));
    }
    this.render();
  }

  /* ---------- links */

  partsUrl(/** @type {Machine} */ m) {
    const finder = this.dataset.finderUrl || '/pages/fpg-part-finder';
    if (m.modelId) {
      const model = this.index?.models.find((x) => x.id === m.modelId);
      if (model) return `${finder}?brand=${model.type.brand.id}&type=${model.type.id}&model=${model.id}`;
    }
    return `${this.dataset.searchUrl || '/search'}?q=${encodeURIComponent(`${m.brand} ${m.model} parts`)}`;
  }

  serviceUrl(/** @type {Machine} */ m) {
    const base = this.dataset.serviceUrl || '/collections/servicing-repair';
    const p = new URLSearchParams({ machine: m.type || '', brand: m.brand || '', model: m.model || '' });
    if (m.serial) p.set('serial', m.serial);
    return `${base}${base.includes('?') ? '&' : '?'}${p}`;
  }

  /* ---------- render */

  all() {
    /** @type {Machine[]} */
    const out = [...this.owned];
    for (const s of this.saved) {
      const dupe = out.some((o) => (s.modelId && o.modelId === s.modelId && !o.serial) || (s.serial && o.serial === s.serial));
      if (!dupe) out.push(s);
    }
    return out;
  }

  render() {
    const machines = this.all();
    if (!this.list) return;
    if (!machines.length) {
      this.list.innerHTML = `<li class="fpg-mm__empty">
        <strong>No machines saved yet</strong>
        <span>Search for your model above. We'll keep it here with quick links to its parts and servicing.</span>
      </li>`;
      return;
    }
    this.list.innerHTML = machines
      .map((m) => {
        const purchase = m.source === 'purchase';
        const details = [
          purchase ? `Bought from FP&G${m.boughtOn ? ` on ${new Date(m.boughtOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}` : '',
          m.serial ? `Serial ${esc(m.serial)}` : '',
        ].filter(Boolean);
        return `<li class="fpg-mm__card">
          <span class="fpg-mm__icon">${machineIcon(m.type || '', 40)}</span>
          <div class="fpg-mm__text">
            <span class="fpg-mm__type">${esc(m.brand)} ${esc((m.type || 'machine').toLowerCase())}</span>
            <strong class="fpg-mm__name">${esc(m.model)}</strong>
            ${details.length ? `<span class="fpg-mm__meta">${details.map((d) => (d.startsWith('Bought') ? `<span class="fpg-mm__badge">${esc(d)}</span>` : d)).join(' · ')}</span>` : ''}
          </div>
          <div class="fpg-mm__actions">
            <a class="fpg-mm__btn" href="${esc(this.partsUrl(m))}">Order parts</a>
            <a class="fpg-mm__btn fpg-mm__btn--ghost" href="${esc(this.serviceUrl(m))}">Book a service</a>
            ${purchase ? '' : `<button type="button" class="fpg-mm__remove" data-remove="${this.saved.indexOf(m)}" aria-label="Remove ${esc(m.brand)} ${esc(m.model)}">Remove</button>`}
          </div>
        </li>`;
      })
      .join('');
  }

  flash(/** @type {string} */ text) {
    if (!this.note) return;
    this.note.textContent = text;
    this.note.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => (this.note.hidden = true), 4000);
  }

  /* ---------- add a machine */

  showSuggestions() {
    if (!this.suggest || !this.input || !this.index) return;
    const q = squash(this.input.value);
    if (!q) {
      this.suggest.hidden = true;
      return;
    }
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
    const found = scored.sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, m]) => m);
    this.suggest.innerHTML = found.length
      ? found
          .map(
            (m) => `<li><button type="button" data-add="${m.id}">${machineIcon(m.type.name, 22)}<span><strong>${esc(m.type.brand.name)} ${esc(m.name)}</strong><small>${esc(m.type.name)}</small></span><em>Add</em></button></li>`
          )
          .join('')
      : `<li class="fpg-mm__none">No machine matches “${esc(this.input.value)}”. <a href="${esc(this.dataset.contactUrl || '/pages/contact')}">Ask us</a> and we'll add it.</li>`;
    this.suggest.hidden = false;
  }

  onClick = async (/** @type {MouseEvent} */ event) => {
    const el = /** @type {HTMLElement} */ (event.target).closest('[data-add],[data-remove]');
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.add) {
      const m = this.fromModelId(Number(el.dataset.add));
      if (this.input) this.input.value = '';
      if (this.suggest) this.suggest.hidden = true;
      if (!m) return;
      if (this.saved.some((s) => s.modelId === m.modelId)) return this.flash(`${m.brand} ${m.model} is already in your machines.`);
      await this.commit([m, ...this.saved].slice(0, 20));
      this.flash(`${m.brand} ${m.model} added.`);
    }
    if (el.dataset.remove !== undefined) {
      const i = Number(el.dataset.remove);
      const gone = this.saved[i];
      if (!gone) return;
      await this.commit(this.saved.filter((_, n) => n !== i));
      this.flash(`${gone.brand} ${gone.model} removed.`);
    }
  };
}

if (!customElements.get('fpg-my-machines')) customElements.define('fpg-my-machines', FpgMyMachines);
