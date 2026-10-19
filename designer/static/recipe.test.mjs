import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, CENTRE, statesOf, isBlank } from "./model.js";
import {
  upgradeRecipe, defaultLayerFor, blankRecipe, sortBackFront, isBack,
  fitsSimple, simpleParts, setPart, differsFromOff, partSummary, useReadyMade,
  layerNames, addLayerTo, setLayerAt, removeLayerAt, moveInGroup, coverage, imageFills, SHRINK_SIZE,
  copyState, copyAllStates, startAlt, removeAlt, clearRecipe, layerSummary,
} from "./recipe.js";

const catalog = {
  shapes: {
    "Bubble": { "Aqua": { off: "Bubble/A_OFF.png", on: "Bubble/A_ON.png" },
                "Blue": { off: "Bubble/B_OFF.png", on: "Bubble/B_ON.png" } },
    "Squared": { "Black": { off: "Squared/K.png", on: "Squared/K.png" } },
  },
  buttons: {},
};

const v1Text = (extra = {}) => ({ type: "text", lines: ["HDMI"], font: "Inter", weight: 700, size: 24,
  x: CENTRE, y: CENTRE, align: "center", colour: { off: "#111111", on: "#222222" }, visible: true, ...extra });
const v1Shape = (extra = {}) => ({ type: "shape", set: "Bubble", colour: "Blue", visible: true, ...extra });
const v1Icon = (extra = {}) => ({ type: "icon", icon: "tv", size: 80, x: CENTRE, y: CENTRE, stroke: 2,
  colour: { off: "#9AA0A6", on: "#FFFFFF" }, visible: true, ...extra });

test("upgradeRecipe resolves text per state", () => {
  const { recipe } = upgradeRecipe({ version: 1, name: "A", layers: [v1Text({ onLines: [null, "On"] })] });
  assert.equal(recipe.version, 2);
  assert.equal(recipe.name, "A");
  const [off] = recipe.states.off.layers;
  const [on] = recipe.states.on.layers;
  assert.deepEqual(off.lines, ["HDMI"]);
  assert.equal(off.colour, "#111111");
  assert.deepEqual(on.lines, ["HDMI", "On"]);
  assert.equal(on.colour, "#222222");
  assert.equal(recipe.states.alt, undefined);
  assert.equal(off.onLines, undefined);
});

test("upgradeRecipe gives ALT its resolved values", () => {
  const { recipe } = upgradeRecipe({ version: 1, name: "", alt: true, layers: [
    v1Shape({ altArt: { colour: "Aqua", art: "on" } }), v1Icon()] });
  const [shape, icon] = recipe.states.alt.layers;
  assert.equal(shape.colour, "Aqua");
  assert.equal(shape.art, "on");
  assert.equal(icon.colour, "#9AA0A6");
  assert.equal(recipe.states.on.layers[0].art, "on");
  assert.equal(recipe.states.off.layers[0].art, "off");
  assert.equal(shape.altArt, undefined);
});

test("upgradeRecipe resolves a custom tint per state", () => {
  const { recipe } = upgradeRecipe({ version: 1, name: "", layers: [
    v1Shape({ tint: { off: "#100000", on: "#200000" } })] });
  assert.equal(recipe.states.off.layers[0].tint, "#100000");
  assert.equal(recipe.states.on.layers[0].tint, "#200000");
});

test("upgradeRecipe picks each state's image", () => {
  const source = { kind: "keypad" };
  const { recipe } = upgradeRecipe({ version: 1, name: "", alt: true, layers: [
    { type: "image", off: "a", on: "", alt: "c", offFile: "a.png", source, size: SIZE, x: CENTRE, y: CENTRE, visible: true }] });
  const [off, on, alt] = ["off", "on", "alt"].map((s) => recipe.states[s].layers[0]);
  assert.equal(off.src, "a");
  assert.equal(off.file, "a.png");
  assert.equal(on.src, "a");
  assert.equal(alt.src, "c");
  for (const layer of [off, on, alt]) assert.deepEqual(layer.source, source);
  assert.equal(off.off, undefined);
});

test("upgradeRecipe reports moved layers", () => {
  const { recipe, moved } = upgradeRecipe({ version: 1, name: "", layers: [v1Text(), v1Shape()] });
  assert.deepEqual(recipe.states.off.layers.map((l) => l.type), ["shape", "text"]);
  assert.deepEqual(moved[0], { state: "off", layer: "Shape", behind: "Text" });
});

test("upgradeRecipe keeps version 2 as it is", () => {
  const v2 = blankRecipe("x");
  const result = upgradeRecipe(v2);
  assert.equal(result.recipe, v2);
  assert.deepEqual(result.moved, []);
});

test("upgradeRecipe turns null into a blank recipe", () => {
  assert.deepEqual(upgradeRecipe(null).recipe, blankRecipe());
});

test("sortBackFront keeps the order within each group", () => {
  const layers = [{ type: "text", n: 1 }, { type: "image" }, { type: "icon" }, { type: "shape" }];
  const { layers: sorted } = sortBackFront(layers);
  assert.deepEqual(sorted.map((l) => l.type), ["image", "shape", "text", "icon"]);
  assert.equal(isBack({ type: "image" }), true);
  assert.equal(isBack({ type: "text" }), false);
});

test("defaultLayerFor text uses the name", () => {
  assert.deepEqual(defaultLayerFor("text", catalog, "on", "HDMI_1").lines, ["HDMI 1"]);
  assert.deepEqual(defaultLayerFor("text", catalog, "on").lines, ["Label"]);
});

test("defaultLayerFor gives single values for the state", () => {
  assert.equal(defaultLayerFor("icon", catalog, "off").colour, "#9AA0A6");
  assert.equal(defaultLayerFor("icon", catalog, "on").colour, "#FFFFFF");
  assert.equal(defaultLayerFor("text", catalog, "alt").colour, "#9AA0A6");
  assert.deepEqual(defaultLayerFor("shape", catalog, "on"),
    { type: "shape", set: "Bubble", colour: "Blue", art: "on", visible: true });
  assert.equal(defaultLayerFor("shape", catalog, "alt").art, "off");
  const image = defaultLayerFor("image", catalog, "off");
  assert.equal(image.src, "");
  assert.equal(image.size, SIZE);
});

test("isBlank and statesOf take both versions", () => {
  const v2 = { ...blankRecipe(), states: { off: { layers: [] }, on: { layers: [] }, alt: { layers: [] } } };
  assert.deepEqual(statesOf(v2), ["off", "on", "alt"]);
  assert.deepEqual(statesOf(blankRecipe()), ["off", "on"]);
  const imageOnly = { ...blankRecipe(), states: { off: { layers: [{ type: "image", src: "", visible: true }] },
    on: { layers: [] } } };
  assert.equal(isBlank(imageOnly), true);
  const withText = { ...blankRecipe(), states: { off: { layers: [] },
    on: { layers: [{ type: "text", lines: ["x"], visible: true }] } } };
  assert.equal(isBlank(withText), false);
  assert.equal(isBlank({ version: 1, layers: [] }), true);
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
    { ok: false, state: "on", reason: "ON has two Text layers. Simple has one of each part." });
  assert.equal(fitsSimple(v2([text(), text(), text()])).reason,
    "OFF has 3 Text layers. Simple has one of each part.");
});

test("fitsSimple names the order", () => {
  assert.deepEqual(fitsSimple(v2([image(), shape()])), { ok: false, state: "off",
    reason: "OFF has Shape above Image. Simple draws Background, Image, Icon and Text from back to front." });
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
  assert.equal(next.states.off.layers[1].colour, "#9AA0A6");
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
});

test("partSummary background covered", () => {
  assert.equal(partSummary(v2([shape(), image()]), "off", "shape"), "Squared · Blue · covered by image");
  assert.equal(partSummary(v2([shape({ tint: "#123456" })]), "off", "shape"), "Squared · Custom");
});

test("partSummary for each part", () => {
  const recipe = v2([image({ source: { kind: "library", name: "HDMI_Squared" } }), icon(), text({ lines: ["A", "B"] })]);
  assert.equal(partSummary(recipe, "off", "image"), "Ready-made · HDMI_Squared");
  assert.equal(partSummary(v2([image()]), "off", "image"), "logo.png");
  assert.equal(partSummary(v2([image({ source: { kind: "keypad" } })]), "off", "image"), "Loaded from keypad");
  assert.equal(partSummary(recipe, "off", "icon"), "tv");
  assert.equal(partSummary(recipe, "off", "text"), "“A / B”");
  assert.equal(partSummary(recipe, "off", "shape"), "Off");
  assert.equal(partSummary(v2([]), "off", "image"), "Off · your own photo or logo");
});

test("useReadyMade leaves ALT alone", () => {
  const alt = { layers: [text({ lines: ["ALT"] })] };
  const recipe = { ...v2([shape(), text()], [shape()]), states: { off: { layers: [shape(), text()] }, on: { layers: [shape()] }, alt } };
  const next = useReadyMade(recipe, "HDMI_Squared", "data:off", "data:on");
  assert.deepEqual(next.states.alt, alt);
  const parts = simpleParts(next, "off");
  assert.equal(parts.shape.layer.visible, false);
  assert.equal(parts.text.layer.visible, false);
  assert.equal(parts.image.layer.src, "data:off");
  assert.deepEqual(parts.image.layer.source, { kind: "library", name: "HDMI_Squared" });
  assert.equal(simpleParts(next, "on").image.layer.src, "data:on");
  assert.equal(simpleParts(next, "on").image.layer.size, SIZE);
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
  assert.equal(layerSummary(shape()), "Squared · Blue");
  assert.equal(layerSummary(image({ src: "", file: "" })), "No image");
  assert.equal(layerSummary(icon()), "tv");
  assert.equal(layerSummary(text({ lines: ["A", "B"] })), "A / B");
});

test("coverage ignores an empty image underneath", () => {
  assert.deepEqual(coverage([image({ src: "" }), shape()], () => true), []);
});
