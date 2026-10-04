import { describe, expect, it } from 'vitest';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import {
  entryPartPatches, entryWithPart, insertEntryPatch, moveEntryPatch, newEntry, removeEntryPatch, shownEntryIndexes,
} from '../../../../src/app/statblocks/editor/statblock-pane/entryPatches';

const bite = { name: 'Bite', desc: 'It bites.' };
const claw = { name: 'Claw', desc: 'It claws.' };
const roar = { name: 'Roar' };
const items = [bite, claw, roar];

const NOTE = `---
actions:
  - name: Bite
    desc: It bites.
  - name: Claw
    desc: It claws.
  - name: Roar
---
Body
`;

describe('entry patches', () => {
  it('sets a part by its path, based on what the entry held', () => {
    expect(entryPartPatches('actions', 1, claw, undefined, 'name', ' Rake ')).toEqual([
      { op: 'set', path: ['actions', 1, 'name'], base: 'Claw', next: 'Rake' },
    ]);
    expect(entryPartPatches('actions', 2, roar, undefined, 'text', 'Everyone hears it.')).toEqual([
      { op: 'set', path: ['actions', 2, 'desc'], base: undefined, next: 'Everyone hears it.' },
    ]);
    expect(entryPartPatches('actions', 0, bite, undefined, 'text', '')).toEqual([
      { op: 'delete', path: ['actions', 0, 'desc'], base: 'It bites.' },
    ]);
    expect(entryPartPatches('actions', 0, bite, undefined, 'name', 'Bite')).toEqual([]);
  });

  it('uses the shape\'s keys, and names an entry written as plain text by making it a record', () => {
    expect(entryPartPatches('moves', 0, { label: 'Hop' }, { nameKey: 'label', textKey: 'text' }, 'text', 'Far.')).toEqual([
      { op: 'set', path: ['moves', 0, 'text'], base: undefined, next: 'Far.' },
    ]);
    expect(entryPartPatches('actions', 0, 'It bites.', undefined, 'name', 'Bite')).toEqual([
      { op: 'set', path: ['actions', 0], base: 'It bites.', next: { name: 'Bite', desc: 'It bites.' } },
    ]);
    expect(entryWithPart(bite, undefined, 'text', '')).toEqual({ name: 'Bite' });
  });

  it('inserts, moves and removes entries by the entry itself', () => {
    expect(insertEntryPatch('actions', items, 0, newEntry(undefined, 'Sting', ''))).toEqual({
      op: 'insert', list: 'actions', after: bite, item: { name: 'Sting' },
    });
    expect(insertEntryPatch('actions', [], null, newEntry(undefined, 'Sting', 'Ow.'))).toEqual({
      op: 'insert', list: 'actions', after: null, item: { name: 'Sting', desc: 'Ow.' },
    });
    expect(moveEntryPatch('actions', items, 1, -1)).toEqual({ op: 'move', list: 'actions', item: claw, after: null });
    expect(moveEntryPatch('actions', items, 0, 1)).toEqual({ op: 'move', list: 'actions', item: bite, after: claw });
    expect(moveEntryPatch('actions', items, 2, 1)).toBeNull();
    expect(removeEntryPatch('actions', roar)).toEqual({ op: 'remove', list: 'actions', item: roar });
  });

  it('moves an entry one place as the patcher applies it', () => {
    const down = applyFrontmatterPatches(NOTE, [moveEntryPatch('actions', items, 0, 1)!]);
    expect(down.conflicts).toEqual([]);
    expect(down.text.indexOf('Claw')).toBeLessThan(down.text.indexOf('Bite'));
    const up = applyFrontmatterPatches(NOTE, [moveEntryPatch('actions', items, 2, -1)!]);
    expect(up.text.indexOf('Roar')).toBeLessThan(up.text.indexOf('Claw'));
    expect(up.text.indexOf('Bite')).toBeLessThan(up.text.indexOf('Roar'));
  });

  it('counts the entries the card shows, as the card does', () => {
    expect(shownEntryIndexes([bite, '', { cost: 2 }, claw], undefined)).toEqual([0, 3]);
  });
});
