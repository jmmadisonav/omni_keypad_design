# Button editor redesign: one state at a time

## Intent

The BUTTON tab is hard for beginners. They need to learn layers before they
can make a simple button. The tab is also too long. It shows OFF, ON, and ALT
canvases at the top, and every setting has OFF, ON, and ALT columns side by
side.

This redesign does three things:

1. **You edit one state at a time.** OFF, ON, and ALT move into a rail beside
   the keypad. You click a state, and the sidebar and the keypad both show
   that state only.
2. **Every state is its own design.** OFF, ON, and ALT share nothing. ON can
   have a different shape set, icon, text, colour, or layer list from OFF.
   This applies everywhere, including the advanced view.
3. **There are two editors over the same data.**
   - **Simple** is for beginners. Each state has four fixed parts:
     Background, Image, Icon, and Text.
   - **Layers** is for advanced users. Each state has a free layer list in
     two groups: Front, which is see-through, and Back, which is solid.

Source material: the round 2 handoff, `OMNI keypad UI redesign (2).zip`, in
the repo root. In it:

- `design_handoff_button_designer/BUTTON-EDITOR.md` is the spec for Simple.
- `Button Editor Explorations.dc.html` holds the mockups. Section 2a is
  Simple, and section 1c is Layers.

Where this document and the handoff disagree, this document wins. The
differences come from decisions made after the handoff was written, and each
one is listed in [Differences from the handoff](#differences-from-the-handoff).

## Goals

- A beginner can make a two-state button without seeing the word "layer".
- The sidebar shows only the state you're editing.
- An advanced user can still have two lines of text, a second icon, or
  several images, with no change to how solid layers are drawn.
- Existing projects and library recipes open and look exactly as they do
  today, with one exception covered in [Migration](#migration).

## Non-goals

- No change to the header, pages, deploy, backups, the HControl and Debug
  drawer, or the LIBRARY tab layout.
- No change to how images are rendered to PNG and deployed. Only the recipe
  that feeds the renderer changes.
- No new artwork. The editor uses the Keypad Graphics catalog that the app
  already loads. The art in the handoff zip is a sample of it.

## Anti-goals

- **No silent changes to existing buttons.** Opening a project must not
  change how any button looks. The single known exception is a Back-over-Front
  reordering, and the app names it when it happens.
- **No shared values between states.** Anything that makes ON follow OFF,
  such as "ALT uses OFF unless set", is removed. When you want ON to match
  OFF, you copy the state.
- **No layer jargon in Simple.** Simple says "parts", "state", and "covered by
  image", never "layer".

## Data model (decided)

A recipe becomes version 2. Each state holds its own layer list:

```js
{
  version: 2,
  name: "HDMI_1",
  editor: "layers",            // Present only after you choose Layers yourself.
  states: {
    off: { layers: [Layer, …] },
    on:  { layers: [Layer, …] },
    alt: { layers: [Layer, …] }, // Present only when the button has an ALT state.
  },
}
```

Layers are drawn from first to last. Back layers (Shape, Image) always come
before Front layers (Icon, Text) in the list. Each layer holds exactly one
value per setting, with no per-state fields:

| Type | Fields |
|---|---|
| `shape` | `set`, `colour` (a catalog colour) or `tint` (a hex value), `art` (`"off"` or `"on"`, which catalog file to draw), `visible` |
| `image` | `src` (a data URL), `file` (the file name), `source` (`{ kind: "keypad" }` or `{ kind: "library", name }`, optional), `size`, `x`, `y`, `visible` |
| `icon` | `icon`, `colour`, `stroke`, `size`, `x`, `y`, `visible` |
| `text` | `lines` (one or two), `colour`, `font`, `weight`, `size`, `align`, `x`, `y`, `visible` |

A layer that's switched off keeps its settings. `visible: false` means "off".

### ALT (my calls)

- **Has ALT:** a button has an ALT state when `states.alt` is present, even
  if it has no visible layers. A present but empty ALT deploys a blank ALT
  image. A missing ALT deploys none, as today.
- **No ALT yet:** the "+ Add ALT" tile and the empty ALT panel show when
  `states.alt` is missing.
- **Start blank:** creates `states.alt` with an empty layer list.
- **Clear button:** empties every state the button has. ALT stays present
  but empty. To remove ALT, use Remove ALT.
- **ALT is always shown (decided).** The **Show ALT** link and the project's
  Show ALT setting are removed. The rail, the Copy state menu, and the
  keypad always offer ALT. The fit check, Copy all states, and Clear button
  act on every state the button has. The client stops reading and sending
  `showAlt`. The server keeps the setting, so older files still open.

The handoff's `Face` object is the Simple view of one state's layer list. It
isn't stored separately. Storing layers for both editors makes **Switch to
layers** lossless.

### When a state fits Simple

A state fits Simple when its layers are at most one of each type, in the
order Shape, Image, Icon, Text. Any of the four may be missing.

A button opens in Simple when every state fits and `editor` isn't
`"layers"`. Otherwise it opens in Layers. Simple shows a missing part as
switched off. The layer is added only when you turn the part on, with the
defaults from today's `defaultLayer`, in its place in the order. Opening a
button never changes it.

### Saving

- The client saves every recipe as version 2, in projects and in the library.
- The server checks recipes in `projects._clean_recipes` and
  `library.save`. Both accept version 2: an object with an `off` and an `on`
  state, an optional `alt` state, and a `layers` list in each.
- Both still accept version 1, so that saves from an older client and
  existing files keep working.

## Migration

The client converts a version 1 recipe to version 2 when it opens one in
the editor, from a project, from the library, or from keypad artwork. The
conversion lives in `model.js` and is unit tested.

The conversion stays in memory until you edit that button. A project keeps
the stored version 1 recipe of every button you haven't edited, and the save
request sends it unchanged. The button's PNG images also stay as they are.
The recipe is saved as version 2 only with your first edit to that button,
when its images are rendered again too. Opening a project doesn't count as
an unsaved change. (My call: this keeps the file, the keypad, and the editor
in step, so a reordered button can't change look without you editing it.)

For each state the button has (OFF and ON, plus ALT when `alt: true`), copy
every layer and resolve its values for that state:

- **Text:** lines from `textLines(layer, state)`. Colour from
  `colourFor(layer.colour, state)`.
- **Icon:** colour from `colourFor`.
- **Shape:** `colour` and `art` from `shapeArt(layer, state)`. `tint` from
  `colourFor(layer.tint, state)`.
- **Image:** `src` is `layer[state] || layer.off || layer.on`. `file` is that
  image's `*File`. Copy `source`.
- `visible`, `size`, `x`, and `y` copy as they are.

Then sort each state's list into Back then Front, keeping the order within
each group. This is the one change that can alter a button's look, for
example a Shape that sat above Text. When it happens, the button opens in
Layers with a notice: "{Layer} moved behind {layer} to keep Back layers
behind Front ones. The keypad shows the old order until you change this
button." The notice shows each time you open the button, until you change
it. It needs no stored flag, because the stored recipe stays version 1 until
then.

Keypad artwork and ready-mades, from `recipeFromImages`, become one Image
layer per state.

## Layout

The main area, from left to right:

1. **Stage:** unchanged, except as noted below.
2. **States rail:** new, 168 px wide, between the workspace (stage and drawer)
   and the sidebar, full height.
3. **Sidebar:** today's width, `clamp(360px, 36vw, 560px)`, not the
   handoff's 380 px.

### Stage changes

- The **OFF | ON | ALT** segmented control in the stage controls goes away.
  The rail sets the keypad's state. The **Show ALT** link goes away too,
  because ALT is always shown.
- The selected button gets the handoff's 2 px `#e31837` outline at a 3 px
  offset.
- **Pick mode** (see [Copy state](#copy-state)) adds the dark banner and the
  dashed outlines on other buttons.
- **Confirmation bar:** after a copy or a ready-made, a bar shows at the
  bottom of the stage: white, a 1 px `#c9ccd0` border, a red 8 px square, the
  message, and **Dismiss**. The same message also goes to the status bar.

### States rail

Build it as the handoff's "States rail" section describes, with these
additions:

- **No selection:** the rail still shows the OFF, ON, and ALT tiles without
  artwork, so you can preview a state on the whole keypad.
- **Remove ALT:** a quiet "Remove ALT" link sits under the ALT tile when the
  button has an ALT state. It keeps today's tooltip and status message.
  Undo restores the state.
- **Moving a layer:** the active tile replaces today's canvases for moving
  things by hand. You drag on the active tile to move the selected part or
  layer, with the same selection box as today.

## Simple editor

Build it as the handoff's "Sidebar: Button tab" section describes:

- the header, with the overline, the name and state chip, and **Copy state ▾**
- **Start from a ready-made**
- the parts list, with its rows, switches, ≠ OFF markers, and the
  "covered by image" summary
- the empty ALT panel

With these decisions:

- **Header toggle:** the header has the 1c **Simple | Layers** toggle, the
  same in both editors. It replaces the handoff's footer link. The footer
  copy stays as a hint: "Need two lines of text, a second icon or a
  different order? Switch to Layers."
- **Overline:** reads "{page name} · Button {N}", per the handoff.
- **Background colours:** the swatches are every colour in the catalog for
  the shape set, not just the handoff's 5. The custom "+" swatch sits at the
  end, as it does today. A custom colour shows one colour field, for this
  state.
- **Background art:** OFF and ALT draw the colour's OFF file, and ON draws the
  ON file. Picking a set or colour sets `art` this way. A migrated shape with
  a different `art` keeps it until you pick a set or colour.
- **Ready-mades:** the grid shows every ready-made in the catalog, with the
  count in the row ("19 designs"), not the handoff's 8.
- **Settings carried over:**
  - Icon: colour, stroke, size, and X and Y.
  - Text: line 2, font, weight, align, size, colour, and X and Y.
  - Image: size, and X and Y.

  Each has one value, for this state.
- **Removed:**
  - Quick button. Simple and the ready-mades replace it.
  - The OFF, ON, and ALT canvases.
- **Unchanged below the parts:**
  - Button name and Go to page.
  - The footer, with **Save to library** and **Clear button**. Clear button
    replaces Clear layers and empties every state.

## Layers editor

Build it from the 1c mockup:

- **Header:** the same as Simple, including **Copy state ▾** and the
  **Simple | Layers** toggle.
  - **Simple** is disabled when a state doesn't fit. Its tooltip names the
    state and the reason, for example "ON has two Text layers. Simple has one
    of each part."
  - Choosing Layers yourself sets `editor: "layers"`. Choosing Simple clears
    it.
- **Label:** "Editing {STATE} state".
- **Front group:** "Front" with "See-through · any order". It lists Icon and
  Text layers, top first.
- **Back group:** "Back" with "Solid · fills the button". It lists Shape and
  Image layers, top first.
- **Layer rows:** each row has:
  - the type glyph
  - the name. A type that appears more than once is numbered: "Text",
    "Text 2".
  - a summary
  - up and down buttons, which move the layer within its group only
  - a visibility switch, the same switch as in Simple
  - delete
- **Hidden tag:** a Back layer that a higher Back layer covers gets a "Hidden
  by {type}" tag.
- **Covering rule:**
  - A Shape always covers what's below it.
  - An Image covers what's below it when its drawn box fills the whole button.
- **Cover warning:** shows under Back when a visible layer is covered: "{Top}
  is solid and covers {lower}. Only the top Back layer shows." It has two
  fixes:
  - **Delete {lower}** deletes the hidden layer.
  - **Shrink {top}** is offered only when the top layer is an Image. It sets
    the image size to 80%, centred, so the shape shows around it.
- **Add layer:** four tiles with sub-lines: **+ Text** and **+ Icon** ("Goes to
  Front"), and **+ Shape** and **+ Image** ("Goes to Back · solid"). A new layer
  goes to the top of its group, in this state only.
- **Settings:** below, titled with the layer's name and a red full stop, for
  example "Text 2.", with "Settings for the selected layer". These are
  today's settings with a single value each.
- **Shape artwork (my call):** a Shape layer's settings add an **Artwork:
  OFF | ON** segmented control in every state. It picks which catalog file
  the shape draws. It replaces today's ALT half-swatch picker. Picking a set
  or colour in Layers keeps the current artwork choice. In Simple, it resets
  the artwork to the state's default.
- **Name and footer:** the same as Simple.

## Copy state

The **Copy state ▾** menu works as the handoff describes, in both editors,
with one more row:

- "Copy the {STATE} state to {OTHER}", one row for each other state.
- "Copy the {STATE} state to another button…", with the sub-line "Then click a
  button on the keypad".
- **New:** "Copy all states to another button…", with the sub-line "Then
  click a button on the keypad". It copies OFF, ON, and ALT, and the `editor`
  choice. The target gets an ALT state only when the source has one, and
  loses its ALT state when the source has none. The target keeps its name,
  page link, and control path.
  - Banner: "Click a button to copy all states to it."
  - Confirmation: "Copied all states of {source} to button {N}."

Pick mode:

- You can switch page tabs while picking.
- Clicking the source button, Cancel, or Esc ends pick mode without copying.

Each copy is one undo step.

## Ready-mades and the LIBRARY tab

- **Start from a ready-made**, in Simple only, sets OFF and ON through their
  Image parts, as the handoff describes. Background, Icon, and Text are
  switched off in both states. ALT isn't touched.
- The LIBRARY tab is unchanged. Applying a ready-made or a saved recipe
  there replaces the whole button, as it does today.

## Undo

Undo works as it does today. Each edit to a button records a snapshot, and
quick changes to one button merge into one step. Copying, starting ALT,
removing ALT, applying a ready-made, and switching between Simple and Layers
are each one step.

## Testing

- `model.test.mjs` covers:
  - converting version 1 to version 2, for each layer type and state
  - ALT, with and without its own values
  - the Back-before-Front sort and its notice
  - fits Simple, including the reason when a state doesn't fit
  - copying one state and all states
  - the covering rule
  - the ≠ OFF comparison
- Python tests cover `projects` and `library` accepting version 2 and still
  accepting version 1, and rejecting a version 2 recipe without OFF or ON.
- Check by hand in the running app:
  - an old project opens and looks the same
  - the Simple and Layers round trip
  - pick mode across pages
  - a project saved with ALT hidden opens with ALT shown
  - deploy the result

## Left to the builder

- How the editor code is split between Simple and Layers modules, and how
  much of `editor.js` is reused.
- CSS details the handoff doesn't specify.
- The order of the work. A sensible order: data model and migration, then
  the rail and the stage, then Simple, then Layers, then copy.

## Differences from the handoff

These were decided after the handoff was written:

- **Layers is per state too.** Both editors store separate layer lists for
  each state. Layers isn't a shared stack with per-state values.
- **Front and Back groups** in Layers, as proposed in 1c and its open
  question.
- **Copy all states to another button**, as well as one state.
- **The full Keypad Graphics catalog** in the swatches and the ready-mades,
  with the custom colour as the last swatch.
- **The Simple | Layers header toggle** replaces the "Switch to layers >"
  footer link.
- **The sidebar keeps today's width.**
- **A Remove ALT link** under the ALT tile. The handoff has no way to remove
  ALT.
- **Quick button is removed.**
- **ALT is always shown.** The Show ALT link and setting are removed.

## Changes after the first build (decided)

- **No Start from a ready-made in Simple.** The LIBRARY tab already applies
  ready-made buttons, so Simple shows only the parts list.
- **Rename by double-clicking the name** in the editor header. Enter or
  leaving the field keeps the name, and Esc puts the old one back. The Button
  name field is gone; the "Files on keypad" hint stays under Go to page.
- **Layers' add buttons sit under their group:** + Text and + Icon under
  Front, + Shape and + Image under Back, with no "Goes to" sub-lines.
- **With no button selected, the States rail and the sidebar are hidden**, so
  the keypad has the room. The LIBRARY tab is reachable once a button is
  selected.
