/*
 * Product CSV import queue for the Shopify admin (run in an admin.shopify.com/store/forest-park-garden-2794/products tab).
 * Shopify runs one product import at a time, so this tries the next file every 2 minutes and moves on once it starts.
 * Files: the dealer price-list imports on Shopify Files (new products, NLA rows dropped) and the STIGA title fix
 * (Handle,Title only, imported with "Overwrite products with matching handles": columns left out keep their values).
 * The STIGA title files are kept in this tab's localStorage (fpg-csv-StigaTitles1..5), the queue in fpg-queue.
 * Paste the whole file into the console (or javascript_tool), then: await fpgQueueStart().
 * Status: _q (still to import), _qlog ([time, file, result]); "busy" just means another import is still running.
 */
window.fpgQueueStart = async () => {
  const parseCSV = (t) => { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c == '"') { if (t[i + 1] == '"') { f += '"'; i++; } else q = false; } else f += c; } else { if (c == '"') q = true; else if (c == ',') { row.push(f); f = ''; } else if (c == '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c != '\r') f += c; } } if (f || row.length) { row.push(f); rows.push(row); } return rows; };
  const enc = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const bad = /\bnla\b|no longer avail|discontinued|obsolete/i;
  window._csvs = window._csvs || {};
  if (!_csvs.Weibang || !_csvs['AL-KO']) {
    const R = parseCSV(await (await fetch('https://cdn.shopify.com/s/files/1/0734/1477/0982/files/fpg-import-alko-2.csv?v=1793965826')).text());
    const h = R[0], iV = h.indexOf('Vendor'), iT = h.indexOf('Title'), iP = h.indexOf('Variant Price');
    for (const v of ['Weibang', 'AL-KO']) _csvs[v] = [h, ...R.slice(1).filter((r) => r.length > 5 && r[iV] === v && !bad.test(r[iT]) && parseFloat(r[iP]) > 0)].map((r) => r.map(enc).join(',')).join('\n') + '\n';
  }
  if (!_csvs.Toro) _csvs.Toro = await (await fetch('https://cdn.shopify.com/s/files/1/0734/1477/0982/files/fpg-import-toro.csv?v=1793966382')).text();
  window._overwrite = new Set();
  for (let i = 1; i <= 5; i++) { const k = 'StigaTitles' + i; const v = localStorage.getItem('fpg-csv-' + k); if (v) _csvs[k] = v; _overwrite.add(k); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const deep = (root, pred, out = []) => { for (const el of root.querySelectorAll('*')) { if (pred(el)) out.push(el); if (el.shadowRoot) deep(el.shadowRoot, pred, out); } return out; };
  const closeAll = async () => { for (const d of document.querySelectorAll('[role=dialog]')) { const c = [...d.querySelectorAll('button')].find((x) => /^(Close|Cancel)$/i.test(x.innerText.trim()) || /close/i.test(x.getAttribute('aria-label') || '')); c?.click(); await sleep(800); } };
  window._tryImport = async (name, csv, key) => {
    if (!csv) return 'no csv';
    await closeAll();
    const dlg = () => document.querySelector('[role=dialog]');
    const btn = deep(document, (el) => (el.tagName === 'BUTTON' || el.tagName === 'S-BUTTON' || el.getAttribute?.('role') === 'button') && el.textContent.trim() === 'Import')[0];
    if (!btn) return 'no import button';
    btn.click();
    for (let i = 0; i < 20 && !document.querySelector('[role=dialog] input[type=file]'); i++) { await sleep(300); if (/import in progress/i.test(dlg()?.innerText || '')) { await closeAll(); return 'busy'; } }
    const inp = document.querySelector('[role=dialog] input[type=file]');
    if (!inp) { const busy = /import in progress/i.test(dlg()?.innerText || ''); await closeAll(); return busy ? 'busy' : 'no file input'; }
    const dt = new DataTransfer(); dt.items.add(new File([csv], name, { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);
    if (_overwrite.has(key)) {
      const box = [...dlg().querySelectorAll('input[type=checkbox]')].find((c) => /overwrite/i.test((c.labels && c.labels[0]?.innerText) || c.closest('label')?.innerText || c.parentElement?.parentElement?.innerText || ''));
      if (!box) { await closeAll(); return 'no overwrite box'; }
      if (!box.checked) box.click();
      await sleep(400);
      if (!box.checked) { await closeAll(); return 'overwrite not ticked'; }
    }
    const up = [...dlg().querySelectorAll('button')].find((b) => b.innerText.trim() === 'Upload file' && !b.disabled);
    if (!up) { await closeAll(); return 'no upload btn'; }
    up.click();
    for (let i = 0; i < 60; i++) {
      await sleep(500); const d = dlg(); const txt = d?.innerText || '';
      if (/already in progress/i.test(txt)) { await closeAll(); return 'busy'; }
      const go = d && [...d.querySelectorAll('button')].find((b) => /^Import products$/.test(b.innerText.trim()) && !b.disabled);
      if (go) { go.click(); await sleep(3000); return 'started'; }
    }
    return 'timeout';
  };
  window._q = window._q || JSON.parse(localStorage.getItem('fpg-queue') || '[]');
  window._qlog = window._qlog || [];
  window._qbusy = false;
  clearInterval(window._qt);
  window._qt = setInterval(async () => {
    if (_qbusy || !_q.length) return;
    _qbusy = true;
    try { const [n, k] = _q[0]; const r = await _tryImport(n, _csvs[k], k); _qlog.push([new Date().toTimeString().slice(0, 5), n, r]); if (r === 'started') { _q.shift(); localStorage.setItem('fpg-queue', JSON.stringify(_q)); } } catch (e) { _qlog.push(['err', String(e)]); }
    _qbusy = false;
  }, 120000);
  return _q.map((x) => x[0]);
};
