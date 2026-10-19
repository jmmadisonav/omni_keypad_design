import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, CENTRE, statesOf, isBlank } from "./model.js";
import { upgradeRecipe, defaultLayerFor, blankRecipe, sortBackFront, isBack } from "./recipe.js";

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
