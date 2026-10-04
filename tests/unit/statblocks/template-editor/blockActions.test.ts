import { describe, expect, it } from 'vitest';
import {
  deleteSelection, duplicateSelection, groupSelection, insertCatalogueBlock, insertNamedStat, pasteClip,
  putSelectionSideBySide, turnSelectionInto, ungroupSelection,
} from '../../../../src/app/statblocks/editor/template-editor/blockActions';
import { clipOf, copyBlocks, rememberClip } from '../../../../src/app/statblocks/editor/template-editor/blockClipboard';
import { insertTarget, moveIntoPrevious, moveOutOfParent, moveSelection } from '../../../../src/app/statblocks/editor/template-editor/blockMoves';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FakeSession, sampleTemplate, shape, template } from './editorKit';

const session = (): FakeSession => new FakeSession(sampleTemplate());
const layoutShape = (s: FakeSession): string => shape(s.template.layout.blocks);

describe('moving blocks without a drag', () => {
  it('steps a block past its neighbour, then out of its container at the end', () => {
    const s = session();
    expect(moveSelection(s, ['stat-hp1'], -1).announce).toBe('Moved Hit points to section Defenses, position 1 of 2.');
    expect(layoutShape(s)).toBe('title001 section1(stat-hp1 stat-ac1) row00001(stat-sp1 stat-cr1) divider1');
    moveSelection(s, ['stat-hp1'], -1);
    expect(layoutShape(s)).toBe('title001 stat-hp1 section1(stat-ac1) row00001(stat-sp1 stat-cr1) divider1');
    expect(s.steps).toBe(2);
  });

  it('moves a run of siblings together and stops at the end of the list', () => {
    const s = session();
    moveSelection(s, ['stat-sp1', 'stat-cr1'], 1);
    expect(layoutShape(s)).toBe('title001 section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1) divider1');
    expect(moveSelection(s, ['divider1'], 1).announce).toBe('Already at the end.');
    expect(s.steps).toBe(0);
  });

  it('puts a block into the container before it, and out of its own', () => {
    const s = session();
    expect(moveIntoPrevious(s, 'row00001').announce).toBe('Moved Side by side to section Defenses, position 3 of 3.');
    expect(layoutShape(s)).toBe('title001 section1(stat-ac1 stat-hp1 row00001(stat-sp1 stat-cr1)) divider1');
    expect(moveIntoPrevious(s, 'title001').announce).toBe('There is no section or row before it.');
    moveOutOfParent(s, 'stat-ac1');
    expect(layoutShape(s)).toBe('title001 section1(stat-hp1 row00001(stat-sp1 stat-cr1)) stat-ac1 divider1');
    expect(moveOutOfParent(s, 'title001').announce).toBe('Already at the top level.');
  });

  it('refuses a Row into a Row, saying why', () => {
    const s = new FakeSession(template([
      { id: 'rowaaaa1', type: 'row', blocks: [] },
      { id: 'rowbbbb1', type: 'row', blocks: [] },
    ]));
    expect(moveIntoPrevious(s, 'rowbbbb1').announce).toBe("That block can't go there.");
    expect(s.steps).toBe(0);
  });

  it('inserts after the anchor, or after the Row a Row would land in', () => {
    const { layout } = sampleTemplate();
    expect(insertTarget(layout, 'stat-ac1', 'stat')).toEqual({ parentId: 'section1', index: 1 });
    expect(insertTarget(layout, 'stat-sp1', 'row')).toEqual({ parentId: null, index: 3 });
    expect(insertTarget(layout, null, 'stat')).toEqual({ parentId: null, index: 4 });
  });

  it('fills an empty container it is anchored on, where the container takes the type', () => {
    const layout = { maxColumns: 1 as const, blocks: [
      { id: 'tabs0001', type: 'tabs' as const, blocks: [{ id: 'tabempty', type: 'section' as const, heading: 'Tab 1', blocks: [] }] },
      { id: 'rowempty', type: 'row' as const, blocks: [] },
    ] };
    expect(insertTarget(layout, 'tabempty', 'stat')).toEqual({ parentId: 'tabempty', index: 0 });
    expect(insertTarget(layout, 'rowempty', 'stat')).toEqual({ parentId: 'rowempty', index: 0 });
    expect(insertTarget(layout, 'rowempty', 'row')).toEqual({ parentId: null, index: 2 });
  });
});

describe('inserting', () => {
  it('inserts a catalogue block after the selection as one step, selected', () => {
    const s = session();
    const outcome = insertCatalogueBlock(s, 'stat', { after: 'stat-ac1' });
    expect(s.steps).toBe(1);
    expect(outcome.inserted).toBeDefined();
    expect(outcome.select).toEqual([outcome.inserted]);
    expect(findBlock(s.template.layout.blocks, outcome.inserted ?? '')).toMatchObject({ parentId: 'section1', index: 1 });
  });

  it('brings the name field along with a Title where the template lacks it', () => {
    const s = new FakeSession(template([]));
    insertCatalogueBlock(s, 'title', { after: null });
    expect(s.template.fields).toEqual([{ key: 'name', label: 'Name', type: 'text' }]);
  });

  it('inserts a Value of the name typed, with a new property of that name', () => {
    const s = new FakeSession(template([]));
    const outcome = insertNamedStat(s, 'Mana', { after: null });
    expect(s.steps).toBe(1);
    expect(s.template.fields).toEqual([{ key: 'mana', label: 'Mana', type: 'text' }]);
    expect(s.template.layout.blocks[0]).toMatchObject({ type: 'stat', field: 'mana' });
    expect(outcome.announce).toBe('Added Mana.');
  });

  it('inserts at the gap the + line named', () => {
    const s = session();
    const outcome = insertCatalogueBlock(s, 'divider', { at: { parentId: 'row00001', index: 1 } });
    expect(findBlock(s.template.layout.blocks, outcome.inserted ?? '')).toMatchObject({ parentId: 'row00001', index: 1 });
  });

  it('changes nothing in a built-in, and says so', () => {
    const s = new FakeSession(sampleTemplate(), { readOnly: true, readOnlyReason: 'built-in' });
    expect(insertCatalogueBlock(s, 'stat', { after: null }).announce).toBe('Built-in template. Make a copy to change it.');
    expect(deleteSelection(s, ['stat-ac1']).announce).toBe('Built-in template. Make a copy to change it.');
    expect(s.steps).toBe(0);
  });
});

describe('the toolbar\'s edits', () => {
  it('deletes the selection in one step, names it, and moves focus to the next sibling', () => {
    const s = session();
    const outcome = deleteSelection(s, ['stat-ac1']);
    expect(outcome).toMatchObject({ select: ['stat-hp1'], deleted: 'Armor class' });
    expect(outcome.announce).toMatch(/^Deleted Armor class\. Press (Cmd|Ctrl)\+Z to undo\.$/);
    s.undo();
    expect(layoutShape(s)).toBe(shape(sampleTemplate().layout.blocks));
  });

  it('duplicates each selected block right after it and selects the copies', () => {
    const s = session();
    const outcome = duplicateSelection(s, ['stat-ac1', 'stat-hp1']);
    expect(s.steps).toBe(1);
    const section = findBlock(s.template.layout.blocks, 'section1')?.block;
    const ids = section && 'blocks' in section ? section.blocks.map((block) => block.id) : [];
    expect(ids).toHaveLength(4);
    expect(outcome.select).toEqual([ids[1], ids[3]]);
  });

  it('groups siblings into a section, puts a lone block beside the next, and ungroups', () => {
    const s = session();
    const grouped = groupSelection(s, ['title001', 'section1']);
    expect(grouped.announce).toBe('Grouped into a section.');
    const sectionId = grouped.select?.[0] ?? '';
    expect(layoutShape(s)).toBe(`${sectionId}(title001 section1(stat-ac1 stat-hp1)) row00001(stat-sp1 stat-cr1) divider1`);
    expect(ungroupSelection(s, [sectionId]).select).toEqual(['title001']);
    const side = putSelectionSideBySide(s, ['stat-ac1']);
    expect(layoutShape(s)).toBe(`title001 section1(${side.select?.[0] ?? ''}(stat-ac1 stat-hp1)) row00001(stat-sp1 stat-cr1) divider1`);
    expect(ungroupSelection(s, ['stat-ac1']).announce).toBe('Select a section or row first.');
  });

  it('turns a block into another type in place', () => {
    const s = session();
    expect(turnSelectionInto(s, ['stat-ac1'], 'track').announce).toBe('Turned into Track.');
    expect(findBlock(s.template.layout.blocks, 'stat-ac1')?.block).toMatchObject({ type: 'track', field: 'ac' });
  });

  it('copies blocks with their fields and pastes them re-keyed, into another template too', () => {
    const owner = {};
    const clip = copyBlocks(sampleTemplate(), ['row00001']);
    expect(clip?.fields.map((field) => field.key)).toEqual(['speed', 'cr']);
    if (clip) rememberClip(owner, clip);
    const other = new FakeSession(template([{ id: 'only0001', type: 'divider' }], [{ key: 'speed', label: 'Pace', type: 'number' }]));
    const outcome = pasteClip(other, clipOf(owner) ?? clip!, 'only0001');
    const pasted = findBlock(other.template.layout.blocks, outcome.inserted ?? '')?.block;
    expect(pasted?.id).not.toBe('row00001');
    expect(pasted && 'blocks' in pasted ? pasted.blocks.map((block) => block.id) : []).not.toContain('stat-sp1');
    // The template's own Speed stays; Challenge comes along.
    expect(other.template.fields).toEqual([{ key: 'speed', label: 'Pace', type: 'number' }, { key: 'cr', label: 'Challenge', type: 'rating' }]);
    expect(other.steps).toBe(1);
  });
});
