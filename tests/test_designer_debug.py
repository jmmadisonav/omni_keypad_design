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
