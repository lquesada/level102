# Drink Mixer

A toy drink machine for kids ("Drink Mixer"; es "Mezclador de bebidas", de "Getränke-Mixer"), in one self-contained file: `docs/drinkmixer/index.html`
(live at https://level102.com/drinkmixer/). Inline SVG, CSS and JS only: no network requests, no fonts or images.

## Design

- **The machine.** A glossy kiosk: a touch panel with the steps, and a dark serving bay with the machine head
  (nozzle, sugar chute, boost chute, drip tray). The panel sits above the bay on an upright phone and beside it on a
  sideways phone or desktop. The cup in the bay is redrawn after every tap, so it always shows the current order.
- **Seven steps, as tabs** (all reachable at any time; a tick marks steps with a choice):
  1. **Treat** -- 13 treats: soda, juice, lemonade, iced tea, energy drink, sports drink, bubble tea, milkshake,
     slushie, smoothie, iced coffee, hot drink (id `hotchoc`) and soft-serve. Each has its own cup.
  2. **Flavour** -- 110 flavours with filter chips (Popular, All, Fruity, Sweet, Tea, Coffee, ...). No limit: pick as
     many as you like, numbered in the order they pour (many flavours = thin rainbow bands; the pour is capped at
     ~4 s). Each treat only offers flavours that suit it.
  3. **Mix** -- base (15: classic, water, sparkling, milks, yogurt, coffee, espresso, teas, coconut water), mix style
     (layers, blend, spiral, ombre, marble), the treat's own level (bubbles, ice, thickness, icy crunch, warmth or
     soft-serve swirls: up to 7 tiers, one per flavour or striped when there are more), ice amount and shape (cubes, crushed, spheres, stars, hearts) and size (or cone / cup).
  4. **Taste** -- sweeteners (6, several at once) and sweetness, popping candy, glass rim or cone dip, straw or bottle cap; then the
     "daring twists" at the bottom: sour, spicy, salty.
  5. **Boosts** -- 24 vitamins and extras, no limit.
  6. **Toppings** -- 114 toppings filtered per treat, no limit (several creams stack into a striped mountain, several
     foams layer): scoops (at the bottom of the glass, in front of the drink), pearls and jellies, fruit, creams and
     foams, sauces, sprinkles, big treats, garnishes (incl. bananas peeled / in their peel, grapes and an olive on a
     pick) and, last, the **Crazy** toys: goldfish (swims), rubber duck, tiny dinosaur, gummy worm, googly eyes, mini
     planet, octopus, sea star, crown, rocket.
  7. **Order** -- a receipt with a generated drink name; each line jumps back to its step; the big POUR button.
- The odd options (pickle, wasabi, chili flakes, ...) sit last in their lists under a **Wild** filter.
- **Single choice** only where two can't coexist: treat, size / cone, base liquid, mix style, ice shape, rim, straw /
  cap, and the amount levels (sweetness, fizz / ice / thickness / warmth / swirls, ice amount, sour, spicy, salty,
  popping candy).
- **Everything shows in the drink** (stage, collection thumbnails, recipe card): each sweetener has its own look
  (sugar crystals settled at the bottom, honey / maple ribbons, agave drops, stevia leaves, candy crystals) and more
  sugar = more of it; each boost is its own coloured, softly glowing dust (shape + colour per boost, no badges);
  sour / spicy / salty / popping candy show in the drink and scale with the level. With many items, a non-overlapping
  pool of spots and a grid of topping cells give every item its own place; the cream mountain grows; thumbnails get
  taller instead of cutting the top off.
- **POUR** plays a timeline built from the order (cup, bottom toppings, ice, each flavour in its colour, sugar, boosts,
  mixing, toppings, straw) with a live checklist and a Skip button. **Served** shows confetti, the recipe and
  **DRINK / EAT** (everything edible and everything that floats is eaten; the straw / cap, the paper umbrella on the rim, googly
  eyes on the glass, the sea star on the wall and the octopus on the bottom stay; picks lose their food and slide into
  the empty glass), **SAVE**, **RESET** (down the sink), plus **Same again**, **Change it** and **SHARE**, and an
  optional "Name your drink" field (max 32 characters; empty = the generated name).
- **Names and share links.** A name typed on the served screen is saved with the drink; in the collection it is the
  only editable thing (pencil on the recipe card). SHARE opens the system share sheet (`navigator.share`) or a dialog
  with the link and a COPY button. Links are `https://level102.com/drinkmixer/?d=<payload>`: version, product, 14
  settings (sweeteners as a bitset), flavours in pour order, toppings and boosts as bitsets, the name (letters and
  digits as themselves, other characters 18 bits each) and a checksum, one URL-safe character per value over
  append-only id tables (format v2, documented next to `packLink`; v1 links still open). A normal drink is about 100
  characters; "everything" plus a 32-emoji name stays under 300 in any pick order. Opening a link
  validates it strictly (bad, cut-off or tampered links show a friendly message and the normal machine) and shows the
  friend's drink on the Order step on the first frame, ready to POUR; nothing is saved until SAVE. Names from links
  are untrusted: control / direction characters are stripped and they are only ever shown as text.
- **Collection.** Saved drinks live in `localStorage` (`fw.inv`: `[recipe code, time, serial]` plus an optional name;
  ids never change, so old saves keep working). Toppings and boosts are drawn in table order, so the pick order never
  changes how a drink looks. The grid is virtualised and its thumbnails use the same drawing code as the machine, rasterised once
  while the list is at rest. A recipe card shows the name (renamable) and how the drink was made, with **MAKE IT AGAIN** (recipe and
  name), **SHARE** and a confirmed **Remove**.
- **Surprise me** builds a random valid order. **Sound** (WebAudio) is off by default. **Reduced motion** shortens the
  pour and drops confetti and idle animation.
- **Shared top bar** (`templates/topbar.html`, pasted verbatim): "‹ Back to level102.com", language EN / ES / DE,
  text size A− / A+ and a download button (save the page to play offline). The game keeps its UI below the bar. The
  page also has an inline SVG favicon.
- **Languages.** English, Spanish, German. The language comes from the bar (saved choice > OS language > English) and
  the game renders straight in it (static texts are filled in the same script run as the first render). All strings
  are in two tables in the game: `I18N` (interface, with templates for plurals) and `DATA_I18N` (names of every data
  item by id). Drink names follow each language's grammar ("Refresco de cereza y mango", "Feurige
  Kirsch-Mango-Brause"). Switching in the bar re-renders in place and keeps the order, the pour, the served drink and
  the open collection.
- **Text size.** All game text is `calc(Npx * var(--fs))` (0.8 to 1.8, default 1.1). Grids, option buttons and tabs adapt: tabs
  scroll with the active one in view, labels wrap (long German words have soft hyphens), and the bay shrinks a little
  on an upright phone at large text.
- **Input.** Every control is a real `<button>` (mouse, touch, keyboard), with press feedback; game controls are at
  least 44 px; the page itself never scrolls, only the lists do.

## CUJs (critical user journeys)

| # | Journey | Expected |
|---|---|---|
| CUJ-1 | First look | Step 1, a treat pre-selected, empty cup, sound off, no errors |
| CUJ-2 | Choose a treat | Selects it; the cup changes shape at once |
| CUJ-3 | Choose flavours | No limit, numbered in pour order; tap to remove; filters work |
| CUJ-4 | Mix | Base, mix style, level, ice amount and shape, size all change the preview |
| CUJ-5 | Boosts | No limit; each boost is its own dust in the drink |
| CUJ-6 | Toppings | Only toppings that fit the treat; no limit; creams stack; Crazy toys under their own filter |
| CUJ-7 | Order | Receipt lists every choice; tapping a line returns to that step; POUR disabled without a flavour |
| CUJ-8 | POUR | Animation follows the order; checklist advances; Skip works |
| CUJ-9 | Served | Ticket with the recipe; Same again / Change it work |
| CUJ-10 | Switch treat | Unfitting flavours / toppings are dropped with a message; bubble tea adds tapioca |
| CUJ-11 | Surprise me | A random valid order on the Order step |
| CUJ-12 | Sound | Off by default; toggle changes icon and label |
| CUJ-13 | Layouts | 360x740 upright, 740x360 sideways, 1280x800 desktop: nothing clipped, targets >= 44 px, no page scroll |
| CUJ-14 | Soft-serve | Cone / waffle / cup, swirl tiers (every flavour visible at every level), creams and toppings sit on the swirl |
| CUJ-15 | Reduced motion | Short pour, no confetti, still served |
| CUJ-16 | SAVE | Added to the collection; button shows SAVED |
| CUJ-17 | DRINK | Drink is eaten from the top down; a clean glass of the same treat arrives |
| CUJ-18 | RESET | Down the sink; a clean glass arrives |
| CUJ-19 | Collection at scale | With 1,000+ drinks only a few cells exist; scrolling stays smooth; survives a reload |
| CUJ-20 | Recipe card | Shows exactly how a saved drink was made |
| CUJ-21 | Remove | Asks first; Keep it cancels; Yes, remove deletes (also from storage) |
| CUJ-22 | Make it again | Loads the exact recipe, ready to POUR |
| CUJ-23 | Wild options | Hidden under Popular, listed last under All |
| CUJ-24 | Taste | Sweetener, rim, popping candy, sour / spicy / salty saved in the recipe and shown on the card |
| CUJ-25 | Newer treats | Energy, sports, iced coffee, hot drink, lemonade, iced tea all pour and serve |
| CUJ-26 | Language | EN / ES / DE from the OS language (others fall back to English); first frame already in that language; no English left in ES / DE |
| CUJ-27 | Switch language | The bar's picker re-renders in place: mid-order, while pouring, served, collection grid and recipe card (with the removal question) keep their state; the choice survives a reload |
| CUJ-28 | Text size | Default 1.1; A− / A+ from 0.8 to 1.8: every screen still fits, nothing spills or splits mid-word, targets >= 44 px; the size survives a reload |
| CUJ-29 | Top bar | Present, one row on a 320 / 360 px phone (German, 1.8), back link to https://level102.com, game UI below it |
| CUJ-30 | Name a drink | Name field on the served screen (Enter = done); saved with the drink; shown in the grid and card; renamed in the card; old unnamed saves still load |
| CUJ-31 | Share | SHARE (served screen and recipe card) calls the share sheet with title, text and link, or shows the copy dialog |
| CUJ-32 | Open a shared link | Exact recipe and name on the Order step from the first frame, at every size and language; bad links -> message + normal machine; names never become HTML |
| CUJ-34 | Everything visible | Each sweetener / boost / scoop / topping / taste / base / mix / ice / rim / straw / size looks different; more = more; in a loaded drink every item is clearly visible, in "everything" none is fully covered |
| CUJ-35 | Everything at once | Every option picked: renders, pours in <= 20 s, receipt says "+ N more", link < 300 characters and exact, 1,000 such drinks scroll smoothly |
| CUJ-33 | Game name | Title and logo "Drink Mixer" / "Mezclador de bebidas" / "Getränke-Mixer"; no old name anywhere |

## Testing

All tests run headless Chrome over the DevTools protocol with Node 22 (no packages; never the real display). From the
repo root:

    ./run_tests.sh drinkmixer                       # what CI runs: run_cujs all + smoke
    node tests/drinkmixer/run_cujs.mjs all          # journeys x 3 sizes x 3 languages, then extras + share
    node tests/drinkmixer/run_cujs.mjs phone de     # one size, one language
    node tests/drinkmixer/extras.mjs                # languages, translation audit, text size, top bar
    node tests/drinkmixer/share.mjs                 # names and share links
    node tests/drinkmixer/leftovers.mjs             # what stays in the glass after DRINK
    node tests/drinkmixer/share_pic.mjs             # SHARE sends a PNG picture + the link; SAVE PICTURE fallback
    node tests/drinkmixer/visuals.mjs [sheets]      # every ingredient visible; contact sheets per dimension
    node tests/drinkmixer/smoke_all_options.mjs     # every treat x option mix renders; names in all languages;
                                                    # soft-serve: every flavour on the swirl, cream on top
    node tests/drinkmixer/profile_inv.mjs 1280 800  # collection thumbnail / scroll profile

- `run_cujs.mjs` drives CUJ-1..25 at phone upright and sideways (touch) and desktop (mouse), once per language with the
  browser's OS language set (`--lang` + Accept-Language), three Chromes in parallel. At each main screen it checks
  layout (no overflow or page scroll, machine fits, targets >= 44 px with the top bar exempt, no spilled or split
  words, bar one row with nothing under it) and, in ES / DE, that no English UI or data string is on screen.
- `extras.mjs` (CUJ-26..29): records every frame from the first one in en-US / es-ES / de-DE / fr-FR; audits that every
  `I18N` key and every data item exists in all languages (anything equal to English must be in the `SAME_AS_EN`
  loanword list); checks drink-name grammar and the game name; switches language through `#l102lang` in each phase;
  runs A+ to 1.8 and A− to 0.8 at all sizes and languages over every screen (and German 1.8 on a 320 px phone).
- `leftovers.mjs`: DRINK on a lemonade with a straw, the umbrella, four picks, toys and fruit (phone, sideways, desktop), a coffee
  with cream and picks, a sports bottle cap, soft-serve in a cup and a cone: kept items unmasked and in the same place,
  edible and floating items masked away, pick feet on the bottom of the glass, food on the picks gone, a language switch
  mid-drink keeps it all. Screenshots: `leftovers_*.png`.
- `share.mjs` (CUJ-30..32): link round trips for random recipes with tricky names (HTML, quotes, RTL marks, emoji,
  very long), the worst-case link length, bad links, a stubbed `navigator.share` / clipboard, naming, renaming, old
  saves, and shared links opened at every size and language.
- `share_pic.mjs`: SHARE sends a 1080x1350 PNG (`drink.png`, the drink with its name drawn in) plus the `?d=` link
  through a stubbed `navigator.share` / `canShare`; without file sharing the dialog offers SAVE PICTURE (download
  checked); cancel = nothing; tricky / very long names; served screen, recipe card and dialog at every size, text
  size 0.8 / 1.8, in every language. Writes `sharepic_*.png` to look at.
- Every run fails on any console error or network request. `i18n_checks.mjs` holds the shared in-page checks;
  `guard.mjs` gives every browser call a timeout and closes Chrome on any crash, so a run never hangs or leaks.
- Screenshots go to `scratch/screenshots/drinkmixer/` (git-ignored): `<lang>_<size>_NN_<state>.png`,
  `fs_<lang>_<size>_fs18|fs08_*.png`, `firstframe_*.png`, `switch_*.png`, `share_*.png`.

Last run, 2026-10-18: `run_cujs.mjs all` -> RESULT: ALL 2253 PASSED; `smoke_all_options.mjs` -> 78 recipes, no problems.

## Known gaps

- Tested in headless Chrome only (the Android Chrome engine); not on a physical phone, Firefox or Safari. Sound is only
  checked for "no errors", not listened to.
- Rasterising a new collection thumbnail can cost one ~50 ms frame with software rendering (once per drink, at rest).
- During DRINK, fruit pieces and pearls stay put while the liquid drains; the glass then fades out.
- A dark scoop under a dark drink (chocolate under cola) is hard to see.
- On a sideways phone at large text the panel shows little at once (it scrolls).
- "Everything" drinks are deliberately crowded: every item shows, but small ones only by a few pixels at thumbnail
  size; the soft-serve "everything" tower is the busiest.
- `visuals.mjs` writes contact sheets `sheet_<dimension>.png` (sweeteners, boosts, scoops, toppings, crazy, tastes,
  options, many flavours, everything) to look at after changing the drawing.
- The on-screen keyboard behaviour around the name field was only checked in headless Chrome (`interactive-widget=
  resizes-content`), not on a real phone.
- No export / import of the collection: it lives in that browser only.
