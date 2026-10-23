import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, CENTRE, statesOf, isBlank } from "./model.js";
import {
  defaultLayerFor, blankRecipe, isBack,
  fitsSimple, simpleParts, setPart, differsFromOff, partSummary,
  layerNames, addLayerTo, setLayerAt, removeLayerAt, moveInGroup, coverage, imageFills, SHRINK_SIZE, resizedSize,
  copyState, copyAllStates, startAlt, removeAlt, clearRecipe, layerSummary, copyStateFrom, viewFor,
} from "./recipe.js";

const catalog = {
  shapes: {
    "Bubble": { "Aqua": { off: "Bubble/A_OFF.png", on: "Bubble/A_ON.png" },
                "Blue": { off: "Bubble/B_OFF.png", on: "Bubble/B_ON.png" } },
    "Squared": { "Black": { off: "Squared/K.png", on: "Squared/K.png" } },
  },
  buttons: {},
};

test("defaultLayerFor text uses the name", () => {
  assert.deepEqual(defaultLayerFor("text", catalog, "on", "HDMI_1").lines, ["HDMI 1"]);
  assert.deepEqual(defaultLayerFor("text", catalog, "on").lines, ["Label"]);
});

test("defaultLayerFor starts the same in every state", () => {
  for (const state of ["off", "on", "alt"]) {
    assert.equal(defaultLayerFor("icon", catalog, state).colour, "#FFFFFF");
    assert.equal(defaultLayerFor("text", catalog, state).colour, "#FFFFFF");
    assert.deepEqual(defaultLayerFor("shape", catalog, state),
      { type: "shape", set: "Fill", colour: "Black", art: "off", visible: true });
  }
  const image = defaultLayerFor("image", catalog, "off");
  assert.equal(image.src, "");
  assert.equal(image.size, SIZE);
});

test("isBlank and statesOf", () => {
  const v2 = { ...blankRecipe(), states: { off: { layers: [] }, on: { layers: [] }, alt: { layers: [] } } };
  assert.deepEqual(statesOf(v2), ["off", "on", "alt"]);
  assert.deepEqual(statesOf(blankRecipe()), ["off", "on"]);
  const imageOnly = { ...blankRecipe(), states: { off: { layers: [{ type: "image", src: "", visible: true }] },
    on: { layers: [] } } };
  assert.equal(isBlank(imageOnly), true);
  const withText = { ...blankRecipe(), states: { off: { layers: [] },
    on: { layers: [{ type: "text", lines: ["x"], visible: true }] } } };
  assert.equal(isBlank(withText), false);
});

// -- Simple parts ---------------------------------------------------------------------

const v2 = (off, on = [], extra = {}) => ({ version: 2, name: "", ...extra,
  states: { off: { layers: off }, on: { layers: on } } });
const shape = (extra = {}) => ({ type: "shape", set: "Squared", colour: "Blue", art: "off", visible: true, ...extra });
const image = (extra = {}) => ({ type: "image", src: "data:a", file: "logo.png", size: SIZE, x: CENTRE, y: CENTRE, visible: true, ...extra });
const icon = (extra = {}) => ({ type: "icon", icon: "tv", colour: "#FFFFFF", stroke: 2, size: 80, x: CENTRE, y: CENTRE, visible: true, ...extra });
const text = (extra = {}) => ({ type: "text", lines: ["HDMI"], colour: "#FFFFFF", font: "Inter", weight: 700, size: 24, align: "center", x: CENTRE, y: CENTRE, visible: true, ...extra });

test("fitsSimple accepts one of each in order", () => {
  assert.deepEqual(fitsSimple(v2([shape(), image(), icon(), text()], [shape(), text()])), { ok: true });
  assert.deepEqual(fitsSimple(blankRecipe()), { ok: true });
});

test("fitsSimple names two text layers", () => {
  assert.deepEqual(fitsSimple(v2([text()], [text(), text()])),
    { ok: false, state: "on", reason: "On has two Text layers. Simple has one of each part." });
  assert.equal(fitsSimple(v2([text(), text(), text()])).reason,
    "Off has 3 Text layers. Simple has one of each part.");
});

test("fitsSimple names the order", () => {
  assert.deepEqual(fitsSimple(v2([image(), shape()])), { ok: false, state: "off",
    reason: "Off has Shape above Image. Simple draws Background, Image, Icon and Text from back to front." });
});

test("simpleParts finds each part and its index", () => {
  const parts = simpleParts(v2([shape(), text()]), "off");
  assert.equal(parts.shape.index, 0);
  assert.equal(parts.text.index, 1);
  assert.equal(parts.image, null);
  assert.equal(simpleParts(v2([shape()]), "alt").shape, null);
});

test("setPart adds a missing part in order", () => {
  const next = setPart(v2([shape(), text()]), "off", "icon", { visible: true }, catalog);
  assert.deepEqual(next.states.off.layers.map((l) => l.type), ["shape", "icon", "text"]);
  assert.equal(next.states.off.layers[1].colour, "#FFFFFF");
});

test("setPart text uses the button name", () => {
  const next = setPart(v2([], [], { name: "HDMI_1" }), "on", "text", { visible: true }, catalog);
  assert.deepEqual(next.states.on.layers[0].lines, ["HDMI 1"]);
});

test("setPart changes only its state", () => {
  const recipe = v2([icon()], [icon()]);
  const next = setPart(recipe, "on", "icon", { icon: "mic" }, catalog);
  assert.equal(next.states.on.layers[0].icon, "mic");
  assert.equal(next.states.off.layers[0].icon, "tv");
  assert.equal(recipe.states.on.layers[0].icon, "tv");
});

test("differsFromOff", () => {
  assert.equal(differsFromOff(v2([icon()], [icon()]), "on", "icon"), false);
  assert.equal(differsFromOff(v2([icon()], [icon({ icon: "mic" })]), "on", "icon"), true);
  assert.equal(differsFromOff(v2([text({ visible: false })], []), "on", "text"), false);
  assert.equal(differsFromOff(v2([text()], []), "on", "text"), true);
  assert.equal(differsFromOff(v2([icon()], [icon({ icon: "mic" })]), "off", "icon"), false);
  assert.equal(differsFromOff(v2([text()], [text({ size: 30 })]), "on", "text"), false);
  assert.equal(differsFromOff(v2([shape()], [shape({ set: "Fill" })]), "on", "shape"), true);
});

test("partSummary background covered", () => {
  assert.equal(partSummary(v2([shape(), image()]), "off", "shape"), "Squared · Blue, dim · covered by image");
  assert.equal(partSummary(v2([shape({ tint: "#123456", art: "on" })]), "off", "shape"), "Squared · Custom, bright");
});

test("partSummary for each part", () => {
  const recipe = v2([image({ source: { kind: "library", name: "HDMI_Squared" } }), icon(), text({ lines: ["A", "B"] })]);
  assert.equal(partSummary(recipe, "off", "image"), "Ready-made · HDMI_Squared");
  assert.equal(partSummary(v2([image()]), "off", "image"), "logo.png");
  assert.equal(partSummary(v2([image({ source: { kind: "keypad" } })]), "off", "image"), "Imported from keypad");
  assert.equal(partSummary(recipe, "off", "icon"), "tv");
  assert.equal(partSummary(recipe, "off", "text"), "“A / B”");
  assert.equal(partSummary(recipe, "off", "shape"), "Off");
  assert.equal(partSummary(v2([]), "off", "image"), "Off · your own photo or logo");
});

// -- Layers, coverage and copying --------------------------------------------------------

test("layerNames numbers repeats", () => {
  assert.deepEqual(layerNames([text(), icon(), text()]), ["Text", "Icon", "Text 2"]);
});

test("addLayerTo puts a back layer under the front group", () => {
  const { recipe, index } = addLayerTo(v2([shape(), text()]), "off", image());
  assert.deepEqual(recipe.states.off.layers.map((l) => l.type), ["shape", "image", "text"]);
  assert.equal(index, 1);
  const front = addLayerTo(v2([shape(), text()]), "off", icon());
  assert.deepEqual(front.recipe.states.off.layers.map((l) => l.type), ["shape", "text", "icon"]);
  assert.equal(front.index, 2);
});

test("setLayerAt and removeLayerAt touch one state", () => {
  const recipe = v2([shape(), text()], [text()]);
  assert.equal(setLayerAt(recipe, "off", 1, { size: 30 }).states.off.layers[1].size, 30);
  assert.equal(setLayerAt(recipe, "off", 1, { size: 30 }).states.on.layers[0].size, 24);
  assert.deepEqual(removeLayerAt(recipe, "off", 0).states.off.layers.map((l) => l.type), ["text"]);
});

test("moveInGroup stays in its group", () => {
  const recipe = v2([shape(), text()]);
  assert.equal(moveInGroup(recipe, "off", 1, -1).recipe, recipe);
  const two = v2([shape(), image(), text()]);
  const moved = moveInGroup(two, "off", 0, 1);
  assert.deepEqual(moved.recipe.states.off.layers.map((l) => l.type), ["image", "shape", "text"]);
  assert.equal(moved.index, 1);
});

test("coverage finds a covering layer", () => {
  assert.deepEqual(coverage([shape(), image()], () => true), [{ lower: 0, top: 1 }]);
  assert.deepEqual(coverage([shape(), image()], () => false), []);
  assert.deepEqual(coverage([shape({ visible: false }), image()], () => true), []);
  assert.deepEqual(coverage([shape(), shape(), text()], () => false), [{ lower: 0, top: 1 }]);
  assert.deepEqual(coverage([image(), shape(), image()], () => true), [{ lower: 0, top: 1 }, { lower: 1, top: 2 }]);
});

test("imageFills", () => {
  assert.equal(imageFills(image(), { width: 188, height: 188 }), true);
  assert.equal(imageFills(image({ size: 150 }), { width: 188, height: 188 }), false);
  assert.equal(imageFills(image(), { width: 376, height: 188 }), false);
  assert.equal(imageFills(image({ x: CENTRE + 10 }), { width: 188, height: 188 }), false);
  assert.equal(SHRINK_SIZE, 150);
});

test("copyState creates the target state", () => {
  const recipe = v2([shape()], [text({ lines: ["ON"] })]);
  const next = copyState(recipe, "on", "alt");
  assert.deepEqual(next.states.alt, recipe.states.on);
  assert.notEqual(next.states.alt.layers[0], recipe.states.on.layers[0]);
  assert.deepEqual(copyState(recipe, "on", "off").states.off, recipe.states.on);
});

test("copyAllStates removes ALT and keeps the name", () => {
  const source = v2([shape()], [text()], { name: "A", editor: "layers" });
  const target = { ...v2([], [], { name: "B" }), states: { off: { layers: [] }, on: { layers: [] }, alt: { layers: [icon()] } } };
  const next = copyAllStates(source, target);
  assert.equal(next.name, "B");
  assert.equal(next.editor, "layers");
  assert.equal(next.states.alt, undefined);
  assert.deepEqual(next.states.on, source.states.on);
  assert.notEqual(next.states.on.layers[0], source.states.on.layers[0]);
  assert.equal(copyAllStates(v2([], [], { name: "A" }), { ...target, editor: "layers" }).editor, undefined);
});

test("startAlt, removeAlt and clearRecipe", () => {
  const recipe = v2([shape()], [text()]);
  assert.deepEqual(startAlt(recipe, "on").states.alt, recipe.states.on);
  assert.deepEqual(startAlt(recipe, null).states.alt, { layers: [] });
  assert.equal(removeAlt(startAlt(recipe, null)).states.alt, undefined);
  const cleared = clearRecipe(startAlt(recipe, "off"));
  assert.deepEqual(cleared.states, { off: { layers: [] }, on: { layers: [] }, alt: { layers: [] } });
  assert.equal(clearRecipe(recipe).states.alt, undefined);
});

test("layerSummary for Layers rows", () => {
  assert.equal(layerSummary(shape()), "Squared · Blue, dim");
  assert.equal(layerSummary(shape({ art: "on" })), "Squared · Blue, bright");
  assert.equal(layerSummary(shape({ set: "Fill", art: "on" })), "Fill · Blue, bright");
  assert.equal(layerSummary(shape({ set: "Fill", tint: "#1A2B3C" })), "Fill · Custom");
  assert.equal(layerSummary(shape({ tint: "#1A2B3C" })), "Squared · Custom, dim");
  assert.equal(layerSummary(image({ src: "", file: "" })), "No image");
  assert.equal(layerSummary(icon()), "tv");
  assert.equal(layerSummary(text({ lines: ["A", "B"] })), "A / B");
});

test("coverage ignores an empty image underneath", () => {
  assert.deepEqual(coverage([image({ src: "" }), shape()], () => true), []);
});

test("copyStateFrom copies one state from another button", () => {
  const source = v2([shape()], [text({ lines: ["SRC"] })], { name: "A" });
  const target = { ...v2([icon()], [icon()], { name: "B", editor: "layers" }), states: { off: { layers: [icon()] }, on: { layers: [icon()] }, alt: { layers: [] } } };
  const next = copyStateFrom(source, target, "on");
  assert.deepEqual(next.states.on, source.states.on);
  assert.notEqual(next.states.on.layers[0], source.states.on.layers[0]);
  assert.deepEqual(next.states.off, target.states.off);
  assert.deepEqual(next.states.alt, { layers: [] });
  assert.equal(next.name, "B");
  assert.equal(next.editor, "layers");
});

test("viewFor picks Simple or Layers from the recipe", () => {
  assert.equal(viewFor(blankRecipe()), "simple");
  assert.equal(viewFor({ ...blankRecipe(), editor: "layers" }), "layers");
  assert.equal(viewFor(v2([text(), text()])), "layers");
});

test("resizedSize grows and shrinks around the layer's position", () => {
  const box = [54, 54, 80, 80];                         // An 80 px icon at the centre.
  assert.equal(resizedSize(icon({ size: 80 }), box, 20, 20), 120);
  assert.equal(resizedSize(icon({ size: 80 }), box, -20, -20), 40);
  assert.equal(resizedSize(icon({ size: 80 }), box, 20, -20), 80);    // Along the edge: no change.
  assert.equal(resizedSize(icon({ size: 80 }), box, 0, 0), 80);
});

test("resizedSize keeps a left-aligned text's left edge", () => {
  const layer = text({ align: "left", x: 20, size: 20 });
  assert.equal(resizedSize(layer, [20, 84, 100, 20], 100, 10), 40);
});

test("resizedSize stays within the Size slider's range", () => {
  assert.equal(resizedSize(icon({ size: 80 }), [54, 54, 80, 80], -200, -200), 12);
  assert.equal(resizedSize(icon({ size: 80 }), [54, 54, 80, 80], 500, 500), SIZE);
  assert.equal(resizedSize(text({ size: 24 }), [44, 80, 100, 28], 500, 500), 80);
  assert.equal(resizedSize(image({ size: 100 }), [44, 44, 100, 100], 900, 900), SIZE * 2);
  assert.equal(resizedSize(image({ size: 100 }), [44, 44, 100, 100], -200, -200), Math.round(SIZE / 10));
});
