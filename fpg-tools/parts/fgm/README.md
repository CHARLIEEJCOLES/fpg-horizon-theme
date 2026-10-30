# FGM Claymore brands (Echo first)

FGM Claymore's dealer portal (fgm.ev-portal.com, "eVision") holds the parts catalogues for Echo, Tanaka, Shindaiwa, Masport, Snapper, Simplicity, Sunseeker and others. Charlie signs in himself; the crawl runs in that browser tab.

## How the portal works
- `Catalogs/NavigationGetData?nodeId=&productId=` returns the folder tree (JSON). Echo is node 4 under "SHOP - PARTS DIAGRAMS" (420).
- Asking for a machine (nodeId + productId) returns its documents. Each parts-list section has a PNG drawing (`FileNameForIpl`) and `FileHotSpot` XML with every callout: ref, part number, description. That is the parts list, so no per-section request is needed.
- `Catalogs/DocumentLayout` and `Catalogs/ProductLayout` only work for the machine last opened in the session. The server also handles one request at a time per session, so run them one machine at a time.
- Drawings: `/Virtual_DataCatalogs/IFGM/FGM/Ressources/Png/{n}.PNG`. Machine photos: `Ressources/{n}.PNG`, named after the folder tile (`ThumbsFolders/{n}.JPG`). Both are public.
- Price list: `Ecommerce/CommonSearchItemsPaged` (160k lines). `OnHand` is an availability code, not a quantity: 1 Normal, 2 Low, 3 Nil. The list also has `SupersededBy`. Descriptions starting "NLA" are no longer available.

## What's in the theme
- `assets/fpg-maker-fgm-echo.json`: the index (types, models, model photos). `groupSmall: false`, so these brands are not grouped with the small Scheppach ones.
- `assets/fpg-maker-fgm-echo-{0..23}.json`: 200 sections per file. Each part row is `[ref, part no, name, stock, replaced by]`. Stock values: 1 = we can order it in, 3 = out at the supplier, 0 = not in FGM's list, -1 = discontinued.
- Drawings are in Shopify Files as `fgm-echo-{n}.png` (3,396 of them, copied from FGM's URLs with fileCreate).
- The section's `data-maker` lists every maker file, separated by spaces.

## FGM's other brands
- One combined file: `assets/fpg-maker-fgm-more.json` + `-{0..29}.json` (Shindaiwa, Snapper, Masport, Orec, Morrison, Simplicity, Echo Robotics, Harry, Sunseeker, Apache, Fort, Lawnmaster). Built per brand with `buildFGM({nameStyle: 'plain', imgSlug: 'x', list0, bid, tid0, mid0, types})` and merged; the note uses `{brand}` so each machine names its own maker.
- Drawings are `fgm-x-{n}.png`. Snapper/Simplicity/Orec drawings are often over Shopify's 20-megapixel limit, so fileCreate from FGM's URL fails; those are shrunk to 18 MP in the browser (canvas), staged as IMAGE and re-created with `duplicateResolutionMode: REPLACE` under the same name.
- Tanaka, Shibaura, Murray, Jagger, Zomax, Adly and Turbo Cut only have PDF parts books, so they are not in the finder.

## Rebuilding
`build-fgm.js` runs in the portal tab against what the crawl saved in IndexedDB (`fpg`/`kv`). The keys it reads are listed at the top of the file. Stock in the files is a snapshot taken when they were built. Keeping it live would mean a job (Polly, or a scheduled rebuild) that re-reads FGM's price list.
