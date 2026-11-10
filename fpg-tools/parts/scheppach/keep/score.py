"""Ranks Scheppach's machines in the parts finder by how worth keeping they are for FP&G, and picks the top ~500.
Inputs (exported from the parts finder in the browser): scheppach-machines.json, scheppach-lists-uk.json.
Writes keep.json (machine ids kept) and scores.csv (every machine, its score and why)."""
import csv, json, math, collections

A = {  # outdoor power equipment FP&G sells and services
    'Log Splitter', 'Lawn Mower', 'Chainsaw', 'Top-handle Chainsaw', 'Garden Shredder', 'Hedge Trimmer', 'Brushcutter',
    'Grass Trimmer', 'Leaf Blower', 'Leaf Blower / Vacuum', 'Tiller', 'Scarifier', 'Generator', 'Pressure Washer',
    'Water Pump', 'Log Saw', 'Ride-on Mower', 'Robot Mower', 'Earth Auger', 'Pole Pruner', 'Meadow Mower',
    'Finger Bar Mower', 'Cylinder Mower', 'Lawn Edger', 'Snow Blower', 'Sweeper', 'Dumper', 'Mini Digger',
    'Compact Loader', 'Grass & Shrub Shears', 'Pruner', 'Lopper', 'Weed Brush', 'Spreader', 'Debarker',
    'Conveyor', 'Chain Sharpener', 'Power Station', 'Pond Filter', 'Rotary Sieve', 'Stone Splitter',
}
B = {  # site and building machines we can support
    'Plate Compactor', 'Cement Mixer', 'Air Compressor', 'Wet & Dry Vacuum', 'Ash Vacuum', 'Demolition Hammer',
    'Trench Rammer', 'Tile Cutter', 'Stone Cutter', 'Welder', 'Paddle Mixer', 'Cut-off Saw', 'Wall Chaser',
    'Core Drill', 'Floor Grinder', 'Hoist', 'Pallet Truck', 'Dehumidifier', 'Patio Heater', 'Air Spade',
    'Rotary Hammer Drill', 'Paint Sprayer', 'Sandblaster', 'Plasma Cutter', 'Work Light', 'Site Radio',
}
UK_BRANDS = {'Parkside', 'Ferrex', 'Gardenline', 'Workzone', 'Clarke', 'MacAllister'}  # sold in UK shops (Lidl, Aldi, Machine Mart, B&Q)
TARGET = 500

d = json.load(open('scheppach-machines.json'))
uk = json.load(open('scheppach-lists-uk.json'))
rows = [dict(zip(d['cols'], r)) for r in d['rows']]
for r in rows:
    lists = r['lists'].split()
    others = [b for b in r['otherBrands'].split('|') if b]
    r['ukPlug'] = any(uk.get(l, [0])[0] for l in lists)
    r['ukShops'] = sorted(set(others) & UK_BRANDS)
    tier = 'A' if r['type'] in A else 'B' if r['type'] in B else 'C'
    r['tier'] = tier
    stock = r['inStock'] / r['parts'] if r['parts'] else 0
    s = {'A': 3.0, 'B': 1.6, 'C': 1.0}[tier]
    s += 2.0 if r['ukPlug'] else 0
    s += 1.5 if r['ukShops'] else 0
    s += min(len(others), 5) * 0.25
    s += min(math.log10(max(r['parts'], 1)), 2.5) * 0.4
    s += 0.3 if r['photo'] else 0
    s *= 0.5 + stock
    r['stock'] = round(stock, 2)
    r['score'] = round(s, 2)
    r['why'] = '; '.join(filter(None, [
        {'A': 'outdoor power', 'B': 'site & building', 'C': 'workshop'}[tier],
        'UK plug parts' if r['ukPlug'] else '',
        'also sold as ' + '/'.join(r['ukShops']) if r['ukShops'] else '',
        f'{len(others)} other brands share the list' if others else '',
        f"{round(stock * 100)}% of parts still available",
    ]))
rows.sort(key=lambda r: (-r['polly'], -r['score']))
# A name that isn't a model ("/", "AC") can't be matched to a rating plate: never kept.
named = lambda r: sum(ch.isalnum() for ch in r['name']) >= 3
keep = [r for r in rows if named(r)][:TARGET]
for r in rows:
    r['keep'] = r in keep
json.dump(sorted(r['mid'] for r in keep), open('keep.json', 'w'))
with open('scores.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['rank', 'keep', 'machine', 'type', 'group', 'score', 'parts', 'parts available', 'UK plug parts', 'UK shop brands', 'other brands sharing list', 'why', 'id'])
    for i, r in enumerate(rows, 1):
        w.writerow([i, 'yes' if r['keep'] else 'no', r['name'], r['type'], {'A': 'Outdoor power', 'B': 'Site & building', 'C': 'Workshop'}[r['tier']], r['score'], r['parts'], f"{round(r['stock']*100)}%", 'yes' if r['ukPlug'] else '', ', '.join(r['ukShops']), r['otherBrands'].replace('|', ', '), r['why'], r['mid']])
k = collections.Counter(r['tier'] for r in keep); a = collections.Counter(r['tier'] for r in rows)
print('kept by group', dict(k), 'of', dict(a))
print('kept with uk plug', sum(r['ukPlug'] for r in keep), 'uk shops', sum(bool(r['ukShops']) for r in keep))
print('cut-off score', keep[-1]['score'])
print('types kept', collections.Counter(r['type'] for r in keep).most_common(30))
