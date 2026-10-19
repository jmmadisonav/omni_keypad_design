// Layers: one state's layers in two groups. Front holds Icon and Text, which
// are see-through and can go in any order. Back holds Shape and Image, which
// are solid. Front always draws over Back, and a warning shows when one Back
// layer hides another.

import { CENTRE, clampPosition } from "./model.js";
import {
  isBack, layerNames, layerSummary, addLayerTo, setLayerAt, removeLayerAt, moveInGroup, coverage,
  imageFills, SHRINK_SIZE, defaultLayerFor,
} from "./recipe.js";
import { createLayerSettings, layerBounds, icon, escapeHtml } from "./layer-settings.js";

const GLYPHS = { shape: "square", icon: "shapes", text: "type", image: "image" };
// The add buttons under each group.
const addButtons = (types) => `<div class="add-grid">${types.map((type) =>
  `<button type="button" class="btn-outline small" data-add="${type}">+ ${type[0].toUpperCase() + type.slice(1)}</button>`).join("")}</div>`;

export function createLayers({ root, catalog, iconTags, onChange, onSelect, onStatus, imageSize }) {
  let recipe = null;
  let state = "off";
  let selected = -1;
  let origin = null;

  const form = document.createElement("form");
  form.className = "settings";
  form.autocomplete = "off";
  const settings = createLayerSettings({
    form, catalog, iconTags, onStatus,
    onChange: (changes, { rerender }) => commit(setLayerAt(recipe, state, selected, changes), null, rerender),
  });

  const layers = () => recipe.states[state]?.layers ?? [];
  const STATE = () => state.toUpperCase();

  function commit(next, label, rerender = true) {
    recipe = next;
    onChange(recipe, label);
    if (rerender) render(recipe, state);
  }

  const fills = (layer) => {
    const natural = layer.src && imageSize(layer.src);
    return Boolean(natural) && imageFills(layer, natural);
  };

  function row(layer, index, names, hiddenBy, group) {
    const first = group[0] === index;
    const last = group[group.length - 1] === index;
    return `<li class="layer-row${index === selected ? " selected" : ""}${layer.visible ? "" : " off"}" data-index="${index}">
      <span class="glyph">${icon(GLYPHS[layer.type], 16)}</span>
      <span class="layer-name">${escapeHtml(names[index])} <span class="sub">${escapeHtml(layerSummary(layer))}</span></span>
      ${hiddenBy ? `<span class="hidden-tag">Hidden by ${hiddenBy}</span>` : ""}
      <button type="button" class="icon-btn" data-act="up" title="Move up" aria-label="Move up"${first ? " disabled" : ""}>${icon("chevron-up", 14)}</button>
      <button type="button" class="icon-btn" data-act="down" title="Move down" aria-label="Move down"${last ? " disabled" : ""}>${icon("chevron-down", 14)}</button>
      <button type="button" class="switch${layer.visible ? " on" : ""}" role="switch" aria-checked="${layer.visible}" data-act="switch"
        title="${layer.visible ? "Turn off" : "Turn on"} for ${STATE()}" aria-label="${escapeHtml(names[index])} for ${STATE()}"><span></span></button>
      <button type="button" class="icon-btn" data-act="delete" title="Delete layer" aria-label="Delete layer">${icon("trash", 14)}</button>
    </li>`;
  }

  function render(next, nextState) {
    if (nextState !== state) origin = null;
    recipe = next;
    state = nextState;
    const list = layers();
    if (selected >= list.length) selected = list.length - 1;
    const names = layerNames(list);
    const covered = coverage(list, fills);
    const hiddenBy = new Map(covered.map(({ lower, top }) => [lower, list[top].type]));
    // Top first in each group.
    const front = [...list.keys()].filter((i) => !isBack(list[i])).reverse();
    const back = [...list.keys()].filter((i) => isBack(list[i])).reverse();
    const group = (indices) => indices.map((i) => row(list[i], i, names, hiddenBy.get(i), indices)).join("")
      || `<li class="group-empty">None</li>`;
    const warn = covered[0];
    root.innerHTML = `
      <div class="parts-head"><span class="label-strong">Editing ${STATE()} state</span></div>
      <div class="layer-group">
        <div class="group-head"><span class="label-strong">Front</span><span class="help">See-through · any order</span></div>
        <ul class="layer-list">${group(front)}</ul>
        ${addButtons(["text", "icon"])}
      </div>
      <div class="layer-group">
        <div class="group-head"><span class="label-strong">Back</span><span class="help">Solid · fills the button</span></div>
        <ul class="layer-list">${group(back)}</ul>
        ${warn ? `<div class="cover-warn">
          <span>${escapeHtml(names[warn.top])} is solid and covers ${escapeHtml(names[warn.lower])}. Only the top Back layer shows.</span>
          <div class="cover-fixes">
            <button type="button" class="btn-outline small" data-fix="delete" data-lower="${warn.lower}">Delete ${escapeHtml(names[warn.lower].toLowerCase())}</button>
            ${list[warn.top].type === "image" ? `<button type="button" class="btn-outline small" data-fix="shrink" data-top="${warn.top}">Shrink ${escapeHtml(names[warn.top].toLowerCase())}</button>` : ""}
          </div></div>` : ""}
        ${addButtons(["shape", "image"])}
      </div>`;
    if (selected >= 0) {
      root.append(form);
      settings.render(list[selected], { state, view: "layers", title: names[selected] });
    }
  }

  root.addEventListener("click", (event) => {
    if (form.contains(event.target)) return;
    const button = event.target.closest("button");
    const item = event.target.closest(".layer-row");
    const act = button?.dataset.act;
    if (item && act) {
      const index = Number(item.dataset.index);
      const names = layerNames(layers());
      if (act === "up" || act === "down") {
        const moved = moveInGroup(recipe, state, index, act === "up" ? 1 : -1);
        if (selected === index) selected = moved.index;
        else if (selected === moved.index) selected = index;
        commit(moved.recipe, `moving ${names[index]}`);
      } else if (act === "switch") {
        const on = layers()[index].visible;
        commit(setLayerAt(recipe, state, index, { visible: !on }), `turning ${on ? "off" : "on"} ${names[index]}`);
      } else if (act === "delete") {
        if (selected === index) selected = -1;
        else if (selected > index) selected--;
        commit(removeLayerAt(recipe, state, index), `deleting ${names[index]}`);
      }
    } else if (item) {
      selected = Number(item.dataset.index);
      onSelect();
      render(recipe, state);
    } else if (button?.dataset.add) {
      const { recipe: next, index } = addLayerTo(recipe, state, defaultLayerFor(button.dataset.add, catalog, state, recipe.name));
      selected = index;
      commit(next, `adding a ${button.dataset.add} layer to ${STATE()}`);
    } else if (button?.dataset.fix === "delete") {
      const lower = Number(button.dataset.lower);
      if (selected === lower) selected = -1;
      else if (selected > lower) selected--;
      commit(removeLayerAt(recipe, state, lower), "deleting the hidden layer");
    } else if (button?.dataset.fix === "shrink") {
      commit(setLayerAt(recipe, state, Number(button.dataset.top), { size: SHRINK_SIZE, x: CENTRE, y: CENTRE }),
        "shrinking the image");
    }
  });

  return {
    render,
    // Keep the selection when the same button comes back, as after an undo; reset it for another.
    reset() { selected = -1; },
    selectedBounds() {
      const layer = layers()[selected];
      return layer ? layerBounds(layer, layer.type === "image" ? imageSize(layer.src) : null) : null;
    },
    moveSelected({ dx, dy, first }) {
      const layer = layers()[selected];
      if (!layer || layer.type === "shape") return;
      if (first || !origin) origin = { x: layer.x, y: layer.y };
      const x = clampPosition(origin.x + dx);
      const y = clampPosition(origin.y + dy);
      settings.syncPosition(x, y);
      commit(setLayerAt(recipe, state, selected, { x, y }), null, false);
    },
  };
}
