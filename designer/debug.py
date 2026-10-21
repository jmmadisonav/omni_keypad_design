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
from designer.bindings import control_names

BUFFER_SIZE = 500          # Entries a new listener receives first.
LISTENER_LIMIT = 1000      # Entries a listener can fall behind before it's dropped.

CURRENT_PAGE = "/settings/currentpage"
DROPPED = ("Connection closed by the keypad. Deploying a design does this. "
           "Click Connect to start again.")

_BUTTON = re.compile(r"/page(\d+)/button(\d+)/action")
_DIAL = re.compile(r"/page(\d+)/dial/level")
_DIAL_BUTTON = re.compile(r"/page(\d+)/dial_button/action")
_CONTROL = re.compile(r"/page(\d+)/(button\d+|dial_button|dial)/")
_KNOB = "knob"             # The default of a dial's "type", wherever the dial is.


def _reference_name(level: str) -> str:
    """"/Category_1/Reference_1/level" -> "Category_1/Reference_1": the name AVX shows."""
    return level.removesuffix("/level").lstrip("/")


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
        self._references: set[str] = set()  # Level paths of dials on script references.
        self._unavailable: set[str] = set()
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

    def connected_to(self, host: str) -> bool:
        """Whether a session is open with the keypad at host."""
        status = self.status()
        return status["connected"] and status["host"] == host

    def resume(self, host: str) -> None:
        """Reconnect after a deploy or restore restarted the keypad at host.

        The new design can have other controls, so this subscribes afresh.
        A failure is logged, not raised: the upload itself worked.
        """
        self._log("note", f"Reconnecting to {host} now that it's running the new design.")
        try:
            self.connect(host)
        except (OSError, HControlError, ValueError):
            pass                            # connect() logged why.

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
        self._unavailable = set()           # LED rings the keypad refused to set.
        # A dial is usually /pageN/dial. With a script reference, AVX moves it
        # to the reference's path, such as /Category_1/Reference_1.
        knobs = {path.rpartition("/")[0] for path, info in params.items()
                 if path.endswith("/type") and info.default == _KNOB}
        self._references = {f"{knob}/level" for knob in knobs
                            if f"{knob}/level" in params and not _DIAL.fullmatch(f"{knob}/level")}
        for path in sorted(self._references):
            self._log("note", f"Found a dial on the script reference {_reference_name(path)}. "
                              "Debug logs its turns but doesn't copy them to an LED ring.")
        count = dials = 0
        missing: dict[str, list[str]] = {}  # Page number -> controls it couldn't subscribe to.
        for path, info in params.items():
            dial = bool(_DIAL.fullmatch(path)) or path in self._references
            if not (path.endswith("/action") or dial or path == CURRENT_PAGE):
                continue
            try:
                client.subscribe(path, lambda p, v: self._on_event(client, generation, p, v),
                                 fmt="string" if info.type == "enum" else None)
            except HControlError as error:
                if match := _CONTROL.match(path):
                    missing.setdefault(match[1], []).append(match[2])
                else:
                    self._log("error", f"Couldn't subscribe to {path}: {error.message}.")
                continue
            count += 1
            dials += dial
        # Ask from what the keypad has, not from what subscribed: the OMNI-KP-V
        # has only a dial, even when the keypad refuses its OMNI-bound level.
        buttons = any(path.endswith("/action") and not path.endswith("/dial_button/action")
                      for path in params)
        if not buttons and not self._references and not any(
                path.endswith("/dial_button/action") or _DIAL.fullmatch(path) for path in params):
            # The OMNI-KP-V leaves an OMNI-bound dial out of its descriptor entirely.
            self._log("error", "The keypad doesn't list any buttons or a dial over HControl. They "
                               "might be bound to an OMNI device. To check, import the design.")
            prompt = "Only page changes show here."
        elif not buttons:
            prompt = "Turn or press the dial."
        else:
            prompt = "Press a button or turn the dial." if dials else "Press a button."
        # The descriptor lists a bound control, but the keypad refuses it. Only
        # the design says what it's bound to, so point there instead of
        # downloading it on every connect.
        for page, controls in missing.items():
            verb, it = ("isn't", "It") if len(controls) == 1 else ("aren't", "They")
            self._log("error", f"Page {page}: {control_names(controls)} {verb} available over "
                               f"HControl. {it} might be bound to an OMNI device. "
                               "To check, import the design.")
        self._log("note", f"Subscribed to {count} controls. {prompt}")

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
            if ring not in self._paths or ring in self._unavailable:
                self._log("note", f"Page {page} dial: {value}")
                return
            try:
                applied = client.set(ring, value)
            except HControlError as error:
                # Report a ring the keypad refuses once, then stop writing to it.
                self._unavailable.add(ring)
                self._log("error", f"Page {page} LED ring isn't available: {error.message}. "
                                   "It might be bound to an OMNI device.")
                self._log("note", f"Page {page} dial: {value}")
                return
            clamped = "" if applied == value else f" (LED ring {applied})"
            self._log("note", f"Page {page} dial: {value}{clamped}")
        elif path in self._references:
            self._log("note", f"Dial on {_reference_name(path)}: {value}")
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
