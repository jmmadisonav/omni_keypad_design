// electron/shortcuts.ts
//
// The View menu's shortcuts (see electron/app-menu.ts), handled before the
// page sees the key. The menu shows them but doesn't register them. Cut,
// copy, paste, and select all work on Windows without a registered key, and
// Ctrl+Z and Ctrl+Y belong to the designer's own undo. There's no full
// screen key: full screen hides the menu bar, with no way back to it.

export type Shortcut = 'devtools' | 'reload' | 'zoom-in' | 'zoom-out' | 'zoom-reset';

/** The parts of Electron's `Input` this reads. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function shortcutFor(input: KeyInput): Shortcut | null {
  if (input.type !== 'keyDown' || input.alt || input.meta) { return null; }
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (!input.control) {
    if (input.shift) { return null; }
    return ({ F5: 'reload', F12: 'devtools' } as Record<string, Shortcut>)[key] ?? null;
  }
  if (input.shift && key === 'i') { return 'devtools'; }
  if (key === '=' || key === '+') { return 'zoom-in'; }
  if (input.shift) { return null; }
  return ({ r: 'reload', '-': 'zoom-out', '0': 'zoom-reset' } as Record<string, Shortcut>)[key] ?? null;
}
