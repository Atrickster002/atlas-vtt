import { describe, expect, it } from 'vitest';
import { cancelledText, pickedUpText, targetText } from '../../../../src/app/statblocks/editor/dnd/announcements';
import { subjectOf } from '../../../../src/app/statblocks/editor/dnd/dragSources';
import { applyDrop, treeTargetOf } from '../../../../src/app/statblocks/editor/dnd/dropEdits';
import type { DropLine } from '../../../../src/app/statblocks/editor/dnd/dropGeometry';
import { siblingShifts } from '../../../../src/app/statblocks/editor/dnd/siblingShifts';
import { FakeSession, sampleTemplate, shape } from '../template-editor/editorKit';
import { insertItemFor } from '../../../../src/app/statblocks/editor/template-editor/insertItems';

const LINE: DropLine = { orientation: 'horizontal', x: 0, y: 0, length: 10 };
const box = (top: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({ left: 0, top, right: 100, bottom });

describe('applyDrop', () => {
  it('moves a block into another container as one undo step, keeping its id and selecting it', () => {
    const session = new FakeSession(sampleTemplate());
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, { kind: 'between', parentId: 'section1', index: 1, line: LINE });
    expect(shape(session.template.layout.blocks)).toBe('title001 section1(stat-ac1 divider1 stat-hp1) row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
    expect(outcome).toMatchObject({ select: ['divider1'], landed: 'divider1', announce: 'Moved Divider to section Defenses, position 2 of 3.' });
    session.undo();
    expect(shape(session.template.layout.blocks)).toBe('title001 section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1) divider1');
  });

  it('sets a block beside another in a new Side by side, on the side dropped, as one undo step', () => {
    const session = new FakeSession(sampleTemplate());
    const beside = (side: 'start' | 'end') => ({ kind: 'beside' as const, targetId: 'title001', side, line: { ...LINE, orientation: 'vertical' as const } });
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, beside('end'));
    const row = session.template.layout.blocks[0];
    expect(row).toMatchObject({ type: 'row', blocks: [{ id: 'title001' }, { id: 'divider1' }] });
    expect(shape(session.template.layout.blocks.slice(1))).toBe('section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
    expect(outcome).toMatchObject({ select: ['divider1'], landed: 'divider1', announce: 'Put Divider beside Name, side by side.' });
    session.undo();
    expect(shape(session.template.layout.blocks)).toBe('title001 section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1) divider1');
    applyDrop(session, { kind: 'item', item: insertItemFor('stat') }, beside('start'));
    expect(session.template.layout.blocks[0]).toMatchObject({ type: 'row', blocks: [{ type: 'stat' }, { id: 'title001' }] });
    expect(session.steps).toBe(2);
  });

  it('counts a later place in the same list once the block has left it', () => {
    const session = new FakeSession(sampleTemplate());
    applyDrop(session, { kind: 'block', id: 'title001' }, { kind: 'between', parentId: null, index: 3, line: LINE });
    expect(shape(session.template.layout.blocks)).toBe('section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1) title001 divider1');
    expect(treeTargetOf(sampleTemplate().layout, { kind: 'between', parentId: null, index: 3, line: LINE }, 'title001')).toEqual({ parentId: null, index: 2 });
  });

  it('inserts a palette block where it is dropped and opens its label, as a click would', () => {
    const session = new FakeSession(sampleTemplate());
    const outcome = applyDrop(session, { kind: 'item', item: insertItemFor('stat') }, { kind: 'into', parentId: null, outline: box(0, 1) });
    expect(session.template.layout.blocks[0]).toMatchObject({ type: 'stat', field: '' });
    expect(outcome.inserted).toBe(session.template.layout.blocks[0]?.id);
    expect(session.steps).toBe(1);
  });

  it('gives a dropped field the natural block for its type, bound to it', () => {
    const session = new FakeSession(sampleTemplate());
    const outcome = applyDrop(session, { kind: 'field', key: 'cr' }, { kind: 'between', parentId: 'section1', index: 2, line: LINE });
    const section = session.template.layout.blocks[1];
    expect(section && 'blocks' in section ? section.blocks[2] : null).toMatchObject({ type: 'stat', field: 'cr' });
    expect(outcome.inserted).toBeUndefined();
    expect(outcome.landed).toBeDefined();
    expect(session.template.fields).toHaveLength(5);
  });

  it('changes nothing in a built-in, and says why', () => {
    const session = new FakeSession(sampleTemplate(), { readOnly: true, readOnlyReason: 'built-in' });
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, { kind: 'between', parentId: null, index: 0, line: LINE });
    expect(outcome.announce).toBe('Built-in template. Make a copy to change it.');
    expect(session.steps).toBe(0);
  });

  it('knows what each source puts in', () => {
    const template = sampleTemplate();
    expect(subjectOf(template, { kind: 'block', id: 'row00001' })).toEqual({ types: ['row'], movingId: 'row00001' });
    expect(subjectOf(template, { kind: 'item', item: insertItemFor('row') })).toEqual({ types: ['row'], movingId: null });
    expect(subjectOf(template, { kind: 'field', key: 'hp' })).toEqual({ types: ['stat'], movingId: null });
    expect(subjectOf(template, { kind: 'field', key: 'missing' })).toBeNull();
  });
});

describe('siblingShifts', () => {
  const list = [{ id: 'a', box: box(0, 20) }, { id: 'b', box: box(28, 48) }, { id: 'c', box: box(56, 86) }];

  it('slides the blocks passed over by the moved block\'s size and gap, and stands it where it lands', () => {
    const down = siblingShifts(list, 0, 3, 'stack');
    expect(Object.fromEntries(down?.shifts ?? [])).toEqual({ b: { x: 0, y: -28 }, c: { x: 0, y: -28 }, a: { x: 0, y: 66 } });
    expect(down?.landing).toEqual(box(66, 86));
    expect(down?.line).toMatchObject({ orientation: 'horizontal', y: 62 });
    const up = siblingShifts(list, 2, 0, 'stack');
    expect(Object.fromEntries(up?.shifts ?? [])).toEqual({ a: { x: 0, y: 38 }, b: { x: 0, y: 38 }, c: { x: 0, y: -56 } });
  });

  it('slides nothing for the block\'s own place or a list in several columns', () => {
    expect(siblingShifts(list, 1, 1, 'stack')).toBeNull();
    expect(siblingShifts(list, 1, 2, 'stack')).toBeNull();
    const columns = [{ id: 'a', box: box(0, 20) }, { id: 'b', box: { left: 120, top: 0, right: 220, bottom: 20 } }];
    expect(siblingShifts(columns, 0, 2, 'stack')).toBeNull();
  });
});

describe('drag announcements', () => {
  const { layout, fields } = sampleTemplate();

  it('says where the block would go', () => {
    expect(targetText(layout, fields, { kind: 'between', parentId: 'section1', index: 1, line: LINE }, 'divider1')).toBe('Section Defenses, position 2 of 3.');
    expect(targetText(layout, fields, { kind: 'between', parentId: null, index: 3, line: LINE }, 'title001')).toBe('The top level, position 3 of 4.');
    expect(targetText(layout, fields, { kind: 'refused' }, null)).toBe("Can't go here.");
  });

  it('says what was picked up and that a cancel left it', () => {
    expect(pickedUpText('Speed', false)).toBe('Picked up Speed.');
    expect(pickedUpText('Speed', true)).toMatch(/^Picked up Speed\. Choose a place with the arrow keys/);
    expect(cancelledText('Speed')).toBe('Cancelled. Speed stays where it was.');
  });
});
