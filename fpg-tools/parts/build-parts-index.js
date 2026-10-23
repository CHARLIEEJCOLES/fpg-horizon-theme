/*
 * Rebuilds assets/fpg-parts-index.json (brands, machine types and models for
 * the parts finder) from the FPG Part Finder app.
 *
 * When: after adding or renaming brands, machine types or models in the app.
 * New models already show up in the finder's model lists without this, but
 * the search box and the product-page "Spare parts for the ..." link only
 * know the models in this file.
 *
 * How: open https://forestparkgarden.com/pages/fpg-part-finder, open the
 * browser console (F12), paste this whole file and press Enter. It downloads
 * fpg-parts-index.json. Upload it over assets/fpg-parts-index.json in the
 * theme (Edit code > Assets).
 */
(async () => {
  const B = '/apps/parts-finder';
  const pre = 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/';
  const j = (u) => fetch(B + u).then((r) => r.json());
  const brands = await j('/getBrands');
  const out = await Promise.all(
    brands
      .sort((a, b) => a.id - b.id)
      .map(async (b) => {
        const types = await j('/getMachineTypes?brandId=' + b.id);
        const ts = [];
        for (const t of types.sort((x, y) => x.name.localeCompare(y.name))) {
          const models = await j('/getModels?machineTypeId=' + t.id);
          ts.push([
            t.id,
            t.name,
            models.filter((m) => m.active !== false).map((m) => [m.id, String(m.name).trim().replace(/\s+/g, ' ')]),
          ]);
        }
        return [b.id, b.name, (b.image || '').replace(pre, ''), ts];
      })
  );
  const data = { v: new Date().toISOString().slice(0, 10), img: pre, b: out };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'fpg-parts-index.json' });
  document.body.append(a);
  a.click();
  a.remove();
  console.log('fpg-parts-index.json:', out.length, 'brands,', out.reduce((n, b) => n + b[3].reduce((m, t) => m + t[2].length, 0), 0), 'models');
})();
