"""Build the parts-diagram progress workbook.

Inputs (same folder):
  live-links.json      {modelId: [dealerListName, source, drawingCount]} for finder models that
                       have a dealer list, read from the live website (/apps/fpg-parts/getDealerParts).
  run-status.json      Polly "Dealer lists" run snapshot read from Polly's Part Finder admin.
Model names/brands/types come from assets/fpg-parts-index.json (the finder catalogue).
"""
import json, sys
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.formatting.rule import FormulaRule

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
index = json.loads((ROOT / 'assets/fpg-parts-index.json').read_text())
links = {int(k): v for k, v in json.loads((HERE / 'live-links.json').read_text()).items()}
run = json.loads((HERE / 'run-status.json').read_text())
out = HERE / sys.argv[1] if len(sys.argv) > 1 else HERE / 'parts-diagram-progress.xlsx'

person = {n: c for n, c in run['person']}          # model name -> close machines
notfound = {n: why for n, why in run['notfound']}
hand = set(run['linked_by_hand'])
suggest = run.get('suggest', {})

ARIAL = 'Arial'
F = Font(name=ARIAL, size=10)
FB = Font(name=ARIAL, size=10, bold=True)
FBLUE = Font(name=ARIAL, size=10, color='0000FF')
FH = Font(name=ARIAL, size=10, bold=True, color='FFFFFF')
FT = Font(name=ARIAL, size=14, bold=True)
FS = Font(name=ARIAL, size=9, italic=True, color='5F5E5A')
HEAD = PatternFill('solid', fgColor='1F4E3D')
thin = Side(style='thin', color='D3D1C7')

STATUSES = [
    ('Diagrams live', 'C6EFCE'),
    ('Linked - no drawings', 'FFEB9C'),
    ('Needs a person', 'F8CBAD'),
    ('Not found on dealer portal', 'D9D9D9'),
    ('Waiting for Polly run', 'DDEBF7'),
    ('No dealer portal (other brand)', 'EDEDED'),
]

rows = []
for b in index['b']:
    brand = b[1].lstrip('*')
    for t in b[3]:
        for mid, name in t[2]:
            name = name.strip()
            link = links.get(mid)
            dealer_brand = brand in ('Stihl', 'Husqvarna')
            if link and link[2] > 0:
                status = 'Diagrams live'
            elif link and link[0]:
                status = 'Linked - no drawings'
            elif not dealer_brand:
                status = 'No dealer portal (other brand)'
            elif name in person:
                status = 'Needs a person'
            elif name in notfound:
                status = 'Not found on dealer portal'
            else:
                status = 'Waiting for Polly run'
            if status == 'Needs a person':
                nxt = suggest.get(name) or f"Pick from {person[name]} close machine(s) once the run finishes"
                note = f"No exact match on the dealer portal - {person[name]} close machine(s)"
            elif status == 'Not found on dealer portal':
                nxt, note = 'Check the model name, or link a list by hand', notfound[name]
            elif status == 'Waiting for Polly run':
                nxt, note = 'Nothing yet - the run will reach it', ''
            elif status == 'Linked - no drawings':
                nxt, note = 'Check the dealer list has drawings', ''
            elif status == 'Diagrams live':
                nxt = ''
                note = 'Linked by hand 29/10' if name in hand else ''
            else:
                nxt, note = '', 'Brand has no dealer parts portal'
            rows.append([mid, brand, t[1], name, status,
                         (link[0] if link else ''), (link[2] if link else 0), note, nxt])

wb = Workbook()

# ---------------- Summary ----------------
s = wb.active
s.title = 'Summary'
s.sheet_view.showGridLines = False
s['A1'] = 'Parts finder - maker diagram progress'; s['A1'].font = FT
s['A2'] = (f"Website checked {run['checked_at']} (every finder model's dealer list read from "
           "forestparkgarden.com/apps/fpg-parts). Polly run read from Polly > Part Finder > Dealer lists.")
s['A2'].font = FS

r = 4
s.cell(r, 1, 'Website coverage').font = FB; r += 1
hdr = ['Status', 'STIHL', 'Husqvarna', 'Other brands', 'All models', '% of all']
for c, h in enumerate(hdr, 1):
    cell = s.cell(r, c, h); cell.font = FH; cell.fill = HEAD; cell.alignment = Alignment(horizontal='center')
first = r + 1
n = len(rows) + 1
rng = lambda col: f"'All models'!${col}$2:${col}${n}"
for name, colour in STATUSES:
    r += 1
    s.cell(r, 1, name).font = F
    s.cell(r, 1).fill = PatternFill('solid', fgColor=colour)
    s.cell(r, 2, f'=COUNTIFS({rng("E")},$A{r},{rng("B")},"Stihl")')
    s.cell(r, 3, f'=COUNTIFS({rng("E")},$A{r},{rng("B")},"Husqvarna")')
    s.cell(r, 4, f'=COUNTIFS({rng("E")},$A{r})-B{r}-C{r}')
    s.cell(r, 5, f'=COUNTIFS({rng("E")},$A{r})')
    s.cell(r, 6, f'=IF($E${first+len(STATUSES)}=0,0,E{r}/$E${first+len(STATUSES)})')
last = r
r += 1
s.cell(r, 1, 'Total').font = FB
for c, col in zip(range(2, 6), 'BCDE'):
    s.cell(r, c, f'=SUM({col}{first}:{col}{last})').font = FB
s.cell(r, 6, f'=SUM(F{first}:F{last})').font = FB
tot = r
for rr in range(first, tot + 1):
    for c in range(2, 7):
        cell = s.cell(rr, c)
        if cell.font != FB: cell.font = F
        cell.number_format = '0.0%' if c == 6 else '#,##0'
        cell.alignment = Alignment(horizontal='center')
        cell.border = Border(bottom=thin)
    s.cell(rr, 1).border = Border(bottom=thin)

r = tot + 2
s.cell(r, 1, 'STIHL + Husqvarna with diagrams live').font = FB
s.cell(r, 5, f'=B{first}+C{first}').font = FB
s.cell(r, 6, f'=IF((B{tot}+C{tot})=0,0,E{r}/(B{tot}+C{tot}))').font = FB
s.cell(r, 5).alignment = s.cell(r, 6).alignment = Alignment(horizontal='center')
s.cell(r, 6).number_format = '0.0%'
r += 1
s.cell(r, 1, 'Diagrams live this morning (before the run)').font = F
s.cell(r, 5, run['baseline_live']).font = FBLUE
s.cell(r, 5).alignment = Alignment(horizontal='center')
s.cell(r, 7, "Source: this morning's coverage check, 29/10").font = FS
r += 1
s.cell(r, 1, 'Added today').font = F
s.cell(r, 5, f'=E{r-2}-E{r-1}').font = F
s.cell(r, 5).alignment = Alignment(horizontal='center')
r += 1
s.cell(r, 1, 'Total drawings now on the website').font = F
s.cell(r, 5, f"=SUM('All models'!$G$2:$G${n})").font = F
s.cell(r, 5).number_format = '#,##0'; s.cell(r, 5).alignment = Alignment(horizontal='center')

r += 2
s.cell(r, 1, "Polly's dealer-list run").font = FB
s.cell(r, 7, f"Source: Polly > Part Finder > Dealer lists, read {run['run_read_at']} (blue = typed in from that screen)").font = FS
r += 1
runrows = [
    ('Started', run['started'], None),
    ('Started by', run['by'], None),
    ('Models in the run', run['run_total'], '#,##0'),
    ('Models done so far', run['run_done'], '#,##0'),
]
rs = r
for label, val, fmt in runrows:
    s.cell(r, 1, label).font = F
    c = s.cell(r, 5, val); c.font = FBLUE; c.alignment = Alignment(horizontal='center')
    if fmt: c.number_format = fmt
    r += 1
s.cell(r, 1, 'Run progress').font = FB
s.cell(r, 5, f'=IF(E{rs+2}=0,0,E{rs+3}/E{rs+2})').font = FB
s.cell(r, 5).number_format = '0.0%'; s.cell(r, 5).alignment = Alignment(horizontal='center')
r += 1
s.cell(r, 1, 'Minutes running when read').font = F
c = s.cell(r, 5, run['run_minutes']); c.font = FBLUE; c.alignment = Alignment(horizontal='center')
r += 1
s.cell(r, 1, 'Pace (minutes per model)').font = F
s.cell(r, 5, f'=IF(E{rs+3}=0,0,E{r-1}/E{rs+3})').font = F
s.cell(r, 5).number_format = '0.00'; s.cell(r, 5).alignment = Alignment(horizontal='center')
r += 1
s.cell(r, 1, 'Estimated minutes left at that pace').font = F
s.cell(r, 5, f'=(E{rs+2}-E{rs+3})*E{r-1}').font = F
s.cell(r, 5).number_format = '#,##0'; s.cell(r, 5).alignment = Alignment(horizontal='center')
r += 1
s.cell(r, 1, 'Run results so far').font = FB; r += 1
for label, key in [('New machine added + connected', 'added'), ('Connected to a saved machine', 'linked'),
                   ('Needs a person', 'person_n'), ('Not found on the dealer portal', 'notfound_n'), ('Failed', 'failed')]:
    s.cell(r, 1, label).font = F
    c = s.cell(r, 5, run['counts'][key]); c.font = FBLUE; c.alignment = Alignment(horizontal='center')
    r += 1
r += 1
s.cell(r, 1, 'Note: the 8 models linked by hand today (see "All models", Note column) have left Polly\'s "Needs a person" list.').font = FS

s.column_dimensions['A'].width = 44
for col in 'BCDEF':
    s.column_dimensions[col].width = 13
s.column_dimensions['G'].width = 60

# ---------------- All models ----------------
a = wb.create_sheet('All models')
heads = ['Finder ID', 'Brand', 'Machine type', 'Model', 'Status', 'Dealer list on website',
         'Drawings', 'Note', 'Next step']
a.append(heads)
for row in sorted(rows, key=lambda x: (x[1] not in ('Stihl', 'Husqvarna'), x[1], x[2], x[3])):
    a.append(row)
for c in range(1, len(heads) + 1):
    a.cell(1, c).font = FH; a.cell(1, c).fill = HEAD
for row in a.iter_rows(min_row=2):
    for cell in row:
        cell.font = F
widths = [10, 12, 24, 22, 28, 40, 10, 50, 52]
for i, w in enumerate(widths, 1):
    a.column_dimensions[get_column_letter(i)].width = w
a.freeze_panes = 'A2'
a.auto_filter.ref = f'A1:I{n}'
for name, colour in STATUSES:
    a.conditional_formatting.add(f'E2:E{n}', FormulaRule(formula=[f'$E2="{name}"'], fill=PatternFill('solid', fgColor=colour)))

# ---------------- Needs a person ----------------
p = wb.create_sheet('Needs a person')
p.append(['Model', 'Brand', 'Close machines on dealer portal', 'On website now', 'Suggested pick / next step'])
by_name = {}
for row in rows:
    by_name.setdefault(row[3], row)
for name, cnt in run['person']:
    row = by_name.get(name)
    live = row[4] == 'Diagrams live' if row else False
    p.append([name, row[1] if row else '', cnt,
              (f"Yes - {row[5]} ({row[6]} drawings)" if live else 'No'),
              ('Done - linked by hand 29/10' if live else (suggest.get(name) or 'Choose once the run finishes'))])
for c in range(1, 6):
    p.cell(1, c).font = FH; p.cell(1, c).fill = HEAD
for row in p.iter_rows(min_row=2):
    for cell in row: cell.font = F
for i, w in enumerate([14, 12, 30, 40, 60], 1):
    p.column_dimensions[get_column_letter(i)].width = w
p.freeze_panes = 'A2'

# ---------------- Not found ----------------
q = wb.create_sheet('Not found')
q.append(['Model', 'Brand', "Polly's note"])
for name, why in run['notfound']:
    row = by_name.get(name)
    q.append([name, row[1] if row else '', why])
for c in range(1, 4):
    q.cell(1, c).font = FH; q.cell(1, c).fill = HEAD
for row in q.iter_rows(min_row=2):
    for cell in row: cell.font = F
for i, w in enumerate([18, 12, 80], 1):
    q.column_dimensions[get_column_letter(i)].width = w
q.freeze_panes = 'A2'

wb.save(out)
print('saved', out, len(rows), 'models')
