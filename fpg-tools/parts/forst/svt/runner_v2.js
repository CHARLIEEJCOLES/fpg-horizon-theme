/* Forst parts catalogue capture, version 2 (run in the catalogue page, forst.svt-app.com).
 * For every machine in window.__svtQueue: walks the assembly tree, then for every assembly takes its 3D view at
 * high resolution and, for every part in it (fasteners too), the same view with that part highlighted. Partful
 * outlines the selected part in yellow: the yellow that is new against the previous part's view is that part's
 * outline. Saves per part its box, its outline mask (half resolution, PNG) and, the first time a part is seen, a
 * full-resolution crop round it for its picture. Downloads svt2-<slug>.json per machine.
 * Status: window.__svt (current), window.__svtLog (finished). */
async function runMachine(slug, S) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const anchors = () => [...document.querySelectorAll(`ul a[href*="/product-library/${slug}/parts-catalogue/"]`)].filter((a) => a.textContent.trim());
  const key = () => anchors().map((a) => a.getAttribute('href')).join('|');
  history.pushState({}, '', `/product-library/${slug}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  for (let i = 0; i < 150 && !anchors().length; i++) await sleep(200);
  if (!anchors().length) throw new Error('machine did not open: ' + slug);
  for (let i = 0; i < 60 && /LOADING/i.test(document.body.innerText); i++) await sleep(500);
  await sleep(4000);

  const listLinks = () => anchors().map((a) => {
    const href = a.getAttribute('href');
    const qty = (a.textContent.match(/Qty\s*(\d+)\s*$/) || [])[1];
    return { name: a.textContent.replace(/Qty\s*\d+\s*$/, '').trim(), href, leaf: /[?&]mesh=/.test(href), qty: qty ? +qty : 1 };
  });
  const pageCode = () => { const m = document.body.innerText.match(/\n(\d{2}-[0-9A-Z]{1,3}-[0-9A-Z._]+)\n/); return m ? m[1] : ''; };
  const go = async (url, settle) => { history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); await sleep(settle); };
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
  // A frame, waiting out a hidden pane if the first try times out.
  const grab2 = async () => { let c = await grab(); if (!c) { await visible(); c = await grab(); } return c; };
  // Wait until the 3D camera has stopped moving (two small frames in a row the same), then keep that frame.
  const settled = async (maxMs = 9000, gap = 300, need = 2) => {
    const small = (c) => { const k = document.createElement('canvas'); k.width = 200; k.height = Math.round(200 * c.height / c.width); k.getContext('2d').drawImage(c, 0, 0, k.width, k.height); return k.getContext('2d').getImageData(0, 0, k.width, k.height).data; };
    const t0 = Date.now();
    let prev = null, last = null, still = 0;
    while (Date.now() - t0 < maxMs) {
      last = await grab2();
      if (!last) return null;
      const cur = small(last);
      if (prev && prev.length === cur.length) {
        let diff = 0; for (let i = 0; i < cur.length; i += 4) diff += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]);
        diff /= cur.length / 2;
        still = diff < 0.5 ? still + 1 : 0;
        if (still >= need) return last;
      }
      prev = cur;
      await sleep(gap);
    }
    return last;
  };
  // Partful's highlight yellow, on a grid of every 2nd pixel.
  const yellowGrid = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const gw = Math.ceil(c.width / 2), gh = Math.ceil(c.height / 2), g = new Uint8Array(gw * gh);
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 150 && gg > 150 && b < 100 && Math.abs(r - gg) < 75) g[(y >> 1) * gw + (x >> 1)] = 1;
    }
    return { g, gw, gh };
  };
  // The part's outline: yellow that was not yellow (nor right next to yellow) on the reference view. The biggest
  // patch, plus patches near it, is the part. Returns its box (full pixels) and its mask (grid cells) in that box.
  const outline = (cur, base) => {
    const { g, gw, gh } = cur;
    const nw = new Uint8Array(gw * gh);
    let count = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!g[y * gw + x]) continue;
      if (base && base.gw === gw) {
        let old = false;
        for (let dy = -1; dy <= 1 && !old; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && base.g[yy * gw + xx]) { old = true; break; } }
        if (old) continue;
      }
      nw[y * gw + x] = 1; count++;
    }
    if (count < 6) return null;
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
      comps.push({ id, n, x0, y0, x1, y1 });
    }
    comps.sort((a, b) => b.n - a.n);
    const m = comps[0];
    if (!m || m.n < 6) return null;
    const pad = Math.max(gw, gh) * 0.12;
    let { x0, y0, x1, y1 } = m;
    const keep = new Set([m.id]);
    for (const q of comps.slice(1)) if (q.n >= 4 && q.x1 >= x0 - pad && q.x0 <= x1 + pad && q.y1 >= y0 - pad && q.y0 <= y1 + pad) { keep.add(q.id); x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1); }
    // The mask of the kept patches, cropped to their box, as a black-and-white PNG.
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
    const k = document.createElement('canvas'); k.width = mw; k.height = mh;
    const ctx = k.getContext('2d'); const id = ctx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const on = keep.has(lab[(y + y0) * gw + (x + x0)]);
      const o = (y * mw + x) * 4; const v = on ? 255 : 0; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return { x0: x0 * 2, y0: y0 * 2, x1: x1 * 2 + 1, y1: y1 * 2 + 1, n: m.n, mask: k.toDataURL('image/png') };
  };
  // An assembly's own view: the camera glides to the assembly after the page changes, sometimes only after a pause,
  // so wait until it has moved and stopped (or 3 s with no movement), never the frame from before the glide.
  const settledAfterMove = async (maxMs = 14000) => {
    const small = (c) => { const k = document.createElement('canvas'); k.width = 200; k.height = Math.round(200 * c.height / c.width); k.getContext('2d').drawImage(c, 0, 0, k.width, k.height); return k.getContext('2d').getImageData(0, 0, k.width, k.height).data; };
    const t0 = Date.now();
    let prev = null, last = null, still = 0, moved = false;
    while (Date.now() - t0 < maxMs) {
      last = await grab2();
      if (!last) return null;
      const cur = small(last);
      if (prev && prev.length === cur.length) {
        let diff = 0; for (let i = 0; i < cur.length; i += 4) diff += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]);
        diff /= cur.length / 2;
        if (diff >= 1.5) moved = true;
        still = diff < 0.5 ? still + 1 : 0;
        if (still >= 3 && (moved || Date.now() - t0 > 3000)) return last;
      }
      prev = cur;
      await sleep(250);
    }
    return last;
  };
  // How far a part's view is from its assembly's view (camera moved = big): mean difference of 200px thumbnails.
  const thumb = (c) => { const k = document.createElement('canvas'); k.width = 200; k.height = Math.round(200 * c.height / c.width); k.getContext('2d').drawImage(c, 0, 0, k.width, k.height); return k.getContext('2d').getImageData(0, 0, k.width, k.height).data; };
  const thumbDiff = (a, b) => { if (!a || !b || a.length !== b.length) return 99; let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length * 0.75); };
  // A square crop round the part at full resolution, with room round it, for its picture (cut out later).
  const crop = (c, box, out = 1024) => {
    const bg = c.getContext('2d').getImageData(4, 4, 1, 1).data;
    const w = box.x1 - box.x0, h = box.y1 - box.y0, s = Math.max(w, h) * 1.25 + 24;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const size = Math.min(out, Math.max(256, Math.round(s)));
    const k = document.createElement('canvas'); k.width = size; k.height = size;
    const g = k.getContext('2d'); g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, cx - s / 2, cy - s / 2, s, s, 0, 0, size, size);
    return k;
  };
  // Render the 3D view big: the catalogue caps its pixel ratio at 2, so make its box 1200 x 860 (2400 x 1720 pixels).
  // The catalogue only draws at full speed while its pane is on screen: wait for that (checked before each group).
  const visible = async () => {
    for (;;) {
      let n = 0; const t0 = performance.now();
      await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); setTimeout(r, 900); });
      if (n >= 10) { S.paused = false; return; }
      S.paused = true;
      await sleep(3000);
    }
  };
  const big = async () => {
    await visible();
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!cv || cv.clientWidth === 1200) return;
    const box = cv.parentElement.parentElement.parentElement.parentElement;
    box.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:860px;z-index:99999;background:#fff';
    window.dispatchEvent(new Event('resize'));
    await sleep(1500);
  };
  // The group's picture without a highlight: the warm-up view W, with its lit part's outline (and a little round it)
  // taken from another part's view P (same camera), where P itself isn't lit.
  const paintOut = (W, Wg, P, Pg) => {
    const out = document.createElement('canvas'); out.width = W.width; out.height = W.height;
    const o = out.getContext('2d'); o.drawImage(W, 0, 0);
    const wd = o.getImageData(0, 0, W.width, W.height), pd = P.getContext('2d').getImageData(0, 0, P.width, P.height);
    const { gw, gh } = Wg;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let lit = false;
      for (let dy = -2; dy <= 2 && !lit; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && Wg.g[yy * gw + xx]) { lit = true; break; } }
      if (!lit || Pg.g[y * gw + x]) continue;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const px = x * 2 + sx, py = y * 2 + sy;
        if (px >= W.width || py >= W.height) continue;
        const i = (py * W.width + px) * 4;
        wd.data[i] = pd.data[i]; wd.data[i + 1] = pd.data[i + 1]; wd.data[i + 2] = pd.data[i + 2];
      }
    }
    o.putImageData(wd, 0, 0);
    return out;
  };
  // Every part gets a picture, decals and the smallest fasteners included.
  const NOPIC = /^$/;

  try {
    S.phase = 'walk';
    const rootHref = location.href;
    const tree = (window.__svtTree && window.__svtTree[slug]) || (await walk([], 0, location.pathname + location.search));
    (window.__svtTree = window.__svtTree || {})[slug] = tree;
    const nodes = [];
    (function f(n) { if (n.error) return; if (n.parts.length && (!window.__svtOnly || n.path.join(' > ').includes(window.__svtOnly))) nodes.push(n); n.children.forEach(f); })(tree);
    const asm = {}, part = {}, spots = {};
    const seen = new Set();
    S.phase = 'capture'; S.done = 0;
    S.total = nodes.reduce((n, x) => n + x.parts.length + 2, 0);
    for (const n of nodes) {
      if (window.__svtStop) throw new Error('stopped');
      const leaves = [];
      const here = new Set();
      for (const p of n.parts) {
        const mesh = (p.href.match(/[?&]mesh=([^&]+)/) || [])[1];
        if (!mesh || /^Copy_of_/.test(decodeURIComponent(mesh))) continue;
        const inst = decodeURIComponent(mesh);
        // Every instance of a part gets its own outline (a bolt used four times is clickable four times).
        if (here.has(inst)) continue;
        here.add(inst);
        leaves.push({ url: p.href, inst, base: inst.replace(/_\d{3}$/, ''), name: p.name });
      }
      // The assembly's own page: the whole machine with the group lit. Only a fallback picture.
      await big();
      await go(n.url, 300);
      const A = await settledAfterMove();
      S.done++;
      if (!A) continue;
      // Inside the group the catalogue explodes it and keeps one camera for all its parts: a warm-up part view
      // gives that camera, and the section's picture is that view with its highlight painted out.
      const W = leaves.length > 1 ? (await go(leaves[leaves.length - 1].url, 300), await settledAfterMove()) : null;
      S.done++;
      const Wg = W ? yellowGrid(W) : null, Wt = W ? thumb(W) : null;
      let ref = W ? Wg : yellowGrid(A), refT = W ? Wt : thumb(A), clean = W ? null : A;
      for (const t of leaves) {
        if (window.__svtStop) throw new Error('stopped');
        // Only the highlight changes between parts (same camera), so a quick look is enough; if no new outline
        // shows up, the highlight hadn't moved yet: look again after a pause.
        const q0 = Date.now();
        await go(t.url, 250);
        let c = await settled(9000, 150, 1);
        S.tLook = (S.tLook || 0) + Date.now() - q0;
        let off = c ? thumbDiff(thumb(c), refT) : 99;
        if (c && off > 6) { S.moved = (S.moved || 0) + 1; c = (await settledAfterMove(4000)) || c; off = thumbDiff(thumb(c), refT); }
        S.done++;
        if (!c) continue;
        const q1 = Date.now();
        let grid = yellowGrid(c);
        let b = outline(grid, ref);
        if (!b) { S.retry = (S.retry || 0) + 1; await sleep(400); c = (await settled(4000, 150, 1)) || c; grid = yellowGrid(c); b = outline(grid, ref); }
        // A group of one part: no second view to paint the highlight out with, so its picture shows it lit.
        if (!W) clean = c;
        if (W && !clean && t.url !== leaves[leaves.length - 1].url) clean = paintOut(W, Wg, c, grid);
        ref = grid;
        if (b) (spots[n.url] = spots[n.url] || []).push([t.base, b.x0, b.y0, b.x1, b.y1, c.width, c.height, b.mask, t.inst, Math.round(off * 10) / 10]);
        if (b && !seen.has(t.base) && !NOPIC.test(t.name) && Math.max(b.x1 - b.x0, b.y1 - b.y0) >= 8) { part[t.base] = crop(c, b).toDataURL('image/webp', 0.92); seen.add(t.base); }
        S.tWork = (S.tWork || 0) + Date.now() - q1;
      }
      asm[n.url] = (clean || W || A).toDataURL('image/webp', 0.9);
    }
    S.phase = 'save';
    const blob = new Blob([JSON.stringify({ v: 2, slug, root: rootHref, tree, asm, part, spots })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `svt2-${slug}${window.__svtOnly ? '-test' : ''}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    S.phase = 'done'; S.slug = slug; S.size = blob.size; S.asm = Object.keys(asm).length; S.part = Object.keys(part).length;
    S.spots = Object.values(spots).reduce((n, v) => n + v.length, 0);
  } catch (e) { S.err = String(e && e.stack || e); }
}
window.runMachine = runMachine;
(async () => {
  const Q = window.__svtQueue || [];
  window.__svtLog = [];
  for (const slug of Q) {
    const S = (window.__svt = { slug, phase: 'start', done: 0, total: 0, err: null, t0: Date.now() });
    await runMachine(slug, S);
    S.secs = Math.round((Date.now() - S.t0) / 1000);
    window.__svtLog.push({ ...S });
    await new Promise((r) => setTimeout(r, 4000));
  }
  window.__svtAll = 'done';
})();
'queue started';
