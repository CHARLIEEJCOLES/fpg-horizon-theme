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
| Page tops | `sections/fpg-page-hero.liquid` (dark teal hero with breadcrumbs, selling points, buttons and a picture) |
| Site-wide sections | `sections/fpg-recently-viewed.liquid`, `fpg-back-to-top.liquid`, `fpg-menu-promos.liquid` (picture cards in the menu dropdowns) |
| Scripts and styles | `assets/fpg-design.css` (design layer), `assets/fpg-design.js` (back to top, countdown, recently viewed, menu promos, fade-up), `assets/fpg-variant-block.js` (refreshes FP&G blocks when the variant changes), `snippets/fpg-head-scripts.liquid` (loads the above, GA4, jQuery on the Part Finder page only), `snippets/fpg-mini-card.liquid` |

### Horizon files edited

Search for `FP&G` to find the changes in the Liquid files. The two exceptions are `layout/theme.liquid`, where the change is the single `render 'fpg-head-scripts'` line, and the locale file, which can't hold comments.

- `snippets/price.liquid`: VAT display, with clearance rounding matching checkout
- `blocks/_featured-product-price.liquid`, `blocks/_product-card-gallery.liquid`, `snippets/card-gallery.liquid`: VAT prices and card badges
- `blocks/buy-buttons.liquid`: pickup wording
- `snippets/cart-summary.liquid`: cart note character limit
- `layout/theme.liquid`: loads `fpg-head-scripts`
- `config/settings_schema.json`: the "FP&G" settings group (VAT rate, clearance tag, stock wording, Cormorant, GA4 and so on)
- `locales/en.default.json`: "(Ex. VAT)" totals and "Delivery instructions"
- `sections/main-collection.liquid`: renders the two promo tiles inside the product grid

### Templates

- `index.json`: the home page
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
- **The header menu** is `horizon-main-menu`, a copy of `main-menu` with shorter top-level labels. `main-menu` is left alone.
- **The cart drawer** opens automatically after something is added, which matches the pop-up on the old theme.
- **Hire products** (vendor FPG HIRE) show a "For hire" badge on product cards, and the hire planner replaces Add to cart on any product with Day / Extra Day / Week / Weekend variants.

## Working on the theme

- Run Theme Check with `shopify theme check`. The only expected errors are missing app blocks.
- Preview a branch by connecting it as its own theme in Shopify (Online Store › Themes › Add theme › Connect from GitHub).
- `fpg-tools/` holds the scripts that generated the original templates. Shopify ignores that folder. **Don't re-run them over this repository**, because they rebuild the templates from scratch and would wipe changes made in the theme editor. They're kept for reference.
