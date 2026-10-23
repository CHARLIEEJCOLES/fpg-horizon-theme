# Forest Park Garden: Horizon theme

The theme for [forestparkgarden.com](https://forestparkgarden.com). It is Shopify's **Horizon 4.3.0** with the FP&G changes and redesign added (October 2026).

This repository is connected to the store through Shopify's GitHub integration, which keeps the two in sync:

- **Changes pushed to `main`** appear in the connected theme within a few seconds.
- **Changes made in the Shopify admin** (theme editor, code editor or apps) are committed back to `main` by Shopify, as "Update from Shopify for theme …".

Pull before editing, because Shopify writes to this branch too.

## What's FP&G and what's Horizon

All new files start with `fpg-`. The only Horizon files that were changed are the ones listed under "Horizon files edited" below. When Horizon is updated, re-apply those edits.

### New files

| Area | Files |
| --- | --- |
| Prices and stock | `snippets/fpg-vat-price.liquid` ("£X + VAT (£Y)"), `snippets/fpg-card-badges.liquid` (sold out, stock count, available to order, dropship, sale/clearance, Call for Price fix), `blocks/fpg-stock-status.liquid` |
| Product page blocks | `blocks/fpg-product-notices.liquid`, `fpg-cormorant.liquid` (Husqvarna/STIHL availability), `fpg-variant-pairs.liquid`, `fpg-spec-tabs.liquid`, `fpg-hire-rates.liquid`, `fpg-store-info.liquid`, `fpg-back-in-stock.liquid` (Notify me), `fpg-countdown.liquid`, `fpg-breadcrumbs.liquid` |
| Collections | `blocks/fpg-promo-tile.liquid` (promo tiles in the product grid) |
| Home page | `blocks/fpg-search-bar.liquid` (hero search with popular chips) |
| Shopping tools | `sections/fpg-kit-builder.liquid` + `assets/fpg-kit-builder.js/.css` (climbing kit builder with minimum-kit checklist), `sections/fpg-service-finder.liquid` + `assets/fpg-service-finder.js/.css` (machine → brand → book a service, model and notes go with the order), `blocks/fpg-hire-calculator.liquid` + `assets/fpg-hire.js` (hire planner: cheapest mix of day, weekend and week rates, or a hire request), `sections/fpg-hire-centre.liquid` + `assets/fpg-hire.css` (hire landing page), `assets/fpg-cart.js` (shared add-to-basket helper that opens the cart drawer) |
| Header and menu | `assets/fpg-menu.css` (dark teal header, menu bar hover line, dropdown columns and headings, "Build a Climbing Kit" pill, phone drawer), `assets/fpg-logo-white.svg` (the FP&G logo in white and pale sage for the dark header), `snippets/fpg-header-contact.liquid` (phone number and open/closed status beside the logo, 1100px and wider) |
| Home page sections | `sections/fpg-help-cards.liquid` ("How can we help?" cards, icon-left on tablets and phones), `sections/fpg-brands.liquid` (teal brand strip: one-tone logos, colour on hover, slow scroll, links to brand collections), `sections/fpg-category-tiles.liquid` (pale sage category tiles with cut-out pictures and a "what's inside" line; ready, not placed yet) |
| Footer | `sections/fpg-footer.liquid` (dark teal footer: newsletter, logo and contact, Shop / Help / More / Visit us columns, policies and payment icons). It replaces Horizon's footer, store info and utilities sections in the footer group |
| Collections and products | `snippets/fpg-subcat-chips.liquid` (sub-category chips from the menu, shown in every collection title band by the breadcrumbs block; `sections/fpg-subcats.liquid` is the same as a stand-alone section), `blocks/fpg-key-specs.liquid` (power, type, cutting width, drive, area, slope and battery chips under the product title, from the product's fields) |
| Round 3 styles | `assets/fpg-look.css` (all of the above, the parts finder restyle, card prices, product page price and part number, and the `--fpg-texture` hook for teal bands), `assets/fpg-look.js` (renames the parts finder's "Please Select" to "Part type"; hides the sticky Add to basket bar on Call for Price products) |
| Round 4 (phones, basket, help) | `sections/fpg-phone-bar.liquid` (search field under the header on phones, not on the home page; holds the phone menu footer template), `snippets/fpg-cart-extras.liquid` (basket: total inc. VAT, free click & collect line, help line, payment icons, empty-basket quick links), `sections/fpg-help-panel.liquid` (search tips and the no-results / page-not-found help card), `assets/fpg-boost.css` (styles for these plus collection filters, announcement arrow, teal sticky basket bar, single-column menu fix) |
| Round 5 (fit, basket builder, Google) | `sections/fpg-fit-finder.liquid` (chain & bar finder by machine or by the numbers on the bar; on the chain, bar and kit collections), `blocks/fpg-fits.liquid` (what a chain/bar fits, or the chains and bars that fit a saw), `blocks/fpg-complete-job.liquid` + `assets/fpg-complete-job.js` ("Complete the job" tick boxes with rules set in the theme editor), `assets/fpg-fit.js` + `assets/fpg-fit.css`, `assets/fpg-fit-data.json` (rebuild with `fpg-tools/fit/build-fit-data.js`), `snippets/fpg-product-jsonld.liquid` (Google product data with VAT-inclusive prices, part number and barcode). Smarter search is in `assets/fpg-look.js` |
| Page tops | `sections/fpg-page-hero.liquid` (dark teal hero with breadcrumbs, selling points, buttons and a picture) |
| Site-wide sections | `sections/fpg-recently-viewed.liquid`, `fpg-back-to-top.liquid`, `fpg-menu-promos.liquid` (picture cards in the menu dropdowns) |
| Scripts and styles | `assets/fpg-design.css` (design layer), `assets/fpg-design.js` (back to top, countdown, recently viewed, menu promos, fade-up), `assets/fpg-variant-block.js` (refreshes FP&G blocks when the variant changes), `snippets/fpg-head-scripts.liquid` (loads the above, GA4, jQuery on the Part Finder page only), `snippets/fpg-mini-card.liquid` |

### Horizon files edited

Search for `FP&G` to find the changes in the Liquid files. The two exceptions are `layout/theme.liquid`, where the change is the single `render 'fpg-head-scripts'` line, and the locale file, which can't hold comments.

- `snippets/price.liquid`: VAT display, with clearance rounding matching checkout
- `blocks/_featured-product-price.liquid`, `blocks/_product-card-gallery.liquid`, `snippets/card-gallery.liquid`: VAT prices and card badges
- `blocks/buy-buttons.liquid`: pickup wording
- `snippets/cart-summary.liquid`: cart note character limit; renders the total inc. VAT under the estimated total
- `snippets/cart-drawer.liquid`: renders `fpg-cart-extras` under the summary and in the empty basket
- `sections/product-information.liquid`: renders `fpg-product-jsonld` in place of Shopify's `structured_data`
- `assets/predictive-search.js`: one line passes the search through `fpgNormaliseSearch` (part numbers and model names)
- `layout/theme.liquid`: loads `fpg-head-scripts`
- `config/settings_schema.json`: the "FP&G" settings group (VAT rate, clearance tag, stock wording, Cormorant, GA4 and so on)
- `locales/en.default.json`: "(Ex. VAT)" totals and "Delivery instructions"
- `sections/main-collection.liquid`: renders the two promo tiles inside the product grid
- `blocks/_header-logo.liquid`: when the header's top row is dark, shows `fpg-logo-white.svg` in place of the uploaded logo and renders `fpg-header-contact` after it

### Templates

- `index.json`: the home page
- `search.json` and `404.json`: the FP&G help panel (Horizon's own 404 text section is switched off)
- `sections/header-group.json`: the FP&G phone bar after the header
- `collection.json`
- `product.json`, `product.quote-needed.json` (hire) and `product.ticket-number.json`
- `page.bar-and-chain-finder.json` and `page.product-parts-page.json` (Year/Make/Model and Part Finder apps)

App blocks in these templates (Hulk offers, YMM search, Part Finder) only work in the store, so offline Theme Check reports them as missing. That's expected.

#### Templates carried over from the old Dawn theme

These collections and pages use their own template, so each one was rebuilt in Horizon with the same wording and pictures. Without them, the pages would lose their content when the theme goes live.

| Template | Used by | What's on it |
| --- | --- | --- |
| `collection.petrol-chainsaws`, `top-handle-chainsaw`, `pole-saws`, `power-pruners`, `helmets`, `class-a-trousers`, `class-c-trousers` | Chainsaws - Petrol, Chainsaws - Top Handle, Pole Saws, Power Pruners, Helmets, Type A and Type C trousers | Products first, then the buying guide: intro, questions, price-range cards, picture rows and links |
| `collection.tool-help` | Tool Help, Aldi & Lidl Products | Partner text and link under the products |
| `collection.repair-page` | Servicing & Repair | Hero, the service finder (machine pictures on the buttons), then all services |
| `collection.combi-machines` | Combi Machines | Six brand carousels |
| `collection.kit-creator` | Kit Creator | Hero, the kit builder (11 steps), the minimum climbing and rescue kit lists with pictures, and "Browse every range" |
| `collection.forestry-arboriculture` | Forestry & Arboriculture Essentials | Nine carousels and "Daily uses". The old February offer was left out. |
| `page.shipping-policy` | Shipping Policy | The full shipping text and the rates map |
| `page.solutions-page`, `page.tall-hedges-solu` | Solutions, Tall Hedges | The filtered-collection AI block |
| `page.test-page` | Test Page | The Recomma quiz app block |
| `page.ymm-custom.liquid` | Product Result | The Year/Make/Model results page, using the app's `snippets/ymm-searchbox.liquid` and `ymm_fields.liquid` |

`fpg-tools/make_alt_templates.py` generated these from the Dawn templates. `fpg-tools/make_shop_tools.py` and `make_page_refresh.py` then rebuilt the kit creator and servicing pages around the new tools and added `collection.hire` (the For Hire collection uses it) and the hire planner on product pages.

The pictures on the kit creator, servicing, hire and home pages were made for FP&G in October 2026 and live in Content › Files under their ChatGPT names (for example `Arborist_Gear_Flat_Lay_in_Earthy_Tones.png`).

## Settings worth knowing

- **Theme settings › FP&G**: VAT 20%, clearance tag and percentage, dropship tag, stock and pickup wording, Cormorant URL and brands, cart note limit 30, GA4 ID.
- **Countdowns** stay hidden until an end date (YYYY-MM-DD, UK time) is set. One is on the home page Offers heading and one is under the product price.
- **The header menu** is `horizon-main-menu` ("Main menu (Horizon)"). It's built from `fpg-tools/menu/menu_spec.py`: run `python3 -I fpg-tools/menu/build_menu.py items` and send `items.json` with `menuUpdate`. Collections, pages and products are real resource links (IDs in `fpg-tools/menu/ids.json`); the breadcrumbs block and the sub-category chips both rely on that, so don't switch them back to web addresses. Ten top-level items (Machinery, Mowers, Parts & Servicing, Accessories, Clothing & PPE, Climbing & Arb, Tools & Workshop, Hire, Offers, Help), three levels deep, and every group has an "All …" link or a heading link so phones can reach the group page. `main-menu` is left alone because the live Dawn theme uses it; to roll back, point the header at `main-menu` again.
- **The menu promo cards** (`fpg-menu-promos` in the footer group) are keyed to the top-level menu titles, so rename them together.
- **The cart drawer** opens automatically after something is added, which matches the pop-up on the old theme.
- **Card badges**: stock shows as a pill with a coloured dot (green in stock, amber to order, red sold out); sale badges read "Save N%" from the card's variant (whole percent, rounded down) or "Clearance".
- **Hire products** (vendor FPG HIRE) show a "For hire" badge on product cards, and the hire planner replaces Add to cart on any product with Day / Extra Day / Week / Weekend variants.

## Working on the theme

- Run Theme Check with `shopify theme check`. The only expected errors are missing app blocks.
- Preview a branch by connecting it as its own theme in Shopify (Online Store › Themes › Add theme › Connect from GitHub).
- `fpg-tools/` holds the scripts that generated the original templates. Shopify ignores that folder. **Don't re-run them over this repository**, because they rebuild the templates from scratch and would wipe changes made in the theme editor. They're kept for reference.
