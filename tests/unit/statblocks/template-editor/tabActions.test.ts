import { describe, expect, it } from 'vitest';
import { addTabTo, splitListIntoTabs } from '../../../../src/app/statblocks/editor/template-editor/tabActions';
import { withoutClosedTab } from '../../../../src/app/statblocks/editor/template-editor/tabClicks';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, shape, template } from './editorKit';

const BLOCKS: TemplateBlock[] = [
  {
    id: 'tabs0001', type: 'tabs', blocks: [
      { id: 'tab00001', type: 'section', heading: 'Tab 1', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
      { id: 'tab00002', type: 'section', heading: 'Tab 2', blocks: [{ id: 'reacts01', type: 'entries', field: 'reactions' }] },
    ],
  },
  { id: 'spells01', type: 'spells', field: 'spells', heading: 'Spellcasting' },
];

describe('tab edits in the template editor', () => {
  it('adds a tab as one step and selects it, so it opens', () => {
    const session = new FakeSession(template(BLOCKS));
    const outcome = addTabTo(session, 'tabs0001');
    expect(session.steps).toBe(1);
    expect(outcome.announce).toBe('Added a tab.');
    const added = outcome.select?.[0] ?? '';
    expect(shape(session.template.layout.blocks)).toBe(`tabs0001(tab00001(actions1) tab00002(reacts01) ${added}()) spells01`);
  });

  it('splits a list into tabs as one step, the Tabs block selected', () => {
    const session = new FakeSession(template(BLOCKS));
    const outcome = splitListIntoTabs(session, 'spells01');
    expect(session.steps).toBe(1);
    const tabs = session.template.layout.blocks[1];
    expect(outcome.select).toEqual([tabs?.id]);
    expect(tabs).toMatchObject({ type: 'tabs', blocks: [{ heading: 'Spellcasting', blocks: [{ id: 'spells01' }] }, { heading: 'Tab 2' }] });
    session.undo();
    expect(session.template.layout.blocks).toEqual(BLOCKS);
  });

  it('makes no step on a read-only template, and says why', () => {
    const session = new FakeSession(template(BLOCKS), { readOnly: true, readOnlyReason: 'built-in' });
    expect(addTabTo(session, 'tabs0001').announce).toBe('Built-in template. Make a copy to change it.');
    expect(session.steps).toBe(0);
  });
});

describe('a click on a tab', () => {
  const layout = template(BLOCKS).layout;
  const tab = { tabsId: 'tabs0001', sectionId: 'tab00002' };

  it('lets go of a selection the tab it opens hides, and keeps every other', () => {
    expect(withoutClosedTab(layout, ['actions1'], tab)).toEqual([]);
    expect(withoutClosedTab(layout, ['tab00001'], tab)).toEqual([]);
    const kept = ['reacts01'];
    expect(withoutClosedTab(layout, kept, tab)).toBe(kept);
    const outside = ['spells01'];
    expect(withoutClosedTab(layout, outside, tab)).toBe(outside);
    const tabs = ['tabs0001'];
    expect(withoutClosedTab(layout, tabs, tab)).toBe(tabs);
  });
});
