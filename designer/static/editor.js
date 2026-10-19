// The BUTTON tab's editor: the header with the state chip, the Simple |
// Layers toggle and Copy state, then Simple or Layers for the state you're
// editing. It also drives the States rail. You edit one state at a time, and
// that state is the one the keypad shows.

import { STATES } from "./model.js";
import { fitsSimple, copyState, startAlt, removeAlt, movedText } from "./recipe.js";
import { renderRecipe } from "./render.js";
import { createRail } from "./rail.js";
import { createSimple } from "./simple.js";
import { createLayers } from "./layers.js";
import { escapeHtml } from "./layer-settings.js";

export { icon } from "./layer-settings.js";

// onRename(name) gets the button name as you type it, after you double-click the name.
export function createEditor({ root, railRoot, catalog, iconTags, onChange, onState, onRename, onCopyToButton, onStatus, onConfirm }) {
  let recipe = null;
  let state = "off";
  let mode = "simple";
  let moved = [];
  let menuOpen = false;
  const imageSizes = new Map();      // src -> { width, height }, or null while it loads.

  root.innerHTML = `
    <div class="ed-head">
      <div class="ed-title">
        <div class="overline" data-overline></div>
        <div class="sel-title"><span data-name title="Double-click to rename"></span>
          <input class="name-edit" data-name-edit spellcheck="false" maxlength="64" aria-label="Button name" hidden><span class="dot">.</span>
          <span class="state-chip" data-chip></span>
          <span class="changed-tag" data-changed hidden>Changed</span></div>
      </div>
      <div class="ed-actions">
        <div class="seg seg-mode" role="group" aria-label="Editor">
          <button type="button" data-mode="simple">Simple</button>
          <button type="button" data-mode="layers">Layers</button>
        </div>
        <div class="copy-wrap">
          <button type="button" class="copy-btn" data-copy-state aria-haspopup="menu">Copy state ▾</button>
          <div class="copy-menu" role="menu" hidden></div>
        </div>
      </div>
    </div>
    <div class="moved-note" hidden></div>
    <div class="ed-view" data-view="simple"></div>
    <div class="ed-view" data-view="layers" hidden></div>
    <div class="empty-alt" hidden>
      <h3 class="title-sm">No ALT state yet<span class="dot">.</span></h3>
      <p class="note">ALT shows when the control system sets this button to Alt. Start it from an existing state, or from blank.</p>
      <button type="button" class="btn-dark" data-start-alt="off">Start from OFF</button>
      <button type="button" class="btn-outline" data-start-alt="on">Start from ON</button>
      <button type="button" class="btn-outline quiet" data-start-alt="">Start blank</button>
    </div>
    <p class="help pad-x" data-hint>Need two lines of text, a second icon or a different order? Switch to Layers.</p>
    <p class="help pad-x" data-size></p>`;

  const $ = (selector) => root.querySelector(selector);
  const menu = $(".copy-menu");

  // The natural size of an image, loaded once. Views that measure images draw again when it's known.
  function imageSize(src) {
    if (!src) return null;
    if (!imageSizes.has(src)) {
      imageSizes.set(src, null);
      const img = new Image();
      img.onload = () => {
        imageSizes.set(src, { width: img.naturalWidth, height: img.naturalHeight });
        if (recipe) renderView();
      };
      img.src = src;
    }
    return imageSizes.get(src);
  }

  function accept(next, label) {
    recipe = next;
    moved = [];
    $(".moved-note").hidden = true;
    onChange(recipe, label);
  }

  // A change from a view: the view has drawn itself already.
  function fromView(next, label) {
    accept(next, label);
    renderToggle();
    renderRail();
  }

  const shared = { catalog, iconTags, onChange: fromView, onSelect: () => renderRail(), onStatus, onConfirm, imageSize };
  const views = {
    simple: createSimple({ root: $('[data-view="simple"]'), ...shared }),
    layers: createLayers({ root: $('[data-view="layers"]'), ...shared }),
  };

  const rail = createRail({
    root: railRoot, catalog,
    onPick: (next) => onState(next),
    onRemoveAlt: () => {
      if (state === "alt") onState("off");
      change(removeAlt(recipe), "removing ALT");
      onStatus("Removed the ALT state. When you save, this button has no ALT image on the keypad.");
    },
    onDrag: (drag) => {
      views[mode].moveSelected(drag);
      renderRail();
    },
  });

  // A change made here, in the shell: the view draws first, so the rail can
  // ask it for the selection box.
  function change(next, label) {
    accept(next, label);
    renderView();
  }

  function renderRail() {
    rail.render({ recipe, state });
    rail.setBox(recipe?.states[state] ? views[mode].selectedBounds() : null);
  }

  function renderToggle() {
    const fit = recipe ? fitsSimple(recipe) : { ok: true };
    for (const button of root.querySelectorAll("[data-mode]")) {
      button.classList.toggle("current", button.dataset.mode === mode);
    }
    const simple = $('[data-mode="simple"]');
    simple.disabled = !fit.ok;
    simple.title = fit.ok ? "Four fixed parts for each state" : fit.reason;
    $('[data-mode="layers"]').title = "Any number of layers, in Front and Back groups";
  }

  function renderView() {
    const blankAlt = Boolean(recipe) && !recipe.states[state];
    $(".empty-alt").hidden = !blankAlt;
    for (const [name, view] of Object.entries(views)) {
      const el = $(`[data-view="${name}"]`);
      el.hidden = blankAlt || name !== mode || !recipe;
      if (!el.hidden) view.render(recipe, state);
    }
    $("[data-hint]").hidden = blankAlt || mode !== "simple" || !recipe;
    $("[data-chip]").textContent = state.toUpperCase();
    $("[data-copy-state]").disabled = blankAlt;
    renderToggle();
    renderRail();
  }

  function renderMenu() {
    menu.hidden = !menuOpen;
    $("[data-copy-state]").classList.toggle("open", menuOpen);
    if (!menuOpen) return;
    const S = state.toUpperCase();
    const rows = STATES.filter((s) => s !== state).map((to) => [`to:${to}`,
      `Copy the ${S} state to ${to.toUpperCase()}`,
      recipe.states[to] ? `Replaces the current ${to.toUpperCase()} parts` : `Creates the ${to.toUpperCase()} state`]);
    rows.push(["button:state", `Copy the ${S} state to another button…`, "Then click a button on the keypad"]);
    rows.push(["button:all", "Copy all states to another button…", "Then click a button on the keypad"]);
    menu.innerHTML = rows.map(([act, text, sub]) => `<button type="button" role="menuitem" data-menu="${act}">
      <span class="menu-text">${escapeHtml(text)}</span><span class="sub">${escapeHtml(sub)}</span></button>`).join("");
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    renderMenu();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !recipe) return;
    if (button.dataset.mode && button.dataset.mode !== mode) {
      mode = button.dataset.mode;
      const next = { ...recipe };
      if (mode === "layers") next.editor = "layers";
      else delete next.editor;
      change(next, mode === "layers" ? "switching to Layers" : "switching to Simple");
    } else if (button.hasAttribute("data-copy-state")) {
      menuOpen = !menuOpen;
      renderMenu();
    } else if (button.dataset.menu) {
      const [kind, value] = button.dataset.menu.split(":");
      closeMenu();
      if (kind === "to") {
        const [from, to] = [state.toUpperCase(), value.toUpperCase()];
        change(copyState(recipe, state, value), `copying ${from} to ${to}`);
        onConfirm(`Copied ${from} to ${to}. You can now change ${to} on its own.`);
      } else {
        onCopyToButton(value);
      }
    } else if (button.dataset.startAlt !== undefined) {
      const from = button.dataset.startAlt || null;
      change(startAlt(recipe, from), "starting ALT");
      onStatus(from ? `Started ALT from ${from.toUpperCase()}. You can now change ALT on its own.` : "Started a blank ALT state.");
    }
  });

  document.addEventListener("click", (event) => {
    if (menuOpen && !event.target.closest(".copy-wrap")) closeMenu();
  });

  // Renaming: double-click the name. Enter or leaving the field keeps it; Esc puts the old name back.
  const nameLabel = $("[data-name]");
  const nameEdit = $("[data-name-edit]");
  let nameBefore = "";
  nameLabel.addEventListener("dblclick", () => {
    if (!recipe) return;
    nameBefore = recipe.name || "";
    nameEdit.value = nameBefore;
    nameLabel.hidden = true;
    nameEdit.hidden = false;
    nameEdit.focus();
    nameEdit.select();
  });
  const endRename = () => {
    nameEdit.hidden = true;
    nameLabel.hidden = false;
  };
  nameEdit.addEventListener("input", () => onRename(nameEdit.value));
  nameEdit.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      nameEdit.value = nameBefore;
      onRename(nameBefore);
    }
    if (event.key === "Enter" || event.key === "Escape") endRename();
  });
  nameEdit.addEventListener("blur", endRename);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  renderRail();

  return {
    getRecipe: () => recipe,
    // moved lists layers that migration moved behind Front layers; the button
    // opens in Layers with a note naming the first. keep holds on to the open
    // part or selected layer, as after an undo.
    setRecipe(next, { moved: nextMoved = [], keep = false } = {}) {
      recipe = next;
      moved = nextMoved;
      closeMenu();
      if (!keep) Object.values(views).forEach((view) => view.reset());
      if (recipe && !(keep && mode === "layers")) {
        mode = moved.length || !fitsSimple(recipe).ok || recipe.editor === "layers" ? "layers" : "simple";
      }
      const note = $(".moved-note");
      note.hidden = !moved.length;
      if (moved.length) {
        note.textContent = `${movedText(moved)} The keypad shows the old order until you change this button.`;
      }
      renderView();
    },
    setHeader(overline, name, changed) {
      $("[data-overline]").textContent = overline;
      $("[data-name]").textContent = name;
      $("[data-changed]").hidden = !changed;
    },
    // Change the button's name without touching its states.
    rename(name) {
      if (!recipe) return;
      recipe = { ...recipe, name };
      onChange(recipe);
    },
    setState(next) {
      if (next === state) return;
      state = next;
      closeMenu();
      renderView();
    },
    // The keypad's image size, for the help line. Layers stay in 188-unit coordinates.
    setImageSize(size) {
      $("[data-size]").textContent = `${size} × ${size} px on the keypad. Drag on the selected state to move a part.`;
    },
    // The OFF image, for the library thumbnail.
    async thumbnail() {
      return (await renderRecipe(recipe, catalog)).off;
    },
  };
}
