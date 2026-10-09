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
