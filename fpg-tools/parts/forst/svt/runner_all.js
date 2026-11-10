async function runMachine(slug, S) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const anchors = () => [...document.querySelectorAll(`ul a[href*="/product-library/${slug}/parts-catalogue/"]`)].filter((a) => a.textContent.trim());
  const key = () => anchors().map((a) => a.getAttribute('href')).join('|');
  // Open the machine inside the catalogue (no page reload), then wait for its parts list.
  history.pushState({}, '', `/product-library/${slug}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  for (let i = 0; i < 150 && !anchors().length; i++) await sleep(200);
  if (!anchors().length) throw new Error('machine did not open: ' + slug);
  // Let the 3D model finish loading before any pictures are taken.
  for (let i = 0; i < 60 && /LOADING/i.test(document.body.innerText); i++) await sleep(500);
  await sleep(4000);
  Object.defineProperty(window, 'devicePixelRatio', { get: () => 2.5, configurable: true });
  window.dispatchEvent(new Event('resize'));
  await sleep(800);

  const listLinks = () => anchors().map((a) => {
    const href = a.getAttribute('href');
    const qty = (a.textContent.match(/Qty\s*(\d+)\s*$/) || [])[1];
    return { name: a.textContent.replace(/Qty\s*\d+\s*$/, '').trim(), href, leaf: /[?&]mesh=/.test(href), qty: qty ? +qty : 1 };
  });
  const waitList = async (prevHref, prevKey) => {
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const k = key();
      if (location.href !== prevHref && k && k !== prevKey) { await sleep(400); return true; }
    }
    return false;
  };
  const pageCode = () => { const m = document.body.innerText.match(/\n(\d{2}-[0-9A-Z]{1,3}-[0-9A-Z._]+)\n/); return m ? m[1] : ''; };
  const go = async (url, settle) => {
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await sleep(settle);
  };
  // Open a list page by its address and wait for its list to change (no history.back: it can leave the catalogue).
  const open = async (url) => {
    const prevK = key();
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    for (let i = 0; i < 80; i++) { await sleep(150); const k = key(); if (k && k !== prevK) { await sleep(400); return true; } }
    return false;
  };
  async function walk(path, depth, url) {
    const here = { path, url, code: pageCode(), parts: [], children: [] };
    const links = listLinks();
    for (const l of links) if (l.leaf) here.parts.push({ name: l.name, href: l.href, qty: l.qty });
    for (const l of links.filter((x) => !x.leaf)) {
      if (depth > 6) continue;
      if (!(await open(l.href))) { here.children.push({ path: [...path, l.name], href: l.href, error: 'no nav' }); await open(url); continue; }
      here.children.push(await walk([...path, l.name], depth + 1, l.href));
      await open(url);
      S.done++;
    }
    return here;
  }

  const grab = () => new Promise((resolve) => {
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const orig = window.requestAnimationFrame;
    const t = setTimeout(() => { window.requestAnimationFrame = orig; resolve(null); }, 3000);
    window.requestAnimationFrame = (cb) => orig((ts) => {
      cb(ts);
      window.requestAnimationFrame = orig;
      clearTimeout(t);
      try { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); resolve(c); } catch (e) { resolve(null); }
    });
  });
  // Yellow on a grid of every 2nd pixel: Partful's highlight colour (also on warning decals, so compare with a baseline).
  // Wait until the 3D camera has stopped moving (two small frames in a row the same), then take the full frame.
  const settled = async (maxMs = 9000) => {
    const small = (c) => { const k = document.createElement('canvas'); k.width = 160; k.height = Math.round(160 * c.height / c.width); k.getContext('2d').drawImage(c, 0, 0, k.width, k.height); return k.getContext('2d').getImageData(0, 0, k.width, k.height).data; };
    const t0 = Date.now();
    let prev = null, last = null, still = 0;
    while (Date.now() - t0 < maxMs) {
      last = await grab();
      if (!last) return null;
      const cur = small(last);
      if (prev && prev.length === cur.length) {
        let diff = 0; for (let i = 0; i < cur.length; i += 4) diff += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]);
        diff /= cur.length / 2;
        still = diff < 0.6 ? still + 1 : 0;
        if (still >= 2) return last;
      }
      prev = cur;
      await sleep(350);
    }
    return last;
  };
  const yellowGrid = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const gw = Math.ceil(c.width / 2), gh = Math.ceil(c.height / 2), g = new Uint8Array(gw * gh);
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 150 && gg > 150 && b < 90 && Math.abs(r - gg) < 70) g[(y >> 1) * gw + (x >> 1)] = 1;
    }
    return { g, gw, gh };
  };
  // The part's highlight: the biggest patch of yellow that wasn't yellow (or next to yellow) on the assembly's own view,
  // plus any other new-yellow patches close to it (the outline round a filled part).
  const yellowBox = (c, base) => {
    const { g, gw, gh } = yellowGrid(c);
    const nw = new Uint8Array(gw * gh);
    let count = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!g[y * gw + x]) continue;
      if (base && base.gw === gw) {
        let old = false;
        for (let dy = -2; dy <= 2 && !old; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && base.g[yy * gw + xx]) { old = true; break; } }
        if (old) continue;
      }
      nw[y * gw + x] = 1; count++;
    }
    if (count < 8) return null;
    // Patches: cells joined if within 3 cells of each other.
    const lab = new Int32Array(gw * gh), comps = [];
    for (let i = 0; i < nw.length; i++) {
      if (!nw[i] || lab[i]) continue;
      const id = comps.length + 1, st = [i]; lab[i] = id;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (st.length) {
        const k = st.pop(), x = k % gw, y = (k / gw) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue; const kk = yy * gw + xx; if (nw[kk] && !lab[kk]) { lab[kk] = id; st.push(kk); } }
      }
      comps.push({ n, x0, y0, x1, y1 });
    }
    comps.sort((a, b) => b.n - a.n);
    const m = comps[0];
    if (m.n < 8) return null;
    // Patches near the biggest one (within 15% of the frame) belong to the same part.
    const pad = Math.max(gw, gh) * 0.15;
    let { x0, y0, x1, y1 } = m;
    for (const q of comps.slice(1)) if (q.n >= 4 && q.x1 >= x0 - pad && q.x0 <= x1 + pad && q.y1 >= y0 - pad && q.y0 <= y1 + pad) { x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1); }
    return { x0: x0 * 2, y0: y0 * 2, x1: x1 * 2 + 1, y1: y1 * 2 + 1, n: m.n };
  };
  const crop = (c, box, out = 640) => {
    const bg = c.getContext('2d').getImageData(4, 4, 1, 1).data;
    const w = box.x1 - box.x0, h = box.y1 - box.y0, s = Math.max(w, h) * 1.36 + 40;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const k = document.createElement('canvas'); k.width = out; k.height = out;
    const g = k.getContext('2d'); g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; g.fillRect(0, 0, out, out);
    g.drawImage(c, cx - s / 2, cy - s / 2, s, s, 0, 0, out, out);
    return k;
  };
  // Nuts, bolts, washers, pins, clips and decals are specks in the 3D view: no picture for those.
  const SMALL = /^(M\d|M\s?\d)|\b(nut|nyloc|washer|screw|bolt|rivet|split pin|r-clip|r clip|circlip|grub|dowel|decal|sticker|label|cable tie|grease nipple|plain pin)\b/i;

  try {
    S.phase = 'walk';
    const rootHref = location.href;
    const tree = await walk([], 0, location.pathname + location.search);
    const nodes = [];
    (function f(n) { if (n.error) return; if (n.parts.length && (!window.__svtOnly || n.path.join(' > ').includes(window.__svtOnly))) nodes.push(n); n.children.forEach(f); })(tree);
    const asm = {}, part = {}, spots = {}, baseYellow = {}, lastPart = {};
    const seen = new Set();
    const todo = [];
    for (const n of nodes) {
      todo.push({ kind: 'asm', url: n.url });
      const here = new Set();
      // A warm-up view of another part (a small one if there is one), so the first real part has a part view to compare with.
      {
        const leaves = n.parts.filter((p) => /[?&]mesh=/.test(p.href));
        const w = leaves.find((p) => SMALL.test(p.name)) || leaves[leaves.length - 1];
        if (w && leaves.length > 1) todo.push({ kind: 'warm', url: w.href, asm: n.url });
      }
      for (const p of n.parts) {
        const mesh = (p.href.match(/[?&]mesh=([^&]+)/) || [])[1];
        const base = mesh ? decodeURIComponent(mesh).replace(/_\d{3}$/, '') : '';
        // Each part once per assembly, for its place on the assembly's picture; its own picture once overall.
        // Track units list their maker's CAD pieces ("Copy_of_..."): not Forst parts, so no pictures.
        if (!mesh || SMALL.test(p.name) || here.has(base) || /^Copy_of_/.test(base)) continue;
        here.add(base);
        todo.push({ kind: 'part', url: p.href, base, asm: n.url, pic: !seen.has(base) });
        seen.add(base);
      }
    }
    S.phase = 'capture'; S.done = 0; S.total = todo.length;
    for (const t of todo) {
      await go(t.url, 700);
      const c = await settled();
      if (c && t.kind === 'warm') lastPart[t.asm] = yellowGrid(c);
      else if (c) {
        if (t.kind === 'asm') { asm[t.url] = c.toDataURL('image/webp', 0.86); baseYellow[t.url] = yellowGrid(c); }
        else {
          // Compare with the previous part's view (same rendering, only the highlight moves); the first part with the assembly's.
          const grid = yellowGrid(c);
          const b = yellowBox(c, lastPart[t.asm] || baseYellow[t.asm]);
          lastPart[t.asm] = grid;
          if (b) (spots[t.asm] = spots[t.asm] || []).push([t.base, b.x0, b.y0, b.x1, b.y1, c.width, c.height]);
          if (b && t.pic && Math.max(b.x1 - b.x0, b.y1 - b.y0) >= 60) part[t.base] = crop(c, b).toDataURL('image/webp', 0.86);
        }
      }
      S.done++;
    }
    S.phase = 'save';
    const blob = new Blob([JSON.stringify({ slug, root: rootHref, tree, asm, part, spots })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `svt-${slug}${window.__svtOnly ? '-test' : ''}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    S.phase = 'done'; S.slug = slug; S.size = blob.size; S.asm = Object.keys(asm).length; S.part = Object.keys(part).length;
  } catch (e) { S.err = String(e && e.stack || e); }
}
(async () => {
  const Q = window.__svtQueue || [];
  window.__svtLog = [];
  for (const slug of Q) {
    const S = (window.__svt = { slug, phase: 'start', done: 0, total: 0, err: null });
    await runMachine(slug, S);
    window.__svtLog.push({ ...S });
    await new Promise((r) => setTimeout(r, 4000));
  }
  window.__svtAll = 'done';
})();
'queue started';
