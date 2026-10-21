import { test } from "node:test";
import assert from "node:assert/strict";
import { buttonGroups, pageControlGroups, HCONTROL_NOTES } from "./hcontrol.js";

const lines = (groups) => groups.flatMap((g) => g.lines.map((l) => `${l.send ? "->" : "<-"} ${l.text}`));

test("buttonGroups fill in the page and button numbers", () => {
  const groups = buttonGroups({ page: 1, button: 3 });
  assert.deepEqual(groups.map((g) => g.title), [
    "Subscribe to presses", "When pressed and released", "Get the feedback state",
    "Set the feedback state (OFF, ON or Alt)", "Enable or disable"]);
  assert.deepEqual(lines(groups.slice(0, 2)), [
    '-> subscribe {"path":"/page1/button3/action","format":"string"}',
    '<- @subscribe {"path":"/page1/button3/action","format":"string","value":"RELEASE"}',
    '<- publish {"path":"/page1/button3/action","format":"string","value":"PUSH"}',
    '-> @publish',
    '<- publish {"path":"/page1/button3/action","format":"string","value":"RELEASE"}',
    '-> @publish',
  ]);
  assert.deepEqual(lines(groups.slice(3, 4)), [
    '-> set {"path":"/page1/button3/state","format":"string","value":"ON"}',
    '<- @set {"path":"/page1/button3/state","format":"string","value":"ON"}',
  ]);
});

test("buttonGroups add page-change lines for a page-switch key", () => {
  const groups = buttonGroups({ page: 2, button: 1, pageName: "Lights", target: "Page \"A\"" });
  const last = groups.at(-1);
  assert.equal(last.title, "Follow page changes · links to Page \"A\"");
  assert.deepEqual(lines([last]), [
    '-> subscribe {"path":"/settings/currentpage","format":"string"}',
    '<- @subscribe {"path":"/settings/currentpage","format":"string","value":"Lights"}',
    '<- publish {"path":"/settings/currentpage","format":"string","value":"Page \\"A\\""}',
    '-> @publish',
  ]);
});

test("pageControlGroups cover the dial, dial button, and LED ring", () => {
  const groups = pageControlGroups(4);
  assert.deepEqual(groups.map((g) => g.title), [
    "Dial level", "When the dial is turned", "Dial button", "When the dial button is pressed and released",
    "LED ring level"]);
  assert.deepEqual(lines(groups), [
    '-> subscribe {"path":"/page4/dial/level"}',
    '<- @subscribe {"path":"/page4/dial/level","value":0}',
    '<- publish {"path":"/page4/dial/level","value":10}',
    '-> @publish',
    '-> subscribe {"path":"/page4/dial_button/action","format":"string"}',
    '<- @subscribe {"path":"/page4/dial_button/action","format":"string","value":"RELEASE"}',
    '<- publish {"path":"/page4/dial_button/action","format":"string","value":"PUSH"}',
    '-> @publish',
    '<- publish {"path":"/page4/dial_button/action","format":"string","value":"RELEASE"}',
    '-> @publish',
    '-> set {"path":"/page4/ledring/level","value":40}',
    '<- @set {"path":"/page4/ledring/level","value":40}',
  ]);
});

test("every note has a title and text", () => {
  assert.ok(HCONTROL_NOTES.length >= 9);
  for (const note of HCONTROL_NOTES) assert.ok(note.title && note.text);
});
