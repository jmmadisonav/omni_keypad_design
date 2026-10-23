// The States rail between the keypad and the sidebar: one tile per state.
// Clicking a tile picks the state you edit, which is also the state the
// keypad shows, and makes its tile bigger. Dragging on the active tile moves
// the selected part or layer, and dragging the handle on its box's corner
// resizes it: onDrag gets the distance from where the drag started, in 188
// units, first, which is true on its first move, and resize.

import { SIZE, STATES, stateName } from "./model.js";
import { paintInto, clearPainted } from "./render.js";

const pct = (value) => `${(value / SIZE) * 100}%`;

export function createRail({ root, catalog, onPick, onRemoveAlt, onDrag }) {
  let recipe = null;
  let state = "off";

  root.innerHTML = `
    <span class="rail-label">States</span>
    ${STATES.map((s) => `
      <div class="rail-state" data-rail="${s}">
        <div class="rail-head"><span>${stateName(s)}</span></div>
        <button type="button" class="rail-tile" data-pick="${s}" aria-label="Edit the ${stateName(s)} state">
          <canvas width="${SIZE}" height="${SIZE}"></canvas>
          <span class="layer-box" hidden></span>
          <span class="resize-handle" title="Drag to resize" hidden></span>
          ${s === "alt" ? `<span class="add-alt">+ Add ALT</span>` : ""}
        </button>
        ${s === "alt" ? `<button type="button" class="link-quiet remove-alt" data-remove-alt
          title="Removes the ALT state from this button.">Remove ALT</button>` : ""}
      </div>`).join("")}
    <p class="help">The panel shows the parts for this state only.</p>`;

  const tile = (s) => root.querySelector(`[data-pick="${s}"]`);
  const canvas = (s) => tile(s).querySelector("canvas");

  function render(next) {
    ({ recipe, state } = next);
    for (const s of STATES) {
      const own = recipe?.states[s];
      root.querySelector(`[data-rail="${s}"]`).classList.toggle("current", s === state);
      tile(s).classList.toggle("empty", !own);
      if (own) paintInto(canvas(s), recipe, s, catalog);
      else clearPainted(canvas(s));
    }
    root.querySelector(".add-alt").hidden = !recipe || Boolean(recipe.states.alt);
    root.querySelector("[data-remove-alt]").hidden = !recipe?.states.alt;
  }

  // The selected part or layer's box on the active tile, in 188 units. The
  // resize handle sits inside the box's bottom-right corner, or inside the
  // tile's edge when the box runs past it.
  function setBox(box) {
    for (const s of STATES) {
      const el = tile(s).querySelector(".layer-box");
      const handle = tile(s).querySelector(".resize-handle");
      const show = Boolean(box) && s === state;
      el.hidden = !show;
      handle.hidden = !show;
      tile(s).classList.toggle("movable", show);
      if (!show) continue;
      Object.assign(el.style, { left: pct(box[0]), top: pct(box[1]), width: pct(box[2]), height: pct(box[3]) });
      const inside = (value) => pct(Math.max(0, Math.min(SIZE, value)));
      Object.assign(handle.style, { left: inside(box[0] + box[2]), top: inside(box[1] + box[3]) });
    }
  }

  // A click picks a tile; a drag on the active tile moves instead of picking.
  let drag = null;
  root.addEventListener("pointerdown", (event) => {
    const t = event.target.closest(".rail-tile");
    if (!t || t.dataset.pick !== state || !t.classList.contains("movable")) return;
    t.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, scale: SIZE / t.getBoundingClientRect().width, moved: false,
             resize: Boolean(event.target.closest(".resize-handle")) };
  });
  root.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = (event.clientX - drag.x) * drag.scale;
    const dy = (event.clientY - drag.y) * drag.scale;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    const first = !drag.moved;
    drag.moved = true;
    onDrag({ dx, dy, first, resize: drag.resize });
  });
  // The click that ends a drag isn't a pick. Only a click straight after the
  // drag is ignored, so a drag that ends without one never eats a later click.
  let ignoreClicksUntil = 0;
  root.addEventListener("pointerup", () => {
    if (drag?.moved) ignoreClicksUntil = performance.now() + 100;
    drag = null;
  });
  root.addEventListener("pointercancel", () => { drag = null; });

  root.addEventListener("click", (event) => {
    if (performance.now() < ignoreClicksUntil) return;
    if (event.target.closest("[data-remove-alt]")) return onRemoveAlt();
    const pick = event.target.closest("[data-pick]")?.dataset.pick;
    if (pick) onPick(pick);
  });

  return { render, setBox };
}
