// The layer editor in the BUTTON tab: the OFF, ON and ALT canvases, Add layer
// and Quick button, the layer list, and the selected layer's settings. ALT
// appears only when the project shows it, and its settings only once the
// button has an ALT state.

import {
  SIZE, MAX_IMPORT, FONTS, defaultLayer, addLayer, updateLayer, removeLayer,
  moveLayer, searchIcons, fitWithin, quickRecipe, layerSummary, clampPosition, tintSource, textLines, setOwnLine, STATES, colourFor, shapeArt,
} from "./model.js";
import { paintInto, loadIcons } from "./render.js";
import { assetUrl } from "./api.js";

const ICON_LIMIT = 64;
const QUICK_LIMIT = 16;
// Common AV icons, shown before you search.
const POPULAR = ["house", "laptop", "monitor", "tv", "projector", "presentation", "volume-2",
  "volume-x", "mic", "mic-off", "bluetooth", "cast", "cable", "wifi", "power", "sun", "moon",
  "lightbulb", "play", "pause", "square", "skip-forward", "skip-back", "chevron-left",
  "chevron-right", "chevron-up", "chevron-down", "settings", "video", "camera", "phone",
  "speaker", "music", "radio", "blinds", "thermometer", "network", "grip", "ban", "activity",
  "audio-lines", "square-play", "star", "users"];
const SIZES = { icon: [12, SIZE, "px"], text: [8, 80, "px"], image: [10, 200, "%"] };
const TYPE_GLYPHS = { shape: "square", icon: "shapes", text: "type", image: "image" };
const DEFAULT_TINT = { off: "#9e1328", on: "#e31837" };    // MGE red, darker when OFF.
const ALIGN_ICONS = { left: "text-align-start", center: "text-align-center", right: "text-align-end" };

export function icon(name, size = 16) {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="/vendor/lucide/sprite.svg#${name}"/></svg>`;
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const pct = (value) => `${(value / SIZE) * 100}%`;
const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value);

export function createEditor({ root, catalog, iconTags, onChange, onPreview, onChooseLibrary, onStatus }) {
  let recipe = null;
  let selected = -1;
  let view = "off";                  // The state previewed on the keypad.
  let altVisible = false;            // The project shows the ALT state.
  let iconQuery = "";
  const quick = { open: false, label: "", icon: "house", colour: "", query: "" };
  const imageSizes = new Map();      // src -> { width, height }, for the selection box.
  const squaredColours = Object.keys(catalog.shapes.Squared || {});
  quick.colour = squaredColours.includes("Blue") ? "Blue" : squaredColours[0] || "";

  root.innerHTML = `
    <div class="canvases">
      ${STATES.map((state) => `
        <div class="canvas-card" data-card="${state}">
          <div class="canvas-head"><span>${state.toUpperCase()}</span>
            <button type="button" class="link-quiet" data-preview="${state}"></button></div>
          <div class="canvas-wrap" data-state="${state}">
            <canvas class="editor-canvas" width="${SIZE}" height="${SIZE}" aria-label="${state.toUpperCase()} image"></canvas>
            <div class="layer-box" hidden></div>
            ${state === "alt" ? `<div class="no-alt"><span>No ALT image</span>
              <button type="button" class="btn-outline small" data-alt="add">+ ALT</button></div>` : ""}
          </div>
          ${state === "alt" ? `<button type="button" class="link-quiet remove-alt" data-alt="remove"
            title="The button has no ALT image on the keypad. Its ALT settings are kept.">Remove ALT</button>` : ""}
        </div>`).join("")}
    </div>
    <p class="help pad-x"><span data-image-size>188 × 188</span> px on the keypad. Drag on any canvas to move the selected layer.</p>
    <div class="block">
      <div class="row-between"><span class="label">Add layer</span>
        <button type="button" class="link-red" data-quick></button></div>
      <div class="add-grid">
        ${["shape", "icon", "text", "image"].map((type) =>
          `<button type="button" class="btn-outline" data-add="${type}">+ ${type}</button>`).join("")}
      </div>
    </div>
    <div class="quick" hidden></div>
    <div class="block">
      <span class="label">Layers · top first</span>
      <div class="blank-note" hidden>
        <span>Blank button. It shows nothing on the keypad. Add a layer, use Quick button, or start from the library.</span>
        <button type="button" class="btn-dark small" data-library>Choose from library</button>
      </div>
      <ul class="layer-list"></ul>
    </div>
    <form class="settings" autocomplete="off" hidden></form>`;

  const canvases = Object.fromEntries(STATES.map((state) =>
    [state, root.querySelector(`.canvas-wrap[data-state="${state}"] canvas`)]));
  const list = root.querySelector(".layer-list");
  const form = root.querySelector(".settings");
  const quickPanel = root.querySelector(".quick");
  const blankNote = root.querySelector(".blank-note");

  // The states being edited: ALT only when the project shows it and the button has it.
  const hasAlt = () => altVisible && Boolean(recipe?.alt);
  const editStates = () => (hasAlt() ? STATES : ["off", "on"]);

  // -- Painting and the selection box ----------------------------------------------

  function paint() {
    for (const state of STATES) {
      if (recipe) paintInto(canvases[state], recipe, state, catalog);
      else canvases[state].getContext("2d").clearRect(0, 0, SIZE, SIZE);
    }
    drawBox();
  }

  function textBounds(layer, state) {
    const ctx = canvases.off.getContext("2d");
    ctx.save();
    ctx.font = `${layer.weight} ${layer.size}px "${layer.font}"`;
    const lines = textLines(layer, state);
    const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    ctx.restore();
    const height = Math.max(1, lines.length) * layer.size * 1.15;
    const left = layer.align === "center" ? layer.x - width / 2
      : layer.align === "left" ? layer.x : layer.x - width;
    return [left, layer.y - height / 2, width, height];
  }

  function imageBounds(layer) {
    const src = layer.off || layer.on;
    if (!src) return null;
    if (!imageSizes.has(src)) {
      imageSizes.set(src, { width: 1, height: 1 });
      const img = new Image();
      img.onload = () => { imageSizes.set(src, { width: img.naturalWidth, height: img.naturalHeight }); drawBox(); };
      img.src = src;
    }
    const { width, height } = imageSizes.get(src);
    const scale = layer.size / Math.max(width, height);
    return [layer.x - (width * scale) / 2, layer.y - (height * scale) / 2, width * scale, height * scale];
  }

  function bounds(layer, state) {
    if (!layer || !layer.visible || layer.type === "shape") return null;
    if (layer.type === "icon") return [layer.x - layer.size / 2, layer.y - layer.size / 2, layer.size, layer.size];
    if (layer.type === "text") return textBounds(layer, state);
    return imageBounds(layer);
  }

  function drawBox() {
    for (const wrap of root.querySelectorAll(".canvas-wrap")) {
      const state = wrap.dataset.state;
      const box = state === "alt" && !recipe?.alt ? null : bounds(recipe?.layers[selected], state);
      const el = wrap.querySelector(".layer-box");
      el.hidden = !box;
      wrap.classList.toggle("movable", Boolean(box));
      if (box) Object.assign(el.style, { left: pct(box[0]), top: pct(box[1]), width: pct(box[2]), height: pct(box[3]) });
    }
  }

  function renderPreviewLinks() {
    for (const state of STATES) {
      const current = view === state;
      root.querySelector(`[data-preview="${state}"]`).textContent = current ? "On keypad" : "Show on keypad";
      root.querySelector(`[data-preview="${state}"]`).classList.toggle("current", current);
      root.querySelector(`.canvas-wrap[data-state="${state}"]`).classList.toggle("current", current);
    }
  }

  // -- Changes -----------------------------------------------------------------------

  function change(next, { settings = false } = {}) {
    recipe = next;
    paint();
    renderList();
    if (settings) renderSettings();
    renderAlt();
    onChange(recipe);
  }

  // Shows the ALT canvas when the project shows ALT, with + ALT until the button has an ALT state.
  function renderAlt() {
    root.querySelector(".canvases").classList.toggle("three", altVisible);
    root.querySelector('[data-card="alt"]').hidden = !altVisible;
    root.querySelector(".no-alt").hidden = !recipe || Boolean(recipe.alt);
    root.querySelector(".remove-alt").hidden = !recipe?.alt;
  }

  const setLayer = (changes, options) => change(updateLayer(recipe, selected, changes), options);

  // -- Quick button --------------------------------------------------------------------

  function renderQuick() {
    root.querySelector("[data-quick]").textContent = quick.open ? "Close quick button" : "Quick button";
    quickPanel.hidden = !quick.open;
    if (!quick.open) return;
    quickPanel.innerHTML = `
      <p class="note">Quick button builds a Shape, Icon and Text layer. It replaces this button's current layers.</p>
      <input class="field" name="label" placeholder="Label" value="${escapeHtml(quick.label)}" aria-label="Label">
      <input class="field" name="query" type="search" placeholder="Search icons" value="${escapeHtml(quick.query)}" aria-label="Search icons">
      <div class="icon-grid quick-icons" role="listbox" aria-label="Icons"></div>
      <div class="swatch-row">${squaredColours.map((name) => swatch("Squared", name, name === quick.colour)).join("")}</div>
      <button type="button" class="btn-dark" data-generate>Generate layers</button>`;
    renderQuickIcons();
  }

  function renderQuickIcons() {
    const grid = quickPanel.querySelector(".quick-icons");
    grid.innerHTML = iconMatches(quick.query, QUICK_LIMIT).map((name) => iconChoice(name, name === quick.icon)).join("");
  }

  quickPanel.addEventListener("input", (event) => {
    const input = event.target;
    if (input.name === "label") quick.label = input.value;
    if (input.name === "query") { quick.query = input.value; renderQuickIcons(); }
  });

  quickPanel.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.icon) {
      quick.icon = button.dataset.icon;
      renderQuickIcons();
    } else if (button.dataset.colour) {
      quick.colour = button.dataset.colour;
      renderQuick();
    } else if (button.hasAttribute("data-generate")) {
      const next = { ...quickRecipe(quick, recipe.name), name: recipe.name };
      selected = 1;                               // The icon.
      quick.open = false;
      renderQuick();
      change(next, { settings: true });
      onStatus("Generated Shape, Icon and Text layers.");
    }
  });

  // -- Layer list ----------------------------------------------------------------------

  function renderList() {
    blankNote.hidden = !recipe || recipe.layers.length > 0;
    list.hidden = !recipe || !recipe.layers.length;
    list.innerHTML = "";
    if (!recipe) return;
    const top = recipe.layers.length - 1;
    for (let index = top; index >= 0; index--) {
      const layer = recipe.layers[index];
      const li = document.createElement("li");
      li.className = "layer-row" + (index === selected ? " selected" : "") + (layer.visible ? "" : " hidden-layer");
      li.dataset.index = index;
      li.innerHTML = `
        <span class="glyph">${icon(TYPE_GLYPHS[layer.type], 16)}</span>
        <span class="layer-name">${cap(layer.type)} <span class="sub">${escapeHtml(layerSummary(layer))}</span></span>
        <button type="button" class="icon-btn" data-act="up" title="Move up" aria-label="Move up"${index === top ? " disabled" : ""}>${icon("chevron-up", 14)}</button>
        <button type="button" class="icon-btn" data-act="down" title="Move down" aria-label="Move down"${index === 0 ? " disabled" : ""}>${icon("chevron-down", 14)}</button>
        <button type="button" class="icon-btn" data-act="hide" title="${layer.visible ? "Hide" : "Show"}" aria-label="${layer.visible ? "Hide" : "Show"}">${icon(layer.visible ? "eye" : "eye-off", 14)}</button>
        <button type="button" class="icon-btn" data-act="delete" title="Delete layer" aria-label="Delete layer">${icon("trash", 14)}</button>`;
      list.append(li);
    }
  }

  list.addEventListener("click", (event) => {
    const item = event.target.closest(".layer-row");
    if (!item) return;
    const index = Number(item.dataset.index);
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "up" || act === "down") {
      const delta = act === "up" ? 1 : -1;        // The list shows the top layer first.
      const next = moveLayer(recipe, index, delta);
      if (next !== recipe && selected === index) selected = index + delta;
      else if (next !== recipe && selected === index + delta) selected = index;
      change(next);
    } else if (act === "hide") {
      change(updateLayer(recipe, index, { visible: !recipe.layers[index].visible }));
      drawBox();
    } else if (act === "delete") {
      if (selected === index) selected = -1;
      else if (selected > index) selected--;
      change(removeLayer(recipe, index), { settings: true });
    } else if (index !== selected) {
      selected = index;
      iconQuery = "";
      renderList();
      renderSettings();
      drawBox();
    }
  });

  // -- Settings ------------------------------------------------------------------------

  const label = (text, extra = "") => `<span class="label">${text}${extra}</span>`;

  function swatch(set, colour, current) {
    const files = catalog.shapes[set]?.[colour];
    if (!files) return "";
    return `<button type="button" class="swatch${current ? " current" : ""}" data-colour="${escapeHtml(colour)}" title="${escapeHtml(colour)}" aria-label="${escapeHtml(colour)}">
      <img alt="" src="${assetUrl(files.off)}"><img alt="" src="${assetUrl(files.on)}"></button>`;
  }

  function iconChoice(name, current) {
    return `<button type="button" class="icon-choice${current ? " current" : ""}" data-icon="${name}" title="${name}" aria-label="${name}">${icon(name, 18)}</button>`;
  }

  function iconMatches(query, limit) {
    if (!query.trim()) return POPULAR.filter((name) => iconTags[name]).slice(0, limit);
    return searchIcons(iconTags, query, limit);
  }

  function segmented(name, options, current) {
    return `<div class="seg" role="group">${options.map(([value, text, glyph]) =>
      `<button type="button" data-seg="${name}" data-value="${value}" class="${String(value) === String(current) ? "current" : ""}"${glyph ? ` title="${text}" aria-label="${text}"` : ""}>${glyph ? icon(glyph, 14) : text}</button>`).join("")}</div>`;
  }

  function sizeField(layer) {
    const [min, max, unit] = SIZES[layer.type];
    const value = layer.type === "image" ? Math.round((layer.size / SIZE) * 100) : layer.size;
    return `<label class="stack">${label("Size", `<span class="value" data-size-label>${value} ${unit === "%" ? "%" : "px"}</span>`)}
      <input type="range" name="size" min="${min}" max="${Math.max(max, value)}" step="1" value="${value}"></label>
      <div class="pair">
        <label class="xy"><span>X</span><input type="number" name="x" value="${layer.x}" min="0" max="${SIZE}"></label>
        <label class="xy"><span>Y</span><input type="number" name="y" value="${layer.y}" min="0" max="${SIZE}"></label>
      </div>`;
  }

  // A colour picker and hex field for layer[prop][state]: colour for icons and text, tint for shapes.
  function colourField(layer, prop, state) {
    return `<div class="colour-field">
      <input type="color" name="colour.${state}" data-state="${state}" value="${isHex(colourFor(layer[prop], state)) ? colourFor(layer[prop], state) : "#ffffff"}" aria-label="${state.toUpperCase()} colour">
      <input class="hex" name="hex.${state}" data-state="${state}" value="${escapeHtml(colourFor(layer[prop], state))}" spellcheck="false" aria-label="${state.toUpperCase()} colour hex">
    </div>`;
  }

  function colourFields(layer, prop = "colour") {
    return `<div class="${hasAlt() ? "trio" : "pair"}">${editStates().map((state) => `
      <div class="stack">${label(`${state.toUpperCase()} colour`)}${colourField(layer, prop, state)}</div>`).join("")}</div>`;
  }

  // The shape artwork ALT shows: either half of any swatch, or OFF's artwork by default.
  function altArtField(layer) {
    const { colour, art } = shapeArt(layer, "alt");
    const halves = Object.entries(catalog.shapes[layer.set] || {}).map(([name, files]) =>
      `<div class="swatch split">${["off", "on"].map((half) => {
        const current = colour === name && art === half;
        return `<button type="button" class="${current ? "current" : ""}" data-alt-art="${escapeHtml(name)}:${half}"
          title="${escapeHtml(name)} ${half.toUpperCase()}" aria-label="${escapeHtml(name)} ${half.toUpperCase()} artwork"><img alt="" src="${assetUrl(files[half])}"></button>`;
      }).join("")}</div>`).join("");
    return `<div class="stack">${label(`ALT artwork · ${escapeHtml(colour)} ${art.toUpperCase()}`,
        layer.altArt ? `<button type="button" class="link-quiet" data-alt-art="">Same as OFF</button>` : "")}
      <div class="swatch-grid">${halves}</div>
      <span class="help">Click the OFF or ON half of a swatch to use that artwork for ALT.</span></div>`;
  }

  // A text layer's lines and colours as an OFF / ON grid. An ON line with no
  // text of its own is empty and shows the OFF line as its placeholder.
  function textGrid(layer) {
    const states = editStates();
    const own = states.slice(1);                           // ON, and ALT when shown.
    const head = (state) => `<button type="button" class="tg-head" data-head="${state}">${state.toUpperCase()}</button>`;
    const rows = [0, 1].map((i) => `${label(`Line ${i + 1}`)}
      <input class="field" name="line${i}" data-state="off" placeholder="Blank" value="${escapeHtml(layer.lines[i] || "")}" aria-label="OFF line ${i + 1}">
      ${own.map((state) => `<div class="own-line" data-own-line="${state}:${i}">
        <input class="field" name="${state}Line${i}" data-state="${state}" value="${escapeHtml(layer[`${state}Lines`]?.[i] ?? "")}" aria-label="${state.toUpperCase()} line ${i + 1}">
        <button type="button" class="relink" data-relink="${state}:${i}" title="Use the OFF text" aria-label="Use the OFF text">${icon("link", 13)}</button>
      </div>`).join("")}`).join("");
    const names = own.map((s) => s.toUpperCase()).join(" and ");
    return `<div class="stack">
      <div class="text-grid${states.length === 3 ? " three" : ""}"><span></span>${states.map(head).join("")}${rows}
        ${label("Colour")}${states.map((state) => colourField(layer, "colour", state)).join("")}</div>
      <p class="help">${names} fields left empty use the OFF text, shown in grey. Type to change it for ${names}; the link button switches back.</p></div>`;
  }

  // Marks the previewed state's heading, and whether each ON or ALT line has its own text.
  function syncTextGrid() {
    const layer = recipe?.layers[selected];
    const grid = form.querySelector(".text-grid");
    if (!grid || layer?.type !== "text") return;
    for (const head of grid.querySelectorAll("[data-head]")) {
      head.classList.toggle("current", head.dataset.head === view);
    }
    for (const wrap of grid.querySelectorAll("[data-own-line]")) {
      const [state, i] = wrap.dataset.ownLine.split(":");
      const own = layer[`${state}Lines`]?.[i] ?? null;
      const input = wrap.querySelector("input");
      wrap.classList.toggle("different", own !== null);
      input.placeholder = own !== null ? "Blank" : layer.lines[i] || "Blank";
      input.title = own !== null ? "Different from OFF" : "Same as OFF";
    }
  }

  function imageRows(layer) {
    const info = layer.source?.kind === "keypad"
      ? "Loaded from the keypad. This button wasn't made in the designer, so its existing OFF and ON artwork is kept as one Image layer."
      : layer.source?.kind === "library"
        ? `Ready-made artwork from Keypad Graphics: ${escapeHtml(layer.source.name)}_OFF.png and _ON.png.` : "";
    return (info ? `<div class="info">${info}</div>` : "") + editStates().map((state) => {
      const src = layer[state];
      const desc = src ? (layer.source ? `Existing ${state.toUpperCase()} artwork` : escapeHtml(layer[`${state}File`] || "Uploaded image"))
        : state !== "off" ? "Optional. Uses the OFF image." : "PNG or SVG";
      return `<div class="image-row">
        <div class="image-thumb">${src ? `<img alt="" src="${src}">` : ""}</div>
        <div class="image-text"><span class="label-sm">${state.toUpperCase()} image</span><span class="sub">${desc}</span></div>
        <label class="btn-outline small">${src ? "Replace" : "Upload"}<input type="file" accept="image/png,image/svg+xml" data-target="${state}" hidden></label>
        ${src && (state !== "off" || !layer.source) ? `<button type="button" class="icon-btn boxed" data-remove="${state}" title="Remove" aria-label="Remove the ${state.toUpperCase()} image">×</button>` : ""}
      </div>`;
    }).join("");
  }

  function renderSettings() {
    const layer = recipe?.layers[selected];
    form.hidden = !layer;
    if (!layer) { form.innerHTML = ""; return; }
    let body = "";
    if (layer.type === "shape") {
      const sets = Object.keys(catalog.shapes);
      const custom = Boolean(layer.tint);
      const canTint = Boolean(tintSource(catalog, layer.set));
      const customSwatch = canTint ? `<button type="button" class="swatch custom${custom ? " current" : ""}" data-custom
          title="Custom colour" aria-label="Custom colour"${custom ? ` style="background: linear-gradient(90deg, ${layer.tint.off} 50%, ${layer.tint.on} 50%)"` : ""}>${custom ? "" : icon("plus", 14)}</button>` : "";
      body = `<div class="stack">${label("Shape set · Keypad Graphics")}${segmented("set", sets.map((s) => [s, s]), layer.set)}</div>
        <div class="stack">${label(`Colour · ${custom ? "Custom" : escapeHtml(layer.colour)}`)}
          <div class="swatch-grid">${Object.keys(catalog.shapes[layer.set] || {}).map((c) => swatch(layer.set, c, !custom && c === layer.colour)).join("")}${customSwatch}</div>
          <span class="help">Each swatch shows OFF and ON artwork.${canTint ? " To pick your own OFF and ON colours, click +." : ""}</span></div>
        ${custom ? colourFields(layer, "tint") : hasAlt() ? altArtField(layer) : ""}`;
    } else if (layer.type === "icon") {
      body = `<div class="stack">${label(`Icon · ${escapeHtml(layer.icon)}`)}
          <input class="field" type="search" name="iconSearch" placeholder="Search by name or tag" value="${escapeHtml(iconQuery)}" aria-label="Search icons">
          <div class="icon-grid scroll" role="listbox" aria-label="Icons"></div>
          <span class="help" data-icon-count></span></div>
        <label class="stack">${label("Stroke width", `<span class="value" data-stroke-label>${layer.stroke}</span>`)}
          <input type="range" name="stroke" min="0.5" max="4" step="0.25" value="${layer.stroke}"></label>
        ${sizeField(layer)}${colourFields(layer)}`;
    } else if (layer.type === "text") {
      body = `${textGrid(layer)}
        <label class="stack">${label("Font")}<select class="field" name="font">${FONTS.map((f) =>
          `<option${f === layer.font ? " selected" : ""}>${f}</option>`).join("")}</select></label>
        <div class="pair">${segmented("weight", [[400, "Regular"], [700, "Bold"]], layer.weight)}
          ${segmented("align", Object.entries(ALIGN_ICONS).map(([a, glyph]) => [a, cap(a === "center" ? "centre" : a), glyph]), layer.align)}</div>
        ${sizeField(layer)}`;
    } else if (layer.type === "image") {
      body = imageRows(layer) + sizeField(layer);
    }
    form.innerHTML = `<h3 class="title-sm">${cap(layer.type)} settings<span class="dot">.</span></h3>${body}`;
    if (layer.type === "icon") renderIconGrid();
    syncTextGrid();
  }

  function renderIconGrid() {
    const grid = form.querySelector(".icon-grid");
    if (!grid) return;
    const current = recipe.layers[selected].icon;
    const matches = iconMatches(iconQuery, 400);
    grid.innerHTML = matches.slice(0, ICON_LIMIT).map((name) => iconChoice(name, name === current)).join("");
    const total = Object.keys(iconTags).length.toLocaleString();
    form.querySelector("[data-icon-count]").textContent = iconQuery.trim()
      ? `${matches.length}${matches.length >= 400 ? "+" : ""} matches${matches.length > ICON_LIMIT ? `, showing ${ICON_LIMIT}` : ""}`
      : `Common icons. Search ${total} Lucide icons by name or tag.`;
  }

  form.addEventListener("submit", (event) => event.preventDefault());

  form.addEventListener("input", (event) => {
    const input = event.target;
    const layer = recipe?.layers[selected];
    if (!input.name || !layer) return;
    if (input.name === "iconSearch") { iconQuery = input.value; return renderIconGrid(); }
    if (input.type === "number" && input.value === "") return;
    if (input.name === "size") {
      const value = Number(input.value);
      form.querySelector("[data-size-label]").textContent = `${value} ${layer.type === "image" ? "%" : "px"}`;
      return setLayer({ size: layer.type === "image" ? Math.round((value / 100) * SIZE) : value });
    }
    if (input.name === "stroke") {
      form.querySelector("[data-stroke-label]").textContent = input.value;
      return setLayer({ stroke: Number(input.value) });
    }
    if (input.name === "x" || input.name === "y") return setLayer({ [input.name]: clampPosition(Number(input.value)) });
    const line = input.name.match(/^(line|onLine|altLine)([01])$/);
    if (line) {
      const i = Number(line[2]);
      if (line[1] !== "line") {
        // Typing gives the ON or ALT line its own text, even if it's then cleared.
        setLayer(setOwnLine(layer, line[1].slice(0, -4), i, input.value));
      } else {
        const lines = [layer.lines[0] || "", layer.lines[1] || ""];
        lines[i] = input.value;
        setLayer({ lines: lines[1] ? lines : [lines[0]] });
      }
      return syncTextGrid();
    }
    if (input.name === "font") return setLayer({ font: input.value });
    const [kind, state] = input.name.split(".");
    if (kind === "colour" || kind === "hex") {
      if (kind === "hex" && !isHex(input.value)) return;
      const twin = form.querySelector(`[name="${kind === "hex" ? "colour" : "hex"}.${state}"]`);
      if (twin) twin.value = input.value;
      const prop = layer.type === "shape" ? "tint" : "colour";
      setLayer({ [prop]: { ...layer[prop], [state]: input.value } });
      if (prop === "tint") {
        const tint = recipe.layers[selected].tint;
        form.querySelector("[data-custom]").style.background =
          `linear-gradient(90deg, ${tint.off} 50%, ${tint.on} 50%)`;
      }
    }
  });

  // Editing a field in the text grid previews its state on the keypad.
  form.addEventListener("focusin", (event) => {
    const state = event.target.closest(".text-grid") && event.target.dataset.state;
    if (state && state !== view) onPreview(state);
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const layer = recipe?.layers[selected];
    if (!button || !layer) return;
    if (button.dataset.icon) {
      setLayer({ icon: button.dataset.icon });
      form.querySelectorAll(".icon-choice").forEach((b) => b.classList.toggle("current", b === button));
      form.querySelector(".label").textContent = `Icon · ${button.dataset.icon}`;
    } else if (button.dataset.colour) {
      setLayer({ colour: button.dataset.colour, tint: undefined }, { settings: true });
    } else if (button.hasAttribute("data-custom")) {
      if (!layer.tint) setLayer({ tint: { ...DEFAULT_TINT } }, { settings: true });
    } else if (button.dataset.seg === "set") {
      const colours = Object.keys(catalog.shapes[button.dataset.value] || {});
      const colour = colours.includes(layer.colour) ? layer.colour : colours.includes("Blue") ? "Blue" : colours[0];
      setLayer({ set: button.dataset.value, colour }, { settings: true });
    } else if (button.dataset.seg === "weight") {
      setLayer({ weight: Number(button.dataset.value) }, { settings: true });
    } else if (button.dataset.seg === "align") {
      setLayer({ align: button.dataset.value }, { settings: true });
    } else if (button.dataset.relink) {
      const [state, i] = button.dataset.relink.split(":");
      setLayer(setOwnLine(layer, state, Number(i), null), { settings: true });
    } else if (button.dataset.head) {
      onPreview(button.dataset.head);
    } else if (button.dataset.altArt !== undefined) {
      const [colour, art] = button.dataset.altArt.split(":");
      setLayer({ altArt: colour ? { colour, art } : undefined }, { settings: true });
    } else if (button.dataset.remove) {
      const state = button.dataset.remove;
      setLayer({ [state]: "", [`${state}File`]: "" }, { settings: true });
    }
  });

  // -- Image import ----------------------------------------------------------------------

  async function importImage(file, target) {
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
      const changes = { [target]: canvas.toDataURL("image/png"), [`${target}File`]: file.name };
      if (target === "off") changes.source = undefined;    // Your own image now.
      setLayer(changes, { settings: true });
      onStatus(`Uploaded ${file.name} as the ${target.toUpperCase()} image.`);
    } catch {
      onStatus(`Couldn't read ${file.name}. Check that it's a valid PNG or SVG.`, true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (input.type === "file") importImage(input.files[0], input.dataset.target);
  });

  // -- Toolbar ---------------------------------------------------------------------------

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !recipe || !root.contains(button) || button.closest(".settings, .quick, .layer-list")) return;
    if (button.dataset.add) {
      const layer = defaultLayer(button.dataset.add, catalog);
      if (layer.type === "text" && recipe.name) layer.lines = [recipe.name.replace(/_/g, " ")];
      selected = recipe.layers.length;
      iconQuery = "";
      change(addLayer(recipe, layer), { settings: true });
    } else if (button.hasAttribute("data-quick")) {
      quick.open = !quick.open;
      if (quick.open && !quick.label) quick.label = recipe.name.replace(/_/g, " ");
      renderQuick();
    } else if (button.dataset.preview) {
      onPreview(button.dataset.preview);
    } else if (button.dataset.alt) {
      // Removing ALT keeps each layer's ALT settings, so adding it back restores them.
      const add = button.dataset.alt === "add";
      change({ ...recipe, alt: add || undefined }, { settings: true });
      onStatus(add ? "Added an ALT image. It starts as a copy of OFF; change it in the ALT fields."
        : "Removed the ALT image. When you save, this button has no ALT image on the keypad.");
      if (add) onPreview("alt");
    } else if (button.hasAttribute("data-library")) {
      onChooseLibrary();
    }
  });

  // -- Dragging on a canvas -----------------------------------------------------------------

  let drag = null;
  for (const wrap of root.querySelectorAll(".canvas-wrap")) {
    wrap.addEventListener("pointerdown", (event) => {
      const layer = recipe?.layers[selected];
      if (!layer || !bounds(layer) || (wrap.dataset.state === "alt" && !recipe.alt)) return;
      wrap.setPointerCapture(event.pointerId);
      drag = { startX: event.clientX, startY: event.clientY, x: layer.x, y: layer.y,
               scale: SIZE / wrap.getBoundingClientRect().width };
    });
    wrap.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const x = clampPosition(drag.x + (event.clientX - drag.startX) * drag.scale);
      const y = clampPosition(drag.y + (event.clientY - drag.startY) * drag.scale);
      setLayer({ x, y });
      const fx = form.querySelector('[name="x"]');
      const fy = form.querySelector('[name="y"]');
      if (fx) fx.value = x;
      if (fy) fy.value = y;
    });
    const stop = () => { drag = null; };
    wrap.addEventListener("pointerup", stop);
    wrap.addEventListener("pointercancel", stop);
  }

  loadIcons();
  renderQuick();
  renderPreviewLinks();

  return {
    canvases,
    getRecipe: () => recipe,
    // With keepLayer, keep the same layer selected if it still exists, as after an undo.
    setRecipe(next, { keepLayer = false } = {}) {
      recipe = next;
      if (!(keepLayer && next && selected >= 0 && selected < next.layers.length)) {
        selected = next && next.layers.length ? next.layers.length - 1 : -1;
        iconQuery = "";
        quick.open = false;
        quick.label = "";
      }
      renderQuick();
      paint();
      renderList();
      renderSettings();
      renderAlt();
    },
    // Change the button's name without touching its layers.
    rename(name) {
      if (!recipe) return;
      recipe = { ...recipe, name };
      onChange(recipe);
    },
    // The keypad's image size, for the help line. Layers stay in 188-unit coordinates.
    setImageSize(size) {
      root.querySelector("[data-image-size]").textContent = `${size} × ${size}`;
    },
    // The state previewed on the keypad: "off", "on" or "alt".
    setView(state) {
      view = state;
      renderPreviewLinks();
      syncTextGrid();
    },
    // Whether the project shows the ALT state.
    setAltVisible(visible) {
      altVisible = visible;
      renderAlt();
      renderSettings();
    },
  };
}

