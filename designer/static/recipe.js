// Version 2 recipes: plain data, no DOM. Each state has its own layer list,
// drawn first to last, with Back layers (Shape, Image) before Front layers
// (Icon, Text). A layer holds one value per setting; nothing is shared
// between states. A recipe is
// { version: 2, name, editor?, states: { off, on, alt? } }, where each state
// is { layers: [...] } and alt is present only when the button has an ALT state.

import { SIZE, CENTRE, FONTS, STATES, textLines, colourFor, shapeArt } from "./model.js";

export const BACK = ["shape", "image"];
const WHITE = "#FFFFFF";

export const isBack = (layer) => BACK.includes(layer.type);
const title = (type) => type[0].toUpperCase() + type.slice(1);

export function blankRecipe(name = "") {
  return { version: 2, name, states: { off: { layers: [] }, on: { layers: [] } } };
}

// A new layer. It starts the same in every state: you decide how each state
// looks. Icons and text are white, and a shape draws its colour's dim picture
// (art "off"; "on" is the bright one).
export function defaultLayerFor(type, catalog, state, name = "") {
  const colour = WHITE;
  switch (type) {
    case "shape": {
      const set = Object.keys(catalog.shapes)[0];
      const colours = Object.keys(catalog.shapes[set] || {});
      return { type, set, colour: colours.includes("Blue") ? "Blue" : colours[0], art: "off", visible: true };
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
      if (layer.tint) {
        // Version 1 recoloured the OFF grey for ALT and ignored altArt on a tinted shape.
        shape.tint = colourFor(layer.tint, state);
        shape.art = state === "on" ? "on" : "off";
      }
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

// The sentence that tells you migration moved a layer, naming the first one, or "".
export function movedText(moved) {
  return moved.length ? `${moved[0].layer} moved behind ${moved[0].behind} to keep Back layers behind Front ones.` : "";
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

const shapeName = (layer) =>
  `${layer.set} · ${layer.tint ? "Custom" : layer.colour}, ${layer.art === "on" ? "bright" : "dim"}`;

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

// -- Layers -------------------------------------------------------------------------------

// Adds a layer at the top of its group: a Back layer after the last Back
// layer, a Front layer at the end. index is where it went.
export function addLayerTo(recipe, state, layer) {
  const layers = [...layersOf(recipe, state)];
  const index = isBack(layer) ? layers.filter(isBack).length : layers.length;
  layers.splice(index, 0, layer);
  return { recipe: withLayers(recipe, state, layers), index };
}

export function setLayerAt(recipe, state, index, changes) {
  return withLayers(recipe, state, layersOf(recipe, state).map((l, i) => (i === index ? { ...l, ...changes } : l)));
}

export function removeLayerAt(recipe, state, index) {
  return withLayers(recipe, state, layersOf(recipe, state).filter((_, i) => i !== index));
}

// Swaps a layer with its neighbour (delta 1 is up) within its group. A move
// that would leave the group returns the same recipe.
export function moveInGroup(recipe, state, index, delta) {
  const layers = [...layersOf(recipe, state)];
  const target = index + delta;
  if (!layers[target] || isBack(layers[target]) !== isBack(layers[index])) return { recipe, index };
  [layers[index], layers[target]] = [layers[target], layers[index]];
  return { recipe: withLayers(recipe, state, layers), index: target };
}

// Whether an image layer's drawn box covers the whole button. natural is the
// image's own size; it's scaled so its longer side is layer.size.
export function imageFills(layer, { width, height }) {
  const scale = layer.size / Math.max(width, height);
  const [w, h] = [width * scale, height * scale];
  return layer.x - w / 2 <= 0 && layer.x + w / 2 >= SIZE && layer.y - h / 2 <= 0 && layer.y + h / 2 >= SIZE;
}

// The size Shrink gives a covering image, so the shape shows around it.
export const SHRINK_SIZE = Math.round(SIZE * 0.8);

// Each visible Back layer that a visible Back layer above it covers, with the
// nearest one that does. A shape always covers; an image covers when fills(layer).
// An image with no file draws nothing, so it's never reported as hidden.
export function coverage(layers, fills) {
  const covers = (l) => isBack(l) && l.visible && (l.type === "shape" || fills(l));
  const result = [];
  layers.forEach((layer, lower) => {
    if (!isBack(layer) || !layer.visible || (layer.type === "image" && !layer.src)) return;
    const top = layers.findIndex((l, i) => i > lower && covers(l));
    if (top >= 0) result.push({ lower, top });
  });
  return result;
}

// The summary line in a Layers row.
export function layerSummary(layer) {
  switch (layer.type) {
    case "shape": return shapeName(layer);
    case "image": return imageName(layer);
    case "icon": return layer.icon;
    case "text": return layer.lines.filter(Boolean).join(" / ");
  }
  return "";
}

// -- States -------------------------------------------------------------------------------

const clone = (value) => structuredClone(value);

// Replaces state to with a copy of state from, creating it if it's missing.
export function copyState(recipe, from, to) {
  return { ...recipe, states: { ...recipe.states, [to]: clone(recipe.states[from]) } };
}

// The target button with one state replaced by a copy of the source button's.
// Its other states, name and Simple or Layers choice don't change.
export function copyStateFrom(source, target, state) {
  return { ...target, states: { ...target.states, [state]: clone(source.states[state]) } };
}

// The target button with every state of the source, and its Simple or Layers
// choice. The target keeps its name, and has ALT only when the source does.
export function copyAllStates(source, target) {
  const next = { ...target, states: clone(source.states) };
  if (source.editor) next.editor = source.editor;
  else delete next.editor;
  return next;
}

// Gives the button an ALT state: a copy of OFF or ON, or empty when from is null.
export function startAlt(recipe, from) {
  return from ? copyState(recipe, from, "alt")
    : { ...recipe, states: { ...recipe.states, alt: { layers: [] } } };
}

export function removeAlt(recipe) {
  const { alt, ...states } = recipe.states;
  return { ...recipe, states };
}

// Empties every state the button has. An ALT state stays, empty.
export function clearRecipe(recipe) {
  return { ...recipe, states: Object.fromEntries(Object.keys(recipe.states).map((s) => [s, { layers: [] }])) };
}
