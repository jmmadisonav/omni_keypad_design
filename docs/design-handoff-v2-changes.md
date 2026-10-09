# Button Designer: changes since the v2 design handoff

This document lists every difference between the v2 design handoff
(`OMNI keypad UI redesign (1).zip`, `design_handoff_button_designer/README.md`)
and the Button Designer as it ships today. Use it to bring the Claude Design
project up to date, so that the next handoff starts from the real app.

Each item is marked:

- **Added**: in the app, not in the handoff. Add it to the design.
- **Changed**: in both, but the app differs. Update the design to match.
- **Missing**: in the handoff, not built. Decide whether to keep it in the
  design or drop it.

Quoted text is the exact UI copy in the app.

## The biggest changes

1. **Debug tab (new).** The bottom drawer has a second tab that connects to a
   keypad, answers button presses and the dial, and shows a live message log.
   See [Debug tab](#debug-tab-new).
2. **The HControl reference moved to a bottom drawer.** It's no longer a
   collapsible section in the BUTTON sidebar. See
   [HControl reference](#hcontrol-reference).
3. **ALT state.** Buttons can have a third image, ALT, shown only when you turn
   it on for the project. See [ALT state](#alt-state-added).
4. **"Key" became "button"** in all UI copy.
5. **Tabletop models.** Each model also covers its tabletop version (T6B,
   T6BV, T8BV).
6. **Undo and redo** with Ctrl+Z and Ctrl+Y.
7. **The prototype's button artwork is a stand-in.** Real buttons are
   bevelled 188 px PNGs in bright colours. See
   [Button artwork](#button-artwork).

## Button artwork

The handoff has no real button artwork. Its README says the shape artwork
and the ready-made tiles are placeholders, and the zip doesn't include
Keypad Graphics. The prototype draws its own stand-ins, which look quite
different from the buttons on a real keypad. Upload
`docs/design-artwork-samples.zip` to the design project and use its PNGs in
place of the stand-ins. It holds 8 ready-made buttons and 4 colours of each
shape set, OFF and ON, plus each set's grey artwork and a README. The full set
is in `docs/Keypad Graphics.zip`.

| | Prototype stand-in | Real Keypad Graphics |
|---|---|---|
| Size | Drawn with CSS at any size | 188 × 188 px PNGs, OFF and ON per colour |
| Finish | Flat fill | Bevelled and shaded, with a light outline. Bubble has a glossy highlight across the top. |
| Squared | Rounded box, radius 8 | Square with slightly rounded corners |
| Bubble | Pill shape, radius 40 | A square button with a gloss highlight, not a pill |
| Circle 45 | Circle, radius 88 | A square with large rounded corners, not a circle |
| Colours | Muted, on-brand: Squared has Charcoal, Red, Orange, Blue and Green. Bubble has Graphite, Teal, Amber and Crimson. Circle 45 has Black, Silver, Red and Cyan. | Bright, saturated colours. Squared and Bubble have Aqua, Blue, Green, Magenta, Orange, Purple, Red and Yellow with OFF and ON images, plus Black, Grey and White as single images. Circle 45 has the same, with DkGrey and LtGrey in place of Grey. |
| OFF and ON | A darker and a lighter tint of one hue | Ready-made buttons are grey for OFF and bright red for ON. Shape colours have a dimmer OFF and a brighter ON. |
| Ready-made tiles | A shape, a Lucide icon and an uppercase label, for example "AUDIO MUTE" | Finished artwork with its own icon and sentence-case label, for example "Audio Mute" in white on grey or red |
| Ready-made names | For example `AudioMute_Square` | For example `AudioMute_Squared`, `Player_Controls`, `Slot1_Play` (19 in all) |

The app also adds a **custom colour** for each shape set, which recolours the
set's single grey image to any OFF and ON colour and keeps its shading. See [BUTTON tab](#button-tab).

## Global

- **Changed: "key" is now "button" everywhere.** For example:
  - "Select a button on the keypad to edit its layers, OFF and ON images and
    page link."
  - "Select a button on the keypad first."
  - "Buttons that link to it…" in the delete-page dialog.
  - The HControl note "Page-switch keys" is now "Page-switch buttons".

## Header

- **Added: FOLDER button** after SAVE AS, in the desktop app only. Tooltip:
  "Open {folder}, which holds your projects, backups, and library".
- **Added: missing address error.** Load, Deploy and Back up keypad now with an
  empty IP address show the status error "Enter the keypad's IP address first,
  or click Find." and focus the field.
- **Added: opening a project with a missing model file** shows the status error
  "Opened {name}. Its model file ({model}) is missing, so it can't be
  deployed."
- **Changed: New project defaults.** The name field suggests "Untitled" (then
  "Untitled 2" and so on), and the model you chose last time is preselected.
- **Changed: OPEN** shows "Open" as its placeholder option.
- Everything else matches: the model chip and "· Model missing", the device
  cluster, the FINDING…, LOADING… and SAVING… labels, the faded SAVE, and the
  busy lock.

## Stage

- **Changed: legend copy.** "Unsaved changes. Drag buttons to swap artwork and
  page links. Ctrl+Z undoes."
- **Added: ALT preview.** See [ALT state](#alt-state-added).
- **Changed: faceplate size.** The maximum width is 550 px for the 8BV and
  363 px for the portrait models, instead of 500 px and 330 px. The faceplate
  also shrinks to fit the stage height above the bottom drawer. The stage
  padding is 16 px top and bottom, 24 px left and right.
- **Added: drag across pages.** Drag a button onto a page tab to switch to that
  page, then drop it on a button there. A page link that would point to its
  own page is dropped. Status: "Swapped artwork and page link between buttons
  {X} and {Y}. Control settings stay with each slot."

## Sidebar

- **Changed: width** is `clamp(360px, 36vw, 560px)`, not
  `clamp(290px, 32vw, 370px)`.

## Status bar

- **Changed: Last deployed.** The text reads "Last deployed 9 Oct 2026,
  14:12": the date as day, short month and year, then a 24-hour time. A
  project that has never been deployed shows "Not deployed yet".
- **Added: app version** (for example "v1.2.3") at the far right, after a
  divider, in the desktop app only.

## Keypad models

- **Added: tabletop models.** Each model includes its tabletop version: the
  OMNI-KP-T6B, T6BV and T8BV. The New project cards read "OMNI-KP-8BV / T8BV"
  and so on. Load and Deploy accept either model, and a model mismatch error
  names the tabletop model.
- **Changed: the 6BV is untested too.** Both the 6B and the 6BV show
  "(untested)".
- **Changed: card order** in the New project dialog: 6B, 6BV, 8BV (by button
  count, then dial).
- **Changed: image size per model.** The 6B and 6BV use 150 × 150 px button
  images, and the 8BV uses 188 × 188 px. The editor helper shows the right
  size for the model.
- **Changed: a project with a missing model file** is drawn from the project
  itself, not with 8BV geometry. With 6 buttons or fewer, it's drawn as a
  portrait faceplate. It shows a dial only if the page has dial settings.

## ALT state (added)

The keypad has a third button state, ALT. Most designs don't use it, so each
project hides it until you turn it on.

- **Stage:** a quiet link next to the OFF / ON toggle reads "Show ALT" or "Hide
  ALT". Its tooltips are "Design the ALT state, the keypad's third button
  state" and "Hide the ALT state for this project". While ALT is shown, the
  toggle gets a third segment, ALT. The setting is saved with the project
  straight away.
  - Status when shown: "Showing the ALT state. To give a button an ALT image,
    select it and click + ALT."
  - Status when hidden: "Hid the ALT state. Buttons that have ALT images still
    deploy them."
- **Canvases:** a third canvas, ALT, joins OFF and ON in a three-column grid.
  Until the button has an ALT image, it shows "No ALT image" and a **+ ALT**
  button. Once it has one, a **Remove ALT** link appears.
  - Status when added: "Added an ALT image. It starts as a copy of OFF; change
    it in the ALT fields."
  - Status when removed: "Removed the ALT image. When you save, this button has
    no ALT image on the keypad."
- **Settings:** every OFF / ON pair gets an ALT column: the text grid, icon and
  text colour fields, and an ALT IMAGE row for Image layers. Each ALT value
  follows OFF until you change it.
- **Shapes:** an "ALT artwork · {colour} {OFF|ON}" picker of split swatches,
  where you click either half. It has a "Same as OFF" reset and the helper
  "Click the OFF or ON half of a swatch to use that artwork for ALT."
- **Layer summary** adds `· ALT "…"`. The file hint adds `_ALT.png`.

## BUTTON tab

- **Changed: header overline** reads "Button 3 · {page name} ·
  /page1/button3", not "KEY 3 · PAGE 1 · …". An unnamed button's title is
  "Button 3". A blank button has no thumbnail.
- **Changed: canvas helper.** "{size} × {size} px on the keypad. Drag on any
  canvas to move the selected layer."
- **Changed: Quick button.** The link reads "Close quick button" while the
  panel is open. The default colour is Blue, and the icon results start with
  common AV icons. Status: "Generated Shape, Icon and Text layers."
- **Changed: defaults for new layers.**
  - Shape: the Bubble set, in Blue.
  - Icon: `circle`, 80 px, OFF `#9AA0A6`, ON `#FFFFFF`.
  - Text: "Label" (or the button name), 24 px, centred at y 94, grey for OFF
    and white for ON.
- **Changed: shape set order** is Bubble / Circle 45 / Squared.
- **Added: custom shape colour.** A "+" swatch with a colour-wheel fill sits at
  the end of the swatches. It recolours the set's grey artwork and shows OFF
  and ON colour fields. The label reads "Colour · Custom", and the layer
  summary reads "Squared · Custom". The helper adds "To pick your own OFF and
  ON colours, click +."
- **Changed: icon picker.**
  - Its label reads "Icon · {name}".
  - The grid fills its width with 38 px cells, not a fixed 8 columns. It's
    176 px high and scrolls.
  - Before a search it shows common icons and "Common icons. Search {count}
    Lucide icons by name or tag." After a search it shows "{N} matches,
    showing 64".
- **Changed: text Align** is a segmented control of three icons (left, centre,
  right) with the tooltips Left, Centre and Right. Weight and Align sit side by
  side, followed by Size, X and Y.
- **Changed: image rows.**
  - The description reads "PNG or SVG" when empty, "Optional. Uses the OFF
    image." for an empty ON row, "Existing OFF artwork" for keypad or
    ready-made art, or the file name.
  - The info box reads "Ready-made artwork from Keypad Graphics: {name}_OFF.png
    and _ON.png."
  - The × doesn't appear on the OFF row of keypad or ready-made art.
  - Errors: "{file} isn't a PNG or SVG. Choose a PNG or SVG file." Success:
    "Uploaded {file} as the OFF image."
- **Changed: button name rules.** The error reads "Use 1 to 64 letters,
  digits, spaces, dashes or underscores, with no space at either end." Names
  can be up to 64 characters.
- **Changed: file names.** Any character other than a letter, digit, dash or
  underscore becomes `_`. A button with no name uses `p{page}b{button}`, for
  example "Files on keypad: p1b3_OFF.png, p1b3_ON.png".
- **Changed: no HCONTROL section.** The sidebar goes from Go to page straight
  to the footer.
- **Changed: footer.** SAVE TO LIBRARY is a full-width outline button. CLEAR
  LAYERS is a red outline button with the tooltip "Remove all layers and
  images". Status: "Cleared the layers on button {N}. It's now blank."

## HControl reference

The strings and notes are the same as in the handoff, but where and how
they're shown has changed.

- **Changed: it's a bottom drawer, not a sidebar section.** The drawer sits
  under the keypad and is open by default. Its open or closed state and its
  height are remembered. You drag its top edge to resize it; the edge turns red
  on hover. Collapsed, it's a 36 px bar.
- **Changed: dark theme.** The drawer looks like a code editor: background
  `#1e1e1e`, bar `#252526`, borders `#3c3c3c`, text `#cccccc` and
  syntax-coloured JSON. This is the one place the UI isn't light.
- **Changed: layout.** Two panes side by side, "STRINGS → send · ← expect" and
  "NOTES", which stack when the drawer is narrower than 620 px. Lines have
  numbers, and group titles appear as `// comment` lines. Page controls appear
  inside the strings pane as "// Page controls · {page}".
- **Added: drawer bar.**
  - A path label: "/page1/button3 · Button 3 · Page 1", or the page name when
    nothing is selected.
  - **COPY ALL** copies every line, marked `->` or `<-`. Status: "Copied {N}
    lines. -> marks lines you send, <- lines you receive."
- **Changed: intro.** "// TCP {ip}:4197. One line per message: a command, a
  space, a JSON object and a line feed." Without an IP address, it shows
  `<keypad IP>`.
- **Changed: warning.** It's an amber item in the drawer bar, not a boxed note:
  a CHECK chip and "Unsaved page changes. Page numbers may change when you save
  and deploy."
- **Changed: no selection.** The drawer still shows the intro and the page
  controls, plus "// Select a button on the keypad to see its strings."
- **Changed: copy buttons** appear only when you point to or focus a line.

## Debug tab (new)

The bottom drawer has two tabs: **HCONTROL** and **DEBUG**. The Debug tab
connects to the keypad in the header and answers it the way a simple control
system would, so an installer can check a deployed design by hand. It works
without a project open.

### What it does

While connected:

- Pressing a button on the keypad switches its feedback state between OFF and
  ON. A button in ALT goes to ON.
- Turning the dial sets the LED ring on the same page to the dial's level.
- Pushing the dial and changing pages are logged only.
- The log shows every line sent and received, plus plain notes.

### Tabs

- Both tabs use the existing drawer tab style. The selected tab has a 2 px red
  top border, background `#1e1e1e` and white text. The other tab is
  transparent with `#cccccc` text.
- Only the selected tab shows the chevron.
- Clicking the selected tab collapses or expands the drawer. Clicking the other
  tab switches to it and opens the drawer.
- The selected tab is remembered.
- While connected, the DEBUG tab shows a 7 px green dot (`#2bb673`) after its
  label, so you can see the connection from the HCONTROL tab too.

### Drawer bar

When DEBUG is selected, the bar shows:

- A status line (12 px monospace, `#9cdcfe`):
  - "Not connected"
  - "Connecting to {ip}…"
  - "Connected to {model} at {ip} · firmware {version}"
- Three drawer buttons, right-aligned:
  - **CONNECT**, or **DISCONNECT** while connected. It's disabled while
    connecting. Tooltip: "Connect to the keypad in the header, and toggle
    buttons and the LED ring as you use it".
  - **CLEAR**, which empties the log on screen. Tooltip: "Clear the log on
    screen".
  - **COPY ALL**, which copies the log. It's disabled when the log is empty.
    Tooltip: "Copy the log".

### Log pane

- Pane title: "LOG", then "→ sent · ← received" in the subtitle style.
- One row per entry, in the same monospace style as the strings pane:
  - The time, `hh:mm:ss.mmm`, in a 112 px column, `#858585`.
  - A direction mark: `→` in `#4fc1ff` for a sent line, `←` in `#858585` for a
    received line, and nothing for notes.
  - The text. Sent and received lines use the same syntax colours as the
    strings pane. Notes are green (`#6a9955`) and errors are `#f48771`.
- The log follows the newest row. If you scroll up, it stays put until you
  scroll back to the bottom.
- It keeps the last 2,000 rows. Reloading the page brings back the recent log
  without duplicates.
- Copy all writes one line per row: the time, then `->`, `<-`, `//` for a note
  or `!!` for an error, then the text.

### Notes in the log

- "Connecting to {ip}…"
- "Connected to {model} at {ip}, firmware {version}. Downloading the
  descriptor…"
- "Subscribed to {N} controls. Press a button or turn the dial."
- "Page {P} button {B}: OFF → ON" (or ON → OFF)
- "Page {P} dial: {level}", with " (LED ring {applied})" when the keypad
  limited the value
- "Page {P} dial button: PUSH" (or RELEASE)
- "Page changed to {name}"
- "Disconnected."
- "Connection closed by the keypad. Deploying a design does this. Click
  Connect to start again."

### Errors in the log

- "Couldn't connect to {ip}: {reason}"
- "Couldn't start debugging {ip}: {reason}"
- "Couldn't subscribe to {path}: {reason}. It might be bound to an OMNI
  device."
- "Page {P} LED ring isn't available: {reason}. It might be bound to an OMNI
  device." This appears once, and after that the dial level is only logged.
- "Couldn't answer {path}: {reason}"

### Status bar

- Connected: "Debugging {ip}. Press buttons or turn the dial on the keypad."
- No IP address: "Enter the keypad's IP address first, or click Find."
- Copied: "Copied {N} lines. -> marks lines you send, <- lines you receive."
- A failure to connect shows the error, for example "couldn't talk to the
  keypad at {ip}: …".

## LIBRARY tab

- **Added: helper text.** "Click to apply to the selected button, or drag onto
  any button."
- **Added: search.** The placeholder reads "Search library". An empty result
  shows "Nothing matches."
- **Added: status messages.** "Applied {name} to button {N}." and "Deleted
  recipe {name}."

## Pages

- **Missing: button count on tabs.** The handoff shows "n/8" or "n/6" after
  the page name. The app shows the name only.
- **Missing: RENAME on the active tab.** You rename by double-clicking the tab.
  Its tooltip reads "Double-click to rename".
- **Changed: duplicate name on blur.** The status error reads "Page names must
  be unique. "{name}" is already used."
- **Added: page messages.**
  - "A design can have up to 9 pages." (status error and tooltip)
  - "A design needs at least one page."
  - "Added Page {N}. Dial and LED ring settings copied from {page 1}."
  - "Deleted {name}. Pages after it were renumbered."

## Projects

- **Added: on start**, the app opens the newest project, or creates "Untitled"
  the first time. If the newest project can't be opened, the status error ends
  "…Choose another project in Open, or click New."
- **Added: closing the browser tab** with unsaved changes asks you first.
- **Changed: Save as.**
  - The name defaults to "{name} copy", with the hint "Letters, digits,
    spaces, dashes and underscores."
  - Errors: "Enter a name.", "Use letters, digits, spaces, dashes and
    underscores only." and "That name is already used."
- **Changed: Load from keypad.** If the name is taken, " 2" and so on is
  added. Status: "Loaded {ip} into new project "{name}". A copy is saved in
  Backups."

## Deploy

- **Missing: a separate Checking step.** The app goes straight to the
  Deploying dialog. Its progress line reads "Checking the keypad's design
  first. A keypad with no design can take up to 15 seconds." and stays for the
  whole deploy.
- **Changed: saving step.** Title "Deploy to keypad", body "Saving the project
  first.", progress line "Saving the project…".
- **Changed: wrong model.** "This project is for an {model}, but the keypad at
  {ip} is an {model}. Nothing was uploaded." Status: "Deploy refused: the
  keypad isn't {model}."
- **Added: more outcomes.**
  - Save failed: "Deploy failed", with "The project couldn't be saved, so
    nothing was uploaded. {reason}".
  - Any other error: "Deploy failed", with the error.
  - Cancelling Replace: the status error "Deploy cancelled."
- **Changed: confirm rows.** Pages reads "1 page" or "{N} pages". Keypad shows
  only the IP address when the model isn't known.
- **Changed: DONE box** has a green border and a slate DONE chip.

## Backups

- **Added: manual backups.** "+ Back up keypad now" saves `manual_` files,
  tagged **MANUAL** in the same style as LOADED. The intro adds "Back up keypad
  now saves manual_ files." The link reads "Backing up…" while it runs.
- **Added: list states.** Errors appear under the list. An empty list reads
  "There are no backups yet." A backup with no known model shows "unknown
  model".
- **Changed: restore copy.**
  - Success: "Restored {file} to {ip}. The keypad has restarted. To edit it,
    click Load."
  - Wrong model: "This backup is for an {model}, but the keypad at {ip} is an
    {model}. Restore refused."
  - Any other failure is titled "Restore failed".

## Design tokens

- **Added: dark drawer palette**, used only in the bottom drawer: `#1e1e1e`,
  `#252526`, `#3c3c3c`, `#cccccc`, `#9cdcfe`, amber `#e5c07b`, plus the syntax
  colours, and the Debug log's `#6a9955` notes and `#f48771` errors.
- **Added: `#f7f7f8`** as the Quick button panel background.
- Hind, radius 0, no grey card shadows and the 200 ms transitions all match.

## Keyboard

- **Added: undo and redo.** Ctrl+Z undoes. Ctrl+Y or Ctrl+Shift+Z redoes.
  - In a text field, these keys undo your typing instead.
  - Changes to one button within 800 ms undo as one step.
  - Status messages: "Undid {change}. To redo it, press Ctrl+Y.", "Redid
    {change}." and "Nothing to undo."
- **Added: dialogs.** Esc or a click on the backdrop closes any dialog that
  isn't running a job. Enter submits name dialogs.
