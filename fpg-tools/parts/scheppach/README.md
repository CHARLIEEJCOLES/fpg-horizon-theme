# Scheppach parts lists and exploded drawings

Downloaded on 30 October 2026 from Scheppach's own shop (shop.scheppach.com) for
Forest Park & Garden, as Scheppach's warranty partner. These are Scheppach's own
parts lists and drawings; we keep them for warranty and spares work and to show
them in the FP&G parts finder.

## What's in the download

The drawings come in several zips (`scheppach-parts-01.zip`, `-02.zip`, ...), about
100 parts lists each, and one data zip (`scheppach-parts-data.zip`) with the tables
and this guide. Unzip them all into one folder, for example
`Documents\FP&G\Scheppach parts\`, so you end up with:

| Path | What it is |
|---|---|
| `drawings\<listId>-<n>.jpg` | The exploded drawing(s) for a parts list, full size (often 4000 px wide). `<n>` is the page when a list has more than one drawing. |
| `lists\<listId>.json` | One parts list: its drawings and every part on them. |
| `parts.csv` | Every part in every list, one row each (opens in Excel). |
| `machines.csv` | Every Scheppach machine page and the parts list(s) it uses. |
| `lists.csv` | One row per parts list: how many parts and drawings, and which machines use it. |
| `fpg-machines.csv` | The machines in our own parts finder and the Scheppach list(s) that match them. |

### parts.csv columns

| Column | Meaning |
|---|---|
| listId | Scheppach's number for the parts list (the same as the file names). |
| refs | The number(s) printed on the drawing for this part, e.g. `A 1`, or `A 4-6` for a kit covering 4 to 6. Several are separated by ` / `. |
| partNumber | Scheppach's part number (article number). Use this when ordering from Scheppach or matching to our Shopify SKUs. |
| name | Scheppach's description (in German on their site). |
| ean | Barcode, where Scheppach has one. |
| available | Scheppach's own stock status when downloaded (`online`, `not_available`, ...). |
| priceEUR | Scheppach's retail price in euros incl. German VAT when downloaded. A guide only; not our price. |
| url | The part's page on shop.scheppach.com. |

### machines.csv columns

| Column | Meaning |
|---|---|
| article | Scheppach's article number for the machine (on the rating plate). |
| title | The machine's name on Scheppach's site, e.g. "Kettensäge CSP41 Gardenline United Kingdom - 1.9PS". |
| listId | The parts list it uses (a machine can have several, one per build year or serial range). |
| label | Scheppach's label for that list, e.g. "0142 - CSP41". |
| url | The machine's page on shop.scheppach.com. |

One model is often sold under several brands and countries (Scheppach, Gardenline,
Ferrex, Workzone, Parkside, ...). Each has its own article number but they often
share the same parts list. Pick the one that matches the machine's rating plate.

## How to get it onto the website

The parts finder already knows how to show a maker's parts list as tiles, with the
drawing and the parts next to it. It gets STIHL and Husqvarna lists from Polly. There
are three ways to give it the Scheppach ones.

### 1. Polly reads Scheppach itself (best long term)

Ask Dan to have Polly fetch Scheppach the way it fetches STIHL and Husqvarna. The
same public addresses this download used:

- Parts list and drawings: `https://shop.scheppach.com/api/product/spare-parts/<listId>`
  returns `{ images: [base64 JPEG...], parts: [{ positions: ["A  1"], product: { productNumber, name, ean, availability, price, route } }] }`.
- Which list a machine uses: the machine's page
  (`https://shop.scheppach.com/<slug>/<article>`) carries `{ listId, label }` in its
  page data (`__NUXT_DATA__`).
- Machine pages: the sitemap at `https://shop.scheppach.com/sitemap.xml`. Machine
  article numbers have a 9 as the third-last digit (e.g. 5910113**9**06); spare parts don't.
- Be polite: one or two requests at a time with a short pause. robots.txt only
  blocks `/checkout/`.

In Polly, link each Part Finder machine to its list the same way as STIHL and
Husqvarna (Dealer lists tab). The website then shows the drawings with no theme
changes.

### 2. Import these files into Polly

If Polly gets an "import a parts list from files" option, it needs, per machine:
the drawing image(s) and the parts table. That is exactly `drawings\<listId>-*.jpg`
plus `lists\<listId>.json` (or the rows of `parts.csv` for that list). Use
`fpg-machines.csv` to see which list goes with which of our machines.

### 3. Straight into the theme (quickest, our machines only)

For a handful of machines (the ones in `fpg-machines.csv`), Claude can:

1. Upload their drawings to Shopify (Content → Files).
2. Save their parts lists into a data file in the Horizon theme.
3. Match each part number to our Shopify SKUs so stocked parts get Add to basket.

This needs an OK first because it uploads files to the live store. It is a snapshot:
re-run it if Scheppach changes a list.

### Clickable numbers

Scheppach gives the ref number of each part but not where it sits on the drawing.
Without positions, the viewer shows the drawing next to the parts list and customers
match the ref by eye (as on some older Husqvarna drawings). The parts finder can find
printed numbers on a drawing (it already does this to line up Husqvarna's), so
clickable numbers can be added later from these same images.

## Matching to our stock

`partNumber` is Scheppach's article number. Our Scheppach spares in Shopify should
carry the same number as their SKU. To check what we stock, compare `parts.csv` →
`partNumber` with a Shopify product export → `Variant SKU`. Parts we don't stock can
still be ordered from Scheppach; the parts finder shows them as "Ask us".
