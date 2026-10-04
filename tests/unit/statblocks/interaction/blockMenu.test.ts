import { describe, expect, it, vi } from 'vitest';
import { blockMenu, type BlockMenuContext } from '../../../../src/app/statblocks/editor/template-editor/menus/blockMenu';
import { findAction, fitsMenuLimit, type SurfaceAction } from '../../../../src/app/statblocks/editor/interaction/surfaceActions';
import { AUTHORABLE_BLOCK_TYPES, createBlock } from '../../../../src/app/statblocks/model/blockCatalogue';
import { blockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from '../template-editor/editorKit';

function context(blocks: TemplateBlock[], blockId: string, extra: Partial<BlockMenuContext> = {}): BlockMenuContext {
  const shown = template(blocks);
  return {
    session: new FakeSession(shown), template: shown, selection: [blockId], blockId, editable: true, canPaste: true,
    run: vi.fn(), turnInto: vi.fn(), openInsert: vi.fn(), moveInto: vi.fn(), openSettings: vi.fn(), copyText: vi.fn(),
    addTab: vi.fn(), splitIntoTabs: vi.fn(),
    ...extra,
  };
}

const labels = (actions: readonly SurfaceAction[]): string[] => actions.map((action) => (action.kind === 'separator' ? '—' : action.label));
const submenu = (actions: readonly SurfaceAction[], id: string): SurfaceAction[] => {
  const found = actions.find((action) => action.kind === 'submenu' && action.id === id);
  return found?.kind === 'submenu' ? found.children : [];
};

/** A block's menu in the template editor (spec §5.2, J11). */
describe('blockMenu', () => {
  it('holds at most twelve rows in every menu, for every block type, editable or not, alone or in a selection, with or without a clip', () => {
    for (const type of AUTHORABLE_BLOCK_TYPES) {
      const block = createBlock(type, blockIdSource(new Set()));
      const blocks: TemplateBlock[] = [{ id: 'sec00001', type: 'section', blocks: [block, { id: 'other001', type: 'divider' }] }, { id: 'sec00002', type: 'section', blocks: [] }];
      for (const editable of [true, false]) {
        for (const canPaste of [true, false]) {
          for (const selection of [[block.id], [block.id, 'other001']]) {
            const menu = blockMenu(context(blocks, block.id, { editable, canPaste, selection }));
            expect(fitsMenuLimit(menu), `${type} editable=${editable} paste=${canPaste} n=${selection.length}`).toBe(true);
            expect(menu.at(-1)).toMatchObject({ kind: 'item', destructive: true });
          }
        }
      }
    }
  });

  it('keeps Move up and Move down at the ends, disabled, so the menu keeps its shape', () => {
    const { layout } = sampleTemplate();
    const first = blockMenu(context(layout.blocks, 'title001'));
    expect(findAction(submenu(first, 'move'), 'move-up')?.disabled).toBe(true);
    expect(findAction(submenu(first, 'move'), 'move-down')?.disabled).toBe(false);
    const last = blockMenu(context(layout.blocks, 'divider1'));
    expect(findAction(submenu(last, 'move'), 'move-down')?.disabled).toBe(true);
    expect(labels(submenu(blockMenu(context(layout.blocks, 'stat-ac1')), 'move'))).toEqual(['Up', 'Down', 'Out of section Defenses']);
  });

  it('starts with Settings and Rename, ends with Delete, and names keys as hints', () => {
    const { layout } = sampleTemplate();
    const menu = blockMenu(context(layout.blocks, 'stat-hp1'));
    expect(labels(menu)[0]).toBe('Settings…');
    expect(labels(menu)[1]).toBe('Rename');
    expect(menu.at(-1)).toMatchObject({ label: 'Delete', hint: 'Del', destructive: true });
    expect(findAction(menu, 'duplicate')?.hint).toBeTruthy();
  });

  it('deletes through the selection\'s command, and says how many blocks a selection deletes', () => {
    const { layout } = sampleTemplate();
    const run = vi.fn();
    const menu = blockMenu(context(layout.blocks, 'stat-ac1', { run, selection: ['stat-ac1', 'stat-hp1'] }));
    expect(menu.at(-1)).toMatchObject({ label: 'Delete 2 blocks' });
    findAction(menu, 'delete')?.run();
    expect(run).toHaveBeenCalledWith('delete');
  });

  it('turns a block into the primitives, each once, into the kind that can show its property', () => {
    const blocks: TemplateBlock[] = [{ id: 'stat0001', type: 'stat', field: 'name', look: 'run-in' }];
    const shown = template(blocks, [{ key: 'name', label: 'Name', type: 'text' }]);
    const turnInto = vi.fn();
    const menu = blockMenu({ ...context(blocks, 'stat0001'), template: shown, turnInto });
    const turn = submenu(menu, 'turn-into');
    expect(labels(turn)).toEqual(['Heading', 'Text', 'Line', 'List', 'Table', 'Track', 'Divider', 'Picture']);
    findAction(turn, 'turn-heading')?.run();
    expect(turnInto).toHaveBeenLastCalledWith('title');
    findAction(turn, 'turn-list')?.run();
    expect(turnInto).toHaveBeenLastCalledWith('entries');
    expect(labels(submenu(blockMenu(context([{ id: 'tags0001', type: 'tags', field: 'x', look: 'comma' }], 'tags0001')), 'turn-into')))
      .not.toContain('List');
  });

  it('offers a list of words every way it can show, with the one in use ticked', () => {
    const blocks: TemplateBlock[] = [{ id: 'tags0001', type: 'tags', field: 'x', look: 'bullets' }];
    const style = submenu(blockMenu(context(blocks, 'tags0001')), 'style');
    expect(style.map((row) => row.kind === 'item' && [row.label, row.checked]))
      .toEqual([['Comma list', false], ['Chips', false], ['Bullets', true], ['Numbered', false]]);
  });

  it('offers the block\'s quick choices with the one in use ticked, each one step', () => {
    const blocks: TemplateBlock[] = [{ id: 'track001', type: 'track', field: 'hp', look: 'boxes', counts: 'down' }];
    const ctx = context(blocks, 'track001');
    const menu = blockMenu(ctx);
    const style = submenu(menu, 'style');
    expect(style.map((row) => row.kind === 'item' && [row.label, row.checked])).toEqual([['Boxes', true], ['Gauge', false]]);
    findAction(style, 'style-gauge')?.run();
    expect((ctx.session as FakeSession).template.layout.blocks[0]).toMatchObject({ look: 'gauge' });
    expect((ctx.session as FakeSession).steps).toBe(1);
  });

  it('lists the sibling containers to move into, and only containers can be ungrouped', () => {
    const { layout } = sampleTemplate();
    const moveInto = vi.fn();
    const menu = blockMenu(context(layout.blocks, 'title001', { moveInto }));
    const into = submenu(submenu(menu, 'move'), 'move-into');
    expect(labels(into)).toEqual(['Defenses', 'Side by side']);
    findAction(into, 'into-section1')?.run();
    expect(moveInto).toHaveBeenCalledWith('section1');
    expect(findAction(blockMenu(context(layout.blocks, 'title001')), 'ungroup')).toBeNull();
    expect(findAction(blockMenu(context(layout.blocks, 'section1')), 'ungroup')).not.toBeNull();
  });

  it('offers Add tab on a Tabs block, and Split into tabs on a list wherever Tabs may stand', () => {
    const blocks: TemplateBlock[] = [
      { id: 'tabs0001', type: 'tabs', blocks: [{ id: 'tab00001', type: 'section', heading: 'Tab 1', blocks: [] }] },
      { id: 'entries1', type: 'entries', field: 'actions' },
      { id: 'row00001', type: 'row', blocks: [{ id: 'tags0001', type: 'tags', field: 'traits', look: 'comma' }] },
      { id: 'stat0001', type: 'stat', field: 'ac', look: 'run-in' },
    ];
    const addTab = vi.fn();
    const tabsMenu = blockMenu(context(blocks, 'tabs0001', { addTab }));
    findAction(tabsMenu, 'add-tab')?.run();
    expect(addTab).toHaveBeenCalledOnce();
    expect(findAction(tabsMenu, 'split-into-tabs')).toBeNull();

    const splitIntoTabs = vi.fn();
    const listMenu = blockMenu(context(blocks, 'entries1', { splitIntoTabs }));
    expect(labels(submenu(listMenu, 'arrange'))).toContain('Split into tabs');
    findAction(listMenu, 'split-into-tabs')?.run();
    expect(splitIntoTabs).toHaveBeenCalledOnce();
    expect(findAction(blockMenu(context(blocks, 'tags0001')), 'split-into-tabs')).toMatchObject({ disabled: true });
    expect(findAction(blockMenu(context(blocks, 'stat0001')), 'split-into-tabs')).toBeNull();
    expect(findAction(blockMenu(context(blocks, 'stat0001')), 'add-tab')).toBeNull();
  });

  it('turns a tab\'s Section into nothing a Tabs block does not take', () => {
    const blocks: TemplateBlock[] = [{ id: 'tabs0001', type: 'tabs', blocks: [{ id: 'tab00001', type: 'section', blocks: [] }] }];
    expect(labels(submenu(blockMenu(context(blocks, 'tab00001')), 'turn-into'))).toEqual([]);
    expect(labels(submenu(blockMenu(context(blocks, 'tabs0001')), 'turn-into'))).toEqual(['Section', 'Side by side']);
  });
});
