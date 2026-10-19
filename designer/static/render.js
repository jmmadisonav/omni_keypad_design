// Draws a version 2 recipe onto a 188x188 canvas for the OFF, ON or ALT state.

import { SIZE, shapeFiles, tintPixels, tintSource, statesOf } from "./model.js";
import { assetUrl } from "./api.js";

const images = new Map();       // src -> Promise<HTMLImageElement>
const symbols = new Map();      // icon name -> inner SVG markup
const generations = new WeakMap();
let iconsLoaded = null;

export function loadIcons() {
  iconsLoaded ??= fetch("/vendor/lucide/sprite.svg")
    .then((r) => r.text())
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      for (const symbol of doc.querySelectorAll("symbol")) {
        symbols.set(symbol.id, symbol.innerHTML);
      }
    });
  return iconsLoaded;
}

export function iconMarkup(name) {
  return symbols.get(name) ?? null;
}

function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(src); reject(new Error(`couldn't load ${src.slice(0, 60)}`)); };
      img.src = src;
    }));
  }
  return images.get(src);
}

const tinted = new Map();       // src + colour -> Promise<canvas>

// White shape artwork recoloured to a custom colour; see tintPixels.
function tintedShape(src, colour) {
  const key = `${src} ${colour}`;
  if (!tinted.has(key)) {
    tinted.set(key, loadImage(src).then((img) => {
      const canvas = blankCanvas();
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const image = ctx.getImageData(0, 0, SIZE, SIZE);
      const d = image.data;
      const centre = (Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2)) * 4;
      const base = Math.max(0.05, (0.299 * d[centre] + 0.587 * d[centre + 1] + 0.114 * d[centre + 2]) / 255);
      tintPixels(d, base, colour);
      ctx.putImageData(image, 0, 0);
      return canvas;
    }));
  }
  return tinted.get(key);
}

function iconSource(name, size, colour, stroke) {
  const inner = iconMarkup(name);
  if (inner === null) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Draws one layer of a version 2 recipe. Each layer has one value per setting.
async function drawLayer(ctx, layer, catalog) {
  switch (layer.type) {
    case "shape": {
      const grey = tintSource(catalog, layer.set);
      if (grey && /^#[0-9a-f]{6}$/i.test(layer.tint || "")) {
        ctx.drawImage(await tintedShape(assetUrl(grey[layer.art]), layer.tint), 0, 0, SIZE, SIZE);
        return;
      }
      const files = shapeFiles(catalog, layer.set, layer.colour);
      if (!files) return;
      ctx.drawImage(await loadImage(assetUrl(files[layer.art])), 0, 0, SIZE, SIZE);
      return;
    }
    case "icon": {
      await loadIcons();
      const src = iconSource(layer.icon, layer.size, layer.colour, layer.stroke);
      if (!src) return;
      ctx.drawImage(await loadImage(src), layer.x - layer.size / 2, layer.y - layer.size / 2,
                    layer.size, layer.size);
      return;
    }
    case "text": {
      const font = `${layer.weight} ${layer.size}px "${layer.font}"`;
      await document.fonts.load(font);
      ctx.font = font;
      ctx.fillStyle = layer.colour;
      ctx.textAlign = layer.align;
      ctx.textBaseline = "middle";
      const lines = layer.lines[1] ? layer.lines : [layer.lines[0] || ""];
      const step = layer.size * 1.15;
      lines.forEach((line, i) => {
        ctx.fillText(line, layer.x, layer.y + (i - (lines.length - 1) / 2) * step);
      });
      return;
    }
    case "image": {
      if (!layer.src) return;
      const img = await loadImage(layer.src);
      const scale = layer.size / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, layer.x - w / 2, layer.y - h / 2, w, h);
      return;
    }
  }
}

// Draws one state of a version 2 recipe.
export async function drawRecipe(ctx, recipe, state, catalog) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  for (const layer of recipe.states[state]?.layers ?? []) {
    if (!layer.visible) continue;
    ctx.save();
    try {
      await drawLayer(ctx, layer, catalog);
    } catch (error) {
      console.warn("Skipped a layer:", error);
    } finally {
      ctx.restore();
    }
  }
}

function blankCanvas(size = SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

// Layers are laid out on a 188-unit canvas whatever the model, so recipes
// work on every keypad. size is the image the keypad shows: 188 on the 8BV,
// 150 on the 6B and 6BV. Drawing scaled, rather than resizing a 188 image,
// keeps a 150-pixel keypad image at its own resolution. The result has an
// alt canvas only when the button has an ALT state.
export async function renderRecipe(recipe, catalog, size = SIZE) {
  const result = {};
  for (const state of statesOf(recipe)) {
    result[state] = blankCanvas(size);
    const ctx = result[state].getContext("2d");
    ctx.scale(size / SIZE, size / SIZE);
    await drawRecipe(ctx, recipe, state, catalog);
  }
  return result;
}

export async function paintInto(canvas, recipe, state, catalog) {
  const generation = (generations.get(canvas) ?? 0) + 1;
  generations.set(canvas, generation);
  const scratch = blankCanvas();
  await drawRecipe(scratch.getContext("2d"), recipe, state, catalog);
  if (generations.get(canvas) !== generation) return;     // A newer paint started.
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(scratch, 0, 0);
}

// Empties a canvas that paintInto draws on, and stops a paint still in progress from drawing there.
export function clearPainted(canvas) {
  generations.set(canvas, (generations.get(canvas) ?? 0) + 1);
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

export function toBase64(canvas) {
  return canvas.toDataURL("image/png").split(",")[1];
}
