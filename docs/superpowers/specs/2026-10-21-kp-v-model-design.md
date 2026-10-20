# OMNI-KP-V support

## Intent

The OMNI-KP-V is the volume-only keypad. It has no screen and no buttons:
just a knob, the knob's push button, and an LED ring around the knob. It comes
in black and white, and both report the model ID `OMNI-KP-V`. There's no
tabletop version and no other ID.

The designer supports the 6B, 6BV, and 8BV, plus their tabletop versions. Now
that the dial and LED ring have ranges you can set, the designer can do
everything a KP-V needs. This change lets you create, import, edit, debug, and
deploy KP-V projects.

On a KP-V, the only thing you set is the dial and LED ring ranges, which you
already set on the Page tab for the 6BV and 8BV. The designer doesn't edit
bindings (`path`, `remote`, `class`) or the push button's settings for any
model, and this change doesn't add that.

## What the keypad holds

The test keypad is at 192.168.101.182. It reports `OMNI-KP-V` at
`/configuration/device/model`. Its `keypad.json`, read back on 2026-10-21, is
one page with no buttons:

```json
{"fingerprint": "...", "lastdeployedtimestamp": "...",
 "haptic": {"enabled": false, "pattern": 1}, "pin": {"code": ""},
 "display": {"brightness": 50, "screentimeout": 5, "screendimtimeout": 3,
             "dimbrightness": 20, "timeout": 30, "panel_separator_color": "#DFDFDF"},
 "pages": [{"name": "Page 1", "background": "#000000",
            "ledring": {...}, "dial": {...}, "dial_button": {...},
            "buttons": []}]}
```

A backup of that design is at
`C:\Users\Jim\AppData\Local\Temp\kpv\manual_20261021_085505.cpio`.

## Goals

- A model file, `designer/models/OMNI-KP-V.json`, describes the KP-V. Its
  template is one page with `"buttons": []` and the same `ledring`, `dial`, and
  `dial_button` blocks the 6BV template uses. It also has the same `display`,
  `haptic`, and `pin` blocks, so the keypad gets the shape it expects.
- The model loader accepts a model with no buttons.
- **New Project** lists the KP-V last, after the six existing models. It offers
  no Wall/Tabletop choice for the KP-V.
- **Find** and **Import** recognise a keypad that reports `OMNI-KP-V`.
  **Deploy** refuses to send a KP-V project to another model, and refuses to
  send another model's project to a KP-V. These checks already work by model
  ID.
- The keypad preview shows a round knob with its LED ring in place of the
  button grid. Clicking the knob, or opening the project, shows the dial
  settings: the Dial range and LED ring range rows, and the read-only list of
bindings, which the Page tab shows today for dial models.
- The **Black | White** finish toggle works for the KP-V, as it does for the
  other models. The **Wall | Tabletop** toggle is hidden.
- **Debug** works as it does now. Its prompt reads "Turn or press the dial." for
  a KP-V.
- The user guide's models table lists the KP-V, and the note "The designer
  doesn't support the OMNI-KP-V yet." is removed.
- The model is marked `"tested": true` after a test design has been deployed to
  the keypad at 192.168.101.182 and read back. The implementing agent does
  this itself: the owner made that keypad available for testing. Afterwards,
  the agent restores the backup below and reads the design back to confirm it
  matches.

## Non-goals

- More than one page. A KP-V project always has exactly one page.
- Linking the dial's push button to a page. With one page, there's nowhere to
  go.
- Telling the black and white faceplates apart beyond the existing finish
  toggle.
- Changing an existing project's model. That stays unsupported for every
  model.
- Editing bindings or the push button's settings. The designer doesn't do
  this for any model today.

## Anti-goals

- A KP-V project that shows controls with no effect on the keypad. That covers
  the Button and Library tabs, the States rail, adding, renaming, or deleting
  pages, page background, separator lines (**Lines**), and the display
  brightness and timeout settings. All of these are hidden for a KP-V.
- Any change in behaviour for the 6B, 6BV, or 8BV.
- Leaving the keypad at 192.168.101.182 with a different design than it had.
  Restore the backup after testing.

## Constraints

- Hidden settings stay in the design file unchanged. A KP-V project keeps the
  `display`, `haptic`, and `pin` values from its template or from the keypad it
  was imported from, and deploy sends them back as they were.
- Model behaviour comes from the model file, not from checks for the ID
  `OMNI-KP-V`. A zero-button model with a dial is the case the code handles.
  Keep it general enough that another dial-only model would only need a new
  model file.
- The designer recognises a backup's model by its button count and whether it
  has a dial (`server.py` `_backup_model`). A page with no buttons and all
  three dial blocks matches the KP-V.
- Several tests use `OMNI-KP-V` as their example of an unsupported keypad,
  such as `tests/test_designer_models.py` and
  `test_load_from_unsupported_keypad_is_400` in
  `tests/test_designer_server.py`. Switch those to a made-up ID. Tests that
  assert the exact model list or order also need updating.

## Decided

- One page only, with no page controls.
- The preview is a round knob with its LED ring, with no button grid.
- With no screen, the display settings are hidden. *(Designer's call: they
  aren't removed from the file.)*
- The KP-V goes last in the New Project list. *(Designer's call.)*
- With no buttons to select, the dial settings are what the sidebar shows by
  default. *(Designer's call.)*
- Importing from, or restoring a backup of, a KP-V that holds more than one
  page or any buttons is refused with a clear message, and nothing is
  changed. Keeping pages the editor can't show, or dropping them so deploy
  erases them, would both surprise you. *(Designer's call.)*

## Left to the builder

- How the model file expresses "no buttons" (for example `columns: 0`,
  `rows: 0`) and a new faceplate value for the knob-only face, plus any
  `image_size` the loader still needs.
- How the preview draws the knob and ring, within the existing black and white
  finishes.
- How the sidebar is arranged once the button-only tabs and settings are
  hidden.
- Test coverage: pytest for the model loader, server, projects, and
  `keypad_ops`, and `node:test` (`npm run test:designer`) for `model.js` and
  `pages.js`.
