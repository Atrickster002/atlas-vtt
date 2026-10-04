import { describe, expect, it } from 'vitest';
import { coreSlotBlocks, deleteBlock, isCoreSlotKey, withCoreSlots } from '../../../../src/app/statblocks/model/coreSlots';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { shape, template } from '../template-editor/editorKit';

const NAME: TemplateBlock = { id: 'title001', type: 'title', field: 'name', level: 1 };
const TOKEN: TemplateBlock = { id: 'image001', type: 'image', field: 'image', shape: 'token' };
const AC: TemplateBlock = { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' };
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Portrait', type: 'image' }, { key: 'ac', label: 'Armor class', type: 'number' },
];

describe('core slots', () => {
  it('are the first Title showing the name and the first Image showing the art, in reading order', () => {
    const copy: TemplateBlock = { ...NAME, id: 'title002' };
    const { layout } = template([AC, { id: 'row00001', type: 'row', blocks: [NAME, TOKEN] }, copy], FIELDS);
    expect([...coreSlotBlocks(layout)]).toEqual([['title001', 'name'], ['image001', 'token']]);
    expect(isCoreSlotKey('name')).toBe(true);
    expect(isCoreSlotKey('image')).toBe(true);
    expect(isCoreSlotKey('ac')).toBe(false);
  });

  it('leaves a template that has both as the same object', () => {
    const whole = template([NAME, TOKEN, AC], FIELDS);
    expect(withCoreSlots(whole)).toBe(whole);
  });

  it('gives a template without either a Name first, side by side with the token art, and their properties', () => {
    const mended = withCoreSlots(template([AC], [{ key: 'ac', label: 'Armor class', type: 'number' }]));
    expect(shape(mended.layout.blocks)).toBe('corehead(corename coretokn) stat-ac1');
    expect(mended.fields.map((field) => field.key)).toEqual(['ac', 'name', 'image']);
    expect(withCoreSlots(template([AC], []))).toEqual(withCoreSlots(template([AC], [])));
  });

  it('puts missing token art into the Row the Name stands in, else beside the Name in a new Row', () => {
    const inRow = withCoreSlots(template([{ id: 'row00001', type: 'row', blocks: [NAME, AC] }], FIELDS));
    expect(shape(inRow.layout.blocks)).toBe('row00001(title001 coretokn stat-ac1)');
    const inSection = withCoreSlots(template([{ id: 'section1', type: 'section', blocks: [AC, NAME] }], FIELDS));
    expect(shape(inSection.layout.blocks)).toBe('section1(stat-ac1 corehead(title001 coretokn))');
  });

  it('never deletes a core slot, and keeps the ones inside a block that goes in its place', () => {
    const header = template([{ id: 'section1', type: 'section', blocks: [{ id: 'row00001', type: 'row', blocks: [NAME, TOKEN] }, AC] }], FIELDS);
    expect(deleteBlock(header.layout, 'title001')).toMatchObject({ ok: false, reason: 'core-slot' });
    expect(deleteBlock(header.layout, 'image001')).toMatchObject({ ok: false, reason: 'core-slot' });
    const kept = deleteBlock(header.layout, 'section1');
    expect(kept.ok && shape(kept.layout.blocks)).toBe('title001 image001');
    const plain = deleteBlock(header.layout, 'stat-ac1');
    expect(plain.ok && shape(plain.layout.blocks)).toBe('section1(row00001(title001 image001))');
  });

  it('keeps a core slot out of a Tabs block, which takes Sections only, when its tab goes', () => {
    const tabs = template([{ id: 'tabs0001', type: 'tabs', blocks: [
      { id: 'tabone01', type: 'section', heading: 'One', blocks: [NAME, AC] },
      { id: 'tabtwo01', type: 'section', heading: 'Two', blocks: [TOKEN] },
    ] }], FIELDS);
    const edit = deleteBlock(tabs.layout, 'tabone01');
    expect(edit.ok && shape(edit.layout.blocks)).toBe('tabs0001(tabtwo01(image001)) title001');
  });

  it('never turns a core slot into another block', () => {
    const { layout, fields } = template([NAME, TOKEN], FIELDS);
    expect(turnInto(layout, 'title001', 'heading', fields)).toMatchObject({ ok: false, reason: 'core-slot' });
    expect(turnInto(layout, 'image001', 'stat', fields)).toMatchObject({ ok: false, reason: 'core-slot' });
  });
});
