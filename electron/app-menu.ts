// electron/app-menu.ts
//
// The app's menu bar, laid out the way Windows apps usually are: File, Edit,
// View, the app's own Keypad menu, and Help. The designer page (designer/static/app.js) carries out the
// project and keypad commands and its own undo: the main process only passes on which
// one you picked. The page reports what the menu needs to know, such as the
// saved projects and whether you can save, whenever it changes.
//
// The Edit and View shortcuts are shown but not registered: the page handles
// Ctrl+Z and Ctrl+Y itself, Windows handles cut, copy, paste, and select all,
// and electron/shortcuts.ts handles the View keys.
import type { MenuItemConstructorOptions } from 'electron';
import type { Shortcut } from './shortcuts';

export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'open-data-folder' | 'undo' | 'redo'
  | 'back-up-keypad' | 'backups' | 'reset-keypad';

/** What the page reports to the menu. */
export interface MenuState {
  /** A project is open. */
  open: boolean;
  /** The page is saving, deploying, or busy with the keypad, so project commands wait. */
  busy: boolean;
  /** The open project has unsaved changes. */
  unsaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** A keypad's IP address is entered. */
  hasKeypad: boolean;
  /** The saved projects, in the order the page lists them. */
  projects: { name: string; model: string }[];
}

export const INITIAL_MENU_STATE: MenuState = {
  open: false, busy: true, unsaved: false, canUndo: false, canRedo: false, hasKeypad: false,
  projects: [],
};

const FLAGS = ['open', 'busy', 'unsaved', 'canUndo', 'canRedo', 'hasKeypad'] as const;

/** Reads a menu state the page sent, or null if it isn't one. */
export function parseMenuState(value: unknown): MenuState | null {
  if (!value || typeof value !== 'object') { return null; }
  const v = value as Record<string, unknown>;
  if (FLAGS.some(flag => typeof v[flag] !== 'boolean') || !Array.isArray(v.projects)) { return null; }
  const projects = v.projects.filter((p): p is { name: string; model: string } =>
    Boolean(p) && typeof p.name === 'string' && typeof p.model === 'string');
  return {
    open: v.open as boolean, busy: v.busy as boolean, unsaved: v.unsaved as boolean,
    canUndo: v.canUndo as boolean, canRedo: v.canRedo as boolean,
    hasKeypad: v.hasKeypad as boolean,
    projects: projects.map(p => ({ name: p.name, model: p.model })),
  };
}

export interface MenuActions {
  /** Passes a command you pick to the page. */
  send: (command: MenuCommand, arg?: string) => void;
  /** Does what a View shortcut does. */
  view: (shortcut: Shortcut) => void;
  /** Opens the user guide in your browser. */
  guide: () => void;
  /** Shows Help > About. */
  about: () => void;
}

/** A menu item that shows a shortcut someone else handles. */
const shown = (accelerator: string) => ({ accelerator, registerAccelerator: false });

export function menuTemplate(state: MenuState, actions: MenuActions, appName: string): MenuItemConstructorOptions[] {
  const { send, view, guide, about } = actions;
  const ready = !state.busy;
  const projects: MenuItemConstructorOptions[] = state.projects.length
    ? state.projects.map(p => ({ label: `${p.name}  ·  ${p.model}`, enabled: ready, click: () => send('open', p.name) }))
    : [{ label: 'No saved projects', enabled: false }];
  return [
    {
      label: '&File',
      submenu: [
        { label: '&New Project…', accelerator: 'Ctrl+N', enabled: ready, click: () => send('new') },
        { label: '&Open Project', enabled: ready, submenu: projects },
        { type: 'separator' },
        { label: '&Save', accelerator: 'Ctrl+S', enabled: ready && state.open && state.unsaved, click: () => send('save') },
        { label: 'Save &As…', accelerator: 'Ctrl+Shift+S', enabled: ready && state.open, click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Open &Data Folder', click: () => send('open-data-folder') },
        { type: 'separator' },
        { label: 'E&xit', role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { label: '&Undo', ...shown('Ctrl+Z'), enabled: ready && state.canUndo, click: () => send('undo') },
        { label: '&Redo', ...shown('Ctrl+Y'), enabled: ready && state.canRedo, click: () => send('redo') },
        { type: 'separator' },
        { label: 'Cu&t', role: 'cut', ...shown('Ctrl+X') },
        { label: '&Copy', role: 'copy', ...shown('Ctrl+C') },
        { label: '&Paste', role: 'paste', ...shown('Ctrl+V') },
        { type: 'separator' },
        { label: 'Select &All', role: 'selectAll', ...shown('Ctrl+A') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: '&Reload', ...shown('F5'), click: () => view('reload') },
        { type: 'separator' },
        { label: 'Zoom &In', ...shown('Ctrl+Plus'), click: () => view('zoom-in') },
        { label: 'Zoom &Out', ...shown('Ctrl+-'), click: () => view('zoom-out') },
        { label: '&Actual Size', ...shown('Ctrl+0'), click: () => view('zoom-reset') },
        { type: 'separator' },
        { label: '&Developer Tools', ...shown('F12'), click: () => view('devtools') },
      ],
    },
    {
      label: '&Keypad',
      submenu: [
        { label: '&Back Up Keypad Now', enabled: ready && state.hasKeypad, click: () => send('back-up-keypad') },
        { label: 'B&ackups…', enabled: ready, click: () => send('backups') },
        { type: 'separator' },
        { label: '&Reset Keypad…', enabled: ready && state.hasKeypad, click: () => send('reset-keypad') },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: '&User Guide', accelerator: 'F1', click: guide },
        { type: 'separator' },
        { label: `&About ${appName}`, click: about },
      ],
    },
  ];
}
