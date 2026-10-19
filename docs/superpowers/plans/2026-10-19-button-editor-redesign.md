# Button editor redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BUTTON tab's layer editor with a one-state-at-a-time editor: a States rail, a Simple parts editor, and a Layers view with Front and Back groups, over a version 2 recipe that stores each state separately.

**Architecture:** A new pure module, `recipe.js`, owns the version 2 recipe: migration from version 1, the Simple and Layers operations, and copying. The renderer draws one state's layer list. The editor is split into a shell (`editor.js`: header, Copy state menu, Simple | Layers toggle), the rail (`rail.js`), the two views (`simple.js`, `layers.js`), and a shared single-value settings form (`layer-settings.js`). `app.js` keeps stored version 1 recipes untouched until a button is edited.

**Tech Stack:** Plain ES modules in the browser, with no build step. `node:test` for the designer tests (`npm run test:designer`). Python `unittest` for the server (`python -m unittest discover -s tests -t .`).

**Spec:** `docs/superpowers/specs/2026-10-19-button-editor-redesign-design.md`. The UI copy and measurements for Simple come from the handoff, `OMNI keypad UI redesign (2).zip` → `design_handoff_button_designer/BUTTON-EDITOR.md`, with the mockups in `Button Editor Explorations.dc.html` (2a is Simple, 1c is Layers). Read both before starting any UI task.

## Global constraints

- Copy uses sentence case. OFF, ON, and ALT are always in capitals. Say "state", never "image" or "version", for OFF, ON, and ALT.
- Simple never says "layer".
- Colours: red `#e31837`, slate `#2e3c49`, grey text `#445c6d`, muted `#909dab`, divider `#e4e5e6`, control border `#c9ccd0`, open-row background `#f7f7f8`. Use the existing CSS variables where they match.
- The sidebar keeps `clamp(360px, 36vw, 560px)`. The rail is 168 px wide.
- Layers are laid out on the 188-unit canvas (`SIZE`) whatever the model.
- No values are shared between states. Nothing reads "ALT follows OFF".
- Stored version 1 recipes stay unchanged on disk until that button is edited.
- Commit messages have no Claude or Anthropic attribution trailers (user's CLAUDE.md).
- Code comments follow the Google developer documentation style: second person, active voice, present tense.

## Review focus

1. **An old project with a Shape above its Text.** It opens in Layers with the moved notice, the keypad still shows the old PNG, and saving another button doesn't rewrite it. This is tested in Task 2 (`upgradeRecipe reports moved layers`) and Task 9 (save request).
2. **An Image-only button loaded from a keypad, with an ALT image.** It converts to one Image layer per state, including ALT, and opens in Simple. This is tested in Task 2.
3. **Copy all states onto a button that has an ALT, from one that doesn't.** The target loses ALT and keeps its name. This is tested in Task 4.
4. **Simple's Text part when the button name has underscores.** Turning Text on uses the name with spaces, for example `HDMI_1` → "HDMI 1". This is tested in Task 3.
5. **Undo after a copy to another button.** It restores the target, not the source. Check it by hand in Task 10.

---

## File structure

| File | Responsibility |
|---|---|
| `designer/projects.py`, `designer/library.py` | Accept version 2 recipes, as well as version 1 |
| `designer/static/recipe.js` (new) | The version 2 recipe: migration, Simple parts, Layers operations, copying, coverage, summaries. No DOM. |
| `designer/static/recipe.test.mjs` (new) | Tests for `recipe.js` |
| `designer/static/model.js` | `statesOf` and `isBlank` accept both versions. The version 1 helpers stay for migration. |
| `designer/static/render.js` | Draws `recipe.states[state].layers` |
| `designer/static/layer-settings.js` (new) | One layer's settings form, with single values, shared by Simple and Layers |
| `designer/static/rail.js` (new) | The States rail: tiles, + Add ALT, Remove ALT, and dragging to move |
| `designer/static/simple.js` (new) | Simple: the ready-made row, the parts list, and the empty ALT panel |
| `designer/static/layers.js` (new) | Layers: the Front and Back groups, the cover warning, Add layer, and the settings |
| `designer/static/editor.js` | Rewritten as the shell: header, Copy state menu, toggle, notice, footer hint |
| `designer/static/app.js`, `index.html`, `style.css` | Placing the rail, removing the state toggle and Show ALT, pick mode, the confirmation bar, and the data flow |
| `README.md` | The "Design a button" and "ALT state" sections |

## Shared data shapes (version 2)

Every task uses these. The spec's "Data model" section has the full description.

```js
// Recipe
{ version: 2, name: string, editor?: "layers",
  states: { off: { layers: Layer[] }, on: { layers: Layer[] }, alt?: { layers: Layer[] } } }
// Layer
{ type: "shape", set, colour?, tint?, art: "off" | "on", visible }
{ type: "image", src, file, source?, size, x, y, visible }
{ type: "icon", icon, colour, stroke, size, x, y, visible }
{ type: "text", lines: [string] | [string, string], colour, font, weight, size, align, x, y, visible }
```

---

### Task 1: The server accepts version 2 recipes

**Files:**
- Modify: `designer/projects.py:254-270` (`_clean_recipes`)
- Modify: `designer/library.py:49-58` (`save`)
- Create in `designer/library.py`: `valid_recipe(recipe) -> bool`. `projects.py` imports it, so the rule lives in one place.
- Test: `tests/test_designer_projects.py`, `tests/test_designer_library.py`

**Interfaces:**
- Produces: `library.valid_recipe(recipe: object) -> bool`. It's true for either of these:
  - `{"version": 1, "layers": list}`
  - `{"version": 2, "states": {"off": {"layers": list}, "on": {"layers": list}, "alt"?: {"layers": list}}}`, with no other state keys

- [ ] **Step 1: Write the failing tests.**
  - In `test_designer_library.py`, add `test_save_accepts_version_2`. Saving `{"version": 2, "states": {"off": {"layers": []}, "on": {"layers": []}}}` round-trips through `get`.
  - Add `test_save_rejects_bad_version_2`. Each of these raises `ValueError`:
    - a missing `on`
    - `"layers": "no"` in `off`
    - an extra state key `"dim"`
    - `"states": []`
  - Change the existing assertion at line 65 so that it uses `{"version": 3, "layers": []}`.
  - In `test_designer_projects.py`, change line 120's bad recipe to `{"version": 3, "layers": []}`. Add `test_save_accepts_version_2_recipes`, which saves a version 2 recipe for `"1-1"` and reads it back unchanged.
- [ ] **Step 2: Run the tests to check that they fail.** Run `python -m unittest tests.test_designer_library tests.test_designer_projects -v`. The new tests should fail.
- [ ] **Step 3: Implement `valid_recipe`, and use it in both places.**
  - Keep the library's error message accurate: `"a recipe needs \"version\": 1 with a list of layers, or \"version\": 2 with OFF and ON states"`.
  - Keep the projects message as it is.
- [ ] **Step 4: Run the full Python suite.** Run `python -m unittest discover -s tests -t .`. Every test should pass.
- [ ] **Step 5: Commit.** Use the message "Accept version 2 button recipes in projects and the library".

### Task 2: The version 2 recipe and migration

**Files:**
- Create: `designer/static/recipe.js`, `designer/static/recipe.test.mjs`
- Modify: `designer/static/model.js`. Change `statesOf` and `isBlank` so that they accept both versions.

**Interfaces:**
- Consumes: from `model.js`, `SIZE`, `CENTRE`, `FONTS`, `textLines`, `colourFor`, `shapeArt`.
- Produces (exports of `recipe.js`):
  - `BACK = ["shape", "image"]` and `isBack(layer) -> boolean`.
  - `blankRecipe(name = "") -> Recipe`, which has an empty OFF and ON.
  - `defaultLayerFor(type, catalog, state, name = "") -> Layer`. It uses the defaults from today's `defaultLayer`, with single values:
    - **Icon and text colour:** `#9AA0A6` for OFF and ALT, `#FFFFFF` for ON.
    - **Shape:** the first set in the catalog, Blue if the set has it, and `art: state === "on" ? "on" : "off"`.
    - **Text:** `lines` is `[name.replace(/_/g, " ") || "Label"]`, at size 24, centred at `CENTRE`.
    - **Image:** `src: ""`, `file: ""`, and `size: SIZE`.
  - `upgradeRecipe(recipe) -> { recipe: Recipe, moved: { state, layer, behind }[] }`.
    - `null` becomes `blankRecipe()`.
    - A version 2 recipe is returned as it is, with `moved: []`.
    - A version 1 recipe is converted per the spec's "Migration" section. ALT is converted only when `recipe.alt` is set.
    - `layer` and `behind` are names from `layerNames`, from Task 4. Define `layerNames` here and test it in Task 4.
  - `sortBackFront(layers) -> { layers, moved: { layer, behind }[] }`. The sort is stable within each group.
- `model.js`:
  - `statesOf(recipe)` returns the keys of `recipe.states` in `STATES` order for version 2.
  - `isBlank(recipe)` is true for version 2 when no state has a visible layer, where an Image needs a `src` to count.

- [ ] **Step 1: Write the failing tests in `recipe.test.mjs`.** Use the catalog fixture style from `model.test.mjs`.
  - `upgradeRecipe resolves text per state`: a version 1 text layer with `lines: ["HDMI"]`, `onLines: [null, "On"]`, and `colour: {off: "#111111", on: "#222222"}`.
    - OFF's text layer has `lines` `["HDMI"]` and colour `#111111`.
    - ON's has `["HDMI", "On"]` and `#222222`.
    - There's no `alt` state.
  - `upgradeRecipe gives ALT its resolved values`: with `alt: true`, a shape with `altArt: {colour: "Aqua", art: "on"}` becomes ALT `{colour: "Aqua", art: "on"}`. An icon with no ALT colour gets OFF's colour.
  - `upgradeRecipe picks each state's image`: an image layer `{off: "a", on: "", alt: "c", offFile: "a.png"}`, with `alt: true`, converts as follows:
    - OFF has `src` `"a"` and `file` `"a.png"`.
    - ON has `src` `"a"`.
    - ALT has `src` `"c"`.
    - `source` is copied to every state.
  - `upgradeRecipe reports moved layers`: version 1 layers `[text, shape]` (shape on top) give OFF the layers `[shape, text]` and `moved` with the entry `{state: "off", layer: "Shape", behind: "Text"}`.
  - `upgradeRecipe keeps version 2 as it is`: `upgradeRecipe(v2).recipe === v2`.
  - `defaultLayerFor text uses the name`: `defaultLayerFor("text", catalog, "on", "HDMI_1").lines` deep-equals `["HDMI 1"]`.
  - `isBlank and statesOf take both versions`: a version 2 recipe with ALT gives `["off", "on", "alt"]`. A version 2 recipe whose only layer is an image with `src: ""` is blank.
- [ ] **Step 2: Run the tests to check that they fail.** Run `npm run test:designer`. The new tests should fail because `recipe.js` doesn't exist yet.
- [ ] **Step 3: Implement the exports in `recipe.js`, and the `model.js` changes.**
- [ ] **Step 4: Run `npm run test:designer`.** Every test should pass, including the existing `model.test.mjs`.
- [ ] **Step 5: Commit.** Use the message "Add version 2 button recipes, with migration from version 1".

### Task 3: Simple parts

**Files:**
- Modify: `designer/static/recipe.js`, `designer/static/recipe.test.mjs`

**Interfaces:**
- Consumes: `defaultLayerFor` and `isBack` from Task 2.
- Produces:
  - `PARTS = ["shape", "image", "icon", "text"]`, which is back to front. The UI names are `{ shape: "Background", image: "Image", icon: "Icon", text: "Text" }`.
  - `fitsSimple(recipe) -> { ok: true } | { ok: false, state, reason }`. It checks OFF, ON, then ALT. The reasons, verbatim:
    - **Count:** `"{STATE} has two {Type} layers. Simple has one of each part."`, with "two" for 2 and the digits for more than 2.
    - **Order:** `"{STATE} has {Type} above {Type}. Simple draws Background, Image, Icon and Text from back to front."`
    - `{Type}` is the layer type in title case: Shape, Image, Icon, or Text.
  - `simpleParts(recipe, state) -> { shape, image, icon, text }`. Each is a `{ layer, index }` or `null`.
  - `setPart(recipe, state, type, changes, catalog) -> Recipe`. It merges `changes` into the part. If the part is missing, it first inserts `defaultLayerFor(type, catalog, state, recipe.name)` at its place in `PARTS` order.
  - `differsFromOff(recipe, state, type) -> boolean`. It's false for OFF. Otherwise it compares these values between the state and OFF:
    - visible, where a missing part counts as not visible
    - `set`
    - `colour` or `tint`
    - `icon`
    - `src`
    - `lines`
  - `partSummary(recipe, state, type) -> string`, with the handoff copy:
    - **Background:** `"{set} · {colour}"`, where a tint reads as "Custom". When Image is on, it ends with `" · covered by image"`.
    - **Image:** the `file`. A ready-made reads `"Ready-made · {name}"`, and keypad artwork reads `"Loaded from keypad"`.
    - **Icon:** the icon name.
    - **Text:** the lines joined with `" / "`, in curly quotes: `“…”`.
    - **Off:** `"Off"`. For Image, `"Off · your own photo or logo"`.
  - `useReadyMade(recipe, name, offSrc, onSrc) -> Recipe`. For OFF and ON, it sets the Image part to `{src, file: "", source: {kind: "library", name}, visible: true, size: SIZE, x: CENTRE, y: CENTRE}`, and the other parts to `visible: false`. ALT isn't touched.

- [ ] **Step 1: Write the failing tests.**
  - `fitsSimple accepts one of each in order`.
  - `fitsSimple names two text layers`: the reason is `"ON has two Text layers. Simple has one of each part."`.
  - `fitsSimple names the order`: OFF layers `[image, shape]` give `"OFF has Shape above Image. Simple draws Background, Image, Icon and Text from back to front."`.
  - `setPart adds a missing part in order`: on OFF layers `[shape, text]`, `setPart(…, "off", "icon", {visible: true})` gives the types `["shape", "icon", "text"]`.
  - `setPart text uses the button name`: on a recipe named `"HDMI_1"` with no text, turning Text on gives the lines `["HDMI 1"]`.
  - `differsFromOff`: the same icon gives false. A different icon on ON gives true. A part that's off in OFF and missing in ON gives false.
  - `partSummary background covered`: gives `"Squared · Blue · covered by image"`.
  - `useReadyMade leaves ALT alone`: ALT deep-equals its value before the call. OFF's shape is `visible: false`.
- [ ] **Step 2: Run `npm run test:designer`.** The new tests should fail.
- [ ] **Step 3: Implement the exports.**
- [ ] **Step 4: Run `npm run test:designer`.** Every test should pass.
- [ ] **Step 5: Commit.** Use the message "Add Simple parts to version 2 recipes".

### Task 4: Layers operations, coverage, and copying states

**Files:**
- Modify: `designer/static/recipe.js`, `designer/static/recipe.test.mjs`

**Interfaces:**
- Produces:
  - `layerNames(layers) -> string[]`. A type's first layer is named "Text", and later ones are named "Text 2", "Text 3", counted bottom to top.
  - `addLayerTo(recipe, state, layer) -> { recipe, index }`. It adds the layer at the top of its group: Back layers go after the last Back layer, and Front layers go at the end.
  - `setLayerAt(recipe, state, index, changes)` and `removeLayerAt(recipe, state, index)`. Each returns a recipe.
  - `moveInGroup(recipe, state, index, delta) -> { recipe, index }`. When the move would leave the group, it returns the same recipe.
  - `imageFills(layer, natural: {width, height}) -> boolean`. It's true when the drawn box covers 0 to `SIZE` on both axes, where the scale is `layer.size / Math.max(width, height)` and the box is centred on `x` and `y`.
  - `coverage(layers, fills: (imageLayer) => boolean) -> { lower: number, top: number }[]`. It lists each visible Back layer with a visible Back layer above it that covers it. A Shape always covers. An Image covers when `fills(layer)` is true. `top` is the nearest covering layer.
  - `SHRINK_SIZE = Math.round(SIZE * 0.8)`.
  - `copyState(recipe, from, to) -> Recipe`. It's a deep copy, and it creates `to` if it's missing.
  - `copyAllStates(source, target) -> Recipe`. It takes `name` from the target, and `states` and `editor` from the source. When the source has no ALT, the target has none.
  - `startAlt(recipe, from: "off" | "on" | null) -> Recipe`. `null` creates an empty ALT state.
  - `removeAlt(recipe) -> Recipe`.
  - `clearRecipe(recipe) -> Recipe`. It empties every state the button has, and keeps ALT if it's present.
  - `layerSummary(layer) -> string`, for Layers rows:
    - **Shape:** `"{set} · {colour or Custom}"`
    - **Image:** the file name, `"Ready-made · {name}"`, `"Loaded from keypad"`, or `"No image"`
    - **Icon:** the icon name
    - **Text:** the lines joined with `" / "`

- [ ] **Step 1: Write the failing tests.**
  - `layerNames numbers repeats`: `[text, icon, text]` gives `["Text", "Icon", "Text 2"]`.
  - `addLayerTo puts a shape under the front group`: on `[shape, text]`, adding an image gives the types `["shape", "image", "text"]` and `index` 1.
  - `moveInGroup stays in its group`: on `[shape, text]`, moving the text down returns the same recipe.
  - `coverage finds a covering image`: `[shape, image]` with `fills` set to `() => true` gives `[{lower: 0, top: 1}]`. With `() => false`, it gives `[]`. A hidden shape gives `[]`.
  - `imageFills`: a 188×188 image at size 188, centred, gives true. At size 150, it gives false.
  - `copyAllStates removes ALT and keeps the name`: copying a source with no ALT to a target named "B" that has ALT gives `name` "B" and no `states.alt`.
  - `copyState creates the target state`: copying `on` to a missing `alt` gives ALT layers that deep-equal ON's, and that aren't the same objects.
  - `clearRecipe keeps ALT empty`: gives `states.alt.layers` deep-equal to `[]`.
  - `startAlt from ON copies ON`. `startAlt(null)` gives empty layers.
- [ ] **Step 2: Run `npm run test:designer`.** The new tests should fail.
- [ ] **Step 3: Implement the exports.**
- [ ] **Step 4: Run `npm run test:designer`.** Every test should pass.
- [ ] **Step 5: Commit.** Use the message "Add layer, coverage and copy operations for version 2 recipes".

### Task 5: Render version 2 recipes

**Files:**
- Modify: `designer/static/render.js`

**Interfaces:**
- Consumes: the version 2 shapes, and `statesOf` from Task 2.
- Produces: the same exports as today, `drawRecipe(ctx, recipe, state, catalog)`, `renderRecipe(recipe, catalog, size)`, and `paintInto(canvas, recipe, state, catalog)`, now taking version 2 only. Callers upgrade first.

- [ ] **Step 1: Change `drawLayer` to single values.**
  - **Shape:** draw `catalog.shapes[set][colour][art]`, or tint `tintSource(...)[art]` with `tint`.
  - **Icon and text:** use `colour` directly. Text draws `lines`.
  - **Image:** draw `src`.
  - `drawRecipe` iterates `recipe.states[state]?.layers ?? []`.
- [ ] **Step 2: Remove the `colourFor`, `shapeArt`, and `textLines` imports.** They're no longer used here.
- [ ] **Step 3: Check the render by hand.** You can't do this until Task 9, because the app still sends version 1. Note it in your report, and commit together with Task 9. Don't commit on its own.

### Task 6: The shared layer settings form

**Files:**
- Create: `designer/static/layer-settings.js`. Move the settings code out of today's `editor.js`, from about line 279 to line 568: the swatches, icon grid, segmented controls, size and X/Y fields, colour fields, text fields, and image import.

**Interfaces:**
- Produces: `createLayerSettings({ form, catalog, iconTags, onChange(changes, { rerender }), onStatus })`. It returns an object with:
  - `render(layer, { state, view: "simple" | "layers", title })`, which renders `layer`'s settings into `form`. `title` is the heading text. Simple passes no title.
  - `syncPosition(x, y)`, which updates the X and Y fields during a drag.

  It also exports `icon(name, size)`, moved from `editor.js`. `app.js` imports it from here from Task 9 on.
- Fields per type, all with a single value:
  - **Shape:** a set segmented control, the colour swatches for every catalog colour, and the custom "+" swatch with one colour field. In `view: "layers"`, it adds an **Artwork** OFF | ON segmented control.
    - Changing the set or colour in Simple sets `art` to the state's default: ON draws `"on"`, and OFF and ALT draw `"off"`.
    - In Layers, it keeps `art`.
    - Swatches show the state's art: the ON file for ON, and the OFF file otherwise.
  - **Image:** a **Choose file** button. In Simple, the help reads "A photo or logo for the {STATE} state. It fills the button and covers the background." The size slider and X and Y fields follow. Errors and the uploaded status are today's copy, with "as the {STATE} image" changed to "for the {STATE} state".
  - **Icon:** today's search, grid, and count copy, then the colour, stroke, size, and X and Y.
  - **Text:** Line 1 and Line 2 fields, colour, font, weight, align, size, and X and Y. Writing an empty Line 2 drops it.

- [ ] **Step 1: Create the module.** Use the code moved from `editor.js` and change it to single values. `editor.js` still has its own copy until Task 9.
- [ ] **Step 2: Check that it loads.** Run `node --check designer/static/layer-settings.js`. It should finish with no output.
- [ ] **Step 3: Commit.** Use the message "Add a single-value settings form for one layer".

### Task 7: The States rail

**Files:**
- Create: `designer/static/rail.js`

**Interfaces:**
- Consumes: `paintInto` from Task 5, and `statesOf`.
- Produces: `createRail({ root, catalog, onPick(state), onRemoveAlt(), onDrag({ dx, dy }) })`, which returns:
  - `render({ recipe, state })`. `recipe` may be `null`.
  - `setBox(box: [left, top, width, height] | null)`, in 188 units.

  Its markup:
  - The label "States".
  - Three tiles. Each has a header with the state name, and an 8 px red square when it's active.
  - A 124 × 124 face canvas, 188 × 188 internally.
  - "+ Add ALT" when `recipe` has no ALT.
  - A quiet "Remove ALT" link under the ALT tile when it has one, with today's tooltip: "The button has no ALT image on the keypad. Its ALT settings are kept." Change the tooltip to "Removes the ALT state from this button."
  - The help text "The panel shows the parts for this state only."
  - With `recipe` set to `null`, the tiles have no faces.
  - Pointer dragging on the active tile calls `onDrag` with deltas in 188 units, scaled from the tile's width, as in today's `editor.js` lines 601 to 623.

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Run `node --check designer/static/rail.js`.** It should finish with no output.
- [ ] **Step 3: Commit.** Use the message "Add the States rail".

### Task 8: The Simple and Layers views

**Files:**
- Create: `designer/static/simple.js`, `designer/static/layers.js`

**Interfaces:**
- Consumes: Tasks 3, 4, and 6.
- Both export a factory, `createSimple({ root, catalog, iconTags, onChange(recipe, label), onStatus, onConfirm(text), onImageSize(src) })` and `createLayers({ ...same })`. Each returns:
  - `render(recipe, state)`
  - `selectedBounds(state) -> box | null`, for the rail
  - `moveSelected(dx, dy)`
- `onImageSize(src) -> {width, height} | null` comes from the shell, which caches the natural sizes, as `imageSizes` does today.

**Simple:**
- Build it from the handoff's sections "Start from a ready-made", "Parts list", and "Empty ALT", with the spec's decisions.
- The ready-made row shows `"{N} designs"` for every entry in `catalog.buttons`, with the sub-line "Sets OFF and ON together from the artwork pair. ALT is left as it is."
- Picking a ready-made fetches both files as data URLs, as `readyMade` does in `app.js` today, calls `useReadyMade`, and then calls `onConfirm("Used the {name} ready-made for OFF and ON. Turn on Text or Icon to add to it.")`.
- The empty ALT panel's buttons call `startAlt` with `"off"`, `"on"`, or `null`.
- Only one row is open at a time. Remember the open part type across state switches.

**Layers:**
- Build it from the 1c mockup, with the spec's "Layers editor" decisions.
- The cover warning reads "{Top} is solid and covers {lower}. Only the top Back layer shows.", using `layerNames`.
- **Delete {lower}** removes the hidden layer.
- **Shrink {top}**, for images only, sets `size: SHRINK_SIZE`, `x: CENTRE`, and `y: CENTRE`.
- A Back row covered by another layer gets the tag "Hidden by {type in lower case}".

- [ ] **Step 1: Create `simple.js`.**
- [ ] **Step 2: Create `layers.js`.**
- [ ] **Step 3: Run `node --check` on both files.** It should finish with no output.
- [ ] **Step 4: Commit.** Use the message "Add the Simple and Layers button views".

### Task 9: The editor shell, and switching the app over

**Files:**
- Rewrite: `designer/static/editor.js`
- Modify: `designer/static/app.js`, `designer/static/index.html`, `designer/static/style.css`
- Include Task 5's `render.js` change in this commit.

**Interfaces:**
- Produces: `createEditor({ root, railRoot, catalog, iconTags, onChange(recipe, label), onState(state), onCopyToButton(scope: "state" | "all"), onStatus, onConfirm(text) })`. It returns:
  - `getRecipe()`
  - `setRecipe(recipe, { moved = [], keep = false })`. With `keep`, the open part or selected layer stays selected.
  - `rename(name)`
  - `setState(state)`
  - `setImageSize(size)`
  - `thumbnail() -> canvas`, the OFF face for Save to library.
  - `setHeader(overline, name)`, called by `renderSelectionHead`.
- **The rail's Remove ALT:** the shell calls `removeAlt`, calls `onChange(next, "removing ALT")`, switches to OFF, and shows today's status: "Removed the ALT image. When you save, this button has no ALT image on the keypad." Change the wording to "Removed the ALT state. When you save, this button has no ALT image on the keypad."
- **Shell markup**, from top to bottom:
  - The header: the overline "{page name} · Button {N}" (`app.js` passes it in with `setHeader(overline, name)`), the name with a red full stop, the state chip, the **Simple | Layers** toggle, and **Copy state ▾**.
  - The moved notice, when `moved` is non-empty: "{layer} moved behind {behind} to keep Back layers behind Front ones. The keypad shows the old order until you change this button." It shows for the first entry only, until the next change.
  - The view, Simple or Layers.
  - In Simple only, the footer hint "Need two lines of text, a second icon or a different order? Switch to Layers."
- **Choosing the view:** Layers when any of these is true:
  - `moved.length` is non-zero
  - `!fitsSimple(recipe).ok`
  - `recipe.editor === "layers"`

  Otherwise Simple. When Simple doesn't fit, the Simple segment is disabled, with `fitsSimple(...).reason` as its tooltip. Choosing a segment sets or clears `editor` through `onChange(…, "switching to Layers")` or `"switching to Simple"`.
- **Copy state menu:** the handoff's rows and sub-lines, plus "Copy all states to another button…". The copy rows call `copyState` and then `onConfirm("Copied {FROM} to {TO}. You can now change {TO} on its own.")`. The other-button rows call `onCopyToButton`. Esc or an outside click closes the menu.
- **`app.js` changes:**
  1. Make `recipeFor` return `upgradeRecipe(raw).recipe`. Keep `state.recipes` raw, and make `selectButton` and `restore` pass `moved`.
  2. In `isKeyBlank`, keep `isBlank` on the raw recipe. `statesOf` handles both versions.
  3. `onEdit(recipe, label)` records `label` when it's given, and otherwise "the change to button {N}".
  4. `clearLayers` becomes `clearButton`. It calls `clearRecipe`, and its status is "Cleared button {N}. It's now blank." Rename the `#clear-layers` button to "Clear button", with the tooltip "Remove every state's parts and layers".
  5. `applyRecipe` upgrades what `get()` returns.
  6. In `saveRecipe`, use `editor.thumbnail()`. The body copy becomes "Saves this button's states as a recipe. The name also names its image files on the keypad."
  7. Remove the following. Ignore `project.showAlt` from now on.
     - `setShowAlt` and `renderShowAlt`
     - `#show-off`, `#show-on`, `#show-alt`, and `#toggle-alt`, with their listeners
     - the `editor.setAltVisible` calls
  8. `setView(view)` calls `editor.setState(view)`, and the editor's `onState` calls `setView`.
  9. Add the selected button's outline: `.key.selected { outline: 2px solid #e31837; outline-offset: 3px; }`.
  10. In `renderNameHint`, use `statesOf(recipeFor(...))`. This is unchanged in meaning.
- **`index.html` and `style.css`:**
  - Add `<aside id="rail" class="rail">` between `.workspace` and `.sidebar`: 168 px wide, white, a 1 px `#e4e5e6` left border, and 20 px by 22 px padding.
  - Remove the state segmented control and the Show ALT link.
  - Change the `#no-selection` lead to "Select a button on the keypad to edit its states, parts and page link."
  - Remove the CSS for today's canvases, layer list, quick button, and text grid that's no longer used.
  - In the narrow layout at line 503, stack the rail above the sidebar as a row of tiles.
- [ ] **Step 1: Rewrite `editor.js`.**
- [ ] **Step 2: Make the `app.js`, `index.html`, and `style.css` changes.**
- [ ] **Step 3: Run `npm run test:designer` and the Python suite.** Both should pass.
- [ ] **Step 4: Check the app by hand.** Run `python designer/server.py`, or use the `run` skill, and check each of these:
  - (a) An existing project opens, and every button looks as it did before.
  - (b) Each OFF, ON, and ALT tile switches both the keypad and the panel.
  - (c) In Simple, turning Text on in ON leaves OFF unchanged, and ON shows "≠ OFF".
  - (d) The Simple | Layers toggle switches both ways on a fitting button. Adding a second Text in Layers disables Simple, and the tooltip gives the reason.
  - (e) With a covering image in Layers, Shrink shows the shape.
  - (f) Save, reopen, and then deploy to a keypad if one is available. If no keypad is available, say so in your report.
  - (g) Undo and redo after a Simple change.
- [ ] **Step 5: Check the save request by hand.** In a project with an unedited version 1 button, edit a different button and save. Then open the project's JSON in the projects folder and confirm that the unedited button's recipe still has `"version": 1`.
- [ ] **Step 6: Commit.** Use the message "Edit one state at a time, with Simple and Layers views".

### Task 10: Copy to another button, pick mode, and the confirmation bar

**Files:**
- Modify: `designer/static/app.js`, `designer/static/index.html`, `designer/static/style.css`

**Interfaces:**
- Consumes: `copyState` and `copyAllStates` from Task 4, and `onCopyToButton` and `onConfirm` from Task 9.
- Produces, in `app.js`:
  - `confirmBar(text)`, which shows the bottom-of-stage bar and also calls `setStatus(text)`.
  - `startPick(scope)` and `endPick()`.
- **Pick mode:**
  - `state.pick = { scope, from: { pageId, button }, view }`.
  - The banner at the top of the stage reads "Click a button to copy the {STATE} state to it." or "Click a button to copy all states to it.", with **Cancel**.
  - Other keys get `.pick-target`: a 1 px dashed `#909dab` outline and `cursor: copy`.
  - Clicking a key copies, instead of selecting:
    - **One state:** `copyState`, using the source's state on the target recipe.
    - **All states:** `copyAllStates`.
  - The copy goes through `setEdit` with `record("copying to button {N}")`. Then pick mode ends and the source stays selected.
  - Confirmations:
    - **One state:** "Copied {STATE} from {source name or Button N} to {target name or Button N}. Its other states are unchanged."
    - **All states:** "Copied all states of {source} to button {N}."
  - Clicking the source button, **Cancel**, or Esc ends pick mode without copying. Page tabs still work during pick mode. Dragging keys is disabled during pick mode.
- **Confirmation bar:** in `#stage`, white, a 1 px `#c9ccd0` border, an 8 px red square, the text, and **Dismiss**. A new message replaces the old one. Selecting another button hides it.

- [ ] **Step 1: Implement pick mode and the bar.**
- [ ] **Step 2: Check the app by hand.** Check each of these:
  - Copy ON to a button on another page, then undo. The target goes back.
  - Copy all states from a button without ALT onto one with ALT. The target loses ALT and keeps its name and page link.
  - Esc cancels.
  - Copy OFF to ON inside a button. The bar shows "Copied OFF to ON. You can now change ON on its own."
- [ ] **Step 3: Commit.** Use the message "Copy a state or all states to another button".

### Task 11: Update the README

**Files:**
- Modify: `README.md`, lines 1 to 110: the layer list, "Design a button", and "The ALT state"

- [ ] **Step 1: Rewrite those sections.** Follow the Google developer documentation style, in second person, and describe:
  - the States rail
  - Simple and its four parts
  - Layers, with Front and Back
  - Copy state
  - ALT, which is always available: "+ Add ALT" with Start from OFF, Start from ON, or Start blank, and Remove ALT
  - that old projects open unchanged until you edit a button

  Remove Show ALT, Quick button, and the canvases.
- [ ] **Step 2: Commit.** Use the message "Describe the one-state-at-a-time editor in the README".
