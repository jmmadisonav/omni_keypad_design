// Keypad geometry, button names, and helpers for button recipes: plain data,
// no DOM. recipe.js describes the recipe format.

export const SIZE = 188;
export const CENTRE = SIZE / 2;
export const MAX_IMPORT = SIZE * 2;      // Dropped images are scaled down to this.
// A keypad's button grid, numbered left to right along the top row first.
// Without a known model, 6 buttons are 2 across (6B, 6BV) and 8 are 4 across (8BV).
// housing is "wall" or "tabletop": the tabletop T6B and T6BV turn the screen
// sideways, so their 6 buttons are 3 columns by 2 rows.
export function gridFor(model, buttonCount, housing = "wall") {
  const tabletop = housing === "tabletop";
  if (model) {
    const grid = (tabletop && model.tabletop) || model;
    return { columns: grid.columns, rows: grid.rows };
  }
  const columns = buttonCount <= 6 ? (tabletop ? 3 : 2) : 4;
  return { columns, rows: Math.ceil(buttonCount / columns) };
}
// The keypad address typed in the header, trimmed, or "" when it can't be one:
// an IPv4 address, or a host name such as kp-lobby.local. Anything else, such
// as pasted log text, counts as no address. server.py's _host_from() agrees.
const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
export function keypadAddress(text) {
  const address = (text || "").trim();
  if (!address || address.length > 253) return "";
  if (/^[\d.]+$/.test(address)) {
    const parts = address.split(".");
    return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255) ? address : "";
  }
  return address.split(".").every((label) => HOST_LABEL.test(label)) ? address : "";
}

// A keypad with no buttons, such as the OMNI-KP-V: just a knob and LED ring.
export function knobOnly(model) {
  return Boolean(model) && model.columns * model.rows === 0;
}
// The pixel size of a keypad's button images. Without a known model, a
// 6-button keypad (6B, 6BV) is 150 and an 8-button one (8BV) is SIZE.
export function imageSizeFor(model, buttonCount) {
  if (model) return model.image_size;
  return buttonCount <= 6 ? 150 : SIZE;
}
export const FONTS = ["Titillium Web", "Inter", "Roboto", "Oswald"];
export const STATES = ["off", "on", "alt"];

// The images a button has: OFF and ON, plus ALT when it has an ALT state.
export function statesOf(recipe) {
  return STATES.filter((state) => recipe?.states?.[state]);
}

export function buttonKey(page, button) {
  return `${page}-${button}`;
}

export function shapeFiles(catalog, set, colour) {
  return catalog.shapes[set]?.[colour] ?? null;
}

// A button made of finished artwork: each state with an image gets one
// full-size image layer holding that image, and a state without one is empty.
// source says where the artwork came from: { kind: "keypad" } for a button
// imported from a keypad, or { kind: "library", name } for ready-made art.
// With an alt image, the button has an ALT state.
export function recipeFromImages(off, on, name = "", source = undefined, alt = "") {
  const images = alt ? { off, on, alt } : { off, on };
  const states = Object.fromEntries(Object.entries(images).map(([state, src]) => {
    if (!src) return [state, { layers: [] }];
    const layer = { type: "image", src, file: "", size: SIZE, x: CENTRE, y: CENTRE, visible: true };
    if (source) layer.source = { ...source };
    return [state, { layers: [layer] }];
  }));
  return { version: 2, name, states };
}

// Whether a button shows nothing in any state.
export function isBlank(recipe) {
  return !Object.values(recipe.states).some((s) =>
    s.layers.some((l) => l.visible && (l.type !== "image" || l.src)));
}

// A custom shape colour recolours one of the set's grey artworks. The grey
// sits at one brightness (base) with a lighter highlight and darker edges:
// base becomes the tint, highlights move part of the way to white, and edges
// darken in proportion, so the shape keeps its shading. Alpha is unchanged.
// Grey has crisp edges; White's are a soft glow, so it's the last choice.
const TINT_SOURCES = ["Grey", "LtGrey", "DkGrey", "White"];
const HIGHLIGHT = 0.6;

// The OFF and ON files to recolour for a shape set, or null if it has no grey.
export function tintSource(catalog, set) {
  const colour = TINT_SOURCES.find((c) => catalog.shapes[set]?.[c]);
  return colour ? catalog.shapes[set][colour] : null;
}

export function tintPixels(data, base, hex) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < data.length; i += 4) {
    const light = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    for (let c = 0; c < 3; c++) {
      data[i + c] = light >= base
        ? rgb[c] + (255 - rgb[c]) * ((light - base) / (1 - base || 1)) * HIGHLIGHT
        : rgb[c] * (light / base);
    }
  }
  return data;
}

export function clampPosition(value) {
  return Math.max(0, Math.min(SIZE, Math.round(value)));
}

// The image file name stem the server uses for a button (keypad_ops.file_base).
export function fileStem(name, page, button) {
  return name ? name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) : `p${page}b${button}`;
}

// The rule in library.validate_name, except that a button may have no name.
const NAME = /^[A-Za-z0-9_-](?:[A-Za-z0-9 _-]{0,62}[A-Za-z0-9_-])?$/;

export function buttonNameError(name) {
  if (!name || NAME.test(name)) return "";
  return "Use 1 to 64 letters, digits, spaces, dashes or underscores, with no space at either end.";
}

// "HDMI_1_OFF_0a1b2c.png" -> "HDMI_1": the name a button's images were saved under.
export function nameFromImage(file) {
  return file.replace(/\.png$/i, "").replace(/_(OFF|ON)(_[0-9a-f]{6})?$/, "");
}

export function searchIcons(tags, query, limit = 60) {
  const names = Object.keys(tags);
  const q = query.trim().toLowerCase();
  if (!q) return names.slice(0, limit);
  const byName = names.filter((n) => n.includes(q));
  const byTag = names.filter((n) => !n.includes(q) && tags[n].some((t) => t.toLowerCase().includes(q)));
  return [...byName, ...byTag].slice(0, limit);
}

export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)),
           height: Math.max(1, Math.round(height * scale)) };
}
