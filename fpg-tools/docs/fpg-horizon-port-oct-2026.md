# FP&G Horizon port: 22–23 Oct 2026

**Decision:** move from Dawn 9.0.0 to Horizon 4.3.0.

**Status:**
- The new theme is installed, redesigned and checked in the unpublished theme "Horizon – FP&G" (gid://shopify/OnlineStoreTheme/195333226790).
- **It is not published; that is Charlie's call.**
- The live theme is still "Forest Park Garden" (Dawn, id 147028279590).

**Backup:** Horizon-FPG-4.3.0-v4.zip (23 Oct) is an uploadable theme zip of the current state. The older v3 packs predate the redesign.

**Repo:** github.com/CHARLIEEJCOLES/fpg-horizon-theme was created on 22 Oct and is still empty and public.
- Claude prepared 2 commits locally (theme plus README).
- Pushing is blocked until Charlie installs the Claude GitHub app on his account (push returns 403).
- Charlie also needs to decide whether the repo stays public or goes private.

## Redesign (22 Oct; Charlie asked Claude to decide the whole look)

**Palette:**
- teal #002D37 (brand)
- sage #5F7D6D (accent)
- pale sage #E2E9E5
- mist #F3F6F4
- line #D6DED9
- ink #12262B
- sale red #C7362B

**Type:**
- Headings: Barlow 700 (h1 56 / h2 40 / h3 24 / h4 20).
- Eyebrows: Barlow 600, uppercase (h6 12).
- Body: Inter 400 at 16. Subheadings: Inter 500.

**Buttons and cards:**
- Buttons have radius 6: teal primary, teal-outline secondary.
- Cards have radius 12 and product images radius 8.
- Cards lift on hover, and quick add is on.

**Header (updated 23 Oct, see "Menu and header redo"):**
- Teal announcement bar with 3 rotating messages: parts look-up; STIHL dealer at Coed Court; click & collect, servicing and hire.
- Dark teal logo row (#002D37) with the white logo and contact strip, then a deeper teal menu row (#0B3C47).
- Sticky when scrolling up; sage cart bubble.

**Menu "Main menu (Horizon)"** (handle horizon-main-menu, gid://shopify/Menu/329850388774): first a copy of main-menu with short labels; rebuilt on 23 Oct (see "Menu and header redo"). main-menu itself is untouched because the live site uses it.

**Homepage, in order:**
1. Hero with search bar and Popular chips
2. Trust strip
3. "How can we help?" (5 cards, including the kit creator)
4. Year/Make/Model band
5. Shop by category
6. Offers carousel, with a countdown slot
7. Servicing
8. Brands (12 logo tiles)
9. Hire
10. New in
11. Training band
12. Footer

**Collection pages:**
- Pale sage title band with breadcrumbs.
- Sidebar filters and square cards with a vendor eyebrow.
- 2 promo tiles in the grid.

**Product pages:**
- Breadcrumbs and a vendor eyebrow above the title.
- Countdown slot under the price.
- Notify me for sold-out variants.
- Trust panel under Add to cart: click & collect, phone number and payment icons.
- Recently viewed row.

## Feature pack and second design round (22 Oct)

**New files:**
- assets/fpg-design.css and fpg-design.js
- blocks/fpg-breadcrumbs, fpg-back-in-stock, fpg-countdown, fpg-promo-tile, fpg-search-bar
- sections/fpg-recently-viewed, fpg-back-to-top, fpg-menu-promos
- snippets/fpg-mini-card

**Core edit:** sections/main-collection.liquid renders the static promo tiles fpg-promo-tile-1 and fpg-promo-tile-2 in the grid loop.

**What each feature does:**
- **Breadcrumbs** (with BreadcrumbList data). A product opened directly picks its deepest collection in horizon-main-menu.
- **Back to top.**
- **Recently viewed.** Uses localStorage "fpg:recently-viewed"; the cards come through the Section Rendering API on /search.
- **Notify me.** Sends a contact-form email to the shop, only for sold-out deny-policy variants.
- **Countdowns.** Hidden until an end date (YYYY-MM-DD, UK time) is set.
- **Promo tiles.** #6 "Talk to our team" and #15 "Servicing and repairs".
- **Menu promos.** Parts & Servicing, Garden & Tree Machinery, Clothing & PPE. fpg-design.js copies them into the dropdown on load and on hover.
- **Design round 2.** Hero search bar with chips, teal YMM band, brand logo tiles, mist product panels, hover effects, sticky-header shadow, and fade-up on scroll.

**Skipped by choice:** age gate, timed pop-up, pre-order deposits.

## Finishing pass (23 Oct; Charlie: "finish whatever needs finishing")

**Overnight check:** nothing changed in the store theme (508 files, all checksums the same).

**Carried-over templates.** The live theme has 16 alternative templates that Horizon lacked. Without them, Horizon falls back to the default template and the content disappears. All were rebuilt with Horizon sections in the FP&G design (fpg-tools/make_alt_templates.py):
- **Buying guides:** collection.petrol-chainsaws, top-handle-chainsaw, pole-saws, power-pruners, helmets, class-a-trousers and class-c-trousers. Products come first, then the guide content in its original order: intro, accordion questions, price-range cards, picture rows and cross-links.
- **collection.tool-help** (Aldi & Lidl Products): partner text.
- **collection.repair-page** (Servicing & Repair): banner and "How it works" stay above the services. The servicing promo tile is turned off there because it would link to the same page.
- **collection.combi-machines:** 6 brand carousels.
- **collection.kit-creator:** banner, minimum kit lists and 14 carousels.
- **collection.forestry-arboriculture:** 9 carousels and "Daily uses". The stale "FEBRUARY Arborist Special Offer" heading and its featured MS 261 were left out.
- **Pages:** page.shipping-policy (the full shipping text and rates map; the Horizon fallback would have shown only the title), page.solutions-page and page.tall-hedges-solu (AI block 27ffdd8), and page.test-page (Recomma quiz app block).
- **page.ymm-custom.liquid** ("Product Result"), with the app snippets ymm-searchbox and ymm_fields.

**Not carried over (identical to the default, or unused):**
- page.login, page.faq, page.kit-creator, page.account-application
- page.home_page (no page uses it)
- product.repair-page and product.trail (no products use them)
- legacy Hulk/pre-order cart and search templates

**Other fixes:**
- **Cart drawer** now opens after Add to cart. It matches the old pop-up; before, adding gave little feedback.
- **Recently viewed** hides prices of Call for Price products. The app also handles those cards itself.

**Verified on the preview:**
- **Cart and checkout:** cart drawer and cart page show "Estimated total (Ex. VAT)", note limit 30, "Delivery instructions", and the automatic "Clearance Sale" discount. Reached checkout without submitting: 2 × clearance scarifier gives subtotal £271.50 and total £325.80, matching the theme's VAT figures. The test cart was cleared.
- **Apps:**
  - Hulk offers block is present on hire products, as on live.
  - IzyRent embed loads.
  - Call for Price shows "Request Quote" on product pages and cards, with prices hidden; predictive search shows no price.
  - Minmaxify limits apply to the quantity input.
- **Carried-over pages:**
  - All 22 uploaded files match the store copies.
  - Page text is identical to live for shipping policy, solutions, tall hedges and product result.
  - Collection guides render, checked visually on petrol chainsaws, helmets and servicing.
  - At 375 mobile there is no sideways scroll.

## Shopping tools and page refresh (23 Oct)

Charlie asked for "apps" to make the featured areas (kit creator, servicing, hire) much better to shop, then to keep improving and remove old content. Commits 38aace1 and ac6cd0e (local repo).

**Tools:**
- **Kit builder** (sections/fpg-kit-builder, assets/fpg-kit-builder.js/.css) on the Kit Creator page. 11 steps from harness to tool strops, each listing 1–2 collections. Two kit types: Climbing kit (6 essentials) and Climbing and rescue kit (8). Checklist, progress bar, running total ex/inc VAT, saved in the browser, and "Add kit to basket" adds everything in one go and opens the cart drawer. Call for Price products show "Ask for a price".
- **Service finder** (sections/fpg-service-finder) on Servicing & Repair. Machine (with picture and from-price) → brand → service with category and model guide → model, serial and notes, which go on the order line. 10 services wired (STIHL, Husqvarna, Mitox, Scheppach chainsaws; STIHL/Husqvarna hedge trimmers and blowers; STIHL/Husqvarna KombiEngine).
- **Hire planner** (blocks/fpg-hire-calculator, assets/fpg-hire.js) on hire product pages (product.json and product.quote-needed). Quick picks (1 day, weekend, week) or dates; picks the cheapest mix of Day, Extra Day, Weekend and Week and shows the saving; books with the dates attached, or offers a hire request form (contact form) when it can't be booked online. Replaces Add to cart on hire products.
- **Hire centre** (sections/fpg-hire-centre, template collection.hire). The For Hire collection's template suffix was set to "hire" on 23 Oct; the live Dawn theme has no such template, so live is unaffected until publish.
- **Shared helper** assets/fpg-cart.js (add to basket and open the drawer).

**Page refresh:**
- New sections/fpg-page-hero (teal band, breadcrumbs, H1, selling points, two buttons, picture) tops the kit creator, servicing and hire pages.
- Removed: old banners with text baked into the picture, the chalkboard pictures and the old kit creator intro (with its "STIEN" typo). The minimum kit rows stay, now as real text lists with new pictures.
- Home page: the hire row uses the new line-up picture and "How can we help?" has a fifth card, "Build a climbing kit".
- Product cards for hire machines (vendor FPG HIRE) show a sage "For hire" badge instead of a stock badge.

**Pictures:** Charlie made 10 with ChatGPT from Claude's prompts (23 Oct) and uploaded them to Content › Files under their ChatGPT names: Arborist_Gear_Flat_Lay_in_Earthy_Tones (kit hero), Arborist_Rope-Access_Gear_Flat_Lay (climbing kit), Arborist_Climbing_Gear_Flat_Lay (rescue kit), Chainsaw_Maintenance_in_a_Warm_Workshop (service hero), Studio_Chainsaw_Product_Shot, Professional_Petrol_Hedge_Trimmer, Orange_and_Black_Backpack_Leaf_Blower, Modular_Garden_Multitool_Attachment_Set (machine tiles), Wood_Chipping_Overlook (hire hero, plus a duplicate _1), Orange_Forestry_Equipment_Display (home hire row). A stray fpg-new-images.zip is also in Files; Charlie can delete it.

**Tested on the preview (23 Oct):** kit → basket (cart drawer opened, clearance discount applied), service booking with Machine/Model/Notes on the line, hire planner weekend pricing, hire centre cards, both kit modes, hire badges in search, no sideways scroll at 375. Test basket cleared.

**Still to improve:** hire product photos have "AVAILABLE FOR HIRE" baked in; new plain photos would let the badge do that job.

## Menu and header redo (23 Oct)

Charlie asked to "redo the menu structure and style adding more layers", then for a modern replacement for the plain logo bar, keeping his real logo. Commit 97fc44a (local repo).

**Menu structure** (built from fpg-tools/menu/menu_spec.py with build_menu.py, sent with menuUpdate):
- Ten top-level items: Machinery, Mowers, Parts & Servicing, Accessories, Clothing & PPE, Climbing & Arb, Tools & Workshop, Hire, Offers, Help.
- Three levels: top item → group heading → links. Machinery has 10 groups (Chainsaws, Hedge Trimmers, Brushcutters & Strimmers, Blowers & Vacuums, Combi Systems, Cordless Systems, Wood & Tree, Lawn & Garden, Site & Power, Clean Up).
- Groups get an "All …" first link where the heading's own collection isn't already listed, so phones (where headings only expand) can still reach the group page.
- Hire lists the six working hire machines by type. Help collects FAQs, contact, delivery, account application, cordless guide, tall hedges and training.
- Groups are kept to 10 links or fewer, because Horizon splits longer groups into columns that overflow the panel.
- Rollback: point the header at main-menu.

**Dead links found in the live main-menu** (left out of the new menu; the live site still shows them):
- Cordless Chainsaws, Cordless Brushcutters, and Cordless, Petrol and Self Propelled Lawn Mowers point to deleted collections.
- Electric Chainsaws, bolt-cutters, hedge-trimmers-electric, heavy-duty-tripod-ladders and sprinklers are empty.
- The JBM 1466 BT stump grinder and Ferris FW35 flail deck hire products return 404 (hidden or unpublished).

**Header look:**
- assets/fpg-logo-white.svg: Charlie's own logo recoloured (teal → white, sage → pale sage #A9C4B5). It shows automatically when the top row is dark.
- snippets/fpg-header-contact: 01443 230000 "Expert advice", plus an open/closed dot with Mon–Fri 8am–5pm (UK time) and "Coed Court, Treforest". Shown at 1100px and wider.
- assets/fpg-menu.css: sage hover line on the menu bar, sage line under the bar while a dropdown is open, uppercase column headings with an arrow on hover, a dark "Build a Climbing Kit" pill, and phone drawer tidy-up.
- Menu promo cards now cover Parts & Servicing, Machinery, Clothing & PPE, Climbing & Arb, Hire and Accessories, using the new pictures.
- Contour texture: Charlie made one with ChatGPT; it goes on the logo row as a cover background once it's uploaded to Content › Files.

**Tested on the preview:** all dropdowns on desktop (including the More overflow at narrow widths), the phone drawer through three levels, and the pill text. A dropdown taller than the window scrolls inside the panel.

## FP&G files (all prefixed fpg-)

- **snippets/fpg-vat-price:** prices shown as "£X + VAT (£Y)".
- **snippets/fpg-card-badges:** stock, sale and dropship badges, plus the fix for duplicated Call for Price card titles.
- **Product blocks:** fpg-stock-status, fpg-product-notices, fpg-cormorant, fpg-variant-pairs, fpg-spec-tabs, fpg-hire-rates, fpg-store-info.
- **assets/fpg-variant-block.js:** refreshes the FP&G blocks when the variant changes.
- **snippets/fpg-head-scripts:** loads the design CSS/JS; jQuery on the Part Finder page only; GA4.
- **Templates:**
  - Core: index, collection, product, product.quote-needed (hire), product.ticket-number.
  - Finder pages: page.bar-and-chain-finder, page.product-parts-page.
  - Plus the 16 carried-over templates above.

## Horizon core files edited

These need re-applying after Horizon updates; each edit is marked "FP&G".
- snippets/price.liquid
- blocks/_featured-product-price.liquid
- blocks/_product-card-gallery.liquid
- snippets/card-gallery.liquid
- blocks/buy-buttons.liquid
- snippets/cart-summary.liquid
- layout/theme.liquid (render line)
- config/settings_schema.json (FP&G group)
- locales/en.default.json
- sections/main-collection.liquid (promo tiles)
- blocks/_header-logo.liquid (white logo and contact strip on a dark top row)

## Theme settings

**FP&G group:**
- VAT 20; clearance tag and percentage 10; dropship tag
- stock wording and pickup wording
- Cormorant https://polly.fpandg.com, with STIHL and Husqvarna
- cart note limit 30
- Part Finder template; GA4 ID

**Also set:**
- Cart drawer opens automatically after adding to cart.
- Logo and favicon match live; cart note is on.

**App embeds** (copied from live and enabled): Call for Price, YMM, Hulk/VolumeBoost, PageFly, Minmaxify, Easy Appointment Booking, IzyRent, Shopify Inbox, PayPal Pay Later.

## Still to do before publishing (Charlie)

- **GitHub:** install the Claude GitHub app on CHARLIEEJCOLES, then choose private or public. After that, Claude pushes and Charlie connects the branch in Shopify (Themes › Add theme › Connect from GitHub).
- **Test order:** place a real test order (pickup and delivery).
- **Notify me:** submit it once (it emails the shop).
- **Countdowns:** set dates if wanted.
- **Ticket product:** assign the ticket-number template after publish.
- **Hire products:** JBM 1466 BT and TR6P are on the default template; the hire planner shows on both templates, so switching them to quote-needed is now optional (Charlie's call).
- **Typos copied from live:** "HUSQVARANA" on combi machines, "Hnadle" on top handle chainsaws, "Husqvarana" on Type A trousers.

## Known differences from live

- Ticket field max is 25 characters (Horizon's minimum).
- Card prices show the first available variant, not "From".
- ARBORTECX lines dropped.
- The tooltip became a toggle.
- The variant pairs grid has no quick add.
- The cart is a drawer that opens on add, not a pop-up.
- Structured data now includes stock status.
- Guide content sits under the products rather than above them.
- Carousels show up to 16 products (Horizon's maximum); the Dawn sliders showed 25.

## Noticed

- Hire products show the backorder pickup wording because stock is 0 with continue-selling.
- BALL BEARING 505133501 is £0.00 and orderable.
- "Forestry & Arboriculture Essentials" is empty but first in the live main menu.
- The live main menu has several dead or empty links (listed under "Menu and header redo").
- The live default collection template references a missing AI block (3ec8fa3) that renders nothing.

## Working notes

**Uploading theme files:**
- Upload with themeFilesUpsert (TEXT, unpublished theme only).
- The GraphQL document limit is 16,384 characters. Files under that go inline as GraphQL block strings ("""…"""), which need no escaping.
- Bigger files go in variables as JSON-escaped strings.

**Comparing with the store:**
- Shopify stores JSON templates compact, with a header comment, and drops empty block_order. Compare parsed content, not bytes.
- The storefront caches pages after a template upload; add ?v=N to see changes.
- Offline Theme Check flags app blocks as missing (expected).

**Browser and network:**
- The preview is reachable only in a real browser. In the built-in pane, window.scrollTo does nothing; use real scroll actions.
- The sandbox can't reach Shopify's staged-upload storage (proxy 403).
