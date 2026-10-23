// electron/context-menu.ts
//
// The right-click menu. Electron shows none by default, so without this you
// can select text, such as several HControl strings, but can't copy it with a
// right-click. Selected text gets Copy; a text field gets Cut, Copy, Paste,
// and Select All, each available only when it would do something.
import type { MenuItemConstructorOptions } from 'electron';

/** The parts of Electron's `ContextMenuParams` this reads. */
export interface ContextParams {
  isEditable: boolean;
  selectionText: string;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}

/** The menu for a right-click, or an empty list when it has nothing to offer. */
export function contextMenuTemplate(params: ContextParams): MenuItemConstructorOptions[] {
  const flags = params.editFlags;
  if (params.isEditable) {
    return [
      { label: 'Cu&t', role: 'cut', enabled: flags.canCut },
      { label: '&Copy', role: 'copy', enabled: flags.canCopy },
      { label: '&Paste', role: 'paste', enabled: flags.canPaste },
      { type: 'separator' },
      { label: 'Select &All', role: 'selectAll', enabled: flags.canSelectAll },
    ];
  }
  if (params.selectionText.trim()) {
    return [{ label: '&Copy', role: 'copy' }];
  }
  return [];
}
