/**
 * FP&G spare parts finder (sections/fpg-part-finder.liquid) and the
 * "Parts for this machine" link on product pages (blocks/fpg-parts-link.liquid).
 *
 * Data
 * - Brands, machine types and models: assets/fpg-parts-index.json, a snapshot
 *   of the FPG Part Finder app built with fpg-tools/parts/build-parts-index.js.
 *   It makes the model search instant. The models list for a machine type is
 *   also asked of the app when a shopper opens it, so new models show up
 *   before the snapshot is rebuilt.
 * - Parts for a model: asked live of the app's proxy (getProducts), grouped
 *   in the app's sections (Carburettor, Engine, ...).
 * - Diagrams: the app's getDealerParts lists the maker's own parts list for a
 *   model (STIHL / Husqvarna, from Polly) in sections, each with its exploded
 *   diagram. Shown as tiles above the sections; a tile opens the diagram with
 *   clickable numbers (getDiagramNumbers) beside that section's parts. Models
 *   without one keep the grouped list only.
 * - Manufacturer stock: the Cormorant server's /availability check, for parts
 *   of the brands in the section setting when we have none ourselves. Only
 *   parts on screen are checked, two at a time, and answers are kept for
 *   10 minutes in the browser.
 *
 * URLs: ?brand=<id>, ?brand=<id>&type=<id>, ?brand=<id>&type=<id>&model=<id>.
 * The old app's links (?step=machineTypes|models|model&id=...) still work.
 */

const STORE_MACHINES = 'fpg-my-machines';
const STORE_STOCK = 'fpg-maker-stock';
const STOCK_LIFETIME = 10 * 60 * 1000;

/* ---------------------------------------------------------------- helpers */

export const esc = (/** @type {unknown} */ value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

const squash = (/** @type {string} */ s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Natural sort, so MS 170 comes before MS 1700 and 021 before 044. */
const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/** "*Stihl" -> "STIHL". The asterisk marks the app's priority brands. */
export function brandName(/** @type {string} */ raw) {
  const name = String(raw || '').replace(/^\*/, '').trim();
  return /^stihl$/i.test(name) ? 'STIHL' : name;
}

/** STIHL 11-digit part numbers read better in their printed groups: 1141 120 0640. */
function partNumber(/** @type {string} */ sku) {
  const s = String(sku || '').trim();
  if (/^\d{11}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  if (/^[A-Z]\d{3}[0-9A-Z]{7}$/.test(s)) return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
  return s;
}

/** Drops the part number the titles repeat at the end, and the brand at the start. */
function cleanTitle(/** @type {string} */ title, /** @type {string} */ sku, /** @type {string} */ brand) {
  let t = String(title || '');
  if (sku) {
    const spaced = partNumber(sku).replace(/ /g, '\\s*');
    t = t.replace(new RegExp(`\\s*${sku}\\s*/\\s*${spaced}\\s*$`, 'i'), '');
    t = t.replace(new RegExp(`\\s+${sku}\\b`, 'i'), '');
    /* Husqvarna: "VOLUTE CASE - 585612501 / 585 61 25-01" */
    t = t.replace(/\s*-?\s*\/\s*\d[\d\s-]{6,}\d$/, '').replace(/\s+-\s*$/, '');
  }
  if (brand) t = t.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '');
  return t.trim() || String(title || '');
}

function readStore(/** @type {string} */ key, /** @type {any} */ fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(/** @type {string} */ key, /** @type {any} */ value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the page still works, it just doesn't remember */
  }
}

/* ---------------------------------------------------------------- model data cache */

/*
 * A model's parts (getProducts) and the maker's list (getDealerParts) are kept
 * for 15 minutes: in memory, so a model is only asked for once per visit (and a
 * hover can fetch it before the click), and in sessionStorage, so Back, reloads
 * and the next page in the same tab show it at once. The maker's list can take
 * several seconds on the server, so this is where most of the waiting goes.
 */
const MODEL_PREFIX = 'fpg-pf:';
const MODEL_LIFETIME = 15 * 60 * 1000;
/** @type {Map<string, { at: number, promise: Promise<any> }>} */
const jsonRequests = new Map();

function readSession(/** @type {string} */ url) {
  try {
    const raw = sessionStorage.getItem(MODEL_PREFIX + url);
    if (!raw) return undefined;
    const saved = JSON.parse(raw);
    if (Date.now() - saved.t < MODEL_LIFETIME) return saved.d;
    sessionStorage.removeItem(MODEL_PREFIX + url);
  } catch {
    /* storage blocked: fetch instead */
  }
  return undefined;
}

function writeSession(/** @type {string} */ url, /** @type {any} */ data) {
  const value = JSON.stringify({ t: Date.now(), d: data });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      sessionStorage.setItem(MODEL_PREFIX + url, value);
      return;
    } catch {
      /* full: drop the older saved models and try once more */
      try {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith(MODEL_PREFIX)) keys.push(k);
        }
        for (const k of keys) sessionStorage.removeItem(k);
      } catch {
        return;
      }
    }
  }
}

/** GETs JSON once per 15 minutes per URL; failures are not kept. */
function cachedJson(/** @type {string} */ url) {
  const held = jsonRequests.get(url);
  if (held && Date.now() - held.at < MODEL_LIFETIME) return held.promise;
  const saved = readSession(url);
  const promise =
    saved !== undefined
      ? Promise.resolve(saved)
      : fetch(url)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((data) => {
            writeSession(url, data);
            return data;
          });
  promise.catch(() => jsonRequests.delete(url));
  jsonRequests.set(url, { at: Date.now(), promise });
  return promise;
}

/* ---------------------------------------------------------------- icons */

/* Drawn for FP&G: simple 48px line icons, one per kind of machine. */
const ICON_PATHS = {
  chainsaw:
    '<rect x="5" y="19" width="16" height="15" rx="3"/><path d="M9 19v-4h9v4"/><path d="M21 23h18a4 4 0 0 1 0 8H21"/><path d="M24 27h13" stroke-dasharray="2 2.5"/><path d="M5 26H2"/>',
  blower:
    '<circle cx="15" cy="27" r="9"/><path d="M15 23v8M11 27h8"/><path d="M23 22l19-6v7l-17 7"/><path d="M10 18c3-6 8-6 11 0"/>',
  trimmer:
    '<rect x="3" y="4" width="10" height="9" rx="2"/><path d="M11 12l26 26"/><path d="M17 22l-7 4M22 17l4-7"/><ellipse cx="40" cy="40" rx="6" ry="3"/>',
  hedge:
    '<rect x="3" y="20" width="15" height="11" rx="3"/><path d="M7 20c3-8 9-8 11 0"/><rect x="18" y="23.5" width="25" height="4" rx="1"/><path d="M22 23.5v-3M27 23.5v-3M32 23.5v-3M37 23.5v-3M22 27.5v3M27 27.5v3M32 27.5v3M37 27.5v3"/>',
  pole:
    '<rect x="3" y="35" width="10" height="9" rx="2"/><path d="M11 37L36 12"/><path d="M33 5l9 9-4 4-9-9z"/><path d="M17 31l-4-4"/>',
  cutter:
    '<circle cx="33" cy="27" r="11"/><circle cx="33" cy="27" r="2"/><path d="M24 18a12 12 0 0 1 18 0"/><rect x="3" y="21" width="14" height="13" rx="3"/><path d="M17 27h14"/><path d="M7 21c2-6 7-6 9 0"/>',
  auger:
    '<rect x="14" y="5" width="20" height="10" rx="2"/><path d="M5 11h38"/><path d="M24 15v28"/><path d="M18 21l12 4-12 4 12 4-12 4"/>',
  kombi:
    '<rect x="3" y="4" width="10" height="9" rx="2"/><path d="M11 12l26 26"/><circle cx="24" cy="25" r="3"/><path d="M17 22l-7 4"/><path d="M34 35l9 1-1 9z"/>',
  mist:
    '<rect x="8" y="8" width="16" height="26" rx="5"/><path d="M12 15h8"/><path d="M24 26c9 0 13-4 15-11"/><path d="M36 12l7 4"/><path d="M10 34v6M22 34v6"/>',
  washer:
    '<rect x="5" y="16" width="17" height="19" rx="3"/><circle cx="9" cy="39" r="3"/><circle cx="19" cy="39" r="3"/><path d="M22 23h9l11-7"/><path d="M42 13v6M45 15v4"/>',
  pump:
    '<circle cx="24" cy="27" r="10"/><circle cx="24" cy="27" r="3"/><path d="M34 27h9M14 27H5"/><path d="M10 40h28M14 37v3M34 37v3"/><path d="M19 14h10v3H19z"/>',
  mower:
    '<rect x="5" y="24" width="28" height="9" rx="3"/><circle cx="11" cy="37" r="4"/><circle cx="28" cy="37" r="4"/><path d="M30 24L42 7"/><path d="M38 7h7"/><path d="M12 24v-3h12v3"/>',
  rideon:
    '<circle cx="33" cy="35" r="7"/><circle cx="11" cy="37" r="4"/><path d="M6 33h20l4-11h9"/><path d="M28 22v-6h6"/><path d="M16 33l-2-13h-4"/><path d="M7 20h7"/>',
  robot:
    '<rect x="5" y="21" width="38" height="13" rx="4"/><circle cx="11" cy="37" r="3"/><circle cx="37" cy="37" r="3"/><path d="M24 21v-9"/><circle cx="24" cy="10" r="2"/><path d="M14 27h20"/>',
  chipper:
    '<path d="M29 15l14-7v22l-14-4z"/><rect x="8" y="18" width="21" height="14" rx="2"/><path d="M11 18L6 8h8l3 10"/><circle cx="17" cy="38" r="4"/><path d="M8 32v6h5"/>',
  grinder:
    '<circle cx="34" cy="31" r="9"/><path d="M34 20v-3M43 31h3M34 42v3M25 31h-3M40 24l2-2M40 38l2 2M28 38l-2 2"/><rect x="6" y="20" width="16" height="12" rx="2"/><path d="M22 26h6"/><path d="M8 20L4 9"/><circle cx="12" cy="37" r="4"/>',
  engine:
    '<rect x="9" y="14" width="26" height="22" rx="3"/><path d="M14 14V9h16v5"/><path d="M14 20h16M14 25h16M14 30h16"/><path d="M35 25h7"/><circle cx="5" cy="25" r="3"/><path d="M8 25h1"/>',
  tiller:
    '<circle cx="14" cy="36" r="7"/><path d="M8 30l12 12M20 30L8 42"/><rect x="18" y="20" width="14" height="11" rx="2"/><path d="M30 20L42 6"/><path d="M38 6h7"/>',
  wrench:
    '<path d="M31 6a9 9 0 0 0-8 12L7 34a4 4 0 0 0 6 6l16-16a9 9 0 0 0 12-8l-6 2-4-4z"/>',
};

const ICON_RULES = [
  [/chainsaw|chain saw/i, 'chainsaw'],
  [/pole|polesaw|pruner/i, 'pole'],
  [/hedge/i, 'hedge'],
  [/mist/i, 'mist'],
  [/blower|vacuum/i, 'blower'],
  [/brush|trimmer|strimmer/i, 'trimmer'],
  [/kombi|multi/i, 'kombi'],
  [/disc|cut-?off/i, 'cutter'],
  [/auger|drill/i, 'auger'],
  [/pressure|washer/i, 'washer'],
  [/pump/i, 'pump'],
  [/remote/i, 'robot'],
  [/ride|tractor|zero/i, 'rideon'],
  [/mower|lawn/i, 'mower'],
  [/chipper/i, 'chipper'],
  [/stump|grinder/i, 'grinder'],
  [/engine/i, 'engine'],
  [/rotavator|tiller|cultivator/i, 'tiller'],
];

export function machineIcon(/** @type {string} */ typeName, size = 48) {
  const key = ICON_RULES.find(([re]) => /** @type {RegExp} */ (re).test(typeName))?.[1] || 'wrench';
  return `<svg class="fpg-pf-icon" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[/** @type {keyof typeof ICON_PATHS} */ (key)]}</svg>`;
}

const ARROW =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* ---------------------------------------------------------------- index */

/**
 * @typedef {{ id: number, name: string, raw: string, logo: string, priority: boolean, types: Type[] }} Brand
 * @typedef {{ id: number, name: string, brand: Brand, models: Model[] }} Type
 * @typedef {{ id: number, name: string, type: Type, key: string }} Model
 */

/** @type {Map<string, Promise<{ brands: Brand[], models: Model[] }>>} */
const indexCache = new Map();

export function loadIndex(/** @type {string} */ url) {
  if (!indexCache.has(url)) {
    indexCache.set(
      url,
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          /** @type {Brand[]} */
          const brands = [];
          /** @type {Model[]} */
          const models = [];
          for (const [id, raw, logo, types] of data.b) {
            /** @type {Brand} */
            const brand = { id, raw, name: brandName(raw), logo: logo ? data.img + logo : '', priority: raw.startsWith('*'), types: [] };
            for (const [tid, tname, list] of types) {
              /** @type {Type} */
              const type = { id: tid, name: tname, brand, models: [] };
              for (const [mid, mname] of list) {
                const model = { id: mid, name: mname, type, key: squash(mname) };
                type.models.push(model);
                models.push(model);
              }
              type.models.sort((a, b) => collator.compare(a.name, b.name));
              brand.types.push(type);
            }
            brands.push(brand);
          }
          /* Priority brands in the app's order (STIHL first), then the rest A to Z. */
          brands.sort((a, b) => Number(b.priority) - Number(a.priority) || (a.priority ? a.id - b.id : collator.compare(a.name, b.name)));
          return { brands, models };
        })
    );
  }
  return /** @type {Promise<{ brands: Brand[], models: Model[] }>} */ (indexCache.get(url));
}

const modelCount = (/** @type {Brand} */ b) => b.types.reduce((n, t) => n + t.models.length, 0);

/** Groups model names by their letters (MS, MSA, HS...), so long lists are easier to scan. */
function seriesOf(/** @type {string} */ name) {
  const m = name.match(/^([A-Za-z]+)[\s-]?\d/);
  if (m) return m[1].toUpperCase();
  if (/^\d/.test(name)) return '';
  return name.split(/\s/)[0].toUpperCase();
}

/* ---------------------------------------------------------------- manufacturer stock */

/** @type {Map<string, Promise<any>>} */
const stockRequests = new Map();
/** @type {Array<() => Promise<void>>} */
const stockQueue = [];
let stockRunning = 0;

function runStockQueue() {
  while (stockRunning < 2 && stockQueue.length) {
    const job = /** @type {() => Promise<void>} */ (stockQueue.shift());
    stockRunning++;
    job().finally(() => {
      stockRunning--;
      runStockQueue();
    });
  }
}

/** Asks the Cormorant server once per supplier and SKU, queued two at a time. */
function makerStock(/** @type {string} */ base, /** @type {string} */ supplier, /** @type {string} */ sku) {
  const key = `${supplier}|${sku}`;
  const saved = readStore(STORE_STOCK, {});
  if (saved[key] && Date.now() - saved[key].at < STOCK_LIFETIME) return Promise.resolve(saved[key]);
  if (!stockRequests.has(key)) {
    stockRequests.set(
      key,
      new Promise((resolve) => {
        stockQueue.push(async () => {
          try {
            const url = new URL(`${base.replace(/\/+$/, '')}/availability`);
            url.searchParams.set('supplier', supplier);
            url.searchParams.set('sku', sku);
            const data = await fetch(url, { mode: 'cors' }).then((r) => r.json());
            if (['in-stock', 'available-to-order', 'unavailable'].includes(data?.status)) {
              const answer = { status: data.status, eta: data.etaDate || null, at: Date.now() };
              const all = readStore(STORE_STOCK, {});
              all[key] = answer;
              writeStore(STORE_STOCK, all);
              resolve(answer);
            } else resolve(null);
          } catch {
            resolve(null);
          }
        });
        runStockQueue();
      })
    );
  }
  return /** @type {Promise<any>} */ (stockRequests.get(key));
}

/* ---------------------------------------------------------------- diagrams */

const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];
const ZOOM_MAX = 8;
/** Clickable numbers per drawing URL: the request in flight, and answers that have arrived. */
/** @type {Map<string, Promise<any>>} */
const numbersCache = new Map();
/** @type {Map<string, any>} */
const numbersReady = new Map();
const wait = (/** @type {number} */ ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * The numbers for one drawing. Polly sometimes fails a first request (it may be
 * fetching the positions from STIHL / Husqvarna), so a failure is retried twice
 * before the viewer gives up; answers are kept for the visit and the tab.
 */
function fetchNumbers(/** @type {string} */ url) {
  const held = numbersCache.get(url);
  if (held) return held;
  const promise = (async () => {
    const saved = readSession(url);
    if (saved?.ok) return saved;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url);
        const data = r.ok ? await r.json() : null;
        if (data?.ok && Array.isArray(data.maps)) {
          writeSession(url, data);
          return data;
        }
        /* The maker has no positions for this drawing: asking again won't help. */
        if (data && /no such diagram|no clickable numbers/i.test(String(data.reason || ''))) return data;
      } catch {
        /* network hiccup: try again */
      }
      if (attempt < 2) await wait(attempt ? 2500 : 900);
    }
    return null;
  })();
  numbersCache.set(url, promise);
  promise.then((data) => {
    if (data?.ok) numbersReady.set(url, data);
    else numbersCache.delete(url);
  });
  return promise;
}

/** "CARBURETOR" -> "Carburetor"; names already in mixed case are kept. */
function sectionName(/** @type {string} */ raw) {
  const name = String(raw || '').trim();
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

/** STIHL letters its sections ("A - Crankcase, Cylinder"): the letter becomes a badge. */
function sectionCode(/** @type {string} */ name) {
  const m = String(name || '').match(/^([A-Z]{1,2}|\d{1,2})\s+-\s+(.+)$/);
  return m ? { code: m[1], label: m[2] } : { code: '', label: String(name || '') };
}

/** Does a number box on a drawing point at this part? By part number first, else by its Ref. */
function matchesPart(/** @type {any} */ box, /** @type {any} */ part) {
  if (!box || !part) return false;
  const pid = squash(box.pid);
  if (pid && (squash(part.partNumber) === pid || squash(part.sku) === pid)) return true;
  return box.a !== '' && box.a != null && String(part.diagramRef || '') === String(box.a);
}

/**
 * Husqvarna places its number boxes loosely, so each box is moved to centre on
 * the digits printed inside it (the same rule as Cormorant's Find parts and the
 * app's own viewer). A box moves only when exactly as many glyphs as the number
 * has digits are found side by side near it.
 */
async function snapBoxesToDigits(/** @type {HTMLImageElement} */ img, /** @type {any} */ data) {
  if (!img.complete || !img.naturalWidth) {
    await new Promise((ok, fail) => {
      img.addEventListener('load', ok, { once: true });
      img.addEventListener('error', () => fail(new Error('image did not load')), { once: true });
    });
  }
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (Math.abs(W / H - data.w / data.h) > 0.02) return data.maps;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const sx = W / data.w;
  const sy = H / data.h;
  const dark = (/** @type {number} */ x, /** @type {number} */ y) => {
    const k = (y * W + x) * 4;
    return px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114 < 140;
  };
  return data.maps.map((/** @type {any} */ b) => {
    const bw = (b.x2 - b.x1) * sx;
    const bh = (b.y2 - b.y1) * sy;
    const digits = String(b.a || '').replace(/[^0-9A-Za-z]/g, '').length;
    if (!digits || bw < 8 || bh < 8) return b;
    const rx1 = Math.max(0, Math.floor(b.x1 * sx - bw / 2));
    const ry1 = Math.max(0, Math.floor(b.y1 * sy - bh / 2));
    const rx2 = Math.min(W - 1, Math.ceil(b.x2 * sx + bw / 2));
    const ry2 = Math.min(H - 1, Math.ceil(b.y2 * sy + bh / 2));
    const rw = rx2 - rx1 + 1;
    const seen = new Uint8Array(rw * (ry2 - ry1 + 1));
    const glyphs = [];
    for (let y = ry1; y <= ry2; y++) {
      for (let x = rx1; x <= rx2; x++) {
        const at = (y - ry1) * rw + (x - rx1);
        if (seen[at] || !dark(x, y)) continue;
        const stack = [[x, y]];
        seen[at] = 1;
        let minX = x, maxX = x, minY = y, maxY = y, count = 0, edge = false;
        while (stack.length) {
          const [cx, cy] = /** @type {number[]} */ (stack.pop());
          count++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cx === rx1 || cx === rx2 || cy === ry1 || cy === ry2) edge = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < rx1 || nx > rx2 || ny < ry1 || ny > ry2) continue;
              const n = (ny - ry1) * rw + (nx - rx1);
              if (!seen[n] && dark(nx, ny)) {
                seen[n] = 1;
                stack.push([nx, ny]);
              }
            }
          }
        }
        const gw = maxX - minX + 1;
        const gh = maxY - minY + 1;
        if (!edge && count >= 6 && gh >= bh * 0.25 && gh <= bh * 0.9 && gw <= bw * 0.8) {
          glyphs.push({ minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, gh });
        }
      }
    }
    if (!glyphs.length) return b;
    const bcx = ((b.x1 + b.x2) / 2) * sx;
    const bcy = ((b.y1 + b.y2) / 2) * sy;
    glyphs.sort((p, q) => Math.hypot(p.cx - bcx, p.cy - bcy) - Math.hypot(q.cx - bcx, q.cy - bcy));
    const group = [glyphs[0]];
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of glyphs) {
        if (group.includes(g)) continue;
        const fits = group.some((o) => {
          const overlap = Math.min(o.maxY, g.maxY) - Math.max(o.minY, g.minY);
          const gap = Math.max(g.minX - o.maxX, o.minX - g.maxX);
          return overlap >= 0.6 * Math.min(o.gh, g.gh) && gap <= 0.5 * Math.max(o.gh, g.gh) && Math.abs(g.gh - o.gh) <= 0.3 * Math.max(o.gh, g.gh);
        });
        if (fits) {
          group.push(g);
          grew = true;
        }
      }
    }
    if (group.length !== digits) return b;
    const cx = (Math.min(...group.map((g) => g.minX)) + Math.max(...group.map((g) => g.maxX))) / 2;
    const cy = (Math.min(...group.map((g) => g.minY)) + Math.max(...group.map((g) => g.maxY))) / 2;
    const dx = cx / sx - (b.x1 + b.x2) / 2;
    const dy = cy / sy - (b.y1 + b.y2) / 2;
    if (Math.abs(dx) > (b.x2 - b.x1) * 0.6 || Math.abs(dy) > (b.y2 - b.y1) * 0.6) return b;
    return { ...b, x1: b.x1 + dx, x2: b.x2 + dx, y1: b.y1 + dy, y2: b.y2 + dy };
  });
}

/* ---------------------------------------------------------------- finder */

class FpgPartsFinder extends HTMLElement {
  /** @type {{ brands: Brand[], models: Model[] } | null} */
  data = null;
  /** @type {IntersectionObserver | null} */
  observer = null;
  vat = 20;
  /** @type {AbortController | null} */
  request = null;
  /** @type {{ modelId: number, model: Model, source: string, sections: any[] } | null} */
  dealer = null;
  /** @type {HTMLDialogElement | null} */
  viewer = null;
  /** The model on screen; answers for any other are dropped. @type {symbol | null} */
  modelToken = null;
  /** What's in the basket, by variant id: the first line's key and the total quantity. */
  /** @type {Map<string, { key: string, quantity: number }>} */
  basket = new Map();

  get proxy() {
    return (this.dataset.proxy || '/apps/fpg-parts').replace(/\/+$/, '');
  }

  async connectedCallback() {
    this.vat = Number(this.dataset.vat || 20);
    this.view = /** @type {HTMLElement} */ (this.querySelector('[data-view]'));
    this.crumbs = /** @type {HTMLElement} */ (this.querySelector('[data-crumbs]'));
    this.input = /** @type {HTMLInputElement} */ (this.querySelector('[data-search]'));
    this.suggest = /** @type {HTMLElement} */ (this.querySelector('[data-suggest]'));
    this.mine = /** @type {HTMLElement} */ (this.querySelector('[data-mine]'));

    this.addEventListener('click', this.onClick);
    this.input?.addEventListener('input', () => this.showSuggestions());
    this.input?.addEventListener('keydown', this.onSearchKey);
    this.input?.addEventListener('focus', () => this.showSuggestions());
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node) || !this.querySelector('[data-searchbox]')?.contains(e.target)) this.hideSuggestions();
    });
    window.addEventListener('popstate', () => this.route(false));
    this.addEventListener('pointerover', this.onHover);
    this.addEventListener('focusin', this.onHover);
    this.addEventListener('pointerout', this.onHoverEnd);
    this.addEventListener('touchstart', this.onTouch, { passive: true });

    /* A link straight to a model: ask for its parts while the index loads. */
    const first = this.params().model;
    if (first) this.prefetchModel(first);

    try {
      this.data = await loadIndex(this.dataset.index || '');
    } catch {
      this.view.innerHTML = this.errorHtml('The parts list did not load.');
      return;
    }
    this.renderMine();
    this.route(false);
    this.searchFromLink();
    this.loadBasket();
    /* Saved machines are the likeliest clicks: fetch up to three of them when the page is idle. */
    const idle = /** @type {any} */ (window).requestIdleCallback || ((/** @type {() => void} */ fn) => setTimeout(fn, 1500));
    idle(() => readStore(STORE_MACHINES, []).slice(0, 3).forEach((/** @type {number} */ id) => this.prefetchModel(id)));
    window.addEventListener('pageshow', (e) => {
      if (/** @type {PageTransitionEvent} */ (e).persisted) this.loadBasket();
    });
    /* Changes made in the cart drawer (or anywhere else on the page) show here too. */
    document.addEventListener('shopify:cart:lines-update', (e) => {
      if (e.target instanceof Node && this.contains(e.target)) return;
      Promise.resolve(/** @type {any} */ (e).promise)
        .catch(() => {})
        .finally(() => this.loadBasket());
    });
  }

  /**
   * ?q=MS 261 (the menu's parts search): an exact model opens its parts, anything
   * else fills the search box and shows the suggestions.
   */
  searchFromLink() {
    const url = new URL(location.href);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return;
    url.searchParams.delete('q');
    history.replaceState(history.state, '', url.pathname + url.search);
    if (this.params().model) return;
    const exact = this.matches(q).filter((m) => m.key === squash(q) || squash(m.type.brand.name) + m.key === squash(q));
    if (exact.length === 1) {
      const m = exact[0];
      history.replaceState(null, '', `${location.pathname}?brand=${m.type.brand.id}&type=${m.type.id}&model=${m.id}`);
      this.route(false);
      return;
    }
    if (!this.input) return;
    this.input.value = q;
    this.input.focus({ preventScroll: true });
    this.showSuggestions();
  }

  /* ---------- basket */

  async loadBasket() {
    try {
      const cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());
      this.setBasket(cart);
    } catch {
      /* the Add buttons still work */
    }
  }

  setBasket(/** @type {any} */ cart) {
    /** @type {Map<string, { key: string, quantity: number }>} */
    const next = new Map();
    for (const item of cart?.items || []) {
      const id = String(item.variant_id);
      const line = next.get(id);
      if (line) line.quantity += Number(item.quantity) || 0;
      else next.set(id, { key: String(item.key), quantity: Number(item.quantity) || 0 });
    }
    this.basket = next;
    for (const el of this.querySelectorAll('[data-buy]')) {
      const box = /** @type {HTMLElement} */ (el);
      if (!box.dataset.busy) box.innerHTML = this.buyInner(box.dataset.buy || '');
    }
  }

  /** Add to basket, or the quantity in the basket with − and +. */
  buyHtml(/** @type {string} */ variant, /** @type {boolean} */ orderable) {
    if (!orderable || !variant) return `<button type="button" class="fpg-pf-add" disabled>Sold out</button>`;
    return `<div class="fpg-pf-buy" data-buy="${esc(variant)}">${this.buyInner(variant)}</div>`;
  }

  buyInner(/** @type {string} */ variant) {
    const line = this.basket.get(variant);
    if (!line) return `<button type="button" class="fpg-pf-add" data-add="${esc(variant)}">Add to basket</button>`;
    return `<div class="fpg-pf-qty">
        <button type="button" class="fpg-pf-qty__btn" data-qty-step="-1" aria-label="${line.quantity === 1 ? 'Remove from basket' : 'One fewer'}">${line.quantity === 1 ? TRASH_ICON : '−'}</button>
        <span class="fpg-pf-qty__n" aria-live="polite"><strong>${line.quantity}</strong> in basket</span>
        <button type="button" class="fpg-pf-qty__btn" data-qty-step="1" aria-label="One more">+</button>
      </div>`;
  }

  async stepQuantity(/** @type {HTMLElement} */ button) {
    const box = /** @type {HTMLElement | null} */ (button.closest('[data-buy]'));
    const variant = box?.dataset.buy || '';
    const line = this.basket.get(variant);
    if (!box || !line || box.dataset.busy) return;
    const quantity = Math.max(0, line.quantity + Number(button.dataset.qtyStep));
    box.dataset.busy = 'true';
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const tools = /** @type {any} */ (window).FPGTools;
      const cart = tools?.setLineQuantity
        ? await tools.setLineQuantity(line.key, quantity, box)
        : await fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: line.key, quantity }) }).then((r) => r.json());
      delete box.dataset.busy;
      this.setBasket(cart);
      if (quantity > 0 && (this.basket.get(variant)?.quantity || 0) < quantity) {
        const n = box.querySelector('.fpg-pf-qty__n');
        if (n) n.innerHTML = `<strong>${this.basket.get(variant)?.quantity || 0}</strong> in basket (all we have)`;
      }
    } catch (error) {
      delete box.dataset.busy;
      box.innerHTML = this.buyInner(variant);
      console.warn('[FP&G parts finder]', error);
    }
  }

  /* ---------- fetching ahead */

  /** @param {string|number} id */
  modelUrls(id) {
    const m = encodeURIComponent(String(id));
    return { parts: `${this.proxy}/getProducts?modelId=${m}`, dealer: `${this.proxy}/getDealerParts?modelId=${m}` };
  }

  /** Starts loading a model's parts and the maker's list (kept, so the click shows them sooner). */
  prefetchModel(/** @type {string|number} */ id) {
    const urls = this.modelUrls(id);
    cachedJson(urls.parts).catch(() => {});
    cachedJson(urls.dealer).catch(() => {});
  }

  /** Starts loading a section's drawings and their clickable numbers. */
  prefetchDrawing(/** @type {number} */ index) {
    const sec = this.dealer?.sections[index];
    (sec?.diagrams || []).forEach((/** @type {any} */ pic, /** @type {number} */ at) => {
      if (at > 1) return;
      if (pic.numbers) {
        /* The numbers name the image they were measured on; that is the one shown. */
        fetchNumbers(this.numbersUrl(sec, at)).then((data) => this.warmImage(data?.ok ? data.image : pic.view));
      } else this.warmImage(pic.view);
    });
  }

  warmImage(/** @type {string} */ name) {
    if (!name) return;
    const url = this.diagramUrl(name);
    if (this.warmed.has(url)) return;
    this.warmed.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  numbersUrl(/** @type {any} */ sec, /** @type {number} */ at) {
    return `${this.proxy}/getDiagramNumbers?modelId=${encodeURIComponent(this.dealer?.modelId ?? '')}&section=${encodeURIComponent(sec.name)}&i=${at}`;
  }

  /** @type {Set<string>} */
  warmed = new Set();
  /** @type {number | undefined} */
  hoverTimer;

  /** Hovering (or tabbing to) a model or a diagram tile for a moment fetches it. */
  onHover = (/** @type {Event} */ e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-go-model],[data-dsec]') : null;
    if (!(t instanceof HTMLElement)) return;
    clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.warm(t), 120);
  };

  onHoverEnd = () => clearTimeout(this.hoverTimer);

  onTouch = (/** @type {TouchEvent} */ e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-go-model],[data-dsec]') : null;
    if (t instanceof HTMLElement) this.warm(t);
  };

  warm(/** @type {HTMLElement} */ el) {
    if (el.dataset.goModel) this.prefetchModel(el.dataset.goModel);
    else if (el.dataset.dsec) this.prefetchDrawing(Number(el.dataset.dsec));
  }

  /* ---------- routing */

  params() {
    const p = new URLSearchParams(location.search);
    const step = p.get('step');
    const id = p.get('id');
    if (step && id) {
      if (step === 'machineTypes') return { brand: id };
      if (step === 'models') return { type: id };
      if (step === 'model') return { model: id };
    }
    return { brand: p.get('brand'), type: p.get('type'), model: p.get('model') };
  }

  /** @param {{ brand?: number|null, type?: number|null, model?: number|null }} to */
  go(to, push = true) {
    const p = new URLSearchParams();
    if (to.brand) p.set('brand', String(to.brand));
    if (to.type) p.set('type', String(to.type));
    if (to.model) p.set('model', String(to.model));
    const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
    if (push) history.pushState(null, '', url);
    this.route(true);
  }

  route(scroll = true) {
    if (!this.data) return;
    const { brand: bId, type: tId, model: mId } = this.params();
    const { brands } = this.data;
    let brand = brands.find((b) => String(b.id) === String(bId)) || null;
    let type = null;
    let model = null;
    if (mId) {
      model = this.data.models.find((m) => String(m.id) === String(mId)) || null;
      if (model) {
        type = model.type;
        brand = type.brand;
      }
    }
    if (!type && tId) {
      for (const b of brands) {
        const t = b.types.find((x) => String(x.id) === String(tId));
        if (t) {
          type = t;
          brand = b;
        }
      }
    }
    this.request?.abort();
    this.observer?.disconnect();
    this.modelToken = null;
    if (model) this.renderModel(model);
    else if (mId) this.renderUnknownModel(Number(mId));
    else if (type) this.renderModels(type);
    else if (brand) this.renderTypes(brand);
    else this.renderBrands();
    this.renderCrumbs(brand, type, model);
    this.dataset.step = model || mId ? 'model' : type ? 'models' : brand ? 'types' : 'brands';
    if (scroll) {
      const top = this.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
      /** @type {HTMLElement | null} */ (this.view.querySelector('[data-focus]'))?.focus({ preventScroll: true });
    }
  }

  renderCrumbs(/** @type {Brand|null} */ brand, /** @type {Type|null} */ type, /** @type {Model|null} */ model) {
    if (!this.crumbs) return;
    if (!brand) {
      this.crumbs.hidden = true;
      return;
    }
    const items = [`<button type="button" data-go-home>All brands</button>`];
    items.push(type ? `<button type="button" data-go-brand="${brand.id}">${esc(brand.name)}</button>` : `<span aria-current="page">${esc(brand.name)}</span>`);
    if (type) items.push(model ? `<button type="button" data-go-type="${type.id}">${esc(type.name)}</button>` : `<span aria-current="page">${esc(type.name)}</span>`);
    if (model) items.push(`<span aria-current="page">${esc(model.name)}</span>`);
    this.crumbs.innerHTML = `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
    this.crumbs.hidden = false;
  }

  /* ---------- step 1: brands */

  renderBrands() {
    const { brands } = /** @type {any} */ (this.data);
    const listed = brands.filter((/** @type {Brand} */ b) => modelCount(b) > 0);
    const featured = listed.filter((/** @type {Brand} */ b) => b.priority);
    const others = listed.filter((/** @type {Brand} */ b) => !b.priority);
    const unlisted = brands.filter((/** @type {Brand} */ b) => modelCount(b) === 0);
    const dealer = this.dataset.dealerLabel || 'Approved dealer';
    const dealerBrands = String(this.dataset.dealerBrands || 'STIHL')
      .split(',')
      .map((s) => squash(s))
      .filter(Boolean);

    const featuredHtml = featured
      .map((/** @type {Brand} */ b) => {
        const types = b.types.filter((t) => t.models.length).slice(0, 6);
        return `
        <article class="fpg-pf-feature">
          <button type="button" class="fpg-pf-feature__main" data-go-brand="${b.id}">
            <span class="fpg-pf-feature__logo">${b.logo ? `<img src="${esc(b.logo)}&width=360" alt="" loading="lazy" width="180" height="90">` : ''}</span>
            <span class="fpg-pf-feature__text">
              ${dealer && dealerBrands.includes(squash(b.name)) ? `<span class="fpg-pf-badge">${esc(dealer)}</span>` : ''}
              <strong>${esc(b.name)} parts</strong>
              <small>${modelCount(b)} machines listed</small>
            </span>
            <span class="fpg-pf-feature__go">${ARROW}</span>
          </button>
          <ul class="fpg-pf-feature__types" role="list">
            ${types.map((t) => `<li><button type="button" data-go-type="${t.id}">${machineIcon(t.name, 22)}<span>${esc(t.name)}</span></button></li>`).join('')}
          </ul>
        </article>`;
      })
      .join('');

    const othersHtml = others
      .map(
        (/** @type {Brand} */ b) => `
        <li><button type="button" class="fpg-pf-brand" data-go-brand="${b.id}">
          <span class="fpg-pf-brand__logo">${b.logo ? `<img src="${esc(b.logo)}&width=240" alt="" loading="lazy" width="120" height="60">` : ''}</span>
          <span class="fpg-pf-brand__name">${esc(b.name)}</span>
          <small>${modelCount(b)} machine${modelCount(b) === 1 ? '' : 's'}</small>
        </button></li>`
      )
      .join('');

    const unlistedNames = unlisted.map((/** @type {Brand} */ b) => esc(b.name)).join(', ');

    this.view.innerHTML = `
      <h2 class="fpg-pf-h" tabindex="-1" data-focus>Choose your machine's brand</h2>
      <div class="fpg-pf-features">${featuredHtml}</div>
      ${others.length ? `<h3 class="fpg-pf-sub">Other brands we stock parts for</h3><ul class="fpg-pf-brands" role="list">${othersHtml}</ul>` : ''}
      ${
        unlisted.length
          ? `<p class="fpg-pf-note">We can also order parts for ${unlistedNames}. These aren't listed online yet, so ${this.contactHtml('get in touch')} with your model and serial number.</p>`
          : ''
      }`;
  }

  /* ---------- step 2: machine types */

  renderTypes(/** @type {Brand} */ brand) {
    const types = brand.types.filter((t) => t.models.length);
    this.view.innerHTML = `
      <div class="fpg-pf-head">
        ${brand.logo ? `<span class="fpg-pf-head__logo"><img src="${esc(brand.logo)}&width=240" alt="" width="120" height="60"></span>` : ''}
        <div>
          <h2 class="fpg-pf-h" tabindex="-1" data-focus>${esc(brand.name)}: what kind of machine?</h2>
          <p class="fpg-pf-lead">${modelCount(brand)} machines listed across ${types.length} type${types.length === 1 ? '' : 's'}.</p>
        </div>
      </div>
      ${
        types.length
          ? `<ul class="fpg-pf-types" role="list">${types
              .map(
                (t) => `
            <li><button type="button" class="fpg-pf-type" data-go-type="${t.id}">
              <span class="fpg-pf-type__icon">${machineIcon(t.name)}</span>
              <strong>${esc(t.name)}</strong>
              <small>${t.models.length} model${t.models.length === 1 ? '' : 's'}</small>
            </button></li>`
              )
              .join('')}</ul>`
          : `<p class="fpg-pf-note">We haven't listed ${esc(brand.name)} machines online yet. ${this.contactHtml('Get in touch')} with your model and serial number and we'll find the part.</p>`
      }`;
  }

  /* ---------- step 3: models */

  renderModels(/** @type {Type} */ type) {
    const draw = () => {
      const groups = new Map();
      for (const m of type.models) {
        const s = seriesOf(m.name);
        if (!groups.has(s)) groups.set(s, []);
        groups.get(s).push(m);
      }
      const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : collator.compare(a, b)));
      const many = keys.length > 1 && type.models.length > 12;
      const body = keys
        .map(
          (k) => `
          <div class="fpg-pf-series" data-series>
            ${many ? `<h3 class="fpg-pf-series__h">${k ? esc(k) : 'Other models'}</h3>` : ''}
            <ul class="fpg-pf-models" role="list">
              ${groups
                .get(k)
                .map((/** @type {Model} */ m) => `<li data-model-name="${esc(m.key)}"><button type="button" class="fpg-pf-model" data-go-model="${m.id}">${esc(m.name)}</button></li>`)
                .join('')}
            </ul>
          </div>`
        )
        .join('');
      this.view.innerHTML = `
        <div class="fpg-pf-head">
          <span class="fpg-pf-head__icon">${machineIcon(type.name)}</span>
          <div>
            <h2 class="fpg-pf-h" tabindex="-1" data-focus>Which ${esc(type.brand.name)} ${esc(type.name.toLowerCase())}?</h2>
            <p class="fpg-pf-lead">The model is on the machine's label, usually near the handle or on the engine cover.</p>
          </div>
        </div>
        ${
          type.models.length > 12
            ? `<label class="fpg-pf-filter">${SEARCH_ICON}<span class="visually-hidden">Filter models</span><input type="search" placeholder="Filter ${type.models.length} models" data-model-filter autocomplete="off"></label>`
            : ''
        }
        <div data-model-list>${body}</div>
        <p class="fpg-pf-empty" data-model-none hidden>No model matches that. ${this.contactHtml('Ask us')} and we'll check.</p>`;
      this.view.querySelector('[data-model-filter]')?.addEventListener('input', (e) => {
        const q = squash(/** @type {HTMLInputElement} */ (e.target).value);
        let shown = 0;
        for (const li of this.view.querySelectorAll('[data-model-name]')) {
          const hit = !q || /** @type {HTMLElement} */ (li).dataset.modelName?.includes(q);
          /** @type {HTMLElement} */ (li).hidden = !hit;
          if (hit) shown++;
        }
        for (const s of this.view.querySelectorAll('[data-series]')) {
          /** @type {HTMLElement} */ (s).hidden = !s.querySelector('[data-model-name]:not([hidden])');
        }
        /** @type {HTMLElement} */ (this.view.querySelector('[data-model-none]')).hidden = shown > 0;
      });
    };
    draw();

    /* Pick up models added in the app since the snapshot was built. */
    fetch(`${this.proxy}/getModels?machineTypeId=${encodeURIComponent(type.id)}`)
      .then((r) => r.json())
      .then((/** @type {any[]} */ live) => {
        if (!Array.isArray(live) || this.dataset.step !== 'models' || this.params().type !== String(type.id)) return;
        let added = false;
        for (const m of live) {
          if (m.active === false || type.models.some((x) => x.id === m.id)) continue;
          const model = { id: m.id, name: String(m.name).trim(), type, key: squash(m.name) };
          type.models.push(model);
          this.data?.models.push(model);
          added = true;
        }
        if (added) {
          type.models.sort((a, b) => collator.compare(a.name, b.name));
          draw();
        }
      })
      .catch(() => {});
  }

  /* ---------- step 4: parts for one model */

  renderUnknownModel(/** @type {number} */ id) {
    /* A model newer than the snapshot: still show its parts. */
    const brand = /** @type {Brand} */ ({ id: 0, name: '', raw: '', logo: '', priority: false, types: [] });
    const type = /** @type {Type} */ ({ id: 0, name: 'machine', brand, models: [] });
    const name = new URLSearchParams(location.search).get('name') || 'this model';
    this.renderModel({ id, name, type, key: squash(name) });
  }

  async renderModel(/** @type {Model} */ model) {
    const brand = model.type.brand;
    const saved = this.isSaved(model.id);
    const supplier = this.supplierFor(brand.name);
    /* STIHL and Husqvarna have the maker's diagrams; other brands rarely do, so they get no placeholder. */
    const expectDiagrams = !!supplier || !model.type.id;
    this.view.innerHTML = `
      <div class="fpg-pf-machine">
        <span class="fpg-pf-machine__icon">${machineIcon(model.type.name, 56)}</span>
        <div class="fpg-pf-machine__text">
          <p class="fpg-pf-machine__kicker">${esc(brand.name)} ${esc(model.type.name)}</p>
          <h2 class="fpg-pf-h" tabindex="-1" data-focus>${esc(model.name)} parts</h2>
          <p class="fpg-pf-lead" data-summary aria-live="polite">Loading parts…</p>
        </div>
        <div class="fpg-pf-machine__actions">
          ${model.type.id ? `<button type="button" class="fpg-pf-btn fpg-pf-btn--ghost fpg-pf-btn--sm" data-save="${model.id}" aria-pressed="${saved}">${saved ? 'Saved to my machines' : 'Save to my machines'}</button>` : ''}
          ${model.type.id ? `<button type="button" class="fpg-pf-btn fpg-pf-btn--ghost fpg-pf-btn--sm" data-go-type="${model.type.id}">Change model</button>` : ''}
        </div>
      </div>
      <div class="fpg-pf-tools" data-tools hidden>
        <label class="fpg-pf-filter">${SEARCH_ICON}<span class="visually-hidden">Search these parts</span><input type="search" placeholder="Search by part name or number" data-part-filter autocomplete="off"></label>
        <label class="fpg-pf-toggle"><input type="checkbox" data-instock> <span>In stock with us</span></label>
      </div>
      <div class="fpg-pf-dealer" data-dealer ${expectDiagrams ? '' : 'hidden'}>${expectDiagrams ? this.dealerLoadingHtml(brand.name) : ''}</div>
      <nav class="fpg-pf-sections" data-sections aria-label="Parts sections" hidden></nav>
      <div data-parts>${this.skeletonHtml()}</div>
      <p class="fpg-pf-empty" data-parts-none hidden>No parts match. Try fewer words, or ${this.contactHtml('ask us')}.</p>`;

    /* Answers for a model the shopper has since left are dropped. */
    const token = Symbol(String(model.id));
    this.modelToken = token;
    const current = () => this.modelToken === token && this.view.isConnected;
    this.request = new AbortController();
    this.dealer = null;

    const urls = this.modelUrls(model.id);
    const dealerRequest = cachedJson(urls.dealer).catch(() => null);
    const summary = /** @type {HTMLElement} */ (this.view.querySelector('[data-summary]'));
    const partsBox = /** @type {HTMLElement} */ (this.view.querySelector('[data-parts]'));
    const tools = /** @type {HTMLElement} */ (this.view.querySelector('[data-tools]'));
    const filter = /** @type {HTMLInputElement} */ (this.view.querySelector('[data-part-filter]'));
    const stockOnly = /** @type {HTMLInputElement} */ (this.view.querySelector('[data-instock]'));
    const apply = () => this.filterParts(filter.value, stockOnly.checked);
    filter.addEventListener('input', apply);
    stockOnly.addEventListener('change', apply);

    const facts = { total: -1, sections: 0, inStock: 0, diagrams: -1, makerParts: 0 };
    const tell = () => {
      const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
      const bits = [];
      if (facts.total > 0) bits.push(`${facts.total} part${s(facts.total)} in ${facts.sections} section${s(facts.sections)}, ${facts.inStock} in stock with us now.`);
      if (facts.diagrams > 0) {
        bits.push(`${brand.name || 'The maker'}'s exploded diagrams: ${facts.diagrams} section${s(facts.diagrams)}${facts.makerParts ? `, ${facts.makerParts} parts` : ''}.`);
      } else if (facts.diagrams < 0 && expectDiagrams) bits.push(facts.total < 0 ? '' : 'Loading the exploded diagrams…');
      summary.textContent = bits.filter(Boolean).join(' ') || 'Loading parts…';
    };

    /* The maker's diagrams arrive on their own, often after our list. */
    dealerRequest.then((dealer) => {
      if (!current()) return;
      facts.diagrams = this.renderDealer(model, dealer);
      facts.makerParts = (this.dealer?.sections || []).reduce((n, sec) => n + (sec.parts?.length || 0), 0);
      if (facts.diagrams) {
        tools.hidden = false;
        apply();
      }
      if (facts.total === 0 && !facts.diagrams) this.renderNoParts(partsBox, brand);
      if (facts.total === 0 && facts.diagrams) partsBox.innerHTML = '';
      tell();
    });

    /** @type {any[]} */
    let groups;
    try {
      groups = await cachedJson(urls.parts);
    } catch {
      if (!current()) return;
      partsBox.innerHTML = this.errorHtml('The parts for this machine did not load.');
      return;
    }
    if (!current()) return;
    if (!Array.isArray(groups)) groups = [];
    groups = groups.filter((g) => g?.products?.length);
    groups.sort((a, b) => Number(/service/i.test(b.categoryName)) - Number(/service/i.test(a.categoryName)));

    facts.total = groups.reduce((n, g) => n + g.products.length, 0);
    facts.sections = groups.length;
    facts.inStock = groups.reduce((n, g) => n + g.products.filter((/** @type {any} */ p) => p.inventoryQuantity > 0).length, 0);

    if (!facts.total) {
      /* Nothing of ours listed: wait for the maker's list before saying so. */
      if (facts.diagrams > 0) partsBox.innerHTML = '';
      else if (facts.diagrams === 0 || !expectDiagrams) this.renderNoParts(partsBox, brand);
      tell();
      return;
    }

    const sectionsNav = /** @type {HTMLElement} */ (this.view.querySelector('[data-sections]'));
    sectionsNav.innerHTML = `<ul role="list">${groups
      .map((g, i) => `<li><a href="#fpg-pf-s${i}" data-jump="${i}">${esc(g.categoryName.replace(/\s+/g, ' '))} <span>${g.products.length}</span></a></li>`)
      .join('')}</ul>`;
    sectionsNav.hidden = groups.length < 2;
    tools.hidden = false;

    partsBox.innerHTML = `
      ${facts.diagrams !== 0 || expectDiagrams ? `<h3 class="fpg-pf-listed">Parts we list for the ${esc(model.name)}</h3>` : ''}
      ${groups
        .map(
          (g, i) => `
        <section class="fpg-pf-group" id="fpg-pf-s${i}" data-group aria-labelledby="fpg-pf-s${i}-h">
          <h3 class="fpg-pf-group__h" id="fpg-pf-s${i}-h">${esc(g.categoryName.replace(/\s+/g, ' '))} <span data-group-count>${g.products.length}</span></h3>
          <ul class="fpg-pf-parts" role="list">${g.products.map((/** @type {any} */ p) => this.partHtml(p, brand.name, supplier)).join('')}</ul>
        </section>`
        )
        .join('')}`;
    tell();

    this.hideQuoteOnly();
    window.addEventListener('load', () => this.hideQuoteOnly(), { once: true });
    apply();

    if (supplier && this.dataset.polly) this.watchMakerStock(supplier);
  }

  renderNoParts(/** @type {HTMLElement} */ box, /** @type {Brand} */ brand) {
    box.innerHTML = `
      <div class="fpg-pf-help fpg-pf-help--inline">
        <p><strong>We can still get the part.</strong> Send us the model and serial number, or the part number from your manual, and we'll check price and stock with ${esc(brand.name || 'the maker')}.</p>
        ${this.contactHtml('Ask about a part', true)}
      </div>`;
    const summary = this.view.querySelector('[data-summary]');
    if (summary) summary.textContent = 'No parts listed online for this machine yet.';
  }

  dealerLoadingHtml(/** @type {string} */ brand) {
    return `
      <div class="fpg-pf-dealer__head">
        <h3 class="fpg-pf-group__h">Exploded diagrams</h3>
        <p class="fpg-pf-dealer__p">Loading ${esc(brand || 'the maker')}'s diagrams…</p>
      </div>
      <ul class="fpg-pf-dsecs fpg-pf-dsecs--loading" role="list" aria-hidden="true">${'<li><span class="fpg-pf-dsec fpg-pf-dsec--ghost"><span class="fpg-pf-dsec__pic"></span><span class="fpg-pf-skel"></span></span></li>'.repeat(4)}</ul>`;
  }

  partHtml(/** @type {any} */ p, /** @type {string} */ brand, /** @type {string} */ supplier) {
    const title = cleanTitle(p.title, p.sku, brand);
    const ex = Math.round(Number(p.price || 0) * 100);
    const inc = Math.round(ex * (1 + this.vat / 100));
    const variant = String(p.variantId || '').replace('gid://shopify/ProductVariant/', '');
    const productId = String(p.shopifyId || '').replace('gid://shopify/Product/', '');
    const qty = Number(p.inventoryQuantity || 0);
    const orderable = qty > 0 || p.inventoryPolicy === 'CONTINUE';
    const stock =
      qty > 0
        ? `<span class="fpg-pf-stock fpg-pf-stock--in">${qty} in stock</span>`
        : orderable
          ? `<span class="fpg-pf-stock fpg-pf-stock--order">Order in</span>`
          : `<span class="fpg-pf-stock fpg-pf-stock--out">Out of stock</span>`;
    const img = p.url && p.url.trim() ? `${p.url.trim()}${p.url.includes('?') ? '&' : '?'}width=360` : '';
    const search = squash(`${title} ${p.sku} ${partNumber(p.sku)}`);
    return `
      <li class="fpg-pf-part" data-part data-search="${esc(search)}" data-qty="${qty}" data-product-id="${esc(productId)}"${qty <= 0 && orderable && supplier && p.sku && String(p.title).toLowerCase().includes(supplier.replace(/-/g, ' ')) ? ` data-sku="${esc(p.sku)}"` : ''}>
        <a class="fpg-pf-part__img" href="/products/${encodeURIComponent(p.handle)}" tabindex="-1" aria-hidden="true">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy" width="180" height="180">` : machineIcon('wrench', 40)}
        </a>
        <div class="fpg-pf-part__body">
          <a class="fpg-pf-part__title" href="/products/${encodeURIComponent(p.handle)}">${esc(title)}</a>
          ${p.sku ? `<span class="fpg-pf-part__no">Part no. ${esc(partNumber(p.sku))}</span>` : ''}
          <div class="fpg-pf-part__stock">${stock}<span class="fpg-pf-maker" data-maker hidden></span></div>
        </div>
        <div class="fpg-pf-part__foot">
          <span class="fpg-pf-part__price"><strong>${money(ex)}</strong> <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(inc)})</span></span>
          ${this.buyHtml(variant, orderable)}
        </div>
      </li>`;
  }

  filterParts(/** @type {string} */ text, /** @type {boolean} */ stockOnly) {
    const q = squash(text);
    let shown = 0;
    for (const group of this.view.querySelectorAll('[data-group]')) {
      let inGroup = 0;
      for (const part of group.querySelectorAll('[data-part]')) {
        const el = /** @type {HTMLElement} */ (part);
        if (el.dataset.quote === 'true') continue;
        const hit = (!q || (el.dataset.search || '').includes(q)) && (!stockOnly || Number(el.dataset.qty) > 0);
        el.hidden = !hit;
        if (hit) inGroup++;
      }
      /** @type {HTMLElement} */ (group).hidden = inGroup === 0;
      const count = group.querySelector('[data-group-count]');
      if (count) count.textContent = String(inGroup);
      shown += inGroup;
    }
    for (const tile of this.view.querySelectorAll('[data-dsec]')) {
      const el = /** @type {HTMLElement} */ (tile);
      const hit = !q || (el.dataset.search || '').includes(q);
      /** @type {HTMLElement} */ (el.closest('li') || el).hidden = !hit;
      if (hit) shown++;
    }
    /** @type {HTMLElement} */ (this.view.querySelector('[data-parts-none]')).hidden = shown > 0;
    const nav = /** @type {HTMLElement | null} */ (this.view.querySelector('[data-sections]'));
    if (nav) {
      this.view.querySelectorAll('[data-group]').forEach((g, i) => {
        const link = nav.querySelector(`[data-jump="${i}"]`)?.parentElement;
        if (link) link.hidden = /** @type {HTMLElement} */ (g).hidden;
      });
    }
  }

  /** Parts the Call for Price app marks as quote-only are hidden, as elsewhere on the site. */
  hideQuoteOnly() {
    const quote = String(/** @type {any} */ (window).cfp_products?.products || '').split(',').filter(Boolean);
    if (!quote.length) return;
    for (const part of this.view.querySelectorAll('[data-part]')) {
      const el = /** @type {HTMLElement} */ (part);
      if (quote.includes(el.dataset.productId || '')) {
        el.dataset.quote = 'true';
        el.hidden = true;
      }
    }
  }

  supplierFor(/** @type {string} */ brand) {
    const list = String(this.dataset.pollyVendors || 'STIHL, Husqvarna')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const b = String(brand || '').toLowerCase();
    return list.find((name) => b.includes(name))?.replace(/\s+/g, '-') || '';
  }

  watchMakerStock(/** @type {string} */ supplier) {
    const base = String(this.dataset.polly || '');
    const brand = brandName(supplier);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = /** @type {HTMLElement} */ (entry.target);
          this.observer?.unobserve(el);
          const out = /** @type {HTMLElement | null} */ (el.querySelector('[data-maker]'));
          if (!out) continue;
          out.hidden = false;
          out.dataset.state = 'loading';
          out.textContent = `Checking ${brand}…`;
          makerStock(base, supplier, el.dataset.sku || '').then((answer) => {
            if (!answer || answer.status === 'unavailable') {
              out.hidden = true;
              return;
            }
            if (answer.status === 'in-stock') {
              out.dataset.state = 'in';
              out.textContent = `${brand} has it: adds 24–48 hrs`;
              out.title = `We don't have this on the shelf, but ${brand} does. We'll order it in for you, which adds 24–48 hours to delivery.`;
              return;
            }
            const date = answer.eta ? new Date(answer.eta) : null;
            out.dataset.state = 'order';
            out.textContent =
              date && !Number.isNaN(date.getTime())
                ? `Due from ${brand} ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : `On order from ${brand}`;
          });
        }
      },
      { rootMargin: '200px 0px' }
    );
    for (const el of this.view.querySelectorAll('[data-sku]')) this.observer.observe(el);
  }

  /* ---------- the maker's diagrams */

  /** Tiles for the maker's parts list, one per section with its diagram. Returns how many. */
  renderDealer(/** @type {Model} */ model, /** @type {any} */ dealer) {
    const box = /** @type {HTMLElement | null} */ (this.view.querySelector('[data-dealer]'));
    const sections = (dealer?.sections || []).filter((/** @type {any} */ s) => s?.parts?.length || s?.diagrams?.length);
    if (!box) return 0;
    if (!sections.length) {
      box.hidden = true;
      box.innerHTML = '';
      return 0;
    }
    this.dealer = { modelId: model.id, model, source: String(dealer.source || ''), sections };
    const brand = model.type.brand.name;
    box.innerHTML = `
      <div class="fpg-pf-dealer__head">
        <h3 class="fpg-pf-group__h">Exploded diagrams <span>${sections.length}</span></h3>
        <p class="fpg-pf-dealer__p">${esc(brand || 'The maker')}'s own parts list for the ${esc(model.name)}. Open a section, then tap a number on the drawing to find the part.</p>
      </div>
      <ul class="fpg-pf-dsecs" role="list">${sections.map((/** @type {any} */ sec, /** @type {number} */ i) => this.dealerTileHtml(sec, i)).join('')}</ul>`;
    box.hidden = false;
    return sections.length;
  }

  dealerTileHtml(/** @type {any} */ sec, /** @type {number} */ i) {
    const parts = sec.parts || [];
    const pics = sec.diagrams || [];
    const words = squash([sec.name, ...parts.map((/** @type {any} */ p) => `${p.title} ${p.sku || ''} ${p.partNumber || ''}`)].join(' '));
    const name = sectionName(sec.name);
    const { code, label } = sectionCode(name);
    return `
      <li>
        <button type="button" class="fpg-pf-dsec" data-dsec="${i}" data-search="${esc(words)}" aria-label="${esc(name)}: diagram and ${parts.length} parts">
          <span class="fpg-pf-dsec__pic">${
            pics.length ? `<img src="${esc(this.diagramUrl(pics[0].thumb))}" alt="" loading="lazy" decoding="async">` : `<span>No diagram</span>`
          }</span>
          <span class="fpg-pf-dsec__name">${code ? `<span class="fpg-pf-dsec__code" aria-hidden="true">${esc(code)}</span>` : ''}${esc(label)}</span>
          <span class="fpg-pf-dsec__count">${parts.length} part${parts.length === 1 ? '' : 's'}${pics.length > 1 ? ` · ${pics.length} drawings` : ''}</span>
        </button>
      </li>`;
  }

  diagramUrl(/** @type {string} */ name) {
    return `${this.proxy}/diagram/${encodeURIComponent(name)}?modelId=${encodeURIComponent(this.dealer?.modelId ?? '')}`;
  }

  /** The viewer: the drawing (zoom, drag to pan, clickable numbers) beside the section's parts. */
  openSection(/** @type {number} */ index, start = 0) {
    const sec = this.dealer?.sections[index];
    if (!sec) return;
    const pics = sec.diagrams || [];
    let at = Math.max(0, Math.min(pics.length - 1, start));
    this.viewer?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'fpg-pf-viewer';
    dialog.setAttribute('aria-label', `${this.dealer?.model.name} ${sectionName(sec.name)} diagram`);
    this.viewer = dialog;
    this.append(dialog);
    const brand = this.dealer?.model.type.brand.name || '';
    const rows = (sec.parts || []).map((/** @type {any} */ p, /** @type {number} */ i) => this.dealerRowHtml(p, i, brand)).join('') ||
      '<p class="fpg-pf-v__note">No parts listed in this section.</p>';

    const state = { zoom: 1, maps: /** @type {any[]} */ ([]), run: 0, drag: /** @type {any} */ (null) };
    const secs = this.dealer?.sections || [];
    const secLabel = (/** @type {any} */ s) => sectionCode(sectionName(s?.name || '')).label;
    const foot =
      secs.length > 1
        ? `<footer class="fpg-pf-v__foot">
            <button type="button" class="fpg-pf-v__sec" data-v-sec="-1" ${index === 0 ? 'disabled' : ''}><span aria-hidden="true">‹</span> <span class="fpg-pf-v__sec-name">${index > 0 ? esc(secLabel(secs[index - 1])) : 'Previous'}</span><span class="visually-hidden"> (previous section)</span></button>
            <span class="fpg-pf-v__pos">Section ${index + 1} of ${secs.length}</span>
            <button type="button" class="fpg-pf-v__sec" data-v-sec="1" ${index === secs.length - 1 ? 'disabled' : ''}><span class="fpg-pf-v__sec-name">${index < secs.length - 1 ? esc(secLabel(secs[index + 1])) : 'Next'}</span><span class="visually-hidden"> (next section)</span> <span aria-hidden="true">›</span></button>
          </footer>`
        : '';
    const paint = () => {
      const pic = pics[at];
      /* When the numbers are already here, show the image they were measured on straight away. */
      const known = pic?.numbers ? numbersReady.get(this.numbersUrl(sec, at)) : null;
      const first = known?.image || pic?.view;
      dialog.innerHTML = `
        <div class="fpg-pf-v">
          <header class="fpg-pf-v__head">
            <div class="fpg-pf-v__title"><span>${esc(this.dealer?.model.name || '')}</span> ${esc(sectionName(sec.name))}</div>
            ${pics.length > 1 ? `<div class="fpg-pf-v__nav"><button type="button" class="fpg-pf-v__btn" data-v-step="-1" ${at === 0 ? 'disabled' : ''} aria-label="Previous drawing">‹</button><span>${at + 1} of ${pics.length}</span><button type="button" class="fpg-pf-v__btn" data-v-step="1" ${at === pics.length - 1 ? 'disabled' : ''} aria-label="Next drawing">›</button></div>` : ''}
            ${pic ? `<div class="fpg-pf-v__zoom"><button type="button" class="fpg-pf-v__btn" data-v-zoom="-1" aria-label="Zoom out">−</button><span data-v-zoom-label></span><button type="button" class="fpg-pf-v__btn" data-v-zoom="1" aria-label="Zoom in">+</button><button type="button" class="fpg-pf-v__btn fpg-pf-v__btn--text" data-v-zoom="0">Fit</button></div>` : ''}
            <button type="button" class="fpg-pf-v__close" data-v-close aria-label="Close">×</button>
          </header>
          <p class="fpg-pf-v__hint" data-v-hint aria-live="polite">${pic ? '' : 'There is no drawing for this section.'}</p>
          <div class="fpg-pf-v__body${pic ? '' : ' fpg-pf-v__body--nopic'}">
            ${pic ? `<div class="fpg-pf-v__scroll" data-v-scroll data-loading="true"><div class="fpg-pf-v__stage" data-v-stage><img src="${esc(this.diagramUrl(first))}" alt="${esc(sectionName(sec.name))} diagram" draggable="false" fetchpriority="high"${known ? ` data-w="${esc(known.w)}" data-h="${esc(known.h)}"` : ''}><div class="fpg-pf-v__hot" data-v-hot></div></div><p class="fpg-pf-v__loading" aria-hidden="true">Loading the drawing…</p></div>` : ''}
            <div class="fpg-pf-v__list">${rows}</div>
          </div>
          ${foot}
        </div>`;
      state.zoom = 1;
      state.maps = [];
      if (!pic) return;
      const img = /** @type {HTMLImageElement} */ (dialog.querySelector('[data-v-stage] img'));
      const loaded = () => {
        const box = dialog.querySelector('[data-v-scroll]');
        if (box instanceof HTMLElement) delete box.dataset.loading;
      };
      if (img.complete && img.naturalWidth) loaded();
      img.addEventListener('load', () => {
        loaded();
        size();
      });
      img.addEventListener('error', () => {
        loaded();
        const note = document.createElement('p');
        note.className = 'fpg-pf-v__note';
        note.textContent = 'This drawing did not load. Please try again shortly.';
        img.replaceWith(note);
      });
      size();
      const run = ++state.run;
      if (pic.numbers) this.loadNumbers(sec, at, dialog, state, run, size);
      else say('Match the numbers on the drawing to the Ref column.');
    };
    const say = (/** @type {string} */ text) => {
      const hint = dialog.querySelector('[data-v-hint]');
      if (hint) hint.textContent = text;
    };
    const size = () => {
      const scroll = /** @type {HTMLElement | null} */ (dialog.querySelector('[data-v-scroll]'));
      const img = /** @type {HTMLImageElement | null} */ (dialog.querySelector('[data-v-stage] img'));
      if (!scroll || !img) return;
      const w = Number(img.dataset.w) || img.naturalWidth;
      const h = Number(img.dataset.h) || img.naturalHeight;
      if (!w || !h) return;
      const fit = Math.min((scroll.clientWidth - 16) / w, (scroll.clientHeight - 16) / h);
      img.style.width = `${Math.max(40, Math.round(w * fit * state.zoom))}px`;
      scroll.dataset.zoomed = String(state.zoom > 1);
      const label = dialog.querySelector('[data-v-zoom-label]');
      if (label) label.textContent = state.zoom <= 1 ? '' : `${Math.round(state.zoom * 100)}%`;
      const out = /** @type {HTMLButtonElement | null} */ (dialog.querySelector('[data-v-zoom="-1"]'));
      const inn = /** @type {HTMLButtonElement | null} */ (dialog.querySelector('[data-v-zoom="1"]'));
      if (out) out.disabled = state.zoom <= 1;
      if (inn) inn.disabled = state.zoom >= ZOOM_MAX;
    };
    const zoomTo = (/** @type {number} */ z, /** @type {{x:number,y:number}=} */ anchor) => {
      const scroll = /** @type {HTMLElement | null} */ (dialog.querySelector('[data-v-scroll]'));
      const stage = /** @type {HTMLElement | null} */ (dialog.querySelector('[data-v-stage]'));
      if (!scroll || !stage) return;
      const r = scroll.getBoundingClientRect();
      const a = anchor || { x: r.left + scroll.clientWidth / 2, y: r.top + scroll.clientHeight / 2 };
      const before = stage.getBoundingClientRect();
      const fx = before.width ? (a.x - before.left) / before.width : 0.5;
      const fy = before.height ? (a.y - before.top) / before.height : 0.5;
      state.zoom = Math.max(1, Math.min(ZOOM_MAX, z));
      size();
      const after = stage.getBoundingClientRect();
      scroll.scrollLeft += after.left + fx * after.width - a.x;
      scroll.scrollTop += after.top + fy * after.height - a.y;
    };

    dialog.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === dialog || t.closest('[data-v-close]')) return shut();
      const hot = t.closest('[data-hot]');
      if (hot instanceof HTMLElement) return this.showNumber(dialog, sec, state.maps[Number(hot.dataset.hot)], state.maps, true, say);
      const secStep = t.closest('[data-v-sec]');
      if (secStep instanceof HTMLElement) {
        const to = index + Number(secStep.dataset.vSec);
        if (to < 0 || to >= secs.length) return;
        shut();
        return this.openSection(to);
      }
      const step = t.closest('[data-v-step]');
      if (step instanceof HTMLElement) {
        at += Number(step.dataset.vStep);
        return paint();
      }
      const zb = t.closest('[data-v-zoom]');
      if (zb instanceof HTMLElement) {
        const dir = Number(zb.dataset.vZoom);
        if (!dir) return zoomTo(1);
        const next = dir > 0 ? ZOOM_STEPS.find((z) => z > state.zoom + 0.01) || ZOOM_MAX : [...ZOOM_STEPS].reverse().find((z) => z < state.zoom - 0.01) || 1;
        return zoomTo(next);
      }
      const row = t.closest('[data-v-row]');
      if (row instanceof HTMLElement && !t.closest('a,button')) {
        const part = (sec.parts || [])[Number(row.dataset.vRow)];
        const box = state.maps.find((b) => matchesPart(b, part));
        if (box) this.showNumber(dialog, sec, box, state.maps, false, say);
      }
    });
    dialog.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !(e.target instanceof Element) || !e.target.closest('[data-v-scroll]')) return;
      e.preventDefault();
      zoomTo(state.zoom * (e.deltaY < 0 ? 1.25 : 0.8), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    dialog.addEventListener('pointerdown', (e) => {
      const scroll = e.target instanceof Element ? e.target.closest('[data-v-scroll]') : null;
      if (!(scroll instanceof HTMLElement) || e.button !== 0 || /** @type {Element} */ (e.target).closest('[data-hot]') || state.zoom <= 1) return;
      state.drag = { scroll, x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
      scroll.setPointerCapture(e.pointerId);
      scroll.dataset.dragging = 'true';
    });
    dialog.addEventListener('pointermove', (e) => {
      const d = state.drag;
      if (!d) return;
      d.scroll.scrollLeft = d.left - (e.clientX - d.x);
      d.scroll.scrollTop = d.top - (e.clientY - d.y);
    });
    const endDrag = () => {
      if (state.drag) delete state.drag.scroll.dataset.dragging;
      state.drag = null;
    };
    dialog.addEventListener('pointerup', endDrag);
    dialog.addEventListener('pointercancel', endDrag);
    dialog.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' && at < pics.length - 1) {
        at++;
        paint();
      } else if (e.key === 'ArrowLeft' && at > 0) {
        at--;
        paint();
      } else if (e.key === '+' || e.key === '=') zoomTo(state.zoom * 1.5);
      else if (e.key === '-') zoomTo(state.zoom / 1.5);
      else if (e.key === '0') zoomTo(1);
    });
    const onResize = () => size();
    window.addEventListener('resize', onResize);
    /* Closes and tidies up straight away rather than waiting for the dialog's close event. */
    const shut = () => {
      if (!dialog.isConnected) return;
      window.removeEventListener('resize', onResize);
      state.run++;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (this.viewer === dialog) this.viewer = null;
      /** @type {HTMLElement | null} */ (this.view.querySelector(`[data-dsec="${index}"]`))?.focus();
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      shut();
    });
    dialog.addEventListener('close', shut);
    dialog.showModal();
    paint();
    /* This section's other drawings and the next section are the likeliest clicks. */
    pics.forEach((/** @type {any} */ pic, /** @type {number} */ i) => {
      if (i !== at && pic.numbers) fetchNumbers(this.numbersUrl(sec, i));
    });
    this.prefetchDrawing(index + 1);
  }

  dealerRowHtml(/** @type {any} */ p, /** @type {number} */ i, /** @type {string} */ brand) {
    const ref = p.diagramRef ? esc(p.diagramRef) : '–';
    const qtyOn = Number(p.quantity) > 1 ? ` · ${Number(p.quantity)} on the machine` : '';
    const no = partNumber(p.sku || p.partNumber || '');
    if (p.unavailable || !p.variantId) {
      return `
        <div class="fpg-pf-vrow" data-v-row="${i}">
          <span class="fpg-pf-vrow__ref">${ref}</span>
          <div class="fpg-pf-vrow__body">
            <span class="fpg-pf-vrow__name">${esc(cleanTitle(p.title, p.sku, brand))}</span>
            <span class="fpg-pf-vrow__no">Part no. ${esc(no)}${qtyOn}</span>
            <div class="fpg-pf-vrow__buy"><span class="fpg-pf-stock fpg-pf-stock--out">Not sold online</span>${this.contactHtml('Ask us')}</div>
          </div>
        </div>`;
    }
    const ex = Math.round(Number(p.price || 0) * 100);
    const inc = Math.round(ex * (1 + this.vat / 100));
    const qty = Number(p.inventoryQuantity || 0);
    const orderable = qty > 0 || p.inventoryPolicy === 'CONTINUE';
    const variant = String(p.variantId).replace('gid://shopify/ProductVariant/', '');
    const stock = qty > 0
      ? `<span class="fpg-pf-stock fpg-pf-stock--in">${qty} in stock</span>`
      : orderable ? `<span class="fpg-pf-stock fpg-pf-stock--order">Order in</span>` : `<span class="fpg-pf-stock fpg-pf-stock--out">Out of stock</span>`;
    return `
      <div class="fpg-pf-vrow" data-v-row="${i}">
        <span class="fpg-pf-vrow__ref">${ref}</span>
        <div class="fpg-pf-vrow__body">
          <a class="fpg-pf-vrow__name" href="/products/${encodeURIComponent(p.handle)}">${esc(cleanTitle(p.title, p.sku, brand))}</a>
          <span class="fpg-pf-vrow__no">Part no. ${esc(no)}${qtyOn}</span>
          <div class="fpg-pf-vrow__buy">
            ${stock}
            <span class="fpg-pf-part__price"><strong>${money(ex)}</strong> <span class="fpg-vat">+ VAT</span> <span class="fpg-vat fpg-vat--inc">(${money(inc)})</span></span>
            ${this.buyHtml(variant, orderable)}
          </div>
        </div>
      </div>`;
  }

  /** The clickable number boxes for the drawing on screen. */
  async loadNumbers(/** @type {any} */ sec, /** @type {number} */ at, /** @type {HTMLDialogElement} */ dialog, /** @type {any} */ state, /** @type {number} */ run, /** @type {() => void} */ size) {
    const say = (/** @type {string} */ text) => {
      const hint = dialog.querySelector('[data-v-hint]');
      if (hint) hint.textContent = text;
    };
    const url = this.numbersUrl(sec, at);
    if (!numbersReady.has(url)) say('Loading the clickable numbers…');
    const data = await fetchNumbers(url);
    if (run !== state.run) return;
    if (!data?.ok || !Array.isArray(data.maps)) return say('Match the numbers on the drawing to the Ref column.');
    const img = /** @type {HTMLImageElement | null} */ (dialog.querySelector('[data-v-stage] img'));
    if (!img) return;
    img.dataset.w = data.w;
    img.dataset.h = data.h;
    const want = this.diagramUrl(data.image);
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    size();
    if (this.dealer?.source === 'husqvarna' && !data.snapped) {
      try {
        data.maps = await snapBoxesToDigits(img, data);
      } catch {
        /* keep the maker's boxes */
      }
      data.snapped = true;
      if (run !== state.run) return;
    }
    state.maps = data.maps;
    const layer = dialog.querySelector('[data-v-hot]');
    const pct = (/** @type {number} */ v, /** @type {number} */ of) => `${((100 * v) / of).toFixed(3)}%`;
    if (layer) {
      layer.innerHTML = data.maps
        .map((/** @type {any} */ b, /** @type {number} */ i) =>
          `<button type="button" class="fpg-pf-v__num" data-hot="${i}" aria-label="Number ${esc(b.a || '?')}" style="left:${pct(b.x1, data.w)};top:${pct(b.y1, data.h)};width:${pct(b.x2 - b.x1, data.w)};height:${pct(b.y2 - b.y1, data.h)}"></button>`)
        .join('');
    }
    say('Tap a number on the drawing to find its part.');
  }

  showNumber(/** @type {HTMLDialogElement} */ dialog, /** @type {any} */ sec, /** @type {any} */ box, /** @type {any[]} */ maps, /** @type {boolean} */ scrollList, /** @type {(t: string) => void} */ say) {
    if (!box) return;
    dialog.querySelectorAll('[data-hot]').forEach((b) => {
      const other = maps[Number(/** @type {HTMLElement} */ (b).dataset.hot)];
      b.classList.toggle('is-on', !!other && other.a === box.a);
    });
    /** @type {HTMLElement | null} */
    let first = null;
    dialog.querySelectorAll('[data-v-row]').forEach((row) => {
      const on = matchesPart(box, (sec.parts || [])[Number(/** @type {HTMLElement} */ (row).dataset.vRow)]);
      row.classList.toggle('is-on', on);
      if (on && !first) first = /** @type {HTMLElement} */ (row);
    });
    if (scrollList) {
      /** @type {HTMLElement | null} */ (first)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      say(first ? `Number ${box.a}` : `Number ${box.a} isn't in this list. Ask us and we'll look it up.`);
    }
  }

  /* ---------- clicks */

  onClick = async (/** @type {MouseEvent} */ event) => {
    const t = /** @type {HTMLElement} */ (event.target);
    const el = t.closest('[data-go-home],[data-go-brand],[data-go-type],[data-go-model],[data-add],[data-qty-step],[data-save],[data-forget],[data-jump],[data-retry],[data-suggest-go],[data-dsec]');
    if (!(el instanceof HTMLElement)) return;
    const d = el.dataset;
    if ('goHome' in d) return this.go({});
    if (d.goBrand) return this.go({ brand: Number(d.goBrand) });
    if (d.goType) {
      const type = this.data?.brands.flatMap((b) => b.types).find((x) => String(x.id) === d.goType);
      return this.go({ brand: type?.brand.id, type: Number(d.goType) });
    }
    if (d.goModel) {
      const model = this.data?.models.find((m) => String(m.id) === d.goModel);
      this.hideSuggestions();
      return this.go({ brand: model?.type.brand.id, type: model?.type.id, model: Number(d.goModel) });
    }
    if (d.suggestGo) {
      location.href = d.suggestGo;
      return;
    }
    if ('retry' in d) return this.route(false);
    if (d.jump) {
      event.preventDefault();
      const target = this.view.querySelector(`#fpg-pf-s${d.jump}`);
      const top = (target?.getBoundingClientRect().top || 0) + window.scrollY - 150;
      window.scrollTo({ top, behavior: 'smooth' });
      return;
    }
    if (d.save) return this.toggleSave(Number(d.save), el);
    if (d.forget) return this.forget(Number(d.forget));
    if (d.add) return this.add(el, d.add);
    if (d.qtyStep) return this.stepQuantity(el);
    if (d.dsec) return this.openSection(Number(d.dsec));
  };

  async add(/** @type {HTMLElement} */ button, /** @type {string} */ variant) {
    const b = /** @type {HTMLButtonElement} */ (button);
    const label = b.textContent;
    b.disabled = true;
    b.textContent = 'Adding…';
    try {
      const tools = /** @type {any} */ (window).FPGTools;
      let cart = null;
      if (tools?.addItemsToCart) cart = await tools.addItemsToCart([{ id: Number(variant), quantity: 1 }], b);
      else {
        const r = await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(variant), quantity: 1 }) });
        if (!r.ok) throw new Error((await r.json()).description || 'Could not add');
      }
      if (!cart) cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());
      /* The button becomes the basket quantity with − and +, here and anywhere else this part shows. */
      this.setBasket(cart);
      if (b.isConnected) {
        b.textContent = 'Added ✓';
        b.dataset.state = 'added';
      }
    } catch (error) {
      b.textContent = 'Could not add';
      console.warn('[FP&G parts finder]', error);
      setTimeout(() => {
        b.textContent = label;
        b.disabled = false;
      }, 2000);
    }
  }

  /* ---------- my machines */

  isSaved(/** @type {number} */ id) {
    return readStore(STORE_MACHINES, []).includes(id);
  }

  toggleSave(/** @type {number} */ id, /** @type {HTMLElement} */ button) {
    let list = readStore(STORE_MACHINES, []).filter((/** @type {number} */ x) => x !== id);
    const saving = button.getAttribute('aria-pressed') !== 'true';
    if (saving) list = [id, ...list].slice(0, 20);
    writeStore(STORE_MACHINES, list);
    button.setAttribute('aria-pressed', String(saving));
    button.textContent = saving ? 'Saved to my machines' : 'Save to my machines';
    this.renderMine();
  }

  forget(/** @type {number} */ id) {
    writeStore(
      STORE_MACHINES,
      readStore(STORE_MACHINES, []).filter((/** @type {number} */ x) => x !== id)
    );
    this.renderMine();
    const save = this.view.querySelector(`[data-save="${id}"]`);
    if (save) {
      save.setAttribute('aria-pressed', 'false');
      save.textContent = 'Save to my machines';
    }
  }

  renderMine() {
    if (!this.mine || !this.data) return;
    const ids = readStore(STORE_MACHINES, []);
    const models = ids.map((/** @type {number} */ id) => this.data?.models.find((m) => m.id === id)).filter(Boolean);
    const page = esc(this.dataset.machinesUrl || '/pages/my-machines');
    this.mine.hidden = false;
    this.mine.innerHTML = models.length
      ? `<a class="fpg-pf-mine__label" href="${page}">My machines</a><ul role="list">${models
          .map(
            (/** @type {Model} */ m) => `<li class="fpg-pf-chip">
              <button type="button" data-go-model="${m.id}">${machineIcon(m.type.name, 18)}<span>${esc(m.type.brand.name)} ${esc(m.name)}</span></button>
              <button type="button" class="fpg-pf-chip__x" data-forget="${m.id}" aria-label="Remove ${esc(m.type.brand.name)} ${esc(m.name)} from my machines">×</button>
            </li>`
          )
          .join('')}</ul>`
      : `<a class="fpg-pf-mine__empty" href="${page}">${machineIcon('', 18)}<span>Save the machines you own for one-tap parts and servicing</span><span aria-hidden="true">→</span></a>`;
  }

  /* ---------- search box */

  matches(/** @type {string} */ text) {
    const q = squash(text);
    if (!q || !this.data) return [];
    /** @type {Array<[number, Model]>} */
    const scored = [];
    for (const m of this.data.models) {
      const brandKey = squash(m.type.brand.name);
      const full = brandKey + m.key;
      let score = 0;
      if (m.key === q || full === q) score = 100;
      else if (m.key.startsWith(q) || full.startsWith(q)) score = 70 - m.key.length;
      else if (m.key.includes(q)) score = 40 - m.key.length;
      if (score) scored.push([score + (m.type.brand.priority ? 5 : 0), m]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, m]) => m);
  }

  showSuggestions() {
    if (!this.suggest || !this.input) return;
    const text = this.input.value.trim();
    if (!text) return this.hideSuggestions();
    const found = this.matches(text);
    const looksLikePart = /\d{3,}/.test(text.replace(/\s/g, '')) && text.replace(/\D/g, '').length >= 7;
    const normalise = /** @type {any} */ (window).fpgNormaliseSearch;
    const query = (typeof normalise === 'function' && normalise(text)) || text;
    const searchUrl = `${this.dataset.searchUrl || '/search'}?q=${encodeURIComponent(query)}`;
    const items = found.map(
      (m) => `<li role="option" id="fpg-pf-o${m.id}"><button type="button" data-go-model="${m.id}" tabindex="-1">
        ${machineIcon(m.type.name, 22)}<span><strong>${esc(m.type.brand.name)} ${esc(m.name)}</strong><small>${esc(m.type.name)}</small></span></button></li>`
    );
    items.push(
      `<li role="option" id="fpg-pf-oq"><button type="button" data-suggest-go="${esc(searchUrl)}" tabindex="-1">${SEARCH_ICON}<span><strong>${
        looksLikePart ? 'Search part number' : 'Search the shop for'
      } “${esc(text)}”</strong><small>${looksLikePart ? 'Finds the exact part, however it is spaced' : 'Parts, machines and accessories'}</small></span></button></li>`
    );
    this.suggest.innerHTML = items.join('');
    this.suggest.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.active = -1;
  }

  hideSuggestions() {
    if (this.suggest) this.suggest.hidden = true;
    this.input?.setAttribute('aria-expanded', 'false');
    this.input?.removeAttribute('aria-activedescendant');
  }

  active = -1;

  onSearchKey = (/** @type {KeyboardEvent} */ e) => {
    if (!this.suggest || this.suggest.hidden) return;
    const options = [...this.suggest.querySelectorAll('[role="option"]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle('is-active', i === this.active));
      this.input?.setAttribute('aria-activedescendant', options[this.active]?.id || '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = options[this.active >= 0 ? this.active : 0];
      /** @type {HTMLElement | null} */ (pick?.querySelector('button'))?.click();
    } else if (e.key === 'Escape') this.hideSuggestions();
  };

  /* ---------- bits */

  contactHtml(/** @type {string} */ label, button = false) {
    const url = this.dataset.contactUrl || '/pages/contact';
    return `<a href="${esc(url)}" class="${button ? 'fpg-pf-btn' : 'fpg-pf-link'}">${esc(label)}</a>`;
  }

  errorHtml(/** @type {string} */ text) {
    return `<div class="fpg-pf-help fpg-pf-help--inline"><p>${esc(text)} Check your connection and try again.</p><button type="button" class="fpg-pf-btn" data-retry>Try again</button></div>`;
  }

  skeletonHtml() {
    return `<ul class="fpg-pf-parts fpg-pf-parts--loading" role="list" aria-hidden="true">${'<li class="fpg-pf-part fpg-pf-part--ghost"><span></span><span></span><span></span></li>'.repeat(8)}</ul>`;
  }
}

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: /** @type {any} */ (window).Shopify?.currency?.active || 'GBP' });
const money = (/** @type {number} */ pence) => fmt.format(pence / 100);

if (!customElements.get('fpg-parts-finder')) customElements.define('fpg-parts-finder', FpgPartsFinder);

/* ---------------------------------------------------------------- product page link */

/**
 * Finds the machine a product is for from its brand and title, using the
 * longest model name that appears in the title as a whole word ("MS 261" in
 * "STIHL MS 261 C-M Chainsaw"), and links to that machine's parts.
 */
export function findMachine(/** @type {{ brands: Brand[] }} */ data, /** @type {string} */ vendor, /** @type {string} */ title) {
  const v = squash(vendor);
  const brand = data.brands.find((b) => squash(b.name) === v || (v && squash(b.name).startsWith(v)) || (v && v.startsWith(squash(b.name))));
  if (!brand) return null;
  const text = ` ${String(title || '').toUpperCase()} `;
  /** @type {Model | null} */
  let best = null;
  for (const type of brand.types) {
    for (const m of type.models) {
      if (/^\d{1,2}$/.test(m.name)) continue; /* "36", "55": too likely to match sizes */
      const pattern = m.name
        .toUpperCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+|-/g, '[\\s-]*');
      if (new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(text)) {
        if (!best || m.key.length > best.key.length) best = m;
      }
    }
  }
  return best;
}

class FpgPartsLink extends HTMLElement {
  async connectedCallback() {
    try {
      const data = await loadIndex(this.dataset.index || '');
      const model = findMachine(data, this.dataset.vendor || '', this.dataset.title || '');
      if (!model) return;
      const url = new URL(this.dataset.finder || '/pages/fpg-part-finder', location.origin);
      url.searchParams.set('brand', String(model.type.brand.id));
      url.searchParams.set('type', String(model.type.id));
      url.searchParams.set('model', String(model.id));
      const a = /** @type {HTMLAnchorElement | null} */ (this.querySelector('a'));
      if (!a) return;
      a.href = url.pathname + url.search;
      const name = this.querySelector('[data-name]');
      if (name) name.textContent = `${model.type.brand.name} ${model.name}`;
      const icon = this.querySelector('[data-icon]');
      if (icon) icon.innerHTML = machineIcon(model.type.name, 30);
      this.hidden = false;
    } catch (error) {
      console.warn('[FP&G parts link]', error);
    }
  }
}

if (!customElements.get('fpg-parts-link')) customElements.define('fpg-parts-link', FpgPartsLink);
