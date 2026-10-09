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
