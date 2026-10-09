# Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Debug** tab to the designer's bottom drawer. It connects to a keypad over HControl, toggles buttons when you press them, copies the dial level to the LED ring, and shows every line sent and received.

**Architecture:** A new `DebugSession` in `designer/debug.py` holds one `HControlClient` per server. It finds controls from the keypad's descriptor and logs every raw line through a new `on_line` hook on the client. The server exposes connect and disconnect routes and a Server-Sent Events stream. A new tab in the drawer starts and stops the session and shows the stream.

**Tech Stack:** Python 3 standard library (`http.server`, `threading`, `queue`), `unittest`, plain ES modules in the browser, and `node --test` for the JavaScript tests.

**Spec:** `docs/superpowers/specs/2026-10-09-debug-mode-design.md`

## Global Constraints

- No new dependencies, in Python or JavaScript.
- Pressing a button flips `OFF` ↔ `ON`. `RELEASE` changes nothing, and a button in `Alt` goes to `ON`.
- Pushing the dial is logged only. It never changes pages.
- There's no LED ring resend timer, no automatic reconnect, no descriptor cache, and no mirroring on the on-screen keypad.
- The tab never reads the open project.
- Log entries are `{"seq", "time", "kind", "text"}`, where `kind` is `send`, `receive`, `note`, `error`, or `status`. `time` is `hh:mm:ss.mmm`.
- The server buffer keeps 500 entries. A listener can fall 1,000 entries behind before it's dropped. The page keeps 2,000 rows.
- The SSE stream sends a keepalive comment after 15 seconds with no entries.
- User-facing text and comments follow the Google developer documentation style: second person, active voice, present tense.
- Commit messages carry no `Co-Authored-By` or other Claude or Anthropic trailer.
- Run the Python tests with `python -m unittest discover -s tests -t .` and the JavaScript tests with `npm run test:designer`.

**One addition to the spec:** the SSE stream starts with an `event: hello` message whose data is `{"boot": "<id>", "status": {...}}`. `boot` changes each time the server starts, so the page knows when to reset its `seq` tracking. `status` gives the page the current connection state even after the buffer has dropped the last `status` entry.

## Review Focus

1. **Disconnecting while a press is being handled.** The event handler is mid-request when you click **Disconnect**. Disconnecting must return within a few seconds, and it must not log a spurious error. This is covered in Task 2 by `test_disconnect_while_handling_a_press_returns_quickly`.
2. **Connecting twice without disconnecting.** The first connection must close, and its late `on_disconnect` callback must not log "Connection closed by the keypad". This is covered in Task 2 by `test_connecting_again_replaces_the_session_quietly`.
3. **A model with no LED ring path,** or a design where it's bound to an OMNI device. A dial event must log its level and send nothing. This is covered in Task 2 by `test_dial_without_led_ring_only_logs`.
4. **The page closes or reloads.** The server's stream thread must notice and remove its listener. After a reload, the page must not duplicate rows, and after a server restart it must not hide new rows. These are covered in Task 3 by `test_closed_stream_removes_its_listener`, and in Task 4 by `createLog` tests for `seq` and `boot`.
5. **A raw line with no JSON body,** such as `@exec` or `unsubscribe`. Without a guard, the row highlighter would cut the command short. This is covered in Task 5, where `debugRow` highlights only lines that contain a space.

---

## Before you start

You're on `main`. Create a branch first:

```bash
git checkout -b debug-mode
```

---

### Task 1: Report raw lines from `HControlClient`

**Files:**
- Modify: `hcontrol.py`, in `HControlClient.__init__`, `_send_line`, and `_handle_line`, plus a new `_report` method
- Test: `tests/test_hcontrol_client.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `HControlClient(host, port=DEFAULT_PORT, timeout=5.0, on_disconnect=None, on_line=None)`. Here, `on_line(direction: str, text: str)` is called with `"send"` or `"receive"` and the line without its line feed. The client reports a send before it writes it, while it holds the send lock, so the log order matches the wire order. It reports a receive before it parses it. Exceptions from `on_line` are logged and ignored.

- [ ] **Step 1: Write the failing tests**

Add this class to the end of `tests/test_hcontrol_client.py`. The file already imports `unittest`, `HControlClient`, and `wait_until`. Add `from tests.fake_keypad import FakeKeypad` to the imports.

```python
class LineHookTests(unittest.TestCase):
    def setUp(self):
        self.keypad = FakeKeypad().__enter__()
        self.addCleanup(self.keypad.__exit__, None, None, None)
        self.lines = []
        self.kp = HControlClient("127.0.0.1", self.keypad.port, timeout=1.0,
                                 on_line=lambda direction, text: self.lines.append((direction, text)))
        self.addCleanup(self.kp.close)

    def test_request_and_reply_are_reported(self):
        self.kp.get("/settings/brightness")
        self.assertEqual(self.lines, [
            ("send", 'get {"path":"/settings/brightness"}'),
            ("receive", '@get {"path":"/settings/brightness","value":50}')])

    def test_publish_is_reported_before_its_acknowledgement(self):
        self.kp.subscribe("/page1/button1/action", lambda path, value: None, fmt="string")
        self.lines.clear()
        self.keypad.press("/page1/button1/action", "PUSH")
        self.assertTrue(wait_until(lambda: len(self.lines) == 2))
        line = 'publish {"path":"/page1/button1/action","format":"string","value":"PUSH"}'
        self.assertEqual(self.lines, [("receive", line), ("send", "@" + line)])

    def test_failing_hook_does_not_break_the_connection(self):
        def broken(direction, text):
            raise RuntimeError("broken hook")
        with HControlClient("127.0.0.1", self.keypad.port, timeout=1.0, on_line=broken) as kp:
            with self.assertLogs("hcontrol", "ERROR"):
                self.assertEqual(kp.get("/settings/brightness"), 50)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_hcontrol_client.LineHookTests -v`
Expected: three errors, each `TypeError: HControlClient.__init__() got an unexpected keyword argument 'on_line'`.

- [ ] **Step 3: Implement the hook**

In `hcontrol.py`, change the constructor signature and store the callback:

```python
    def __init__(
        self,
        host: str,
        port: int = DEFAULT_PORT,
        timeout: float = 5.0,
        on_disconnect: Callable[[], None] | None = None,
        on_line: Callable[[str, str], None] | None = None,
    ):
        self.timeout = timeout
        self._on_disconnect = on_disconnect
        self._on_line = on_line
```

Leave the rest of `__init__` as it is. Then extend the class docstring with this paragraph, after the existing one:

```python
    Pass on_line to see every line on the wire: the client calls
    on_line("send", text) or on_line("receive", text), without the line feed.
```

Replace `_send_line`:

```python
    def _send_line(self, line: bytes) -> None:
        text = line.decode("utf-8").rstrip()
        log.debug("-> %s", text)
        with self._send_lock:
            # Report first, so a fast reply can't appear before its request.
            self._report("send", text)
            self._sock.sendall(line)
```

At the top of `_handle_line`, before the existing `log.debug` call, add this line:

```python
        self._report("receive", line)
```

Add this method after `_dispatch_loop`:

```python
    def _report(self, direction: str, text: str) -> None:
        if self._on_line is None:
            return
        try:
            self._on_line(direction, text)
        except Exception:
            log.exception("on_line callback failed")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_hcontrol_client -v`
Expected: all tests pass, including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add hcontrol.py tests/test_hcontrol_client.py
git commit -m "Report every HControl line to an optional on_line callback" -m "The Debug tab needs to show each line sent to and received from a keypad, including the automatic @publish acknowledgements. The callback runs before a line is written or parsed, so the order matches the wire."
```

---

### Task 2: `DebugSession`

**Files:**
- Create: `designer/debug.py`
- Test: `tests/test_designer_debug.py`

**Interfaces:**
- Consumes: `HControlClient(..., on_disconnect=..., on_line=...)` from Task 1, and `walk_descriptor`, `HControlError`, and `DEFAULT_PORT` from `hcontrol`.
- Produces:
  - `DebugSession(port: int = DEFAULT_PORT, timeout: float = 5.0)`, with these members:
    - `.boot: str`
    - `.connect(host: str) -> dict`, which returns the status, or raises `OSError` or `HControlError` and some `ValueError`s
    - `.disconnect() -> dict`
    - `.status() -> dict`, which returns `{"connected": bool, "host": str, "model": str, "version": str}`
    - `.listen() -> Listener`
    - `.unlisten(listener) -> None`
  - `Listener`, with `.queue: queue.Queue` of entry dicts and `.dropped: bool`.
  - Module constants `BUFFER_SIZE = 500` and `LISTENER_LIMIT = 1000`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_designer_debug.py`:

```python
import json
import queue
import time
import unittest
from unittest import mock

from designer import debug
from designer.debug import DebugSession
from hcontrol import HControlError
from tests.fake_keypad import FakeKeypad
from tests.helpers import wait_until

DESCRIPTOR = "descriptor/hornet.json"     # The fake keypad's descriptorlocation.
BOUND = "/page3/button1/action"           # In the descriptor, but not available over HControl.


def descriptor_for(params: dict, extra: tuple[str, ...] = (), skip: tuple[str, ...] = ()) -> bytes:
    """Build a descriptor that lists the fake keypad's parameters.

    The paths in extra come first, so a failing subscription to one of them
    happens before the others.
    """
    rows = [(path, {"value": 0, "enums": ["RELEASE", "PUSH"], "access": "ro"}) for path in extra]
    rows += [(path, param) for path, param in params.items() if path not in skip]
    root: dict = {}
    for path, param in rows:
        *parents, leaf = path.strip("/").split("/")
        node = root
        for key in parents:
            node = node.setdefault(key, {})
        if "enums" in param:
            kind = {".type": "enum", ".enums": param["enums"]}
        else:
            kind = {".type": "string" if isinstance(param["value"], str) else "integer"}
        node[leaf] = {".kind": "param", ".access": param.get("access", "rw"), **kind}
    return json.dumps(root).encode("utf-8")


class DebugSessionTests(unittest.TestCase):
    def setUp(self):
        self.keypad = FakeKeypad().__enter__()
        self.addCleanup(self.keypad.__exit__, None, None, None)
        self.keypad.files[DESCRIPTOR] = descriptor_for(self.keypad.params, extra=(BOUND,))
        self.session = DebugSession(port=self.keypad.port, timeout=1.0)
        self.addCleanup(self.session.disconnect)
        self.listener = self.session.listen()
        self.seen = []

    # -- Helpers -------------------------------------------------------------------

    def entries(self) -> list[dict]:
        while True:
            try:
                self.seen.append(self.listener.queue.get_nowait())
            except queue.Empty:
                return self.seen

    def texts(self, kind: str) -> list[str]:
        return [entry["text"] for entry in self.entries() if entry["kind"] == kind]

    def wait_for_note(self, text: str) -> None:
        self.assertTrue(wait_until(lambda: text in self.texts("note")),
                        f"no note {text!r} in {self.texts('note')}")

    def connect(self) -> dict:
        return self.session.connect("127.0.0.1")

    # -- Connecting --------------------------------------------------------------

    def test_connect_subscribes_to_controls_and_reports_status(self):
        status = self.connect()
        self.assertEqual(status, {"connected": True, "host": "127.0.0.1",
                                  "model": "OMNI-KP-8BV", "version": "1.1.4.0"})
        received = self.keypad.received
        self.assertIn('subscribe {"path":"/page1/button1/action","format":"string"}', received)
        self.assertIn('subscribe {"path":"/page2/dial_button/action","format":"string"}', received)
        self.assertIn('subscribe {"path":"/page1/dial/level"}', received)
        self.assertIn('subscribe {"path":"/settings/currentpage","format":"string"}', received)
        self.assertFalse(any('"/page1/button1/state"' in line for line in received
                             if line.startswith("subscribe ")))
        # 2 pages x (8 buttons + dial button + dial) + current page.
        self.assertIn("Subscribed to 21 controls. Press a button or turn the dial.", self.texts("note"))
        statuses = [json.loads(text) for text in self.texts("status")]
        self.assertEqual(statuses[-1], status)

    def test_unavailable_control_is_logged_and_the_rest_still_subscribe(self):
        self.connect()
        self.assertIn(f"Couldn't subscribe to {BOUND}: unknown path. "
                      "It might be bound to an OMNI device.", self.texts("error"))
        self.assertIn('subscribe {"path":"/page2/dial/level"}', self.keypad.received)

    def test_connect_failure_raises_and_logs(self):
        session = DebugSession(port=1, timeout=1.0)
        listener = session.listen()
        with self.assertRaises(OSError):
            session.connect("127.0.0.1")
        texts = [listener.queue.get_nowait()["text"] for _ in range(listener.queue.qsize())]
        self.assertTrue(any(text.startswith("Couldn't connect to 127.0.0.1") for text in texts), texts)
        self.assertFalse(session.status()["connected"])

    def test_missing_descriptor_raises_and_closes(self):
        del self.keypad.files[DESCRIPTOR]
        with self.assertRaises(HControlError):
            self.connect()
        self.assertFalse(self.session.status()["connected"])
        self.assertTrue(wait_until(lambda: not self.keypad.sessions))

    def test_connecting_again_replaces_the_session_quietly(self):
        self.connect()
        self.connect()
        self.assertTrue(wait_until(lambda: len(self.keypad.sessions) == 1))
        time.sleep(0.2)                    # Let any late on_disconnect run.
        self.assertNotIn(debug.DROPPED, self.texts("note"))
        self.assertTrue(self.session.status()["connected"])

    # -- Buttons -----------------------------------------------------------------

    def test_push_toggles_button_state(self):
        self.connect()
        self.keypad.press("/page1/button3/action", "PUSH")
        self.wait_for_note("Page 1 button 3: OFF → ON")
        self.assertEqual(self.keypad.value("/page1/button3/state"), "ON")
        self.keypad.press("/page1/button3/action", "RELEASE")
        self.keypad.press("/page1/button3/action", "PUSH")
        self.wait_for_note("Page 1 button 3: ON → OFF")
        self.assertEqual(self.keypad.value("/page1/button3/state"), "OFF")

    def test_push_on_alt_button_goes_on(self):
        self.keypad.params["/page2/button1/state"]["value"] = 1      # Alt
        self.connect()
        self.keypad.press("/page2/button1/action", "PUSH")
        self.wait_for_note("Page 2 button 1: Alt → ON")
        self.assertEqual(self.keypad.value("/page2/button1/state"), "ON")

    def test_release_leaves_state_alone(self):
        self.connect()
        self.keypad.press("/page1/button3/action", "RELEASE")
        self.keypad.press("/page1/dial/level", 5)           # Handled after the release.
        self.wait_for_note("Page 1 dial: 5")
        self.assertFalse(any(line.startswith('set {"path":"/page1/button3/state"')
                             for line in self.keypad.received))

    # -- Dial --------------------------------------------------------------------

    def test_dial_sets_led_ring(self):
        self.connect()
        self.keypad.press("/page2/dial/level", -40)
        self.wait_for_note("Page 2 dial: -40")
        self.assertEqual(self.keypad.value("/page2/ledring/level"), -40)

    def test_clamped_led_ring_level_is_noted(self):
        self.keypad.params["/page1/ledring/level"]["max"] = 5
        self.connect()
        self.keypad.press("/page1/dial/level", 8)
        self.wait_for_note("Page 1 dial: 8 (LED ring 5)")

    def test_dial_without_led_ring_only_logs(self):
        self.keypad.files[DESCRIPTOR] = descriptor_for(
            self.keypad.params, skip=("/page1/ledring/level",))
        self.connect()
        self.keypad.press("/page1/dial/level", 3)
        self.wait_for_note("Page 1 dial: 3")
        self.assertFalse(any(line.startswith('set {"path":"/page1/ledring/level"')
                             for line in self.keypad.received))

    def test_dial_button_and_page_changes_are_noted(self):
        self.connect()
        self.keypad.press("/page1/dial_button/action", "PUSH")
        self.wait_for_note("Page 1 dial button: PUSH")
        self.keypad.press("/settings/currentpage", "Page 2")
        self.wait_for_note("Page changed to Page 2")
        self.assertFalse(any(line.startswith('set {"path":"/settings/currentpage"')
                             for line in self.keypad.received))

    # -- Log ---------------------------------------------------------------------

    def test_raw_lines_reach_listener_in_order(self):
        self.connect()
        self.keypad.press("/page1/button1/action", "PUSH")
        self.wait_for_note("Page 1 button 1: OFF → ON")
        wire = [(entry["kind"], entry["text"]) for entry in self.entries()
                if entry["kind"] in ("send", "receive")]
        line = 'publish {"path":"/page1/button1/action","format":"string","value":"PUSH"}'
        index = wire.index(("receive", line))
        self.assertEqual(wire[index + 1], ("send", "@" + line))
        self.assertEqual(wire[0], ("send", 'get {"path":"/configuration/device/model","format":"string"}'))

    def test_entries_are_numbered_and_timed(self):
        self.connect()
        entries = self.entries()
        self.assertEqual([entry["seq"] for entry in entries], list(range(1, len(entries) + 1)))
        self.assertRegex(entries[0]["time"], r"^\d\d:\d\d:\d\d\.\d{3}$")

    def test_later_listener_gets_the_buffer_first(self):
        self.connect()
        late = self.session.listen()
        first = late.queue.get_nowait()
        self.assertEqual((first["seq"], first["text"]), (1, "Connecting to 127.0.0.1…"))

    def test_slow_listener_is_dropped(self):
        with mock.patch.object(debug, "LISTENER_LIMIT", 3):
            slow = self.session.listen()
            self.connect()
        self.assertTrue(slow.dropped)
        self.session.unlisten(slow)                     # Safe after a drop.

    # -- Disconnecting -----------------------------------------------------------

    def test_keypad_dropping_the_connection_is_logged(self):
        self.connect()
        self.keypad.disconnect_all()
        self.wait_for_note(debug.DROPPED)
        self.assertFalse(self.session.status()["connected"])
        self.assertFalse(json.loads(self.texts("status")[-1])["connected"])

    def test_disconnect_is_safe_twice(self):
        self.connect()
        self.assertFalse(self.session.disconnect()["connected"])
        self.session.disconnect()
        self.assertEqual(self.texts("note").count("Disconnected."), 1)
        self.assertNotIn(debug.DROPPED, self.texts("note"))

    def test_disconnect_while_handling_a_press_returns_quickly(self):
        self.connect()
        self.keypad.delay["get"] = 0.5
        self.keypad.press("/page1/button1/action", "PUSH")
        self.assertTrue(wait_until(lambda: any(
            entry["text"].startswith('get {"path":"/page1/button1/state"') for entry in self.entries())))
        start = time.monotonic()
        self.session.disconnect()
        self.assertLess(time.monotonic() - start, 3.0)
        self.assertFalse(self.session.status()["connected"])
        time.sleep(0.6)
        texts = [entry["text"] for entry in self.entries()]
        self.assertEqual(self.texts("error"), [f"Couldn't subscribe to {BOUND}: unknown path. "
                                               "It might be bound to an OMNI device."])
        self.assertIn("Disconnected.", texts)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_designer_debug -v`
Expected: `ModuleNotFoundError: No module named 'designer.debug'`.

- [ ] **Step 3: Implement `designer/debug.py`**

```python
"""Debug mode: a live HControl session for checking a keypad by hand.

The Debug tab starts and stops one session per server. While it runs, the
session toggles a button's feedback state between OFF and ON when you press
it, copies each dial level to the same page's LED ring, and logs every line
it sends and receives. It finds the controls from the keypad's descriptor,
so it works without a project.
"""

from __future__ import annotations

import collections
import datetime
import json
import queue
import re
import secrets
import threading
from typing import Any

from hcontrol import DEFAULT_PORT, HControlClient, HControlError, walk_descriptor

BUFFER_SIZE = 500          # Entries a new listener receives first.
LISTENER_LIMIT = 1000      # Entries a listener can fall behind before it's dropped.

CURRENT_PAGE = "/settings/currentpage"
DROPPED = ("Connection closed by the keypad. Deploying a design does this. "
           "Click Connect to start again.")

_BUTTON = re.compile(r"/page(\d+)/button(\d+)/action")
_DIAL = re.compile(r"/page(\d+)/dial/level")
_DIAL_BUTTON = re.compile(r"/page(\d+)/dial_button/action")


class Listener:
    """One page's copy of the log. The server streams entries from queue."""

    def __init__(self, entries: list[dict]):
        self.queue: queue.Queue = queue.Queue(LISTENER_LIMIT)
        self.dropped = False                # Set when the listener fell too far behind.
        for entry in entries:
            self.queue.put_nowait(entry)


class DebugSession:
    """A connection that echoes button presses and the dial, and logs it all."""

    def __init__(self, port: int = DEFAULT_PORT, timeout: float = 5.0):
        self.port = port
        self.timeout = timeout
        self.boot = secrets.token_hex(4)    # Changes when the server restarts.
        self._lock = threading.Lock()
        self._connect_lock = threading.Lock()   # One connect or disconnect at a time.
        self._client: HControlClient | None = None
        self._generation = 0                # Increases whenever a client is replaced.
        self._host = self._model = self._version = ""
        self._paths: frozenset[str] = frozenset()
        self._seq = 0
        self._buffer: collections.deque = collections.deque(maxlen=BUFFER_SIZE)
        self._listeners: list[Listener] = []

    # -- Connection ----------------------------------------------------------------

    def status(self) -> dict:
        with self._lock:
            return {"connected": self._client is not None, "host": self._host,
                    "model": self._model, "version": self._version}

    def connect(self, host: str) -> dict:
        """Connect, subscribe to every control, and return the status.

        Closes the current session first. Raises OSError or HControlError
        when the keypad can't be reached or doesn't send its descriptor.
        """
        with self._connect_lock:
            self._close("Disconnected.")
            with self._lock:
                generation = self._generation
            self._log("note", f"Connecting to {host}…")
            try:
                client = HControlClient(
                    host, self.port, timeout=self.timeout, on_line=self._log,
                    on_disconnect=lambda: self._dropped(generation))
            except OSError as error:
                self._log("error", f"Couldn't connect to {host}: {error}")
                raise
            with self._lock:
                self._client, self._host, self._model, self._version = client, host, "", ""
            try:
                self._start(client, host, generation)
            except (OSError, HControlError, ValueError) as error:
                self._log("error", f"Couldn't start debugging {host}: {error}")
                self._close(None)
                raise
            return self.status()

    def disconnect(self) -> dict:
        """Close the session, if one is open, and return the status."""
        with self._connect_lock:
            self._close("Disconnected.")
        return self.status()

    def _start(self, client: HControlClient, host: str, generation: int) -> None:
        model = str(client.get("/configuration/device/model", fmt="string"))
        version = str(client.get("/configuration/device/version", fmt="string"))
        with self._lock:
            self._model, self._version = model, version
        self._send_status()
        self._log("note", f"Connected to {model} at {host}, firmware {version}. "
                          "Downloading the descriptor…")
        location = client.get("/configuration/device/descriptorlocation", fmt="string")
        params = {info.path: info for info in walk_descriptor(json.loads(client.get_file(location)))
                  if info.kind == "param"}
        self._paths = frozenset(params)
        count = 0
        for path, info in params.items():
            if not (path.endswith("/action") or path.endswith("/dial/level") or path == CURRENT_PAGE):
                continue
            try:
                client.subscribe(path, lambda p, v: self._on_event(client, generation, p, v),
                                 fmt="string" if info.type == "enum" else None)
            except HControlError as error:
                self._log("error", f"Couldn't subscribe to {path}: {error.message}. "
                                   "It might be bound to an OMNI device.")
                continue
            count += 1
        self._log("note", f"Subscribed to {count} controls. Press a button or turn the dial.")

    def _close(self, message: str | None) -> None:
        with self._lock:
            client, self._client = self._client, None
            self._generation += 1           # Ignore that client's late callbacks.
        if client is None:
            return
        client.close()                      # Outside the lock: handlers may be logging.
        if message:
            self._log("note", message)
        self._send_status()

    def _dropped(self, generation: int) -> None:
        """Runs on the client's reader thread when the keypad closes the connection."""
        with self._lock:
            if generation != self._generation or self._client is None:
                return
            client, self._client = self._client, None
            self._generation += 1
        client.close()
        self._log("note", DROPPED)
        self._send_status()

    # -- Events ------------------------------------------------------------------

    def _on_event(self, client: HControlClient, generation: int, path: str, value: Any) -> None:
        """Runs on the client's dispatcher thread for each publish."""
        try:
            self._respond(client, path, value)
        except (OSError, HControlError) as error:
            with self._lock:
                current = generation == self._generation
            if current:
                self._log("error", f"Couldn't answer {path}: {error}")

    def _respond(self, client: HControlClient, path: str, value: Any) -> None:
        if match := _BUTTON.fullmatch(path):
            page, button = match.groups()
            state = f"/page{page}/button{button}/state"
            if value != "PUSH" or state not in self._paths:
                return
            current = client.get(state, fmt="string")
            new = "OFF" if current == "ON" else "ON"
            client.set(state, new, fmt="string")
            self._log("note", f"Page {page} button {button}: {current} → {new}")
        elif match := _DIAL.fullmatch(path):
            page = match[1]
            ring = f"/page{page}/ledring/level"
            if ring not in self._paths:
                self._log("note", f"Page {page} dial: {value}")
                return
            applied = client.set(ring, value)
            clamped = "" if applied == value else f" (LED ring {applied})"
            self._log("note", f"Page {page} dial: {value}{clamped}")
        elif match := _DIAL_BUTTON.fullmatch(path):
            self._log("note", f"Page {match[1]} dial button: {value}")
        elif path == CURRENT_PAGE:
            self._log("note", f"Page changed to {value}")

    # -- Log ---------------------------------------------------------------------

    def listen(self) -> Listener:
        """Start a listener. Its queue starts with the buffered entries."""
        with self._lock:
            listener = Listener(list(self._buffer))
            self._listeners.append(listener)
            return listener

    def unlisten(self, listener: Listener) -> None:
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    def _send_status(self) -> None:
        self._log("status", json.dumps(self.status()))

    def _log(self, kind: str, text: str) -> None:
        """Add an entry. on_line calls this with kind "send" or "receive"."""
        now = datetime.datetime.now()
        with self._lock:
            self._seq += 1
            entry = {"seq": self._seq, "time": f"{now:%H:%M:%S}.{now.microsecond // 1000:03d}",
                     "kind": kind, "text": text}
            self._buffer.append(entry)
            for listener in list(self._listeners):
                try:
                    listener.queue.put_nowait(entry)
                except queue.Full:
                    listener.dropped = True     # Its page reconnects and replays the buffer.
                    self._listeners.remove(listener)
```

The `Listener` reads `LISTENER_LIMIT` when it's created, so `mock.patch.object(debug, "LISTENER_LIMIT", 3)` in the test applies to listeners created inside the patch.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_designer_debug -v`
Expected: all 19 tests pass.

If `test_disconnect_while_handling_a_press_returns_quickly` reports an extra `Couldn't answer` error, check two things: that `_close` increments `_generation` before `client.close()`, and that `_on_event` compares against it.

- [ ] **Step 5: Run the whole Python suite**

Run: `python -m unittest discover -s tests -t .`
Expected: every test passes.

- [ ] **Step 6: Commit**

```bash
git add designer/debug.py tests/test_designer_debug.py
git commit -m "Add a debug session that echoes button presses and the dial" -m "DebugSession connects to a keypad, reads its descriptor, and subscribes to every button, dial, dial button, and the current page. A push toggles the button between OFF and ON, and the dial level goes to the same page's LED ring. Every line on the wire, plus plain notes, goes into a numbered log that listeners can stream."
```

---

### Task 3: Server routes and the event stream

**Files:**
- Modify: `designer/server.py`: the imports, `make_server`, `_Handler` (a `debug` attribute, `KEEPALIVE`, routes, and a new `_events` method), and `main`
- Test: `tests/test_designer_server.py`

**Interfaces:**
- Consumes: `DebugSession`, `Listener`, `.boot`, `.connect`, `.disconnect`, `.status`, `.listen`, and `.unlisten` from Task 2.
- Produces these HTTP routes for Task 5:
  - `POST /api/debug/connect` with body `{"host": "..."}` returns the status JSON. Errors follow the existing mapping. A failure to reach the keypad is a 502 with `{"error": "couldn't talk to the keypad at <host>: ..."}`, and a missing host is a 400.
  - `POST /api/debug/disconnect` returns the status JSON.
  - `GET /api/debug/events` returns `text/event-stream`. It first sends `event: hello` with `data: {"boot": str, "status": {...}}`. Then it sends one `data: <entry json>` per entry, and a `: keepalive` comment after `KEEPALIVE` seconds with no entries.
  - `server.RequestHandlerClass.debug` is the server's `DebugSession`.

- [ ] **Step 1: Write the failing tests**

Add `import http.client` and `from designer.server import _Handler` to the imports at the top of `tests/test_designer_server.py`. The file already imports `make_server`, so extend that line to `from designer.server import _Handler, make_server`. It also already imports `wait_until`; if not, add `from tests.helpers import FIXTURES, make_png, wait_until`. Also import the descriptor helper:

```python
from tests.test_designer_debug import DESCRIPTOR, descriptor_for
```

Add this class at the end of the file, before any `if __name__ == "__main__":` block:

```python
def next_event(response) -> tuple[str, dict]:
    """Read one server-sent event, skipping keepalive comments."""
    event, data = "message", None
    while True:
        line = response.readline().decode("utf-8").rstrip("\r\n")
        if not line:
            if data is not None:
                return event, json.loads(data)
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(": ")
        if field == "event":
            event = value
        elif field == "data":
            data = value


class DebugRouteTests(unittest.TestCase):
    def setUp(self):
        self.keypad = FakeKeypad().__enter__()
        self.addCleanup(self.keypad.__exit__, None, None, None)
        self.keypad.files[DESCRIPTOR] = descriptor_for(self.keypad.params)
        tmp = Path(tempfile.mkdtemp())
        zip_path = tmp / "g.zip"
        with zipfile.ZipFile(zip_path, "w") as archive:
            archive.writestr("Keypad Graphics/Squared/Squared_Black.png", make_png())
        ops = KeypadOps(tmp / "backups", port=self.keypad.port, timeout=2)
        self.server = make_server(0, ops, Library(tmp / "library"), GraphicsZip(zip_path),
                                  ProjectStore(tmp / "projects"))
        self.debug = self.server.RequestHandlerClass.debug
        self.addCleanup(self.debug.disconnect)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_address[1]

    def post(self, path, body=None):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}", method="POST",
            data=json.dumps(body or {}).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.loads(error.read())

    def open_events(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        self.addCleanup(conn.close)
        conn.request("GET", "/api/debug/events")
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers["Content-Type"], "text/event-stream")
        self.assertEqual(response.headers["Cache-Control"], "no-cache")
        return conn, response

    def test_connect_and_disconnect(self):
        status, body = self.post("/api/debug/connect", {"host": "127.0.0.1"})
        self.assertEqual((status, body["connected"], body["model"]), (200, True, "OMNI-KP-8BV"))
        status, body = self.post("/api/debug/disconnect")
        self.assertEqual((status, body["connected"]), (200, False))

    def test_connect_needs_a_host(self):
        status, body = self.post("/api/debug/connect", {})
        self.assertEqual((status, body["error"]), (400, "enter the keypad's IP address"))

    def test_connect_failure_names_the_keypad(self):
        del self.keypad.files[DESCRIPTOR]
        status, body = self.post("/api/debug/connect", {"host": "127.0.0.1"})
        self.assertEqual(status, 502)
        self.assertTrue(body["error"].startswith("couldn't talk to the keypad at 127.0.0.1"), body)
        self.assertFalse(self.debug.status()["connected"])

    def test_stream_says_hello_then_sends_entries(self):
        _, response = self.open_events()
        event, hello = next_event(response)
        self.assertEqual(event, "hello")
        self.assertEqual(hello["boot"], self.debug.boot)
        self.assertFalse(hello["status"]["connected"])
        self.post("/api/debug/connect", {"host": "127.0.0.1"})
        texts = []
        while not any(text.startswith("Subscribed to") for text in texts):
            event, entry = next_event(response)
            self.assertEqual(event, "message")
            texts.append(entry["text"])
        self.assertEqual(texts[0], "Connecting to 127.0.0.1…")

    def test_stream_refuses_other_hosts(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        self.addCleanup(conn.close)
        conn.request("GET", "/api/debug/events", headers={"Host": "evil.example"})
        self.assertEqual(conn.getresponse().status, 403)

    def test_closed_stream_removes_its_listener(self):
        with mock.patch.object(_Handler, "KEEPALIVE", 0.05):
            conn, response = self.open_events()
            next_event(response)
            self.assertEqual(len(self.debug._listeners), 1)
            response.close()
            conn.close()
            self.assertTrue(wait_until(lambda: not self.debug._listeners, timeout=5))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_designer_server.DebugRouteTests -v`
Expected: errors with `AttributeError: type object 'Handler' has no attribute 'debug'`.

- [ ] **Step 3: Implement the routes**

In `designer/server.py`, add `import queue` to the standard-library imports. Then add this line after the `from designer.assets import GraphicsZip` line:

```python
from designer.debug import DebugSession  # noqa: E402
```

In `make_server`, after `Handler.backup_models = {}`, add this line:

```python
    Handler.debug = DebugSession(port=ops.port, timeout=ops.timeout)
```

In `_Handler`, extend the class attributes:

```python
    backup_models: dict[str, str | None]    # Backup file name -> model. Backups don't change.
    debug: DebugSession
    KEEPALIVE = 15.0                        # Seconds of quiet before the event stream sends a comment.
```

In `_route`, add these routes just before `if route == ("GET", "models"):`:

```python
        if route == ("POST", "debug", "connect"):
            return self._json(self.debug.connect(self._host_from(self._body())))
        if route == ("POST", "debug", "disconnect"):
            return self._json(self.debug.disconnect())
        if route == ("GET", "debug", "events"):
            return self._events()
```

Add this method after `_bytes`:

```python
    def _events(self) -> None:
        """Stream the debug log as server-sent events until the page closes."""
        listener = self.debug.listen()
        self.close_connection = True
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            hello = {"boot": self.debug.boot, "status": self.debug.status()}
            self._send_event(f"event: hello\ndata: {json.dumps(hello)}\n\n")
            while not listener.dropped:
                try:
                    entry = listener.queue.get(timeout=self.KEEPALIVE)
                except queue.Empty:
                    self._send_event(": keepalive\n\n")
                    continue
                self._send_event(f"data: {json.dumps(entry)}\n\n")
        except OSError:
            pass                                # The page closed the stream.
        finally:
            self.debug.unlisten(listener)

    def _send_event(self, text: str) -> None:
        self.wfile.write(text.encode("utf-8"))
        self.wfile.flush()
```

In `main`, end the session when the server stops. Change the `finally` block to this:

```python
    finally:
        server.RequestHandlerClass.debug.disconnect()
        server.server_close()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_designer_server -v`
Expected: all tests pass, including the six new ones.

- [ ] **Step 5: Run the whole Python suite**

Run: `python -m unittest discover -s tests -t .`
Expected: every test passes.

- [ ] **Step 6: Commit**

```bash
git add designer/server.py tests/test_designer_server.py
git commit -m "Serve the debug session over HTTP and server-sent events" -m "POST /api/debug/connect and /api/debug/disconnect start and stop the session. GET /api/debug/events streams its log: a hello event with the server's boot id and the current status, then one event per entry, with a keepalive comment when it's quiet."
```

---

### Task 4: Log helpers for the page

**Files:**
- Create: `designer/static/debug.js`
- Test: `designer/static/debug.test.mjs`

**Interfaces:**
- Consumes: the entry shape from Task 2.
- Produces:
  - `MAX_ROWS = 2000`.
  - `arrowFor(kind) -> "→" | "←" | ""`.
  - `copyText(entries) -> string`, with one line per entry: `hh:mm:ss.mmm -> text`. The marks are `->` for `send`, `<-` for `receive`, `//` for `note`, and `!!` for `error`.
  - `statusText(status, connecting = "") -> string`.
  - `createLog(limit = MAX_ROWS)`, which returns an object with these members:
    - `boot`, `lastSeq`, and `entries`.
    - `start(boot) -> boolean`, which resets and returns `true` when `boot` changed.
    - `accept(entry) -> boolean`, which returns `false` for a `seq` it has already seen.
    - `add(entry) -> number`, which returns how many old rows fell off.
    - `clear()`, which keeps `lastSeq`.

- [ ] **Step 1: Write the failing tests**

Create `designer/static/debug.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ROWS, arrowFor, copyText, statusText, createLog } from "./debug.js";

const entry = (seq, kind = "note", text = `entry ${seq}`) => ({ seq, time: "14:03:22.517", kind, text });

test("arrowFor marks sent and received lines only", () => {
  assert.equal(arrowFor("send"), "→");
  assert.equal(arrowFor("receive"), "←");
  assert.equal(arrowFor("note"), "");
  assert.equal(arrowFor("error"), "");
});

test("copyText writes one line per entry with a text mark", () => {
  assert.equal(copyText([
    entry(1, "send", 'get {"path":"/a"}'),
    entry(2, "receive", '@get {"path":"/a","value":1}'),
    entry(3, "note", "Page 1 dial: 5"),
    entry(4, "error", "Couldn't answer /a"),
  ]), [
    '14:03:22.517 -> get {"path":"/a"}',
    '14:03:22.517 <- @get {"path":"/a","value":1}',
    "14:03:22.517 // Page 1 dial: 5",
    "14:03:22.517 !! Couldn't answer /a",
  ].join("\n"));
  assert.equal(copyText([]), "");
});

test("statusText describes each connection state", () => {
  assert.equal(statusText({ connected: false }), "Not connected");
  assert.equal(statusText(undefined), "Not connected");
  assert.equal(statusText({ connected: false }, "10.0.0.5"), "Connecting to 10.0.0.5…");
  assert.equal(statusText({ connected: true, host: "10.0.0.5", model: "", version: "" }), "Connected to 10.0.0.5");
  assert.equal(statusText({ connected: true, host: "10.0.0.5", model: "OMNI-KP-8BV", version: "1.1.4.0" }),
    "Connected to OMNI-KP-8BV at 10.0.0.5 · firmware 1.1.4.0");
});

test("createLog skips entries it has already seen", () => {
  const log = createLog();
  log.start("a");
  assert.equal(log.accept(entry(1)), true);
  assert.equal(log.accept(entry(2)), true);
  assert.equal(log.accept(entry(1)), false);
  assert.equal(log.accept(entry(2)), false);
  assert.equal(log.accept(entry(3)), true);
});

test("createLog starts over when the server restarts", () => {
  const log = createLog();
  assert.equal(log.start("a"), true);
  log.accept(entry(5));
  log.add(entry(5));
  assert.equal(log.start("a"), false);
  assert.equal(log.accept(entry(5)), false);
  assert.equal(log.start("b"), true);
  assert.deepEqual(log.entries, []);
  assert.equal(log.accept(entry(1)), true);
});

test("createLog drops the oldest rows past its limit", () => {
  const log = createLog(3);
  assert.deepEqual([1, 2, 3].map((n) => log.add(entry(n))), [0, 0, 0]);
  assert.equal(log.add(entry(4)), 1);
  assert.deepEqual(log.entries.map((e) => e.seq), [2, 3, 4]);
  assert.equal(MAX_ROWS, 2000);
});

test("clear empties the rows but remembers what it has seen", () => {
  const log = createLog();
  log.start("a");
  log.accept(entry(1));
  log.add(entry(1));
  log.clear();
  assert.deepEqual(log.entries, []);
  assert.equal(log.accept(entry(1)), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:designer`
Expected: `debug.test.mjs` fails with `Cannot find module` for `./debug.js`. The other test files still pass.

- [ ] **Step 3: Implement `designer/static/debug.js`**

```js
// The Debug tab's log as plain data, no DOM. The server streams entries
// { seq, time, kind, text }, where kind is send, receive, note, error or
// status, and seq counts up from 1 each time the server starts.

export const MAX_ROWS = 2000;

const ARROWS = { send: "→", receive: "←" };
const COPY_MARKS = { send: "->", receive: "<-", note: "//", error: "!!" };

export const arrowFor = (kind) => ARROWS[kind] || "";

export function copyText(entries) {
  return entries.map((e) => `${e.time} ${COPY_MARKS[e.kind]} ${e.text}`).join("\n");
}

export function statusText(status, connecting = "") {
  if (connecting) return `Connecting to ${connecting}…`;
  if (!status?.connected) return "Not connected";
  if (!status.model) return `Connected to ${status.host}`;
  return `Connected to ${status.model} at ${status.host} · firmware ${status.version}`;
}

// The rows to show. accept() filters out entries a reconnecting stream
// replays; start() resets when the server has restarted.
export function createLog(limit = MAX_ROWS) {
  const log = {
    boot: "",
    lastSeq: 0,
    entries: [],
    start(boot) {
      if (boot === log.boot) return false;
      log.boot = boot;
      log.lastSeq = 0;
      log.entries = [];
      return true;
    },
    accept(entry) {
      if (entry.seq <= log.lastSeq) return false;
      log.lastSeq = entry.seq;
      return true;
    },
    add(entry) {
      log.entries.push(entry);
      const over = Math.max(0, log.entries.length - limit);
      log.entries.splice(0, over);
      return over;
    },
    clear() {
      log.entries = [];
    },
  };
  return log;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:designer`
Expected: every test passes, including the seven in `debug.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add designer/static/debug.js designer/static/debug.test.mjs
git commit -m "Add log helpers for the Debug tab" -m "Plain functions for the arrow and copy marks, the connection status line, and a row list that skips replayed entries, resets when the server restarts, and keeps the newest 2,000 rows."
```

---

### Task 5: The Debug tab

**Files:**
- Modify: `designer/static/index.html`, in the drawer section (lines 75–96)
- Modify: `designer/static/style.css`, in the drawer rules (lines 348–391)
- Modify: `designer/static/app.js`: the imports, `setDrawerOpen`, and `wireDrawer`, a new Debug section after `onCopy`, and the startup call near line 1621
- Modify: `README.md`, in "Program the keypad from your own code"

**Interfaces:**
- Consumes: the routes from Task 3 and the helpers from Task 4. From `app.js`, it uses `$`, `icon`, `highlight`, `escapeHtml`, `host`, `needHost`, `setStatus`, `remember`, `recall`, and `sendJson`.
- Produces: the user interface. Nothing else depends on it.

- [ ] **Step 1: Change the drawer markup**

In `designer/static/index.html`, replace the `drawer-bar` div and add the Debug body after `drawer-body`. The section becomes this:

```html
    <section id="drawer" class="drawer" aria-label="HControl">
      <div id="drawer-resize" class="drawer-resize" title="Drag to resize" aria-hidden="true"></div>
      <div class="drawer-bar">
        <div class="drawer-tabs" role="tablist">
          <button id="drawer-toggle" type="button" role="tab" class="drawer-tab current" aria-selected="true"
            aria-expanded="true" aria-controls="drawer-body"><span class="chev"></span>HControl</button>
          <button id="debug-tab" type="button" role="tab" class="drawer-tab" aria-selected="false"
            aria-expanded="true" aria-controls="debug-body"><span class="chev"></span>Debug<span id="debug-dot" class="debug-dot" title="Connected" hidden></span></button>
        </div>
        <span id="drawer-path" class="drawer-path hc-only"></span>
        <span id="debug-status" class="debug-status debug-only" role="status">Not connected</span>
        <span class="grow"></span>
        <span id="drawer-warn" class="drawer-warn hc-only" hidden><span class="chip-check">Check</span>Unsaved page changes. Page numbers may change when you save and deploy.</span>
        <button id="copy-all" type="button" class="drawer-btn hc-only" title="Copy every line you send and receive">Copy all</button>
        <button id="debug-connect" type="button" class="drawer-btn debug-only" title="Connect to the keypad in the header, and toggle buttons and the LED ring as you use it">Connect</button>
        <button id="debug-clear" type="button" class="drawer-btn debug-only" title="Clear the log on screen">Clear</button>
        <button id="debug-copy" type="button" class="drawer-btn debug-only" title="Copy the log" disabled>Copy all</button>
      </div>
      <div id="drawer-body" class="drawer-body hc-only">
        <div class="drawer-pane code-pane">
          <div class="pane-title">Strings <span class="pane-sub">→ send · ← expect</span></div>
          <div id="hc-code" class="hc-code" role="list"></div>
        </div>
        <div class="drawer-pane notes-pane">
          <div class="pane-title">Notes</div>
          <div id="hc-notes" class="hc-notes"></div>
        </div>
      </div>
      <div id="debug-body" class="debug-body debug-only">
        <div class="pane-title">Log <span class="pane-sub">→ sent · ← received</span></div>
        <div id="debug-log" class="hc-code debug-log" role="log"></div>
      </div>
    </section>
```

- [ ] **Step 2: Add the styles**

In `designer/static/style.css`, add these rules after the `.drawer.collapsed .drawer-tab` rule:

```css
.drawer-tabs { display: flex; height: 100%; }
.drawer-tab:not(.current) { border-top-color: transparent; background: transparent; color: #cccccc; }
.drawer-tab .chev { display: none; }
.drawer-tab.current .chev { display: inline-flex; }
.debug-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
.drawer[data-tab="debug"] .hc-only, .drawer:not([data-tab="debug"]) .debug-only { display: none; }
.debug-status { min-width: 0; font: 12px var(--mono); color: #9cdcfe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

Then add these rules after the `.drawer.collapsed .drawer-body, …` rule:

```css
.drawer.collapsed .debug-body, .drawer.collapsed .debug-status { display: none; }
.debug-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.debug-log .ln { width: 112px; }
.dbg-note .src { color: #6a9955; }
.dbg-error .src { color: #f48771; }
```

- [ ] **Step 3: Switch tabs in `app.js`**

Add the import after the `hcontrol.js` import:

```js
import { arrowFor, copyText, statusText, createLog } from "./debug.js";
```

Replace `setDrawerOpen`:

```js
function setDrawerOpen(open) {
  $("drawer").classList.toggle("collapsed", !open);
  for (const tab of document.querySelectorAll(".drawer-tab")) tab.setAttribute("aria-expanded", open);
  for (const chev of document.querySelectorAll(".drawer-tab .chev")) chev.innerHTML = icon(open ? "chevron-down" : "chevron-up", 14);
  remember("designer.drawer", open ? "open" : "closed");
}

// tab is "hcontrol" or "debug".
function setDrawerTab(tab) {
  $("drawer").dataset.tab = tab;
  for (const [id, name] of [["drawer-toggle", "hcontrol"], ["debug-tab", "debug"]]) {
    $(id).classList.toggle("current", tab === name);
    $(id).setAttribute("aria-selected", tab === name);
  }
  remember("designer.drawerTab", tab);
}

// Clicking the open tab hides or shows the drawer; clicking the other one switches to it.
function onDrawerTab(tab) {
  const collapsed = $("drawer").classList.contains("collapsed");
  if ($("drawer").dataset.tab === tab) return setDrawerOpen(collapsed);
  setDrawerTab(tab);
  setDrawerOpen(true);
}
```

In `wireDrawer`, replace this line:

```js
  $("drawer-toggle").addEventListener("click", () => setDrawerOpen($("drawer").classList.contains("collapsed")));  $("hc-code").addEventListener("click", onCopy);
```

with these lines:

```js
  setDrawerTab(recall("designer.drawerTab") === "debug" ? "debug" : "hcontrol");
  $("drawer-toggle").addEventListener("click", () => onDrawerTab("hcontrol"));
  $("debug-tab").addEventListener("click", () => onDrawerTab("debug"));
  $("hc-code").addEventListener("click", onCopy);
```

- [ ] **Step 4: Wire the Debug tab in `app.js`**

Add this section right after the `onCopy` function:

```js
// -- Debug tab --------------------------------------------------------------------------

const debugLog = createLog();
let debugStatus = { connected: false };
let debugConnecting = "";          // The address of a connect in progress.

function renderDebugStatus() {
  $("debug-status").textContent = statusText(debugStatus, debugConnecting);
  $("debug-connect").textContent = debugStatus.connected ? "Disconnect" : "Connect";
  $("debug-connect").disabled = Boolean(debugConnecting);
  $("debug-dot").hidden = !debugStatus.connected;
  $("debug-copy").disabled = !debugLog.entries.length;
}

function debugRow(entry) {
  const row = document.createElement("div");
  row.className = `code-row dbg-${entry.kind}`;
  row.setAttribute("role", "listitem");
  // highlight() needs a JSON body; lines such as "@exec" have none.
  const wire = entry.kind === "send" || entry.kind === "receive";
  const text = wire && entry.text.includes(" ") ? highlight(entry.text) : escapeHtml(entry.text);
  row.innerHTML = `<span class="ln">${escapeHtml(entry.time)}</span>
    <span class="dir${entry.kind === "send" ? " send" : ""}">${arrowFor(entry.kind)}</span>
    <span class="src">${text}</span>`;
  return row;
}

function onDebugEntry(entry) {
  if (!debugLog.accept(entry)) return;
  if (entry.kind === "status") {
    debugStatus = JSON.parse(entry.text);
    return renderDebugStatus();
  }
  const box = $("debug-log");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  const dropped = debugLog.add(entry);
  for (let i = 0; i < dropped; i++) box.firstElementChild?.remove();
  box.append(debugRow(entry));
  if (atBottom) box.scrollTop = box.scrollHeight;
  $("debug-copy").disabled = false;
}

// The stream stays open while the page is; EventSource reconnects by itself.
function openDebugEvents() {
  const events = new EventSource("/api/debug/events");
  events.addEventListener("hello", (event) => {
    const hello = JSON.parse(event.data);
    if (debugLog.start(hello.boot)) $("debug-log").replaceChildren();
    debugStatus = hello.status;
    renderDebugStatus();
  });
  events.addEventListener("message", (event) => onDebugEntry(JSON.parse(event.data)));
}

async function onDebugConnect() {
  if (debugStatus.connected) {
    try {
      debugStatus = await sendJson("POST", "/api/debug/disconnect");
    } catch (error) {
      setStatus(error.message, true);
    }
    return renderDebugStatus();
  }
  if (needHost()) return;
  debugConnecting = host();
  renderDebugStatus();
  try {
    debugStatus = await sendJson("POST", "/api/debug/connect", { host: debugConnecting });
    setStatus(`Debugging ${debugConnecting}. Press buttons or turn the dial on the keypad.`);
  } catch (error) {
    setStatus(error.message, true);
  }
  debugConnecting = "";
  renderDebugStatus();
}

function wireDebug() {
  $("debug-connect").addEventListener("click", onDebugConnect);
  $("debug-clear").addEventListener("click", () => {
    debugLog.clear();
    $("debug-log").replaceChildren();
    renderDebugStatus();
  });
  $("debug-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText(debugLog.entries));
      setStatus(`Copied ${debugLog.entries.length} lines. -> marks lines you send, <- lines you receive.`);
    } catch {
      setStatus("Couldn't copy to the clipboard. Select the text and copy it instead.", true);
    }
  });
  renderDebugStatus();
  openDebugEvents();
}
```

Next to the existing `wireDrawer();` call at startup (near line 1621), add this line:

```js
  wireDebug();
```

- [ ] **Step 5: Update the README**

In `README.md`, change the drawer bullet:

```markdown
- To resize the drawer, drag its top edge. To hide or show it, click the
  selected tab.
```

Then add this section after the paragraph that ends "…when you save and deploy." under "Program the keypad from your own code":

```markdown
### Try a design on the keypad

The **Debug** tab in the drawer connects to the keypad and answers it the
way a simple control system would, so you can check a deployed design by
hand. It doesn't need a project open.

1. Enter the keypad's IP address in the header, or click **Find**.
2. Click the **Debug** tab, and then click **Connect**.
3. Press buttons and turn the dial on the keypad.

While you're connected, pressing a button switches it between OFF and ON,
and turning the dial sets the LED ring on the same page to the dial's level.
The log shows every line sent (`→`) and received (`←`), plus notes such as
`Page 1 dial: 40`. A green dot on the **Debug** tab shows that you're
connected.

Only controls that aren't bound to an OMNI device are available. Deploying a
design closes the connection. To start again, click **Connect**.
```

- [ ] **Step 6: Run the automated tests**

Run: `npm run test:designer`
Expected: every test passes.

Run: `python -m unittest discover -s tests -t .`
Expected: every test passes.

- [ ] **Step 7: Check the tab by hand against the fake keypad**

Create this script in the session scratchpad. Don't commit it. Save it as `run_debug_demo.py` in the scratchpad, and change `ROOT` to the repository path:

```python
"""Run the designer against a fake keypad that presses buttons and turns the dial."""
import sys, tempfile, threading, time
from pathlib import Path

ROOT = Path(r"C:\Users\Jim\Developer\omni_keypad_designer")
sys.path.insert(0, str(ROOT))

from designer.assets import GraphicsZip
from designer.keypad_ops import KeypadOps
from designer.library import Library
from designer.projects import ProjectStore
from designer.server import make_server
from tests.fake_keypad import FakeKeypad
from tests.test_designer_debug import DESCRIPTOR, descriptor_for

keypad = FakeKeypad().__enter__()
keypad.files[DESCRIPTOR] = descriptor_for(keypad.params)
tmp = Path(tempfile.mkdtemp())
server = make_server(8045, KeypadOps(tmp / "backups", port=keypad.port, timeout=2),
                     Library(tmp / "library"), GraphicsZip(), ProjectStore(tmp / "projects"))
threading.Thread(target=server.serve_forever, daemon=True).start()
print("Open http://127.0.0.1:8045/ and connect to 127.0.0.1. Press Ctrl+C to stop.")

def activity():
    level = -100
    while True:
        time.sleep(2)
        keypad.press("/page1/button1/action", "PUSH")
        keypad.press("/page1/button1/action", "RELEASE")
        level = -100 if level >= 10 else level + 10
        keypad.press("/page1/dial/level", level)

threading.Thread(target=activity, daemon=True).start()
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    pass
```

Run it with `python <scratchpad>/run_debug_demo.py`. If `GraphicsZip()` fails without a graphics zip, pass the one the designer normally uses. Open `http://127.0.0.1:8045/`, type `127.0.0.1` in the header's IP address field, and check each of these:

- The drawer shows **HControl** and **Debug** tabs. Clicking **Debug** shows the log, with **Connect**, **Clear**, and **Copy all**. Clicking **Debug** again collapses the drawer.
- **Connect** shows `Connecting to 127.0.0.1…`, then `Connected to OMNI-KP-8BV at 127.0.0.1 · firmware 1.1.4.0`. A green dot appears on the **Debug** tab and stays while you switch to **HControl**.
- Every 2 seconds, the log shows a received `publish` and the sent `@publish`. It also shows `Page 1 button 1: OFF → ON` or `ON → OFF`, and `Page 1 dial: N`, with `→` lines in blue and notes in green.
- Scrolling up stops the log from jumping to the bottom. Scrolling back to the bottom resumes following.
- When you reload the page, the log returns without duplicate rows, and the tab is still selected.
- **Clear** empties the log. **Copy all** copies lines that start with a time and `->`, `<-`, `//`, or `!!`.
- **Disconnect** shows `Disconnected.` and `Not connected`, and the dot disappears.
- With the IP address field empty, **Connect** shows "Enter the keypad's IP address first, or click Find."

Then stop the script. Ask the user to check the tab against a real keypad. That check covers the real descriptor's paths, OMNI-bound controls, and the LED ring following the dial.

- [ ] **Step 8: Commit**

```bash
git add designer/static/index.html designer/static/style.css designer/static/app.js README.md
git commit -m "Add a Debug tab that drives the keypad live" -m "The drawer now has HControl and Debug tabs. Debug connects to the keypad in the header, toggles buttons between OFF and ON as you press them, copies the dial level to the LED ring, and shows every line sent and received. It works without a project open."
```
