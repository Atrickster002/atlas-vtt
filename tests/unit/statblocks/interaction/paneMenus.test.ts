import { describe, expect, it, vi } from 'vitest';
import { fitsMenuLimit, findAction, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';
import { paneBlockMenu, paneEntryMenu, type BlockMenuInput, type EntryMenuInput } from '../../../../src/app/statblocks/editor/statblock-pane/paneMenus';

const labels = (actions: readonly SurfaceAction[]): string[] => actions.map((action) => (action.kind === 'separator' ? '—' : action.label));

function block(extra: Partial<BlockMenuInput> = {}): BlockMenuInput {
  return {
    name: 'Spells', editable: true, hasValues: true, onValue: false,
    edit: vi.fn(), copyText: vi.fn(), clear: vi.fn(), editInTemplate: vi.fn(),
    remove: { label: 'Remove Spells from Hill folk · 3 statblocks', run: vi.fn() }, addSectionBelow: vi.fn(),
    ...extra,
  };
}

function entry(extra: Partial<EntryMenuInput> = {}): EntryMenuInput {
  return {
    name: 'Tentacle', noun: 'action', canMoveUp: true, canMoveDown: true, moveTargets: [{ label: 'Reactions', run: vi.fn() }],
    edit: vi.fn(), move: vi.fn(), addBelow: vi.fn(), duplicate: vi.fn(), copyText: vi.fn(), remove: vi.fn(),
    ...extra,
  };
}

/** The panel's menus (spec §5.5, J11): words that tell the truth about the data. */
describe('the panel\'s block menu', () => {
  it('clears this statblock\'s values, and removes from the template on the last, red row that names its reach', () => {
    const menu = paneBlockMenu(block());
    expect(labels(menu)).toEqual([
      'Edit Spells', 'Copy as text', '—', 'Clear Spells on this statblock', 'Add a section below…', '—', 'Edit in template',
      'Remove Spells from Hill folk · 3 statblocks',
    ]);
    expect(menu.at(-1)).toMatchObject({ destructive: true });
    expect(fitsMenuLimit(menu)).toBe(true);
  });

  it('disables Clear while the note holds nothing for the block, and copies a value from a value', () => {
    const menu = paneBlockMenu(block({ hasValues: false, onValue: true, editable: false, remove: undefined, editInTemplate: undefined, addSectionBelow: undefined }));
    expect(findAction(menu, 'clear')?.disabled).toBe(true);
    expect(labels(menu)).toEqual(['Copy value', '—', 'Clear Spells on this statblock']);
  });
});

describe('rolling from a menu', () => {
  it('rolls the one expression of a value by name, and offers each of several in a submenu', () => {
    const roll = vi.fn();
    expect(labels(paneBlockMenu(block({ rolls: [{ label: '18d10 + 36', run: roll }] })))).toContain('Roll 18d10 + 36');
    findAction(paneBlockMenu(block({ rolls: [{ label: '18d10 + 36', run: roll }] })), 'roll')?.run();
    expect(roll).toHaveBeenCalledTimes(1);
    const both = paneEntryMenu(entry({ rolls: [{ label: '+9', run: vi.fn() }, { label: '2d6 + 5', run: vi.fn() }] }));
    expect(both.find((action) => action.kind === 'submenu' && action.id === 'roll')).toMatchObject({ label: 'Roll' });
    expect(labels(paneEntryMenu(entry()))).not.toContain('Roll');
  });
});

describe('the panel\'s ability menu', () => {
  it('edits, moves within and to other lists, adds, duplicates, copies and deletes, Delete last', () => {
    const menu = paneEntryMenu(entry());
    expect(labels(menu)).toEqual(['Edit Tentacle', '—', 'Move up', 'Move down', 'Move to', '—', 'Add action below', 'Duplicate', 'Copy as text', '—', 'Delete Tentacle']);
    expect(menu.at(-1)).toMatchObject({ destructive: true, hint: 'Del' });
    expect(fitsMenuLimit(menu)).toBe(true);
  });

  it('keeps Move up and Move down at the list\'s ends, disabled, and leaves out Move to without another list', () => {
    const menu = paneEntryMenu(entry({ canMoveUp: false, moveTargets: [] }));
    expect(findAction(menu, 'move-up')?.disabled).toBe(true);
    expect(findAction(menu, 'move-down')?.disabled).toBe(false);
    expect(labels(menu)).not.toContain('Move to');
  });
});
