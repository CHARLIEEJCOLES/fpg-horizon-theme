/*
 * Briggs & Stratton from Henton & Chattell's dealer site (www.hcuk.co, http, Charlie signs in). Paste into that tab.
 * Get to Parts through the site's own menu: opening PartsHome.aspx by its address signs you out.
 *
 * Model list: QuickViewWeb2.GetSearchTermsWebService (the page's own ASMX proxy).
 *   GetRowsForBoschProducts(n, lastRow, 'Briggs', ok)                  -> "row;#id;#name;#Briggs;*..."  50 rows a call, 2,000 rows at most
 *   GetRowsForSearchedBoschProducts(n, lastRow, term, 'Briggs', ok)    substring search, same limits
 *   The 2 Nov crawl saved the whole list: KV bs-terms (72,143 [name, id]) and bs-pick (2,848 engines, one type each:
 *   [model, id, "model-type-trim"]). bs-selected = 400 commonest engines, read first.
 * Parts pages: PartSearchARI.aspx?Model=BSImages/<id>A&Franchise=Briggs&Name=<name>&ModelT=<name>&BriggsType=<id>
 *   <select id=select> lists the sections; other sections come from posting the form back with select=<value>.
 *   GridView1 rows carry partno, theitem, popupstockstatus ("No Stock"...), and hscount + hsleftN/hstopN/hsrightN/hsbottomN
 *   boxes measured on the ARI drawing at its Max size (HiddenImageUrl). Prices on the page (RRP/dealer) are not kept.
 *   About 6 s a page, one at a time per sign-in, so running more in parallel doesn't help.
 *   22 picks whose name isn't model-type-trim (pressure washers, mulch kits) give a server error on H&C's own site.
 * Then: bsDims() -> KV bs-dims, build with build-bs.js (buildBS), upload drawings as bs-<guid>.png.
 */
window.bsReadDoc = (d) => {
  const g = d.getElementById('GridView1');
  const r = [];
  if (g)
    for (const tr of g.querySelectorAll('tr[partno], tr[theitem]')) {
      const c = [...tr.cells].map((x) => x.innerText.trim());
      const n = +tr.getAttribute('hscount') || 0;
      const b = [];
      for (let i = 0; i < n; i++) b.push([+tr.getAttribute('hsleft' + i), +tr.getAttribute('hstop' + i), +tr.getAttribute('hsright' + i), +tr.getAttribute('hsbottom' + i)]);
      r.push([c[0] || tr.getAttribute('theitem') || '', c[1] || '', c[2] || '', c[3] || '', tr.getAttribute('popupstockstatus') || '', b]);
    }
  return { img: d.getElementById('HiddenImageUrl')?.value || '', r };
};

const retry = async (fn) => {
  for (let a = 0; a < 3; a++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
};

window.bsModel = async (id, label) => {
  const u = `PartSearchARI.aspx?Model=BSImages/${id}A&Franchise=Briggs&Name=${encodeURIComponent(label)}&ModelT=${encodeURIComponent(label)}&BriggsType=${id}`;
  const t = await retry(async () => (await fetch(u)).text());
  if (!t) return null;
  const d = new DOMParser().parseFromString(t, 'text/html');
  if (d.querySelector('input[type=password]')) throw new Error('signed out');
  const sel = d.getElementById('select');
  if (!sel) return { id, k: label, secs: [], nosel: true };
  const cur = sel.value;
  const secs = [];
  for (const [v, txt] of [...sel.options].map((o) => [o.value, o.text])) {
    let dd = d;
    if (v !== cur) {
      const f = d.forms.form1;
      const fd = new FormData(f);
      fd.set('select', v);
      fd.set('__EVENTTARGET', 'select');
      fd.set('__EVENTARGUMENT', '');
      for (const k of [...fd.keys()]) if (/^(btn|Btn|lnkbtn)/.test(k)) fd.delete(k);
      const t2 = await retry(async () => (await fetch(f.getAttribute('action'), { method: 'POST', body: new URLSearchParams(fd) })).text());
      if (!t2) continue;
      dd = new DOMParser().parseFromString(t2, 'text/html');
      if (dd.getElementById('select')?.value !== v) continue;
    }
    secs.push({ sid: v, n: txt, ...bsReadDoc(dd) });
  }
  return { id, k: label, secs };
};

/* Reads every engine not yet saved (bs-selected first) into KV bs2-m-<model>. Progress in window._bc. */
window.bsCrawl = async (workers = 2) => {
  const pick = await KV.get('bs-pick');
  const sset = new Set((await KV.get('bs-selected')) || []);
  const have = new Set((await KV.keys()).filter((k) => String(k).startsWith('bs2-m-')).map((k) => k.slice(6)));
  const ok = (p) => /^[0-9A-Z]{6}-[0-9A-Z]{4}-[0-9A-Z]{2}$/.test(p[2]);
  const todo = [...pick.filter((p) => sset.has(p[0])), ...pick.filter((p) => !sset.has(p[0]))].filter((p) => ok(p) && !have.has(p[0]));
  window._bc = { total: pick.length, done: have.size, todo: todo.length, empty: 0, failed: [], stock: {}, signedOut: false, active: 0, finished: false, sections: 0 };
  const w = async () => {
    window._bc.active++;
    while (todo.length && !window._bc.signedOut) {
      const [base, id, label] = todo.shift();
      try {
        const m = await bsModel(id, label);
        if (!m) {
          window._bc.failed.push(base);
          continue;
        }
        m.secs = m.secs.filter((s) => s.r.length);
        for (const s of m.secs) for (const x of s.r) window._bc.stock[x[4]] = (window._bc.stock[x[4]] || 0) + 1;
        window._bc.sections += m.secs.length;
        if (!m.secs.length) window._bc.empty++;
        await KV.set('bs2-m-' + base, m);
        window._bc.done++;
      } catch (e) {
        if (/signed out/.test(e.message)) {
          window._bc.signedOut = true;
          todo.unshift([base, id, label]);
        } else window._bc.failed.push(base + ': ' + e.message);
      }
    }
    window._bc.active--;
    if (!window._bc.active) window._bc.finished = true;
  };
  for (let i = 0; i < workers; i++) w();
  return todo.length;
};

/* Size of each drawing the saved engines use -> KV bs-dims {guid: [w, h]}. */
window.bsDims = async () => {
  const dims = (await KV.get('bs-dims')) || {};
  const urls = new Map();
  for (const k of (await KV.keys()).filter((k) => String(k).startsWith('bs2-m-')))
    for (const s of (await KV.get(k)).secs) {
      const g = (s.img.match(/\/BRG\/([0-9a-f-]{36})\//i) || [])[1];
      if (g && !dims[g]) urls.set(g, s.img);
    }
  const list = [...urls];
  const size = (u) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res([i.naturalWidth, i.naturalHeight]);
      i.onerror = () => res(null);
      i.src = u;
    });
  await Promise.all(
    [0, 1, 2, 3, 4, 5].map(async () => {
      while (list.length) {
        const [g, u] = list.shift();
        const s = await size(u);
        if (s) dims[g] = s;
      }
    })
  );
  await KV.set('bs-dims', dims);
  return Object.keys(dims).length;
};
