import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE, CENTRE, stateName, buttonKey, shapeFiles, shapeColours, FILL, recipeFromImages, searchIcons, fitWithin, gridFor, knobOnly,
  keypadAddress,
} from "./model.js";

const catalog = {
  shapes: {
    "Bubble": { "Aqua": { off: "Bubble/A_OFF.png", on: "Bubble/A_ON.png" },
                "Blue": { off: "Bubble/B_OFF.png", on: "Bubble/B_ON.png" } },
    "Squared": { "Black": { off: "Squared/K.png", on: "Squared/K.png" } },
  },
  buttons: {},
};

test("stateName keeps ALT in capitals", () => {
  assert.deepEqual(["off", "on", "alt"].map(stateName), ["Off", "On", "ALT"]);
});

test("buttonKey joins page and button", () => {
  assert.equal(buttonKey(1, 3), "1-3");
});

test("shapeFiles finds files or returns null", () => {
  assert.deepEqual(shapeFiles(catalog, "Bubble", "Aqua"),
    { off: "Bubble/A_OFF.png", on: "Bubble/A_ON.png" });
  assert.equal(shapeFiles(catalog, "Bubble", "Pink"), null);
  assert.equal(shapeFiles(catalog, "Nope", "Aqua"), null);
});

test("Fill offers the Squared colours", () => {
  assert.deepEqual(shapeColours(catalog, FILL), catalog.shapes.Squared);
  assert.equal(shapeFiles(catalog, FILL, "Black").off, "Squared/K.png");
  assert.deepEqual(shapeColours({ shapes: { Bubble: catalog.shapes.Bubble } }, FILL), catalog.shapes.Bubble);
  assert.deepEqual(shapeColours(catalog, "Nope"), {});
});

test("recipeFromImages gives each state one full-size image layer with its own image", () => {
  const recipe = recipeFromImages("data:a", "data:b", "HDMI");
  assert.equal(recipe.version, 2);
  assert.equal(recipe.name, "HDMI");
  assert.deepEqual(Object.keys(recipe.states), ["off", "on"]);
  assert.deepEqual(recipe.states.off.layers, [{ type: "image", src: "data:a", file: "",
    size: SIZE, x: CENTRE, y: CENTRE, visible: true }]);
  assert.equal(recipe.states.on.layers[0].src, "data:b");
});

test("recipeFromImages leaves a state without an image empty", () => {
  const recipe = recipeFromImages("", "data:on", "Logo", { kind: "keypad" });
  assert.deepEqual(recipe.states.off.layers, []);
  assert.equal(recipe.states.on.layers[0].src, "data:on");
});

test("searchIcons ranks name matches before tag matches", () => {
  const tags = { "tv": ["monitor", "screen"], "monitor": ["screen"], "mic": ["audio"] };
  assert.deepEqual(searchIcons(tags, ""), ["tv", "monitor", "mic"]);
  assert.deepEqual(searchIcons(tags, "MONITOR"), ["monitor", "tv"]);
  assert.deepEqual(searchIcons(tags, "screen", 1), ["tv"]);
  assert.deepEqual(searchIcons(tags, "zzz"), []);
});

test("fitWithin only scales down and keeps the ratio", () => {
  assert.deepEqual(fitWithin(4000, 2000, 376), { width: 376, height: 188 });
  assert.deepEqual(fitWithin(100, 50, 376), { width: 100, height: 50 });
  assert.deepEqual(fitWithin(5000, 1, 376), { width: 376, height: 1 });
});

test("gridFor uses the model, or guesses from the button count", () => {
  assert.deepEqual(gridFor({ columns: 2, rows: 3 }, 6), { columns: 2, rows: 3 });
  assert.deepEqual(gridFor(undefined, 8), { columns: 4, rows: 2 });
  assert.deepEqual(gridFor(undefined, 6), { columns: 2, rows: 3 });
});

test("gridFor uses the tabletop grid for a tabletop project", () => {
  const sixBV = { columns: 2, rows: 3, tabletop: { columns: 3, rows: 2 } };
  assert.deepEqual(gridFor(sixBV, 6, "tabletop"), { columns: 3, rows: 2 });
  assert.deepEqual(gridFor(sixBV, 6, "wall"), { columns: 2, rows: 3 });
  assert.deepEqual(gridFor(sixBV, 6), { columns: 2, rows: 3 });
  // A model file with no tabletop grid uses the wall grid.
  assert.deepEqual(gridFor({ columns: 4, rows: 2 }, 8, "tabletop"), { columns: 4, rows: 2 });
  // With no model, a 6-button tabletop is 3 x 2.
  assert.deepEqual(gridFor(undefined, 6, "tabletop"), { columns: 3, rows: 2 });
  assert.deepEqual(gridFor(undefined, 8, "tabletop"), { columns: 4, rows: 2 });
});

test("keypadAddress keeps an IP address or host name, and drops anything else", () => {
  assert.equal(keypadAddress(" 192.168.101.182 "), "192.168.101.182");
  assert.equal(keypadAddress("kp-lobby.local"), "kp-lobby.local");
  assert.equal(keypadAddress(""), "");
  // Pasted log text, as found in the IP box: not an address.
  assert.equal(keypadAddress("2026-10-20 09:23:27 id = 417, 0x00000cb3 (SNTP down)"), "");
  for (const bad of ["192.168.1.256", "1.2.3", "a b", "x".repeat(254), "-lobby", "lobby-", "a..b"]) {
    assert.equal(keypadAddress(bad), "", bad);
  }
});

test("knobOnly is true for a known model with no buttons", () => {
  assert.equal(knobOnly({ columns: 0, rows: 0, dial: true }), true);
  assert.equal(knobOnly({ columns: 4, rows: 2, dial: true }), false);
  assert.equal(knobOnly(null), false);
  assert.equal(knobOnly(undefined), false);
});

test("gridFor gives a knob-only model no grid, even on a tabletop", () => {
  const kpV = { columns: 0, rows: 0, tabletop: null };
  assert.deepEqual(gridFor(kpV, 0), { columns: 0, rows: 0 });
  assert.deepEqual(gridFor(kpV, 0, "tabletop"), { columns: 0, rows: 0 });
});

test("fileStem matches the server's image file names", async () => {
  const { fileStem } = await import("./model.js");
  assert.equal(fileStem("HDMI 1", 1, 3), "HDMI_1");
  assert.equal(fileStem("", 2, 5), "p2b5");
  assert.equal(fileStem("a".repeat(70), 1, 1), "a".repeat(64));
});

test("buttonNameError allows empty and file-safe names only", async () => {
  const { buttonNameError } = await import("./model.js");
  assert.equal(buttonNameError(""), "");
  assert.equal(buttonNameError("HDMI 1"), "");
  assert.equal(buttonNameError("Room_off-2"), "");
  assert.match(buttonNameError("HDMI/1"), /letters, digits/);
  assert.match(buttonNameError(" HDMI"), /letters, digits/);
});

test("nameFromImage recovers a button name from its image file", async () => {
  const { nameFromImage } = await import("./model.js");
  assert.equal(nameFromImage("AudioMute_Squared_OFF.png"), "AudioMute_Squared");
  assert.equal(nameFromImage("HDMI_1_OFF_0a1b2c.png"), "HDMI_1");
  assert.equal(nameFromImage("logo.png"), "logo");
  assert.equal(nameFromImage(""), "");
});

test("recipeFromImages records where the artwork came from", () => {
  const recipe = recipeFromImages("data:off", "data:on", "Cast", { kind: "library", name: "Cast_Squared" });
  assert.equal(recipe.name, "Cast");
  for (const state of ["off", "on"]) {
    assert.deepEqual(recipe.states[state].layers[0].source, { kind: "library", name: "Cast_Squared" });
  }
  assert.notEqual(recipe.states.off.layers[0].source, recipe.states.on.layers[0].source);
  assert.equal(recipeFromImages("a", "b").states.off.layers[0].source, undefined);
});

test("isBlank is true when no layer is visible", async () => {
  const { isBlank } = await import("./model.js");
  const icon = { type: "icon", icon: "tv", visible: true };
  const image = { type: "image", src: "", visible: true };
  assert.equal(isBlank({ version: 2, name: "", states: { off: { layers: [] }, on: { layers: [] } } }), true);
  assert.equal(isBlank({ version: 2, name: "", states: { off: { layers: [icon] }, on: { layers: [] } } }), false);
  assert.equal(isBlank({ version: 2, name: "", states: { off: { layers: [{ ...icon, visible: false }] }, on: { layers: [] } } }), true);
  assert.equal(isBlank({ version: 2, name: "", states: { off: { layers: [image] }, on: { layers: [] } } }), true);
});

test("clampPosition keeps a layer centre on the canvas", async () => {
  const { clampPosition } = await import("./model.js");
  assert.equal(clampPosition(-5), 0);
  assert.equal(clampPosition(200), SIZE);
  assert.equal(clampPosition(93.6), 94);
});

test("tintPixels recolours white artwork and keeps its shading", async () => {
  const { tintPixels } = await import("./model.js");
  const base = 0.8;
  const grey = Math.round(255 * base);
  const data = new Uint8ClampedArray([grey, grey, grey, 255, 255, 255, 255, 128, 0, 0, 0, 255]);
  tintPixels(data, base, "#E31837");
  assert.deepEqual([...data.slice(0, 4)], [227, 24, 55, 255]);       // Base brightness -> the tint.
  assert.ok(data[5] > 24 && data[5] < 255);                          // A highlight is lighter.
  assert.equal(data[7], 128);                                        // Alpha is unchanged.
  assert.deepEqual([...data.slice(8, 11)], [0, 0, 0]);               // Black stays black.
});

test("tintSource prefers crisp grey artwork", async () => {
  const { tintSource } = await import("./model.js");
  const shapes = { shapes: { A: { White: { off: "w" }, Grey: { off: "g" } }, B: { White: { off: "w" }, LtGrey: { off: "l" } }, C: { Red: {} } } };
  assert.equal(tintSource(shapes, "A").off, "g");
  assert.equal(tintSource(shapes, "B").off, "l");
  assert.equal(tintSource(shapes, "C"), null);
});

test("imageSizeFor uses the model's size, or guesses from the button count", async () => {
  const { imageSizeFor } = await import("./model.js");
  assert.equal(imageSizeFor({ image_size: 150 }, 8), 150);
  assert.equal(imageSizeFor(undefined, 6), 150);
  assert.equal(imageSizeFor(undefined, 8), SIZE);
});

test("statesOf adds ALT only for buttons with an ALT state", async () => {
  const { statesOf } = await import("./model.js");
  assert.deepEqual(statesOf({ states: { off: { layers: [] }, on: { layers: [] } } }), ["off", "on"]);
  assert.deepEqual(statesOf({ states: { off: { layers: [] }, on: { layers: [] }, alt: { layers: [] } } }),
                   ["off", "on", "alt"]);
});

test("recipeFromImages keeps a keypad button's ALT image", async () => {
  const { recipeFromImages } = await import("./model.js");
  assert.equal(recipeFromImages("a", "b", "X").states.alt, undefined);
  const recipe = recipeFromImages("a", "b", "X", { kind: "keypad" }, "c");
  assert.equal(recipe.states.alt.layers[0].src, "c");
});
