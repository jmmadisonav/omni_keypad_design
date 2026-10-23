// electron/context-menu.spec.ts
import { describe, expect, it } from 'vitest';
import { type ContextParams, contextMenuTemplate } from './context-menu';

const flags = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false };
const params = (extra: Partial<ContextParams> = {}): ContextParams =>
  ({ isEditable: false, selectionText: '', editFlags: flags, ...extra });

describe('contextMenuTemplate', () => {
  it('offers Copy for selected text, such as several HControl strings', () => {
    const menu = contextMenuTemplate(params({ selectionText: '@subscribe {...}\n@subscribe {...}' }));
    expect(menu).toEqual([{ label: '&Copy', role: 'copy' }]);
  });

  it('offers nothing with no selection', () => {
    expect(contextMenuTemplate(params())).toEqual([]);
    expect(contextMenuTemplate(params({ selectionText: ' \n' }))).toEqual([]);
  });

  it('offers the edit commands in a text field, each when it can run', () => {
    const menu = contextMenuTemplate(params({ isEditable: true, editFlags: { ...flags, canPaste: true, canSelectAll: true } }));
    expect(menu.map(i => i.role ?? i.type)).toEqual(['cut', 'copy', 'paste', 'separator', 'selectAll']);
    expect(menu.filter(i => i.enabled).map(i => i.role)).toEqual(['paste', 'selectAll']);
  });
});
