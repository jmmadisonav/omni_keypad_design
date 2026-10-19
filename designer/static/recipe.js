// Version 2 recipes: plain data, no DOM. Each state has its own layer list,
// drawn first to last, with Back layers (Shape, Image) before Front layers
// (Icon, Text). A layer holds one value per setting; nothing is shared
// between states. A recipe is
// { version: 2, name, editor?, states: { off, on, alt? } }, where each state
// is { layers: [...] } and alt is present only when the button has an ALT state.

import { SIZE, CENTRE, FONTS, STATES, textLines, colourFor, shapeArt } from "./model.js";

export const BACK = ["shape", "image"];
const OFF_GREY = "#9AA0A6";
const ON_WHITE = "#FFFFFF";

export const isBack = (layer) => BACK.includes(layer.type);
const title = (type) => type[0].toUpperCase() + type.slice(1);

export function blankRecipe(name = "") {
  return { version: 2, name, states: { off: { layers: [] }, on: { layers: [] } } };
}

// A new layer for a state. Icons and text are grey for OFF and ALT and white
// for ON. A shape draws its colour's ON artwork for ON and OFF artwork otherwise.
export function defaultLayerFor(type, catalog, state, name = "") {
  const colour = state === "on" ? ON_WHITE : OFF_GREY;
  switch (type) {
    case "shape": {
      const set = Object.keys(catalog.shapes)[0];
      const colours = Object.keys(catalog.shapes[set] || {});
      return { type, set, colour: colours.includes("Blue") ? "Blue" : colours[0],
               art: state === "on" ? "on" : "off", visible: true };
    }
    case "icon":
      return { type, icon: "circle", colour, stroke: 2, size: 80, x: CENTRE, y: CENTRE, visible: true };
    case "text":
      return { type, lines: [name.replace(/_/g, " ") || "Label"], colour, font: FONTS[0], weight: 700,
               size: 24, align: "center", x: CENTRE, y: CENTRE, visible: true };
    case "image":
      return { type, src: "", file: "", size: SIZE, x: CENTRE, y: CENTRE, visible: true };
    default:
      throw new Error(`unknown layer type ${type}`);
  }
}

// Display names for a state's layers: a type's first layer is "Text", later
// ones "Text 2", "Text 3", counted from the bottom.
export function layerNames(layers) {
  const counts = {};
  return layers.map((layer) => {
    counts[layer.type] = (counts[layer.type] || 0) + 1;
    return counts[layer.type] === 1 ? title(layer.type) : `${title(layer.type)} ${counts[layer.type]}`;
  });
}

// Moves Back layers before Front layers, keeping the order within each group.
// moved lists each Back layer that was above a Front layer, by display name.
export function sortBackFront(layers) {
  const order = [...layers.keys()].sort((a, b) =>
    (isBack(layers[b]) - isBack(layers[a])) || a - b);
  const sorted = order.map((i) => layers[i]);
  const names = layerNames(sorted);
  const nameOf = new Map(order.map((original, at) => [original, names[at]]));
  const moved = [];
  layers.forEach((layer, i) => {
    if (!isBack(layer)) return;
    for (let below = 0; below < i; below++) {
      if (!isBack(layers[below])) moved.push({ layer: nameOf.get(i), behind: nameOf.get(below) });
    }
  });
  return { layers: sorted, moved };
}

// A version 1 layer with its values for one state.
function layerForState(layer, state) {
  const { type, visible } = layer;
  switch (type) {
    case "shape": {
      const { colour, art } = shapeArt(layer, state);
      const shape = { type, set: layer.set, colour, art, visible };
      if (layer.tint) shape.tint = colourFor(layer.tint, state);
      return shape;
    }
    case "icon":
      return { type, icon: layer.icon, colour: colourFor(layer.colour, state), stroke: layer.stroke,
               size: layer.size, x: layer.x, y: layer.y, visible };
    case "text":
      return { type, lines: textLines(layer, state), colour: colourFor(layer.colour, state),
               font: layer.font, weight: layer.weight, size: layer.size, align: layer.align,
               x: layer.x, y: layer.y, visible };
    case "image": {
      const from = layer[state] ? state : layer.off ? "off" : "on";
      const image = { type, src: layer[from] || "", file: layer[`${from}File`] || "",
                      size: layer.size, x: layer.x, y: layer.y, visible };
      if (layer.source) image.source = layer.source;
      return image;
    }
    default:
      return { ...layer };
  }
}

// Any recipe as version 2. A version 1 recipe is split into a layer list per
// state, each holding exactly what that state showed. moved lists the Back
// layers that had to move behind Front layers, which changes how they look.
export function upgradeRecipe(recipe) {
  if (!recipe) return { recipe: blankRecipe(), moved: [] };
  if (recipe.version === 2) return { recipe, moved: [] };
  const states = {};
  const moved = [];
  for (const state of recipe.alt ? STATES : ["off", "on"]) {
    const sorted = sortBackFront(recipe.layers.map((layer) => layerForState(layer, state)));
    states[state] = { layers: sorted.layers };
    moved.push(...sorted.moved.map((m) => ({ state, ...m })));
  }
  return { recipe: { version: 2, name: recipe.name || "", states }, moved };
}

// -- Simple parts -----------------------------------------------------------------------

// Simple's four parts, back to front, and the names it shows for them.
export const PARTS = ["shape", "image", "icon", "text"];
export const PART_NAMES = { shape: "Background", image: "Image", icon: "Icon", text: "Text" };

const layersOf = (recipe, state) => recipe.states[state]?.layers ?? [];

// Whether every state has at most one of each part, in PARTS order. If not,
// reason says which state and why, for the Simple toggle's tooltip.
export function fitsSimple(recipe) {
  for (const state of STATES) {
    const layers = recipe.states[state]?.layers;
    if (!layers) continue;
    const STATE = state.toUpperCase();
    for (const type of PARTS) {
      const count = layers.filter((l) => l.type === type).length;
      if (count > 1) {
        return { ok: false, state,
                 reason: `${STATE} has ${count === 2 ? "two" : count} ${title(type)} layers. Simple has one of each part.` };
      }
    }
    for (let i = 1; i < layers.length; i++) {
      const [below, above] = [layers[i - 1], layers[i]];
      if (PARTS.indexOf(above.type) < PARTS.indexOf(below.type)) {
        return { ok: false, state, reason: `${STATE} has ${title(above.type)} above ${title(below.type)}. ` +
                 "Simple draws Background, Image, Icon and Text from back to front." };
      }
    }
  }
  return { ok: true };
}

// A state's parts: { shape, image, icon, text }, each { layer, index } or null.
export function simpleParts(recipe, state) {
  const layers = layersOf(recipe, state);
  return Object.fromEntries(PARTS.map((type) => {
    const index = layers.findIndex((l) => l.type === type);
    return [type, index < 0 ? null : { layer: layers[index], index }];
  }));
}

const withLayers = (recipe, state, layers) =>
  ({ ...recipe, states: { ...recipe.states, [state]: { ...recipe.states[state], layers } } });

// Changes one part of one state. A missing part is added first, with the
// defaults for that state, in its place in PARTS order.
export function setPart(recipe, state, type, changes, catalog) {
  const layers = [...layersOf(recipe, state)];
  let index = layers.findIndex((l) => l.type === type);
  if (index < 0) {
    index = layers.findIndex((l) => PARTS.indexOf(l.type) > PARTS.indexOf(type));
    if (index < 0) index = layers.length;
    layers.splice(index, 0, defaultLayerFor(type, catalog, state, recipe.name));
  }
  layers[index] = { ...layers[index], ...changes };
  return withLayers(recipe, state, layers);
}

const SHOWN = ["set", "colour", "tint", "icon", "src", "lines"];

// Whether an ON or ALT part looks different from OFF: it's on in one and not
// the other, or its shape set, colour, icon, image or text differs. A part
// that's off in both doesn't differ.
export function differsFromOff(recipe, state, type) {
  if (state === "off") return false;
  const mine = simpleParts(recipe, state)[type]?.layer;
  const off = simpleParts(recipe, "off")[type]?.layer;
  const [a, b] = [Boolean(mine?.visible), Boolean(off?.visible)];
  if (a !== b) return true;
  if (!a) return false;
  return SHOWN.some((key) => JSON.stringify(mine[key]) !== JSON.stringify(off[key]));
}

function imageName(layer) {
  if (layer.source?.kind === "library") return `Ready-made · ${layer.source.name}`;
  if (layer.source?.kind === "keypad") return "Loaded from keypad";
  return layer.file || (layer.src ? "Uploaded image" : "No image");
}

const shapeName = (layer) => `${layer.set} · ${layer.tint ? "Custom" : layer.colour}`;

// The summary line under a part's name in Simple.
export function partSummary(recipe, state, type) {
  const parts = simpleParts(recipe, state);
  const layer = parts[type]?.layer;
  if (!layer?.visible) return type === "image" ? "Off · your own photo or logo" : "Off";
  switch (type) {
    case "shape": return shapeName(layer) + (parts.image?.layer.visible ? " · covered by image" : "");
    case "image": return imageName(layer);
    case "icon": return layer.icon;
    default: return `“${layer.lines.filter(Boolean).join(" / ")}”`;
  }
}

// Uses ready-made artwork for OFF and ON: each state's Image part shows the
// artwork, and its other parts are switched off. ALT isn't touched.
export function useReadyMade(recipe, name, offSrc, onSrc) {
  let next = recipe;
  for (const [state, src] of [["off", offSrc], ["on", onSrc]]) {
    const image = { type: "image", src, file: "", source: { kind: "library", name },
                    size: SIZE, x: CENTRE, y: CENTRE, visible: true };
    const layers = layersOf(next, state).filter((l) => l.type !== "image")
      .map((l) => ({ ...l, visible: false }));
    const at = layers.findIndex((l) => PARTS.indexOf(l.type) > PARTS.indexOf("image"));
    layers.splice(at < 0 ? layers.length : at, 0, image);
    next = withLayers(next, state, layers);
  }
  return next;
}
