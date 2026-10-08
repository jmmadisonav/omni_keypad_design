"""Run designer/server.py the way the desktop app does."""

import json
import re
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = ROOT / "designer" / "server.py"


class LaunchTests(unittest.TestCase):
    def start(self, *args):
        proc = subprocess.Popen([sys.executable, str(SERVER), "--no-browser", *args],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: proc.poll() is None and proc.kill())
        self.lines = [proc.stdout.readline() for _ in range(2)]   # Data folder, then address.
        line = "".join(self.lines)
        match = re.search(r"http://127\.0\.0\.1:(\d+)/", line)
        self.assertIsNotNone(match, line + proc.stderr.read() if proc.poll() is not None else line)
        return proc, int(match[1])

    def refused_folder(self):
        """A folder Windows can't create, as Controlled folder access refuses
        one in Documents: it would be inside an ordinary file."""
        blocker = Path(tempfile.mkdtemp()) / "Documents"
        blocker.write_text("")
        return blocker / "OMNI Keypad Designer"

    def test_data_dir_holds_projects_backups_and_library(self):
        data = Path(tempfile.mkdtemp())
        proc, port = self.start("--port", "0", "--data-dir", str(data), "--exit-with-parent")
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/projects", method="POST",
                                     data=json.dumps({"name": "Lobby"}).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as response:
            self.assertEqual(response.status, 200)
        self.assertTrue((data / "projects" / "Lobby" / "keypad.json").exists())
        self.assertTrue((data / "backups").is_dir())
        self.assertTrue((data / "library").is_dir())
        proc.stdin.close()                       # The app closing.
        self.assertEqual(proc.wait(timeout=10), 0)

    def test_reports_the_data_folder(self):
        data = Path(tempfile.mkdtemp())
        proc, _ = self.start("--port", "0", "--data-dir", str(data), "--exit-with-parent")
        self.assertEqual(self.lines[0].strip(), f"Data folder: {data}")
        proc.stdin.close()
        proc.wait(timeout=10)

    def test_falls_back_when_windows_refuses_the_data_folder(self):
        fallback = Path(tempfile.mkdtemp()) / "Data"
        proc, _ = self.start("--port", "0", "--data-dir", str(self.refused_folder()),
                             "--fallback-data-dir", str(fallback), "--exit-with-parent")
        self.assertEqual(self.lines[0].strip(), f"Data folder: {fallback}")
        self.assertTrue((fallback / "projects").is_dir())
        proc.stdin.close()
        proc.wait(timeout=10)

    def test_says_which_folders_it_tried_when_both_are_refused(self):
        refused = self.refused_folder()
        result = subprocess.run([sys.executable, str(SERVER), "--no-browser", "--port", "0",
                                 "--data-dir", str(refused), "--fallback-data-dir", str(refused)],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 1)
        self.assertIn("couldn't create its folders", result.stderr)
        self.assertIn(" or in ", result.stderr)

    def test_any_port_moves_off_a_port_in_use(self):
        # Another designer: Python's HTTP server sets SO_REUSEADDR, which on
        # Windows lets a second server bind the same port instead of failing.
        busy = socket.socket()
        busy.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        self.addCleanup(busy.close)
        taken = busy.getsockname()[1]
        proc, port = self.start("--port", str(taken), "--any-port",
                                "--data-dir", tempfile.mkdtemp(), "--exit-with-parent")
        self.assertNotEqual(port, taken)
        proc.stdin.close()
        proc.wait(timeout=10)


if __name__ == "__main__":
    unittest.main()
