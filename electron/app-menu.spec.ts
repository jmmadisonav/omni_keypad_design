// electron/app-menu.spec.ts
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_MENU_STATE, type MenuState, menuTemplate, parseMenuState } from './app-menu';

const actions = () => ({ send: vi.fn(), view: vi.fn(), guide: vi.fn(), about: vi.fn() });
const menus = (state: MenuState, a = actions()) => menuTemplate(state, a, 'OMNI Keypad Designer');
const submenu = (state: MenuState, label: string, a = actions()) =>
  menus(state, a).find(m => m.label === label)!.submenu as MenuItemConstructorOptions[];
const item = (items: MenuItemConstructorOptions[], label: string) =>
  items.find(i => i.label?.replace('&', '') === label)!;
const click = (i: MenuItemConstructorOptions) => (i.click as () => void)();

const ready: MenuState = {
  open: true, busy: false, unsaved: true, canUndo: true, canRedo: true, hasKeypad: true, locating: false,
  projects: [{ name: 'Lobby', model: 'OMNI-KP-8BV' }],
};

describe('menuTemplate', () => {
  it('has the usual Windows menus, in order', () => {
    expect(menus(ready).map(m => m.label)).toEqual(['&File', '&Edit', '&View', '&Keypad', '&Help']);
  });

  it('passes the project and undo commands you pick to the page', () => {
    const a = actions();
    const file = submenu(ready, '&File', a);
    for (const [label, command] of [['New Project…', 'new'], ['Save', 'save'], ['Save As…', 'save-as'], ['Open Data Folder', 'open-data-folder']]) {
      click(item(file, label));
      expect(a.send).toHaveBeenLastCalledWith(command);
    }
    const open = item(file, 'Open Project').submenu as MenuItemConstructorOptions[];
    click(open[0]);
    expect(a.send).toHaveBeenLastCalledWith('open', 'Lobby');
    expect(open[0].label).toContain('OMNI-KP-8BV');
    const edit = submenu(ready, '&Edit', a);
    click(item(edit, 'Undo'));
    expect(a.send).toHaveBeenLastCalledWith('undo');
    click(item(edit, 'Redo'));
    expect(a.send).toHaveBeenLastCalledWith('redo');
  });

  it('passes the keypad commands to the page', () => {
    const a = actions();
    const keypad = submenu(ready, '&Keypad', a);
    for (const [label, command] of [['Locate', 'locate'], ['Back Up Keypad Now', 'back-up-keypad'], ['Reset Keypad…', 'reset-keypad']]) {
      click(item(keypad, label));
      expect(a.send).toHaveBeenLastCalledWith(command);
    }
  });

  it('ticks Locate while the keypad is locating', () => {
    expect(item(submenu(ready, '&Keypad'), 'Locate').checked).toBe(false);
    expect(item(submenu({ ...ready, locating: true }, '&Keypad'), 'Locate').checked).toBe(true);
  });

  it('turns off the keypad commands until you enter an IP address', () => {
    const keypad = submenu({ ...ready, hasKeypad: false }, '&Keypad');
    expect(keypad.filter(i => i.label).map(i => i.enabled)).toEqual([false, false, false]);
  });

  it('runs the View shortcuts and the Help items', () => {
    const a = actions();
    const viewMenu = submenu(ready, '&View', a);
    click(item(viewMenu, 'Zoom In'));
    expect(a.view).toHaveBeenLastCalledWith('zoom-in');
    click(item(viewMenu, 'Developer Tools'));
    expect(a.view).toHaveBeenLastCalledWith('devtools');
    const help = submenu(ready, '&Help', a);
    click(item(help, 'User Guide'));
    expect(a.guide).toHaveBeenCalled();
    expect(item(help, 'User Guide').accelerator).toBe('F1');
    click(item(help, 'About OMNI Keypad Designer'));
    expect(a.about).toHaveBeenCalled();
  });

  it("shows the Edit and View keys without taking them from the page", () => {
    for (const label of ['&Edit', '&View']) {
      for (const i of submenu(ready, label).filter(i => i.accelerator)) {
        expect(i.registerAccelerator).toBe(false);
      }
    }
  });

  it('turns off Save when nothing has changed, and both saves with no project', () => {
    expect(item(submenu({ ...ready, unsaved: false }, '&File'), 'Save').enabled).toBe(false);
    expect(item(submenu({ ...ready, unsaved: false }, '&File'), 'Save As…').enabled).toBe(true);
    const none = submenu({ ...ready, open: false }, '&File');
    expect(item(none, 'Save').enabled).toBe(false);
    expect(item(none, 'Save As…').enabled).toBe(false);
  });

  it('turns off Undo and Redo when there is nothing to undo or redo', () => {
    const edit = submenu({ ...ready, canUndo: false, canRedo: false }, '&Edit');
    expect([item(edit, 'Undo').enabled, item(edit, 'Redo').enabled]).toEqual([false, false]);
  });

  it('waits while the page is busy, or until it reports in', () => {
    for (const state of [{ ...ready, busy: true }, INITIAL_MENU_STATE]) {
      const file = submenu(state, '&File');
      expect(['New Project…', 'Open Project', 'Save', 'Save As…'].map(l => item(file, l).enabled))
        .toEqual([false, false, false, false]);
    }
  });

  it('says when there are no saved projects', () => {
    const open = item(submenu({ ...ready, projects: [] }, '&File'), 'Open Project').submenu as MenuItemConstructorOptions[];
    expect(open).toEqual([{ label: 'No saved projects', enabled: false }]);
  });
});

describe('parseMenuState', () => {
  it('keeps a well-formed state and drops malformed projects', () => {
    expect(parseMenuState({ ...ready, projects: [...ready.projects, { name: 3 }, null] })).toEqual(ready);
  });

  it('refuses anything else', () => {
    expect(parseMenuState(null)).toBeNull();
    expect(parseMenuState({ ...ready, canUndo: 'yes' })).toBeNull();
  });
});
