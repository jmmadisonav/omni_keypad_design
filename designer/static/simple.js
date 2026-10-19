// Simple: the four fixed parts of one state, Background, Image, Icon and
// Text, drawn back to front, plus Start from a ready-made. It never says
// "layer".

import { clampPosition } from "./model.js";
import { assetUrl } from "./api.js";
import {
  PARTS, PART_NAMES, simpleParts, setPart, differsFromOff, partSummary, useReadyMade, defaultLayerFor,
} from "./recipe.js";
import { createLayerSettings, layerBounds, icon, escapeHtml } from "./layer-settings.js";

async function dataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// onChange(recipe, label) reports each change; label names it for undo, or
// is null for a setting that merges with the changes around it.
export function createSimple({ root, catalog, iconTags, onChange, onStatus, onConfirm, imageSize }) {
  let recipe = null;
  let state = "off";
  let open = null;                 // The part type whose settings are open.
  let gallery = false;
  let origin = null;               // The open part's position when a drag started.

  const form = document.createElement("form");
  form.className = "settings part-settings";
  form.autocomplete = "off";
  const settings = createLayerSettings({
    form, catalog, iconTags, onStatus,
    // Changing a part's settings turns it on: you're designing with it.
    onChange: (changes, { rerender }) =>
      commit(setPart(recipe, state, open, { ...changes, visible: true }, catalog), null, rerender),
  });

  function commit(next, label, rerender = true) {
    recipe = next;
    onChange(recipe, label);
    if (rerender) render(recipe, state);
    else refreshSummaries();
  }

  const STATE = () => state.toUpperCase();
  const readyNames = () => Object.keys(catalog.buttons);
  const readyInUse = () => {
    const image = simpleParts(recipe, state).image?.layer;
    return image?.visible && image.source?.kind === "library" ? image.source.name : "";
  };
  const readyArt = (name) => assetUrl(catalog.buttons[name][state === "on" ? "on" : "off"]);

  function thumb(type, layer) {
    switch (type) {
      case "shape": {
        if (!layer) return `<span class="part-thumb"></span>`;
        if (layer.tint) return `<span class="part-thumb" style="background: ${layer.tint}"></span>`;
        const files = catalog.shapes[layer.set]?.[layer.colour];
        return `<span class="part-thumb">${files ? `<img alt="" src="${assetUrl(files[layer.art])}">` : ""}</span>`;
      }
      case "image":
        return `<span class="part-thumb dashed">${layer?.src ? `<img alt="" src="${layer.src}">` : ""}</span>`;
      case "icon":
        return `<span class="part-thumb dark">${icon(layer?.icon || "shapes", 18)}</span>`;
      default:
        return `<span class="part-thumb aa">Aa</span>`;
    }
  }

  function readyBlock() {
    const names = readyNames();
    if (!names.length) return "";
    const current = readyInUse();
    return `<div class="ready-block${gallery ? " open" : ""}">
      <button type="button" class="ready-row" data-gallery>
        <span>Start from a ready-made</span>
        <span class="ready-thumb"><img alt="" src="${readyArt(current || names[0])}"></span>
        <span class="sub">${gallery ? "Close" : `${names.length} designs`}</span>
      </button>
      ${gallery ? `<div class="ready-grid">${names.map((name) => `
        <button type="button" class="ready-tile${name === current ? " current" : ""}" data-ready="${escapeHtml(name)}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">
          <img alt="" src="${readyArt(name)}"></button>`).join("")}</div>
        <p class="help">Sets OFF and ON together from the artwork pair. ALT is left as it is.</p>` : ""}
    </div>`;
  }

  function partRow(type, part) {
    const on = Boolean(part?.layer.visible);
    const differs = differsFromOff(recipe, state, type);
    return `<li class="part-row${on ? "" : " off"}${open === type ? " open" : ""}" data-part="${type}">
      ${thumb(type, part?.layer)}
      <span class="part-text"><span class="part-name">${PART_NAMES[type]}${differs
        ? ` <span class="differs" title="Different from OFF">≠ OFF</span>` : ""}</span>
        <span class="sub" data-summary>${escapeHtml(partSummary(recipe, state, type))}</span></span>
      <button type="button" class="switch${on ? " on" : ""}" role="switch" aria-checked="${on}" data-switch
        title="${on ? "Turn off" : "Turn on"} for ${STATE()}" aria-label="${PART_NAMES[type]} for ${STATE()}"><span></span></button>
    </li>`;
  }

  function render(next, nextState) {
    if (nextState !== state) origin = null;
    recipe = next;
    state = nextState;
    const parts = simpleParts(recipe, state);
    root.innerHTML = `${readyBlock()}
      <div class="parts-head"><span class="label-strong">Editing ${STATE()} state</span><span class="help">Back to front</span></div>
      <ul class="parts">${PARTS.map((type) => partRow(type, parts[type])).join("")}</ul>`;
    if (open) {
      root.querySelector(`[data-part="${open}"]`).after(form);
      settings.render(parts[open]?.layer ?? { ...defaultLayerFor(open, catalog, state, recipe.name), visible: false },
        { state, view: "simple" });
    }
  }

  // Updates the summaries and markers without redrawing, so a field keeps its focus.
  function refreshSummaries() {
    for (const row of root.querySelectorAll("[data-part]")) {
      const type = row.dataset.part;
      row.querySelector("[data-summary]").textContent = partSummary(recipe, state, type);
      const on = Boolean(simpleParts(recipe, state)[type]?.layer.visible);
      row.classList.toggle("off", !on);
      const sw = row.querySelector("[data-switch]");
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-checked", on);
    }
  }

  async function pickReady(name) {
    const files = catalog.buttons[name];
    try {
      const [off, on] = await Promise.all([dataUrl(assetUrl(files.off)), dataUrl(assetUrl(files.on))]);
      gallery = false;
      open = null;
      commit(useReadyMade(recipe, name, off, on), `using the ${name} ready-made`);
      onConfirm(`Used the ${name} ready-made for OFF and ON. Turn on Text or Icon to add to it.`);
    } catch (error) {
      onStatus(`Couldn't load the ${name} ready-made: ${error.message}`, true);
    }
  }

  root.addEventListener("click", (event) => {
    if (form.contains(event.target)) return;
    const button = event.target.closest("button");
    const row = event.target.closest("[data-part]");
    if (button?.hasAttribute("data-switch")) {
      const type = row.dataset.part;
      const on = Boolean(simpleParts(recipe, state)[type]?.layer.visible);
      commit(setPart(recipe, state, type, { visible: !on }, catalog),
        `turning ${on ? "off" : "on"} ${PART_NAMES[type]} for ${STATE()}`);
    } else if (row) {
      open = open === row.dataset.part ? null : row.dataset.part;
      render(recipe, state);
    } else if (button?.hasAttribute("data-gallery")) {
      gallery = !gallery;
      render(recipe, state);
    } else if (button?.dataset.ready) {
      pickReady(button.dataset.ready);
    }
  });

  function openLayer() {
    return open ? simpleParts(recipe, state)[open]?.layer : null;
  }

  return {
    render,
    // Closes the open part and the ready-mades, for another button.
    reset() { open = null; gallery = false; },
    selectedBounds() {
      const layer = openLayer();
      return layer ? layerBounds(layer, layer.type === "image" ? imageSize(layer.src) : null) : null;
    },
    // dx and dy are the distance from where the drag started, in 188 units.
    moveSelected({ dx, dy, first }) {
      const layer = openLayer();
      if (!layer || layer.type === "shape") return;
      if (first || !origin) origin = { x: layer.x, y: layer.y };
      const x = clampPosition(origin.x + dx);
      const y = clampPosition(origin.y + dy);
      settings.syncPosition(x, y);
      commit(setPart(recipe, state, open, { x, y }, catalog), null, false);
    },
  };
}
