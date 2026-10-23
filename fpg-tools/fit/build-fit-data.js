/*
 * Rebuilds assets/fpg-fit-data.json (the chain and bar "what fits" data used by
 * assets/fpg-fit.js).
 *
 * How to run: open https://forestparkgarden.com in a browser, open the
 * developer console, paste this whole file and press Enter. It reads the
 * public product feed of the chain, bar and bar-and-chain-kit collections and
 * downloads fpg-fit-data.json. Upload that file to the theme's assets folder
 * (replace the old one). Run it again whenever chains or bars are added or
 * their "Fit Guide" text changes.
 *
 * Where the data comes from (nothing is guessed):
 * - Pitch, gauge, drive links and bar length: the product title, falling back
 *   to the description ("Pitch: 3/8", "chain drive link count: 55").
 * - Which machines a product fits: the "Fit Guide <Brand> (<bar>in): models."
 *   sentence in the description; for Cut Kits and conversion kits, the models
 *   named in the title after " - ".
 *
 * Output shape:
 *   { v: 'YYYY-MM-DD',
 *     products: [{ h: handle, k: 'c'|'b'|'k', p: pitch, g: gauge mm, l: drive links, b: bar inches, r: 1 if reel }],
 *     lists: [[[productIndex, barInches?], ...], ...],
 *     models: { 'STIHL|MS 261': listIndex } }
 */
(async () => {
  const COLLECTIONS = [['chainsaw-chains', 'c'], ['chainsaw-bars', 'b'], ['bar-chain-kits', 'k']];
  const SKIP = /cover|protector|scabbard|guard|sharpen|file/i;
  const GAUGE = { '.043': '1.1', '.050': '1.3', '.058': '1.5', '.063': '1.6', '0.043': '1.1', '0.050': '1.3', '0.058': '1.5', '0.063': '1.6' };
  const BRANDS = { stihl: 'STIHL', husqvarna: 'Husqvarna', echo: 'ECHO', toro: 'Toro', makita: 'Makita', jonsered: 'Jonsered', scheppach: 'Scheppach' };
  const text = (p) => (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  async function all(handle) {
    let out = [];
    for (let page = 1; page < 40; page++) {
      const json = await fetch(`/collections/${handle}/products.json?limit=250&page=${page}`).then((r) => r.json());
      out = out.concat(json.products);
      if (json.products.length < 250) break;
    }
    return out;
  }

  function parse(p, kind) {
    const t = p.title.replace(/0\.325/, '.325') + ' ';
    const d = text(p);
    const s = {};
    let m = t.match(/(1\/4|3\/8|\.325|\.404)\s*(?:in|")?\s*(P\b|Low Profile|Mini|LP)?/i) || d.match(/(1\/4|3\/8|\.325|\.404)\s*(?:in|")?\s*(P\b|Low Profile|Mini)?/i);
    if (m) {
      let pitch = m[1];
      const q = (m[2] || '').toLowerCase();
      if ((pitch === '3/8' || pitch === '1/4') && (q === 'p' || q === 'low profile' || q === 'lp' || (pitch === '3/8' && q === 'mini'))) pitch += ' P';
      if (pitch === '.325' && q === 'mini') pitch = '.325 Mini';
      s.p = pitch;
    }
    m = t.match(/\b(1\.1|1\.3|1\.5|1\.6|2\.0)\s*mm/i) || t.match(/(0?\.043|0?\.050|0?\.058|0?\.063)\s*(?:in|")/i) || (kind !== 'c' && t.match(/\s(1\.1|1\.3|1\.5|1\.6)\s/)) || d.match(/\b(1\.1|1\.3|1\.5|1\.6)\s*mm/i);
    if (m) s.g = GAUGE[m[1]] || m[1];
    m = t.match(/(\d{2,3})\s*(?:Links|drive links|DL)\b/i) || (kind !== 'c' && d.match(/drive link(?:s| count)\s*:?\s*(\d{2,3})/i));
    if (m) s.l = +m[1];
    if (/reel/i.test(t)) s.r = 1;
    m = t.match(/(\d{1,2})\s*(?:in\b|"|IN\b)/) || t.match(/(\d{2,3})\s*cm/i);
    if (m && kind !== 'c') s.b = /cm/i.test(m[0]) ? Math.round(+m[1] / 2.54) : +m[1];

    const fits = [];
    const at = d.search(/Fit Guide/i);
    if (at >= 0) {
      const seg = d.slice(at + 9).replace(/\.(\s|$)[\s\S]*/, '');
      const re = /([A-Z][A-Za-z\-]+)(?:\s*\((\d+)\s*in\))?\s*:\s*/g;
      const parts = [];
      let x;
      while ((x = re.exec(seg))) parts.push({ brand: x[1], bar: x[2] ? +x[2] : null, start: re.lastIndex, idx: x.index });
      parts.forEach((part, i) => {
        const end = i + 1 < parts.length ? parts[i + 1].idx : seg.length;
        seg.slice(part.start, end).split(',').map((v) => v.trim().replace(/\s+/g, ' ')).filter((v) => v && v.length < 32 && /\d/.test(v))
          .forEach((model) => fits.push([BRANDS[part.brand.toLowerCase()] || part.brand, model.toUpperCase(), part.bar]));
      });
    }
    if (kind === 'k') {
      const k = p.title.match(/ - (?:(Stihl|Husqvarna|ECHO)\s+)?(.+)$/i);
      if (k) {
        const brand = k[1] ? BRANDS[k[1].toLowerCase()] || k[1] : /stihl/i.test(p.vendor + p.title) ? 'STIHL' : p.vendor;
        k[2].split(',').map((v) => v.trim().toUpperCase()).filter((v) => /\d/.test(v))
          .forEach((model) => fits.push([brand, model.replace(/^(MS|MSA|GTA|HTA|HT)(\d)/, '$1 $2'), s.b || null]));
      }
    }
    return { s, fits };
  }

  const tidy = (model) =>
    model.replace(/\s*-\s*FOR .*$/, '').trim().replace(/^(MS|MSA|HT|HTA|GTA)(\d)/, '$1 $2').replace(/^(MS \d+)(C)$/, '$1 $2');

  const products = [];
  const models = {};
  for (const [handle, kind] of COLLECTIONS) {
    for (const p of await all(handle)) {
      if (SKIP.test(p.title)) continue;
      const { s, fits } = parse(p, kind);
      const i = products.length;
      products.push(Object.assign({ h: p.handle, k: kind }, s));
      for (const [brand, model, bar] of fits) {
        for (const one of model.split(/\s+AND\s+|\s*&\s*|\s*\/\s*(?=[A-Z])/)) {
          const key = `${brand}|${tidy(one)}`;
          const list = (models[key] = models[key] || []);
          if (!list.some((e) => e[0] === i && e[1] === (bar || undefined))) list.push(bar ? [i, bar] : [i]);
        }
      }
    }
  }
  const sorted = {};
  Object.keys(models).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach((k) => (sorted[k] = models[k]));
  // Models that fit exactly the same products share one list, which keeps the file small.
  const lists = [];
  const seen = new Map();
  for (const key of Object.keys(sorted)) {
    const sig = JSON.stringify(sorted[key]);
    if (!seen.has(sig)) {
      seen.set(sig, lists.length);
      lists.push(sorted[key]);
    }
    sorted[key] = seen.get(sig);
  }
  const data = { v: new Date().toISOString().slice(0, 10), products, lists, models: sorted };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  link.download = 'fpg-fit-data.json';
  link.click();
  console.log(`fpg-fit-data.json: ${products.length} products, ${Object.keys(sorted).length} machine models`);
})();
