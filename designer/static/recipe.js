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
