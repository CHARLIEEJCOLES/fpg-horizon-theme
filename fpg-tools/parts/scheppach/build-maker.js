/*
 * Builds the parts finder's Scheppach data (assets/fpg-maker-parts.json and the
 * list files assets/fpg-maker-scheppach-<n>.json) from a crawl of shop.scheppach.com.
 *
 * Runs in a browser tab on shop.scheppach.com (the site's API is same-origin only),
 * after the crawl has filled:
 *   CRAWL.rows   [{ article, title, path, lists: [{ listId, label }] }]  machine pages
 *   LCRAWL.lists { [listId]: { d: drawings, r: [[refs, partNumber, germanName, status]] } }
 *   ENGLISH      { [germanName]: englishName }  translated part names
 *   FPGIDX       the theme's assets/fpg-parts-index.json (our own machines)
 *   PIMG         { [partNumber]: picture path } from the parts lists' covers (optional);
 *                machine pictures are CRAWL.rows[].img (the page's og:image, after /media/)
 * Then: FPGBUILD.build({ version }) -> { index, shards: { [n]: json } }.
 */
(() => {
  const BRANDS = {
    scheppach: 'Scheppach', schepppach: 'Scheppach', parkside: 'Parkside', woodster: 'Woodster', ferrex: 'Ferrex', kity: 'Kity',
    workzone: 'Workzone', ixes: 'IXES', herkules: 'Herkules', toolson: 'Toolson', zgonc: 'Zgonc', dexter: 'Dexter', practixx: 'Practixx',
    garland: 'Garland', gomag: 'Gomag', woodtec: 'Woodtec', primaster: 'Primaster', macallister: 'MacAllister', gardenline: 'Gardenline',
    'stürmer': 'Stürmer', germania: 'Germania', powertec: 'Powertec', 'b&q': 'B&Q', redstone: 'Redstone', utool: 'Utool', kama: 'Kama',
    meec: 'Meec', powerfix: 'Powerfix', matrix: 'Matrix', sentar: 'Sentar', temver: 'Temver', huemer: 'Huemer', manupro: 'Manupro',
    flow: 'Flow', wingart: 'Wingart', grizzly: 'Grizzly', einhell: 'Einhell', ryobi: 'Ryobi', fartools: 'Fartools', lux: 'LUX',
    'güde': 'Güde', mannesmann: 'Mannesmann', hecht: 'Hecht', fieldmann: 'Fieldmann', cleancraft: 'Cleancraft', holzmann: 'Holzmann',
    triton: 'Triton', evolution: 'Evolution', draper: 'Draper', sterwins: 'Sterwins', florabest: 'Florabest', ultimatespeed: 'UltimateSpeed',
    hyundai: 'Hyundai', worx: 'Worx', titan: 'Titan', wolfcraft: 'Wolfcraft', gardena: 'Gardena', makita: 'Makita', bosch: 'Bosch',
    ozito: 'Ozito', performance: 'Performance Power', kreator: 'Kreator', vonroc: 'Vonroc', fuxtec: 'Fuxtec', westfalia: 'Westfalia',
    craftomat: 'Craftomat', topcraft: 'Topcraft', powerplus: 'Powerplus', varo: 'Varo', clarke: 'Clarke', riwall: 'Riwall', forbes: 'Forbes',
    toopro: 'Toopro', bamato: 'Bamato', mitox: 'Mitox', steeltec: 'Steeltec', gudnord: 'Gudnord', century: 'Century', holtzling: 'Holtzling',
    villager: 'Villager', bremann: 'Bremann', kienesberger: 'Kienesberger', elitech: 'Elitech', greatstar: 'Greatstar', genpower: 'Genpower',
    fagimex: 'Fagimex', widmer: 'Widmer', womax: 'Womax', ohlson: 'Ohlson', dineiger: 'Dineiger', holzkraft: 'Holzkraft', wemit: 'Wemit',
    spero: 'Spero', strongline: 'Strongline', gartenmeister: 'Gartenmeister', central: 'Central Machinery', lombarte: 'Lombarte',
  };
  /** @type {Record<string, string>} German machine word (lower case) -> our machine type. */
  const TYPES = {};
  const add = (en, keys) => keys.split(',').forEach((k) => (TYPES[k.trim()] = en));
  add('Air Compressor', 'kompressor,leisekompressor,handkompressor');
  add('Table Saw', 'tischkreissäge,präzisionstischkreissäge,tischkreissägen');
  add('Sliding Table Saw', 'rolltischkreissäge');
  add('Panel Saw', 'formatkreissäge');
  add('Site Saw', 'baukreissäge,baustellenkreissäge');
  add('Log Saw', 'wippkreissäge,wippsäge,brennholzkappsäge,wipp-,doppelsäge');
  add('Lawn Mower', 'rasenmäher,benzinrasenmäher');
  add('Ride-on Mower', 'aufsitzrasenmäher,rasentraktor');
  add('Robot Mower', 'rasenmähroboter,mähroboter,rasenmäherroboter');
  add('Cylinder Mower', 'spindelmäher');
  add('Finger Bar Mower', 'balkenmäher');
  add('Meadow Mower', 'wiesenmäher');
  add('Log Splitter', 'holzspalter,meterholzspalter,hydraulikspalter,spalter');
  add('Mitre Saw', 'kappzugsäge,kappsäge,zugsäge,gehrungssäge,kapp-,flipoversäge,kapp-zugsäge');
  add('Chainsaw', 'kettensäge');
  add('Top-handle Chainsaw', 'baumpflegesäge');
  add('Band Saw', 'bandsäge,bandsägen');
  add('Metal Band Saw', 'metallbandsäge');
  add('Pressure Washer', 'hochdruckreiniger,druckreiniger');
  add('Dust Extractor', 'absauganlage,absauganl.,mobil-entstauber,entstauber');
  add('Scroll Saw', 'dekupiersäge');
  add('Planer Thicknesser', 'abricht-,dickenhobel,dickenhobelmaschine,hobel,hobelmaschine');
  add('Pillar Drill', 'tischbohrmaschine,ständerbohrmaschine');
  add('Drill', 'bohrmaschine');
  add('Core Drill', 'kernlochbohrer');
  add('Plunge Saw', 'tauchsäge');
  add('Belt & Disc Sander', 'band-,tellerschleifer,tellerschleifmaschine');
  add('Belt Sander', 'bandschleifer');
  add('Generator', 'inverter,stromerzeuger,stromgenerator,generator,inverter-stromgenerator');
  add('Power Station', 'powerstation');
  add('Drywall Sander', 'wand-,deckenschleifer,universal-renovierungsschleifer');
  add('Wet & Dry Vacuum', 'trockensauger,waschsauger,nass-/trockensauger');
  add('Wet & Dry Grinder', 'trockenschleifer');
  add('Wet Sharpening System', 'nassschleifsystem,nassschleifmaschine,nasschleifmaschine,schleifsystem,nass-schleifsystem,nasschleifmasch.');
  add('Demolition Hammer', 'abbruchhammer');
  add('Rotary Hammer Drill', 'bohrhammer');
  add('Multi-tool', 'multigartengerät,multifunktionsgerät,4in1,5in1');
  add('Wood Lathe', 'drechselmaschine');
  add('Plate Compactor', 'rüttelplatte');
  add('Trench Rammer', 'vibrationsstampfer');
  add('Brushcutter', 'freischneider');
  add('Hedge Trimmer', 'heckenschere');
  add('Grass & Shrub Shears', 'strauchschere,gras-');
  add('Spindle Moulder', 'fräsmaschine,tischfräsmaschine,formatfräsmaschine');
  add('Router', 'oberfräse');
  add('Machine Stand', 'maschinenuntergestell,untergestell,universal-untergestell');
  add('Bench Grinder', 'doppelschleifer');
  add('Tiller', 'motorhacke,bodenhacke,triebradhacke');
  add('Cement Mixer', 'betonmischer');
  add('Paddle Mixer', 'mörtelrührwerk,handrührgerät,handmixer');
  add('Leaf Blower / Vacuum', 'laubsauger,laub-,laubsauger/bläser');
  add('Leaf Blower', 'laubbläser,blower,bläser');
  add('Angle Grinder', 'winkelschleifer');
  add('Scarifier', 'vertikutierer');
  add('Tool Trolley', 'werkstattwagen');
  add('Tile Cutter', 'fliesenschneider');
  add('Stone Cutter', 'steintrennmaschine,steintrenner,stein-');
  add('Earth Auger', 'erdbohrer');
  add('Grass Trimmer', 'rasentrimmer,trimmer');
  add('Lawn Edger', 'rasenkantenschneider,kantenschneider,rasenkantenstecher');
  add('Impact Wrench', 'schlagschrauber');
  add('Combination Woodworker', 'kombinationsmaschine,kombimaschine,kombi');
  add('Dumper', 'dumper,kettendumper');
  add('Garden Shredder', 'leisehäcksler,häcksler,gartenhäcksler,messerhäcksler,elektrohäcksler,gartenhäcksl.');
  add('Circular Saw', 'handkreissäge');
  add('Saw', 'allround-säge');
  add('Rotary Sieve', 'rollsieb');
  add('Sweeper', 'kehrmaschine,handkehrmaschine');
  add('Ash Vacuum', 'aschesauger');
  add('Pruner', 'gehölzschneider');
  add('Hoist', 'kettenzug,seilzug');
  add('Paint Sprayer', 'farbsprühsystem,farb-,sprüh-,airless');
  add('Jigsaw', 'stichsäge');
  add('Reciprocating Saw', 'säbelsäge');
  add('Drill Driver', 'schlagbohrschrauber,bohrschrauber,schrauber,trockenbauschrauber');
  add('Welder', 'schweißgerät,multischweißgerät');
  add('Welding Helmet', 'schweißhelm');
  add('Chain Sharpener', 'kettenschärfer');
  add('Air Spade', 'druckluftspaten');
  add('Tool Case', 'werkzeugkoffer,toolbox');
  add('Water Pump', 'gartenpumpe,pumpe,hauswasserautomat,hauswasserwerk,schmutzwasserkombipumpe,schmutzwasserpumpe,klarwasserpumpe,tauchpumpe,regenfasspumpe,wasserpumpe');
  add('Pond Filter', 'teichdruckfilter,poolfilter');
  add('Bobbin Sander', 'spindelschleifmaschine,spindelschleifer');
  add('Edge Sander', 'kantenschleifmaschine,kanten-');
  add('Paint Stripper', 'lackfräse');
  add('Cut-off Saw', 'trennschneider,metall-trennschneider,trennschleifer');
  add('Multi Sander', 'multischleifer,multifunktionsschleifer,kombinationsschleifer,kombinationsschleifmaschine,deltaschleifer');
  add('Snow Blower', 'schneefräse');
  add('Mini Digger', 'minibagger,bagger');
  add('Pallet Truck', 'hubwagen');
  add('Random Orbital Sander', 'exzenterschleifer');
  add('Satin Finisher', 'satiniermaschine');
  add('Wallpaper Steamer', 'tapetenentferner');
  add('Patio Heater', 'terrassenheizer');
  add('Heater', 'dieselheizer,heizer');
  add('Dehumidifier', 'bautrockner,luftentfeuchter');
  add('Lopper', 'astschere');
  add('Pole Pruner', 'hochentaster');
  add('Wall Chaser', 'mauernutfräse');
  add('Oscillating Multi-tool', 'multifunktionswerkzeug,multifunktionstool');
  add('Hammer Drill', 'schlagbohrmaschine');
  add('Plasma Cutter', 'plasmaschneider');
  add('Air Purifier', 'luftreiniger');
  add('Mortiser', 'stemmmaschine,langlochbohreinrichtung');
  add('Biscuit Jointer', 'flachdübelfräse');
  add('Heat Gun', 'heißluftpistole');
  add('Polisher', 'poliermaschine');
  add('Sandblaster', 'sandstrahlgerät');
  add('Window Robot', 'fensterputzroboter');
  add('Conveyor', 'förderband,fördertechnik');
  add('Compact Loader', 'kompaktlader');
  add('Plasterboard Lift', 'trockenbaulift');
  add('Nailer & Stapler', 'nagelpistole,klammer-');
  add('Weed Brush', 'unkrautfugenbürste');
  add('Spot Cleaner', 'fleckenreiniger');
  add('Floor Grinder', 'betonbodenschleifer');
  add('Site Radio', 'baustellenradio');
  add('Work Bench', 'spanntisch,arbeitstisch,arbeitsbock,spannbock,sägetisch,teleskop-arbeitsbock');
  add('Drum Sander', 'zylinderschleifmaschine');
  add('Rotary Tool', 'feinbohrschleifer');
  add('Hand Vacuum', 'handstaubsauger');
  add('Spreader', 'handstreuer,streuwagen');
  add('Work Light', 'arbeitsleuchte');
  add('Stone Splitter', 'steinknacker');
  add('Drill Sharpener', 'bohrerschleifgerät,bohrerschleifer');
  add('Power Feeder', 'vorschubapparat');
  add('Sliding Carriage', 'schiebeschlitten');
  add('Sander', 'schleifmaschine');
  add('Mobile Workshop', 'werkstatt');
  add('Garden Tool', 'gartenhacke,doppelhacke');
  add('Garden Tool Set', 'gartengeräte');
  add('Debarker', 'schälmaschine');
  add('Accessory', 'zubehör');
  /** Scheppach series names that say what the machine is when the title doesn't. */
  const SERIES = { tiger: 'Wet Sharpening System', forsa: 'Planer Thicknesser', plana: 'Planer Thicknesser', molda: 'Spindle Moulder', bestcombi: 'Combination Woodworker', basa: 'Band Saw', woova: 'Dust Extractor', biostar: 'Garden Shredder', precisa: 'Table Saw', capas: 'Mitre Saw' };
  const FILL = new Set(['benzin', 'akku', 'elektro', 'diesel', 'und', '&', 'stehend', 'liegend', 'mobile', 'mobiler', 'mobiles', 'tisch', 'oszillierende', 'oszillierender', 'universal', 'elektrischer', 'display', 'der', 'die', 'das', 'für', 'set', 'vernetzter', 'super-silent', 'super', 'silent', 'leise', 'lcd', 'paket', 'langstielig']);
  const STOP = /^(inkl\.?|mit|m\.|bis|zu|\+|lidl|aldi|norma|hofer|globus|bauhaus|\(bauhaus\)|brico|leroy|united|schweiz|australien|großbritannien|türkei|frankreich|\(diy\)|länderblock|black|edition|special|exclusive|classic|modell|we|uk|gb|ch|grün|british|usa|us|dr|p1)$/i;
  const UNITONLY = /^(kw|w|v|hz|ps|t|to|kg|l|mm|cm)[,.]?$/i;
  const UNIT = /^(\d+([.,]\d+)?(kw|w|v|hz|ps|mm|cm|l|bar|kg|j|db|qm|m2|m³|cm³|nm|t)(\/.*)?|\d+-\d+v.*|\d+v\/.*|kw,?|hz,?|w,?|v|ps)$/i;
  const MARKET = { schweiz: 'Switzerland', 'österreich': 'Austria', frankreich: 'France', 'türkei': 'Turkey', australien: 'Australia', 'großbritannien': 'UK', irland: 'Ireland', deutschland: 'Germany', finnland: 'Finland', 'südafrika': 'South Africa', russland: 'Russia', polen: 'Poland', belgien: 'Belgium', slowenien: 'Slovenia', portugal: 'Portugal', israel: 'Israel', dubai: 'Dubai', usa: 'USA', 'länderblock': 'country block', modell: 'model', inkl: 'incl.', 'inkl.': 'incl.', ohne: 'without', mit: 'with', und: 'and', 'sägeblatt': 'saw blade', schwert: 'bar', kingdom: 'Kingdom' };
  const LABEL = { ohne: 'without', mit: 'with', ab: 'from', bis: 'to', baujahr: 'built', seriennummer: 'serial no.', serie: 'series', und: 'and', schwert: 'bar', 'sägeblatt': 'saw blade', alt: 'old', neu: 'new', 'für': 'for', typ: 'type', version: 'version', ausführung: 'version', schwarz: 'black', 'grün': 'green', blau: 'blue', rot: 'red', gelb: 'yellow', grau: 'grey' };

  const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const clean = (w) => w.toLowerCase().replace(/[(),]/g, '').replace(/^(benzin|elektro|akku|diesel)-/, '');
  const typeOf = (w) => { const k = clean(w); return TYPES[k] || TYPES[k.split('-').filter(Boolean).pop()] || ''; };
  const fixCase = (m) => m.split(' ').map((t) => (t === t.toLowerCase() && (/\d/.test(t) || t.length <= 3) ? t.toUpperCase() : t)).join(' ');
  const head = (title) => title.replace(/^Paket \d+ - /i, '').split(/\s+-\s+|\s*\|\s*|\s+–\s+/)[0].replace(/\s+/g, ' ').trim();

  /** "Benzin-Kettensäge CSP41 Gardenline United Kingdom - 1.9PS" -> { brand, type, model, rest } */
  function parse(title) {
    const toks = head(title).split(' ').filter(Boolean);
    let brand = '', bi = -1;
    for (let j = 0; j < toks.length; j++) {
      const k = toks[j].toLowerCase().replace(/[(),]/g, '').replace(/-$/, '');
      if (BRANDS[k]) { brand = BRANDS[k]; bi = j; break; }
    }
    let type = '', ti = -1;
    for (let j = 0; j < toks.length; j++) {
      if (j === bi) continue;
      const t = typeOf(toks[j]);
      if (t) { type = t; ti = j; break; }
    }
    const used = new Set([bi, ti]);
    if (ti >= 0) {
      let j = ti;
      while (j + 1 < toks.length && (/-,?$/.test(toks[j]) || /^(und|&)$/i.test(toks[j + 1]) || /^(und|&)$/i.test(toks[j]))) used.add(++j);
      for (let k = 0; k < ti; k++) if (FILL.has(clean(toks[k])) || typeOf(toks[k]) || /-,?$/.test(toks[k])) used.add(k);
    }
    const grab = (from, to) => {
      const cand = [];
      for (let j = from; j < to; j++) {
        if (used.has(j)) { if (cand.length) break; continue; }
        const c = clean(toks[j]);
        if (STOP.test(toks[j])) break;
        if (FILL.has(c) || typeOf(toks[j])) { if (cand.length) break; continue; }
        if (cand.length && (UNIT.test(toks[j]) || toks[j].includes('/') || (/^\d+([.,]\d+)?$/.test(toks[j]) && UNITONLY.test(toks[j + 1] || '')))) break;
        if (BRANDS[c]) break;
        cand.push(toks[j]);
      }
      return cand;
    };
    let cand = bi > 0 ? grab(0, bi) : [];
    if (!cand.length) cand = grab(bi >= 0 ? bi + 1 : 0, toks.length);
    if (!cand.length) cand = toks.filter((t, j) => !used.has(j) && /^[A-Z]{2,}$/.test(t) && !BRANDS[t.toLowerCase()]);
    let model = fixCase(cand.join(' ').replace(/[,.]+$/, '')).replace(/^-\s*/, '').trim();
    if (!type) {
      const s = title.toLowerCase().match(/tiger|forsa|plana|molda|bestcombi|basa|woova|biostar|precisa|capas/);
      type = s ? SERIES[s[0]] : 'Other';
    }
    /* Words after the brand: the market or edition ("United Kingdom", "(DIY) Schweiz"). */
    const rest = bi >= 0 ? toks.slice(bi + 1).filter((t) => !/^\d/.test(t)).map((t) => MARKET[t.toLowerCase()] || t).join(' ').replace(/United Kingdom/i, 'UK').replace(/\s+/g, ' ').trim() : '';
    return { brand: brand || 'Scheppach', type, model, rest };
  }

  /** "0142 - CSP41 ohne SDS" -> "CSP41 without SDS" */
  function labelName(label) {
    return String(label || '').replace(/^\s*\d+\s*-\s*/, '').split(/(\s+)/).map((w) => LABEL[w.toLowerCase()] || w).join('').replace(/\s+/g, ' ').trim();
  }

  const STOCK = { online: 1, not_available_with_eta: 2, not_available: 0, no_longer_available: -1 };

  function build({ version, per = 100 }) {
    const rows = CRAWL.rows.filter((r) => r.lists.length);
    const lists = LCRAWL.lists;
    /* Our machines, to join rather than duplicate. */
    const ours = new Map();
    for (const [, raw, , types] of FPGIDX.b) for (const [, , list] of types) for (const [mid, mn] of list) ours.set(squash(raw.replace(/^\*/, '')) + '|' + squash(mn), mid);
    const models = new Map();
    for (const r of rows) {
      /* Some page titles are only "Benzin Rasenmäher | Scheppach": take the model code from the address. */
      if (!parse(r.title).model) {
        const code = (r.path.split('/')[1] || '').match(/(?:^|-)([A-Z]{1,5}\d[A-Za-z0-9]*(?:-\d+[A-Za-z0-9]*)?)(?=-|$)/);
        if (code) r.title = `${code[1]} ${r.title}`;
      }
      const p = parse(r.title);
      let model = p.model;
      if (!model || model.length > 26) model = 'Art. ' + r.article;
      const key = p.brand + '|' + p.type + '|' + squash(model);
      if (!models.has(key)) models.set(key, { brand: p.brand, type: p.type, model, lists: new Map(), img: '' });
      const m = models.get(key);
      if (!m.img && r.img) m.img = r.img;
      for (const l of r.lists) {
        if (!lists[l.listId]?.r?.length) continue;
        if (!m.lists.has(l.listId)) m.lists.set(l.listId, { label: l.label, rest: new Set() });
        if (p.rest) m.lists.get(l.listId).rest.add(p.rest);
      }
    }
    /* Our own Scheppach-listed PBKS53A2 is the Parkside one. */
    const extra = { 223: [1067] };
    const out = { models: {}, b: [], mi: {} };
    const brands = new Map();
    const usedLists = new Set();
    let next = 800001;
    const sorted = [...models.values()].filter((m) => m.lists.size).sort((a, b) => (a.brand + a.type + a.model).localeCompare(b.brand + b.type + b.model));
    for (const m of sorted) {
      const ids = [...m.lists.keys()].sort((a, b) => a - b);
      const hints = ids.map((id) => {
        const rest = [...m.lists.get(id).rest].filter(Boolean);
        return ids.length > 1 && rest.length ? rest.slice(0, 3).join(', ').slice(0, 60) : '';
      });
      const entry = ids.map((id, i) => (hints[i] ? [id, hints[i]] : id));
      ids.forEach((id) => usedLists.add(id));
      const mine = ours.get(squash(m.brand) + '|' + squash(m.model));
      if (mine) {
        out.models[mine] = entry;
        if (m.img) out.mi[mine] = m.img;
        continue;
      }
      const mid = next++;
      out.models[mid] = entry;
      if (m.img) out.mi[mid] = m.img;
      if (!brands.has(m.brand)) brands.set(m.brand, new Map());
      const types = brands.get(m.brand);
      if (!types.has(m.type)) types.set(m.type, []);
      types.get(m.type).push([mid, m.model]);
    }
    for (const [mid, ids] of Object.entries(extra)) if (!out.models[mid]) { out.models[mid] = ids; ids.forEach((id) => usedLists.add(id)); }
    let bid = 9001, tid = 90001;
    for (const [name, types] of [...brands].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.b.push([bid++, name, [...types].sort((a, b) => a[0].localeCompare(b[0])).map(([t, list]) => [tid++, t, list])]);
    }
    /* Rough parts counts: different part numbers across each brand's lists. */
    const counts = {};
    const brandLists = new Map();
    for (const m of sorted) {
      if (!brandLists.has(m.brand)) brandLists.set(m.brand, new Set());
      m.lists.forEach((_, id) => brandLists.get(m.brand).add(id));
    }
    for (const [b, ids] of brandLists) {
      const nos = new Set();
      ids.forEach((id) => lists[id].r.forEach((p) => nos.add(p[1])));
      counts[b] = nos.size;
    }
    /* The list files: one section per parts list. */
    const shards = {};
    let missing = 0;
    for (const id of [...usedLists].sort((a, b) => a - b)) {
      const l = lists[id];
      const multi = l.d > 1;
      const label = [...models.values()].map((m) => m.lists.get(id)?.label).find(Boolean) || '';
      const r = l.r.map(([refs, no, name, status]) => {
        const ref = String(refs).split(' / ').map((s) => s.replace(/^([A-Z])\s+/, multi ? '$1' : '').trim()).filter((s) => !/o\.?\s*Abb/i.test(s)).join(', ');
        const en = ENGLISH[name];
        if (!en) missing++;
        return [ref, no, en || name, STOCK[status] ?? 0];
      });
      const n = Math.floor(id / per);
      const shard = (shards[n] ||= { lists: {} });
      for (const [, no] of l.r) if (window.PIMG?.[no]) (shard.img ||= {})[no] = window.PIMG[no];
      shard.lists[id] = { n: labelName(label) || `Parts list ${id}`, p: Array.from({ length: l.d }, (_, i) => `${id}-${i + 1}`), r };
    }
    const index = {
      v: 2,
      source: 'scheppach',
      brand: 'Scheppach',
      plain: true,
      note: "Scheppach makes this machine. These are Scheppach's own parts lists for the {model}, one per version: open the one that matches your machine's rating plate, then match the numbers on the drawing to the Ref column.",
      img: 'https://cdn.shopify.com/s/files/1/0734/1477/0982/files/{id}.jpg',
      /* Scheppach's own photos of machines (mi) and parts (img in the list files), at size {s}. */
      pimg: 'https://shop.scheppach.com/imgproxy/s:{s}:{s}/media/{p}',
      mi: out.mi,
      /* A photo for each brand's tile: a machine from its biggest machine type that has one. */
      bi: Object.fromEntries(
        out.b
          .map(([, name, types]) => {
            const mids = [...types].sort((a, b) => b[2].length - a[2].length).flatMap(([, , list]) => list.map(([mid]) => mid));
            const pic = mids.map((mid) => out.mi[mid]).find(Boolean);
            return [name, pic];
          })
          .filter(([, pic]) => pic)
      ),
      shard: `fpg-maker-scheppach-{n}.json?v=${version}`,
      per,
      counts,
      b: out.b,
      models: out.models,
    };
    /* Section names: "CSP41 - ohne SDS - 14\"" -> "CSP41, without SDS, 14\"". A model's lists that end up
       with the same name are told apart by market when the pages say, else "version 1, 2...". */
    for (const s of Object.values(shards)) for (const l of Object.values(s.lists)) l.n = l.n.replace(/\s+-\s+/g, ', ').replace(/^-\s*|\s*-$/g, '').trim();
    const nameOf = (id) => shards[Math.floor(id / per)].lists[id].n;
    const unit = /^(PS|kW|V|Hz|W|mm|cm|-|–|\|)$/i;
    for (const [mid, entry] of Object.entries(index.models)) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const items = entry.map((e) => (Array.isArray(e) ? { id: e[0], h: e[1] } : { id: e, h: '' }));
      items.forEach((it) => {
        it.n = nameOf(it.id);
        it.h = it.h.split(', ').map((x) => x.split(' ').filter((t) => !unit.test(t)).join(' ').trim()).filter(Boolean).join(', ');
      });
      const groups = new Map();
      items.forEach((it) => (groups.has(it.n) ? groups.get(it.n).push(it) : groups.set(it.n, [it])));
      for (const g of groups.values()) {
        if (g.length < 2) { g[0].h = ''; continue; }
        const distinct = new Set(g.map((x) => x.h)).size === g.length && g.every((x) => x.h);
        g.forEach((x, k) => (x.h = distinct ? x.h : `version ${k + 1}`));
      }
      index.models[mid] = items.map((it) => (it.h ? [it.id, it.h] : it.id));
    }
    return { index, shards, stats: { models: sorted.length, added: next - 800001, lists: usedLists.size, missingNames: missing } };
  }

  window.FPGBUILD = { parse, labelName, build, TYPES, BRANDS };
})();
