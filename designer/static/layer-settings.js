// One layer's settings, with one value per setting, for the state being
// edited. Simple shows them inside an open part; Layers shows them under the
// layer list.

import { SIZE, MAX_IMPORT, FONTS, FILL, stateName, shapeColours, shapeFiles, searchIcons, fitWithin, clampPosition, tintSource } from "./model.js";
import { assetUrl } from "./api.js";
import { SIZE_LIMITS } from "./recipe.js";

const ICON_LIMIT = 64;
// Common AV icons, shown before you search.
const POPULAR = ["house", "laptop", "monitor", "tv", "projector", "presentation", "volume-2",
  "volume-x", "mic", "mic-off", "bluetooth", "cast", "cable", "wifi", "power", "sun", "moon",
  "lightbulb", "play", "pause", "square", "skip-forward", "skip-back", "chevron-left",
  "chevron-right", "chevron-up", "chevron-down", "settings", "video", "camera", "phone",
  "speaker", "music", "radio", "blinds", "thermometer", "network", "grip", "ban", "activity",
  "audio-lines", "square-play", "star", "users"];
const SIZES = { icon: [...SIZE_LIMITS.icon, "px"], text: [...SIZE_LIMITS.text, "px"],
  image: [...SIZE_LIMITS.image.map((size) => Math.round((size / SIZE) * 100)), "%"] };
const DEFAULT_TINT = { off: "#9e1328", on: "#e31837" };    // MGE red, darker for the dim picture.
const ALIGN_ICONS = { left: "text-align-start", center: "text-align-center", right: "text-align-end" };

export function icon(name, size = 16) {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="/vendor/lucide/sprite.svg#${name}"/></svg>`;
}

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value);
const label = (text, extra = "") => `<span class="label">${text}${extra}</span>`;

let measure = null;

// A layer's box on the 188-unit canvas, [left, top, width, height], for the
// selection outline, or null for a shape or a hidden layer. natural is an
// image's own size, or null while it loads.
export function layerBounds(layer, natural) {
  if (!layer?.visible) return null;
  switch (layer.type) {
    case "icon": return [layer.x - layer.size / 2, layer.y - layer.size / 2, layer.size, layer.size];
    case "text": {
      measure ??= document.createElement("canvas").getContext("2d");
      measure.font = `${layer.weight} ${layer.size}px "${layer.font}"`;
      const lines = layer.lines[1] ? layer.lines : [layer.lines[0] || ""];
      const width = Math.max(1, ...lines.map((l) => measure.measureText(l).width));
      const height = lines.length * layer.size * 1.15;
      const left = layer.align === "center" ? layer.x - width / 2 : layer.align === "left" ? layer.x : layer.x - width;
      return [left, layer.y - height / 2, width, height];
    }
    case "image": {
      if (!layer.src || !natural) return null;
      const scale = layer.size / Math.max(natural.width, natural.height);
      const [w, h] = [natural.width * scale, natural.height * scale];
      return [layer.x - w / 2, layer.y - h / 2, w, h];
    }
  }
  return null;
}

function segmented(name, options, current, disabled = false) {
  return `<div class="seg" role="group">${options.map(([value, text, glyph]) =>
    `<button type="button" data-seg="${name}" data-value="${value}" class="${String(value) === String(current) ? "current" : ""}"${glyph ? ` title="${text}" aria-label="${text}"` : ""}${disabled ? " disabled" : ""}>${glyph ? icon(glyph, 14) : text}</button>`).join("")}</div>`;
}

function colourField(value, name = "colour") {
  return `<div class="colour-field">
    <input type="color" name="${name}" value="${isHex(value) ? value : "#ffffff"}" aria-label="Colour">
    <input class="hex" name="${name}Hex" value="${escapeHtml(value || "")}" spellcheck="false" aria-label="Colour hex">
  </div>`;
}

function sizeField(layer) {
  const [min, max, unit] = SIZES[layer.type];
  const value = layer.type === "image" ? Math.round((layer.size / SIZE) * 100) : layer.size;
  return `<label class="stack">${label("Size", `<span class="value" data-size-label>${value} ${unit}</span>`)}
    <input type="range" name="size" min="${min}" max="${Math.max(max, value)}" step="1" value="${value}"></label>
    <div class="pair">
      <label class="xy"><span>X</span><input type="number" name="x" value="${layer.x}" min="0" max="${SIZE}"></label>
      <label class="xy"><span>Y</span><input type="number" name="y" value="${layer.y}" min="0" max="${SIZE}"></label>
    </div>`;
}

// onChange(changes, { rerender }) gets each change to the layer; rerender
// says the form needs drawing again, for example after a new shape set.
export function createLayerSettings({ form, catalog, iconTags, onChange, onStatus }) {
  let layer = null;
  let state = "off";
  let view = "simple";
  let iconQuery = "";
  let iconFor = null;               // The layer the search belongs to, so it resets for another.

  const change = (changes, rerender = false) => {
    layer = { ...layer, ...changes };
    onChange(changes, { rerender });
  };

  // A colour's swatch: its dim picture on the left and its bright one on the
  // right, each its own choice. A colour with one picture is one choice.
  function swatch(set, colour) {
    const files = shapeFiles(catalog, set, colour);
    if (!files) return "";
    const pictures = files.off === files.on ? [["off", ""]] : [["off", ", dim"], ["on", ", bright"]];
    return `<div class="swatch split">${pictures.map(([art, word]) => {
      const current = !layer.tint && layer.colour === colour && (pictures.length === 1 || layer.art === art);
      const name = escapeHtml(colour + word);
      return `<button type="button" class="${current ? "current" : ""}" data-colour="${escapeHtml(colour)}" data-art="${art}"
        title="${name}" aria-label="${name}"><img alt="" src="${assetUrl(files[art])}"></button>`;
    }).join("")}</div>`;
  }

  const pictureName = () => (layer.art === "on" ? "bright" : "dim");

  function shapeFields() {
    const sets = [FILL, ...Object.keys(catalog.shapes)];
    const fill = layer.set === FILL;
    const custom = Boolean(layer.tint);
    const canTint = fill || Boolean(tintSource(catalog, layer.set));
    const customSwatch = canTint ? `<button type="button" class="swatch custom${custom ? " current" : ""}" data-custom
        title="Custom colour" aria-label="Custom colour"${custom ? ` style="background: ${layer.tint}"` : ""}>${custom ? "" : icon("plus", 14)}</button>` : "";
    const shade = custom && fill ? "" : `, ${pictureName()}`;
    return `<div class="stack">${label("Shape")}${segmented("set", sets.map((s) => [s, s]), layer.set)}</div>
      <div class="stack">${label(`Colour · ${custom ? "Custom" : escapeHtml(layer.colour)}${shade}`)}
        <div class="swatch-grid">${Object.keys(shapeColours(catalog, layer.set)).map((c) =>
          swatch(layer.set, c)).join("")}${customSwatch}</div>
        <span class="help">Each swatch has a dim picture on the left and a bright one on the right.${fill ? " Fill paints its colour flat, with no shading." : ""}${canTint && !custom ? " To pick your own colour, click +." : ""}</span></div>
      ${custom ? `<div class="stack">${label("Custom colour")}${colourField(layer.tint, "tint")}
        ${fill ? "" : segmented("art", [["off", "Dim"], ["on", "Bright"]], layer.art)}</div>` : ""}`;
  }

  function imageFields() {
    const name = layer.source?.kind === "library" ? `Ready-made · ${escapeHtml(layer.source.name)}`
      : layer.source?.kind === "keypad" ? "Imported from keypad" : escapeHtml(layer.file || (layer.src ? "Uploaded image" : "PNG or SVG"));
    return `<div class="image-row">
        <div class="image-thumb">${layer.src ? `<img alt="" src="${layer.src}">` : ""}</div>
        <div class="image-text"><span class="sub">${name}</span></div>
        <label class="btn-outline small">Choose file<input type="file" accept="image/png,image/svg+xml" hidden></label>
      </div>
      ${view === "simple" ? `<p class="help">A photo or logo for the ${stateName(state)} state. It fills the button and covers the background.</p>` : ""}
      ${sizeField(layer)}`;
  }

  function iconFields() {
    return `<div class="stack">${label(`Icon · <span data-icon-name>${escapeHtml(layer.icon)}</span>`)}
        <input class="field" type="search" name="iconSearch" placeholder="Search by name or tag" value="${escapeHtml(iconQuery)}" aria-label="Search icons">
        <div class="icon-grid scroll" role="listbox" aria-label="Icons"></div>
        <span class="help" data-icon-count></span></div>
      <div class="stack">${label("Colour")}${colourField(layer.colour)}</div>
      <label class="stack">${label("Stroke width", `<span class="value" data-stroke-label>${layer.stroke}</span>`)}
        <input type="range" name="stroke" min="0.5" max="4" step="0.25" value="${layer.stroke}"></label>
      ${sizeField(layer)}`;
  }

  function textFields() {
    return `<div class="pair">
        <label class="stack">${label("Line 1")}<input class="field" name="line0" value="${escapeHtml(layer.lines[0] || "")}" placeholder="Blank"></label>
        <label class="stack">${label("Line 2")}<input class="field" name="line1" value="${escapeHtml(layer.lines[1] || "")}" placeholder="Optional"></label>
      </div>
      <div class="stack">${label("Colour")}${colourField(layer.colour)}</div>
      <label class="stack">${label("Font")}<select class="field" name="font">${FONTS.map((f) =>
        `<option${f === layer.font ? " selected" : ""}>${f}</option>`).join("")}</select></label>
      <div class="pair">${segmented("weight", [[400, "Regular"], [700, "Bold"]], layer.weight)}
        ${segmented("align", Object.entries(ALIGN_ICONS).map(([a, glyph]) => [a, cap(a === "center" ? "centre" : a), glyph]), layer.align)}</div>
      ${sizeField(layer)}`;
  }

  function iconMatches(query, limit) {
    if (!query.trim()) return POPULAR.filter((name) => iconTags[name]).slice(0, limit);
    return searchIcons(iconTags, query, limit);
  }

  function renderIconGrid() {
    const grid = form.querySelector(".icon-grid");
    if (!grid) return;
    const matches = iconMatches(iconQuery, 400);
    grid.innerHTML = matches.slice(0, ICON_LIMIT).map((name) =>
      `<button type="button" class="icon-choice${name === layer.icon ? " current" : ""}" data-icon="${name}" title="${name}" aria-label="${name}">${icon(name, 18)}</button>`).join("");
    const total = Object.keys(iconTags).length.toLocaleString();
    form.querySelector("[data-icon-count]").textContent = iconQuery.trim()
      ? `${matches.length}${matches.length >= 400 ? "+" : ""} matches${matches.length > ICON_LIMIT ? `, showing ${ICON_LIMIT}` : ""}`
      : `Common icons. Search ${total} Lucide icons by name or tag.`;
  }

  const FIELDS = { shape: shapeFields, image: imageFields, icon: iconFields, text: textFields };

  function render(next, options = {}) {
    ({ state = state, view = view } = options);
    if (next !== layer && iconFor !== next?.type) iconQuery = "";
    layer = next;
    iconFor = next?.type;
    if (!layer) { form.innerHTML = ""; return; }
    const head = options.title ? `<div class="settings-head"><h3 class="title-sm">${escapeHtml(options.title)}<span class="dot">.</span></h3>
      <span class="help">Settings for the selected layer</span></div>` : "";
    form.innerHTML = head + FIELDS[layer.type]();
    if (layer.type === "icon") renderIconGrid();
  }

  function syncPosition(x, y) {
    const fx = form.querySelector('[name="x"]');
    const fy = form.querySelector('[name="y"]');
    if (fx) fx.value = x;
    if (fy) fy.value = y;
  }

  // Shows a size set elsewhere, such as by the rail's corner handle.
  function syncSize(size) {
    const slider = form.querySelector('[name="size"]');
    if (!slider) return;
    const value = layer.type === "image" ? Math.round((size / SIZE) * 100) : size;
    slider.value = value;
    form.querySelector("[data-size-label]").textContent = `${value} ${layer.type === "image" ? "%" : "px"}`;
  }

  async function importImage(file) {
    const STATE = stateName(state);
    if (!file || !["image/png", "image/svg+xml"].includes(file.type)) {
      onStatus(`${file ? file.name : "That file"} isn't a PNG or SVG. Choose a PNG or SVG file.`, true);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("load failed"));
        i.src = url;
      });
      const { width, height } = fitWithin(img.naturalWidth || SIZE, img.naturalHeight || SIZE, MAX_IMPORT);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      change({ src: canvas.toDataURL("image/png"), file: file.name, source: undefined, visible: true }, true);
      onStatus(`Uploaded ${file.name} for the ${STATE} state.`);
    } catch {
      onStatus(`Couldn't read ${file.name}. Check that it's a valid PNG or SVG.`, true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  form.addEventListener("submit", (event) => event.preventDefault());

  form.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.name || !layer) return;
    if (input.name === "iconSearch") { iconQuery = input.value; return renderIconGrid(); }
    if (input.type === "number" && input.value === "") return;
    if (input.name === "size") {
      const value = Number(input.value);
      form.querySelector("[data-size-label]").textContent = `${value} ${layer.type === "image" ? "%" : "px"}`;
      return change({ size: layer.type === "image" ? Math.round((value / 100) * SIZE) : value });
    }
    if (input.name === "stroke") {
      form.querySelector("[data-stroke-label]").textContent = input.value;
      return change({ stroke: Number(input.value) });
    }
    if (input.name === "x" || input.name === "y") return change({ [input.name]: clampPosition(Number(input.value)) });
    if (input.name === "line0" || input.name === "line1") {
      const lines = [layer.lines[0] || "", layer.lines[1] || ""];
      lines[Number(input.name.slice(-1))] = input.value;
      return change({ lines: lines[1] ? lines : [lines[0]] });
    }
    if (input.name === "font") return change({ font: input.value });
    const colour = input.name.match(/^(colour|tint)(Hex)?$/);
    if (colour) {
      if (colour[2] && !isHex(input.value)) return;
      const twin = form.querySelector(`[name="${colour[1]}${colour[2] ? "" : "Hex"}"]`);
      if (twin) twin.value = input.value;
      change({ [colour[1]]: input.value });
      if (colour[1] === "tint") form.querySelector("[data-custom]").style.background = input.value;
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.type === "file") importImage(event.target.files[0]);
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !layer) return;
    if (button.dataset.icon) {
      change({ icon: button.dataset.icon });
      form.querySelectorAll(".icon-choice").forEach((b) => b.classList.toggle("current", b === button));
      form.querySelector("[data-icon-name]").textContent = button.dataset.icon;
    } else if (button.dataset.colour) {
      change({ colour: button.dataset.colour, art: button.dataset.art, tint: undefined }, true);
    } else if (button.hasAttribute("data-custom")) {
      if (!layer.tint) change({ tint: DEFAULT_TINT[layer.art] }, true);
    } else if (button.dataset.seg === "set") {
      const set = button.dataset.value;
      const colours = Object.keys(shapeColours(catalog, set));
      const colour = colours.includes(layer.colour) ? layer.colour : colours.includes("Blue") ? "Blue" : colours[0];
      const tint = layer.tint && (set === FILL || tintSource(catalog, set)) ? layer.tint : undefined;
      change({ set, colour, tint }, true);
    } else if (button.dataset.seg === "art") {
      change({ art: button.dataset.value }, true);
    } else if (button.dataset.seg === "weight") {
      change({ weight: Number(button.dataset.value) }, true);
    } else if (button.dataset.seg === "align") {
      change({ align: button.dataset.value }, true);
    }
  });

  return { render, syncPosition, syncSize };
}
