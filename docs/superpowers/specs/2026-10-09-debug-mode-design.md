# Debug mode design

Date: 2026-10-09

## Goal

Add a **Debug** tab to the bottom drawer, next to **HControl**. The tab
connects to a keypad over HControl and runs a small echo app against it, so
you can check a deployed design on the real hardware:

- Pressing a button toggles its feedback state between `OFF` and `ON`.
- Turning the dial prints its level and copies it to the same page's LED ring.
- Every line sent to and received from the keypad appears in a live log.

The tab works whether or not a project is open. It finds the keypad's
controls from the keypad itself, not from the project.

**Success:** you connect, press buttons on the keypad and see them light and
unlight, turn the dial and see the LED ring follow, and read every message in
the log.

## Decisions

| Question | Decision |
|---|---|
| Toggle behaviour | Each `PUSH` flips `OFF` ↔ `ON`. `RELEASE` changes nothing. `Alt` is never set. A button in `Alt` goes to `ON`. |
| Dial push | Logged only. It doesn't change pages. |
| LED ring resend after 0.6 s | Not implemented. The log shows the firmware's behaviour as is. |
| Mirror the keypad on screen | No. The on-screen keypad stays the editor. |
| Transport to the page | Server-Sent Events (SSE). |
| Reconnect after a drop | No. The session ends, and the log says why. |
| Name | **Debug** |

## Reference

The behaviour follows `DescriptorApp` in
`C:\Users\Jim\Developer\omni_keypad\02_descriptor.py`, without the resend
timer. `hcontrol.py` is the same in both repositories, apart from line endings.

## Architecture

```
Browser (Debug tab)                 Python server                      Keypad
  Connect ──POST /api/debug/connect──► DebugSession.connect(host) ──TCP 4197──►
  EventSource ◄─GET /api/debug/events── listeners ◄── on_line / notes ◄────────
  Disconnect ─POST /api/debug/disconnect► DebugSession.disconnect()
```

A browser page can't open a raw TCP socket, so the Python server holds the
HControl connection, and the page only starts, stops, and watches it.

### `hcontrol.py`: line hook

`HControlClient.__init__` gets an optional keyword argument:

```python
on_line: Callable[[str, str], None] | None = None
```

The client calls `on_line(direction, text)` with these values:

- `"send"` and the line without its line feed, from `_send_line`. This
  includes the automatic `@publish` acknowledgements.
- `"receive"` and the line, from `_handle_line`, before it's parsed.

An exception raised by `on_line` is logged and ignored, so a broken listener
can't break the connection. When `on_line` is `None`, the client behaves as
it does today.

This change makes the designer's `hcontrol.py` differ from the copy in
`omni_keypad`. Copy the change across to keep the two copies the same.

### `designer/debug.py`: `DebugSession`

There is one `DebugSession` per server, created in `make_server`.

**State:** the client, or `None`; the host; the model and firmware version;
a ring buffer of the last 500 log entries; and a set of listener queues. A
lock guards all of them.

**Log entries** are dictionaries that the server sends as JSON:

```json
{"seq": 41, "time": "14:03:22.517", "kind": "send", "text": "set {...}"}
```

`kind` is one of these values:

- `send`: a line sent to the keypad.
- `receive`: a line received from the keypad.
- `note`: a plain-language note from the session.
- `error`: a note about a failure.
- `status`: a change to the connection state. Its `text` is a JSON object
  with `connected`, `host`, `model`, and `version`, which the page uses to
  update the toolbar.

**`connect(host)`** does the following:

1. If a session is already open, it closes that session first.
2. It opens an `HControlClient(host, on_line=..., on_disconnect=...)`.
3. It reads `/configuration/device/model` and
   `/configuration/device/version`, and logs a `status` entry.
4. It reads `/configuration/device/descriptorlocation`, downloads that file
   with `get_file`, and parses it as JSON. The descriptor isn't cached.
5. It subscribes to each parameter from `walk_descriptor(desc)` whose path
   ends in `/action` or `/dial/level`, or is `/settings/currentpage`. Enum
   parameters use `fmt="string"`.

   If a subscription fails with `HControlError`, the session logs an `error`
   note that names the path and suggests it might be bound to an OMNI
   device, then carries on with the next path. At the end, it logs
   `Subscribed to N controls`.

6. It returns the status.

Steps 2 to 5 run on the request thread, so `POST /api/debug/connect` returns
after the subscriptions are in place, or returns an error. If connecting or
downloading fails, the session closes the client, logs an `error` note, and
the route returns the error. The page then shows it in the status bar as it
does for other keypad errors.

**Events** run on the client's dispatcher thread:

- `/pageP/buttonB/action` with `PUSH`: if the descriptor has
  `/pageP/buttonB/state`, the session gets the current state and sets
  the new one. It logs `Page P button B: OFF → ON`.
- `/pageP/buttonB/action` with `RELEASE`: no note. The raw line is logged.
- `/pageP/dial/level` with value `V`: the session sets `/pageP/ledring/level`
  to `V`, if the descriptor has that path. It logs `Page P dial: V` and
  shows the applied value when the keypad clamped it, for example
  `Page P dial: 120 (LED ring 100)`.
- `/pageP/dial_button/action`: it logs `Page P dial button: PUSH`.
- `/settings/currentpage`: it logs `Page changed to NAME`.

If a request in an event handler fails, the session logs an `error` note.
The session stays open.

**`disconnect()`** closes the client, logs `Disconnected`, and sends a
`status` entry. It's safe to call when no session is open.

**`on_disconnect`** runs when the keypad closes the connection. The session
logs `Connection closed by the keypad. Deploying a design does this. Click
Connect to start again.` and sends a `status` entry.

**Listeners:** `listen()` returns a queue that starts with a copy of the ring
buffer, and `unlisten(queue)` removes it. `_log(entry)` adds the entry to the
buffer and puts it on every queue. Each queue holds at most 1,000 entries. If
a queue is full, the session drops that listener, and the page's
`EventSource` reconnects and replays the buffer.

### `designer/server.py`: routes

| Route | Body | Result |
|---|---|---|
| `POST /api/debug/connect` | `{"host": "..."}` | The status JSON, or an error. |
| `POST /api/debug/disconnect` | none | The status JSON. |
| `GET /api/debug/events` | none | `text/event-stream` |

The connect route reads `host` with the existing `_host_from` helper.

The events route sends these headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`

It writes each entry as `data: <json>\n\n` and flushes after each one. Every
15 seconds without an entry, it writes a `: keepalive\n\n` comment. It stops
when a write fails, which means the page has closed, and then calls
`unlisten`.

`ThreadingHTTPServer` gives each request its own thread, so a long-lived
stream doesn't block other requests. The route goes through the existing
`_check_origin`. An `EventSource` from the app's own page sends a same-origin
`GET`, which that check allows.

When the server shuts down, it calls `DebugSession.disconnect()`.

### Interaction with other features

The keypad accepts several HControl connections, so Deploy, Load, Backup,
and Restore keep working while a debug session is open. A deploy makes the
keypad drop every connection, so the session ends with the note above.
Opening, closing, or switching projects doesn't affect the session.

## User interface

### Drawer tabs

The drawer bar's single **HControl** toggle becomes two tabs, **HControl** and
**Debug**, with `role="tab"`:

- Clicking the selected tab collapses or expands the drawer, as the
  **HControl** toggle does today.
- Clicking the other tab selects it and opens the drawer.
- The app saves the selected tab with `remember("designer.drawerTab", ...)`
  and restores it on load.
- While a session is connected, the **Debug** tab shows a small green dot, so
  you can see the session from the **HControl** tab.

The current HControl content (`#drawer-path`, `#drawer-warn`, `#copy-all`,
and the body panes) shows only when **HControl** is selected.

### Debug toolbar

When **Debug** is selected, the drawer bar shows these controls:

- **Connect** or **Disconnect**, depending on the state. **Connect** uses
  the IP address in the header field. When that field is empty, it calls the
  existing `needHost()`.
- A status line: `Not connected`, `Connecting to 192.168.1.40…`, or
  `Connected to OMNI-KP-8BV at 192.168.1.40 · firmware 1.1.4.0`.
- **Clear**, which empties the log on screen only.
- **Copy all**, which copies the visible log as text, one entry per line:
  `14:03:22.517 -> set {...}`.

Changing the header IP address while connected doesn't affect the session.
**Connect** uses the new address next time.

### Debug log

The log fills the drawer body in the **Strings** pane's monospace style. Each
row shows the time, a mark, and the text:

| Kind | Mark | Style |
|---|---|---|
| `send` | `→` | Colour of the existing send lines |
| `receive` | `←` | Colour of the existing expect lines |
| `note` | none | Comment style |
| `error` | none | Error colour |

`status` entries update the toolbar and the tab dot, and aren't shown as
rows.

The log scrolls to the newest row unless you've scrolled up from the bottom.
It keeps the last 2,000 rows and removes the oldest. The page tracks `seq` and
skips entries it has already shown, so a replay after the `EventSource`
reconnects doesn't add duplicates.

The page opens the `EventSource` when the app starts. That way, a session
that was open before a page reload appears with its recent history.

### Code layout

- `designer/static/debug.js` (new) holds the formatting helpers as plain
  data with no DOM, in the style of `hcontrol.js`: the mark and label for
  each kind, the copy-all text, and the trimming of rows over the limit. It
  has tests in `debug.test.mjs`.
- `app.js` holds the DOM wiring next to the existing HControl drawer code.
- `index.html` and `style.css` get the tabs, toolbar, and log pane.

## Testing

**`tests/test_designer_debug.py`** uses `FakeKeypad`. Put a small descriptor
in `keypad.files`, at the path that
`/configuration/device/descriptorlocation` gives, covering two pages with
buttons, a dial, a dial button, and a LED ring. The tests cover these cases:

- Connecting subscribes to every action, dial level, and current page path
  in the descriptor, and logs the status.
- A `PUSH` publish turns an `OFF` button `ON`, and a second turns it `OFF`.
  A `RELEASE` changes nothing.
- A dial publish sets the same page's LED ring to the same level.
- A subscription that fails is logged, and the other subscriptions still
  happen.
- Sent and received raw lines, including `@publish`, reach a listener in
  order.
- A listener added later gets the buffered entries first.
- When the keypad closes the connection, the session logs it and reports
  that it isn't connected.
- `disconnect()` is safe to call twice.

**`tests/test_hcontrol_client.py`** covers `on_line`
for sends, receives, and the `@publish` acknowledgement.

**`tests/test_designer_server.py`** covers connect and disconnect against
`FakeKeypad`, and reads the first few events from the stream.

**`debug.test.mjs`** covers the formatting helpers.

**By hand:** run the app against `FakeKeypad` to check the tabs, toolbar, and
log. Then check it against a real keypad.

## Out of scope

- Reconnecting automatically.
- Sending custom commands from the tab.
- Mirroring the keypad on the on-screen faceplate.
- The LED ring resend workaround.
- Caching the descriptor.
