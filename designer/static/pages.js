// The design's pages and where each button switches to: plain data, no DOM.
// Pages have stable ids ("L2" for loaded page 2, "N1" for the first new
// page), so edits and destinations survive pages being added or deleted.
// A layout is { pages: [{ id, name, source, background, ranges }], destinations: { "<id>-<button>": id }, next }.
// background is the page's #RRGGBB colour, which shows around the buttons and
// behind blank or transparent ones. ranges is { dial, ring }: each [min, max],
// or null to leave it blank so the keypad uses its own range (0 to 200).

export const MAX_PAGES = 9;
const BLACK = "#000000";
const BLANK_RANGES = { dial: null, ring: null };

// A control's range in a design, or null when it has none.
function rangeIn(control) {
  return typeof control?.min === "number" && typeof control?.max === "number" ? [control.min, control.max] : null;
}

const key = (pageId, button) => `${pageId}-${button}`;

export function layoutFromConfig(config) {
  const pages = config.pages.map((page, i) => ({ id: `L${i + 1}`, name: page.name, source: i + 1,
                                                 background: (page.background || BLACK).toUpperCase(),
                                                 ranges: { dial: rangeIn(page.dial), ring: rangeIn(page.ledring) } }));
  const byName = new Map(pages.map((p) => [p.name, p.id]));
  const destinations = {};
  config.pages.forEach((page, i) => {
    (page.buttons || []).forEach((button, j) => {
      const target = byName.get(button.destination);
      if (target) destinations[key(`L${i + 1}`, j + 1)] = target;
    });
  });
  return { pages, destinations, next: 1 };
}

export function pageNumber(layout, id) {
  return layout.pages.findIndex((p) => p.id === id) + 1;
}

export function pageName(layout, id) {
  return layout.pages.find((p) => p.id === id)?.name ?? "";
}

export function addPage(layout) {
  if (layout.pages.length >= MAX_PAGES) {
    throw new Error(`A design can have at most ${MAX_PAGES} pages.`);
  }
  const taken = new Set(layout.pages.map((p) => p.name.toLowerCase()));
  let n = layout.pages.length + 1;
  while (taken.has(`page ${n}`)) n++;
  const page = { id: `N${layout.next}`, name: `Page ${n}`, source: null,
                 background: layout.pages[0]?.background ?? BLACK, ranges: BLANK_RANGES };
  return { ...layout, pages: [...layout.pages, page], next: layout.next + 1 };
}

export function renamePage(layout, id, name) {
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name for the page.");
  if (layout.pages.some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`There's already a page called ${clean}.`);
  }
  return { ...layout, pages: layout.pages.map((p) => (p.id === id ? { ...p, name: clean } : p)) };
}

export function backgroundOf(layout, id) {
  return layout.pages.find((p) => p.id === id)?.background ?? BLACK;
}

export function setBackground(layout, id, colour) {
  return { ...layout, pages: layout.pages.map((p) => (p.id === id ? { ...p, background: colour } : p)) };
}

// which is "dial" or "ring".
export function rangeOf(layout, id, which) {
  return layout.pages.find((p) => p.id === id)?.ranges?.[which] ?? null;
}

export function setRange(layout, id, which, range) {
  return { ...layout, pages: layout.pages.map((p) =>
    (p.id === id ? { ...p, ranges: { ...(p.ranges ?? BLANK_RANGES), [which]: range } } : p)) };
}

// Why a min and max typed by hand aren't a range, or "" when they are (both blank is fine).
export function rangeError(min, max) {
  const [a, b] = [min.trim(), max.trim()];
  if (!a && !b) return "";
  if (!a || !b) return "Enter both a min and a max, or leave both blank.";
  if (!/^-?\d+$/.test(a) || !/^-?\d+$/.test(b)) return "Use whole numbers.";
  if (Number(a) >= Number(b)) return "Min must be less than max.";
  return "";
}

const CONTROL_NAMES = { dial: "dial", ledring: "LED ring", dial_button: "dial button" };

function joinNames(items) {
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

// ["dial", "button5", "button3"] -> "Dial and buttons 3 and 5".
function controlNames(controls) {
  const names = controls.filter((c) => CONTROL_NAMES[c]).map((c) => CONTROL_NAMES[c]);
  const buttons = controls.filter((c) => !CONTROL_NAMES[c]).map((c) => Number(c.slice("button".length)))
    .sort((a, b) => a - b);
  if (buttons.length) names.push(`button${buttons.length > 1 ? "s" : ""} ${joinNames(buttons.map(String))}`);
  const text = joinNames(names);
  return text[0].toUpperCase() + text.slice(1);
}

// One line per device or script reference for a saved page's bindings, from
// the project's "bindings" list. page is the saved page number, or null for
// a page added since the last save.
export function bindingLines(bindings, page) {
  const groups = new Map();
  for (const b of bindings) {
    if (b.page !== page) continue;
    const label = b.kind === "omni" ? `bound to ${b.remote || "an OMNI device"}` : `script reference ${b.path}`;
    groups.set(label, [...(groups.get(label) ?? []), b.control]);
  }
  return [...groups].map(([label, controls]) => `${controlNames(controls)}: ${label}`);
}

export function deletePage(layout, id) {
  if (layout.pages.length <= 1) throw new Error("You can't delete the last page.");
  const destinations = Object.fromEntries(Object.entries(layout.destinations)
    .filter(([from, to]) => to !== id && !from.startsWith(`${id}-`)));
  return { ...layout, pages: layout.pages.filter((p) => p.id !== id), destinations };
}

export function destinationsTo(layout, id) {
  return Object.values(layout.destinations).filter((to) => to === id).length;
}

export function destinationOf(layout, pageId, button) {
  return layout.destinations[key(pageId, button)] ?? null;
}

export function setDestination(layout, pageId, button, targetId) {
  const destinations = { ...layout.destinations };
  if (targetId) destinations[key(pageId, button)] = targetId;
  else delete destinations[key(pageId, button)];
  return { ...layout, destinations };
}

// Swap two buttons' page links, as when you drag one button onto another. A
// link that would then point at its own page is dropped.
export function swapDestinations(layout, a, b) {
  const destinations = { ...layout.destinations };
  const ka = key(a.pageId, a.button);
  const kb = key(b.pageId, b.button);
  const [ta, tb] = [destinations[ka], destinations[kb]];
  delete destinations[ka];
  delete destinations[kb];
  if (tb && tb !== a.pageId) destinations[ka] = tb;
  if (ta && ta !== b.pageId) destinations[kb] = ta;
  return { ...layout, destinations };
}

// The deploy request's "layout": current page numbers, names, backgrounds, and ranges.
export function layoutRequest(layout) {
  return {
    pages: layout.pages.map((p) => ({ name: p.name, source: p.source, background: p.background,
                                      dialRange: p.ranges?.dial ?? null, ringRange: p.ranges?.ring ?? null })),
    destinations: Object.entries(layout.destinations).map(([from, to]) => {
      const [pageId, button] = from.split("-");
      return { page: pageNumber(layout, pageId), button: Number(button), destination: pageName(layout, to) };
    }),
  };
}

// Saved projects key button layers by page number ("2-3"); the page keys
// them by page id ("L2-3"), like edits.
export function recipesFromSaved(saved) {
  return Object.fromEntries(Object.entries(saved || {}).map(([k, recipe]) => [`L${k}`, recipe]));
}

export function recipesRequest(layout, recipes) {
  const result = {};
  for (const [k, recipe] of recipes) {
    const [pageId, button] = k.split("-");
    const page = pageNumber(layout, pageId);
    if (page) result[`${page}-${button}`] = recipe;
  }
  return result;
}
