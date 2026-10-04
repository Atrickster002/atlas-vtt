import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { containersAround, outlineRows, outlineStep } from '../../../../src/app/statblocks/editor/template-editor/outlineRows';
import { FakeSession, sampleTemplate, shape } from './editorKit';
import { key, mountEditor, openDock } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the outline\'s rows', () => {
  const { blocks } = sampleTemplate().layout;

  it('lists every block in reading order with its level and place', () => {
    const rows = outlineRows(blocks, new Set());
    expect(rows.map((row) => `${row.block.id}@${row.level}:${row.position}/${row.siblings}`)).toEqual([
      'title001@1:1/4', 'section1@1:2/4', 'stat-ac1@2:1/2', 'stat-hp1@2:2/2', 'row00001@1:3/4', 'stat-sp1@2:1/2', 'stat-cr1@2:2/2', 'divider1@1:4/4',
    ]);
    expect(rows.find((row) => row.block.id === 'section1')?.expanded).toBe(true);
    expect(rows.find((row) => row.block.id === 'title001')?.expanded).toBeNull();
  });

  it('leaves out what a folded container holds', () => {
    const rows = outlineRows(blocks, new Set(['section1']));
    expect(rows.map((row) => row.block.id)).toEqual(['title001', 'section1', 'row00001', 'stat-sp1', 'stat-cr1', 'divider1']);
    expect(rows[1]?.expanded).toBe(false);
  });

  it('steps between rows as the tree\'s keys do', () => {
    const rows = outlineRows(blocks, new Set());
    expect(outlineStep(rows, null, 'next')).toBe('title001');
    expect(outlineStep(rows, 'section1', 'next')).toBe('stat-ac1');
    expect(outlineStep(rows, 'stat-ac1', 'previous')).toBe('section1');
    expect(outlineStep(rows, 'stat-hp1', 'parent')).toBe('section1');
    expect(outlineStep(rows, 'section1', 'first-child')).toBe('stat-ac1');
    expect(outlineStep(rows, 'title001', 'first-child')).toBeNull();
    expect(outlineStep(rows, 'divider1', 'next')).toBeNull();
    expect(outlineStep(rows, 'stat-ac1', 'last')).toBe('divider1');
    expect(containersAround(blocks, 'stat-cr1')).toEqual(['row00001']);
    expect(containersAround(blocks, 'title001')).toEqual([]);
  });
});

function openOutline(): HTMLElement {
  openDock('Structure');
  return screen.getByRole('tree', { name: 'Blocks' });
}

const row = (tree: HTMLElement, id: string): HTMLElement => {
  const found = tree.querySelector<HTMLElement>(`[data-outline-id="${id}"]`);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};

describe('the Outline tab', () => {
  it('is a tree of every block that shares the canvas\'s selection', () => {
    const { frame } = mountEditor();
    const tree = openOutline();
    const items = within(tree).getAllByRole('treeitem');
    expect(items).toHaveLength(8);
    expect(row(tree, 'stat-ac1').getAttribute('aria-level')).toBe('2');
    expect(row(tree, 'stat-ac1').textContent).toContain('Armor class');
    expect(row(tree, 'section1').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(frame('stat-hp1'));
    expect(row(tree, 'stat-hp1').getAttribute('aria-selected')).toBe('true');
    expect(row(tree, 'stat-hp1').tabIndex).toBe(0);
    fireEvent.click(row(tree, 'stat-ac1'), { shiftKey: true });
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('sibling');
  });

  it('walks, folds and unfolds with the arrows, keeping focus in the tree', () => {
    const { frame } = mountEditor();
    const tree = openOutline();
    act(() => row(tree, 'title001').focus());
    key(row(tree, 'title001'), 'ArrowDown');
    expect(document.activeElement).toBe(row(tree, 'section1'));
    expect(frame('section1').getAttribute('data-te-selected')).toBe('primary');
    key(row(tree, 'section1'), 'ArrowRight');
    expect(document.activeElement).toBe(row(tree, 'stat-ac1'));
    key(row(tree, 'stat-ac1'), 'ArrowLeft');
    expect(document.activeElement).toBe(row(tree, 'section1'));
    key(row(tree, 'section1'), 'ArrowLeft');
    expect(row(tree, 'section1').getAttribute('aria-expanded')).toBe('false');
    expect(tree.querySelector('[data-outline-id="stat-ac1"]')).toBeNull();
    key(row(tree, 'section1'), 'ArrowRight');
    expect(row(tree, 'section1').getAttribute('aria-expanded')).toBe('true');
    key(row(tree, 'section1'), 'End');
    expect(document.activeElement).toBe(row(tree, 'divider1'));
  });

  it('runs the block keys on the selected row and keeps focus in the tree', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    const tree = openOutline();
    fireEvent.click(row(tree, 'stat-ac1'));
    act(() => row(tree, 'stat-ac1').focus());
    key(row(tree, 'stat-ac1'), 'ArrowDown', { altKey: true });
    expect(shape(session.template.layout.blocks)).toContain('section1(stat-hp1 stat-ac1)');
    expect(document.activeElement).toBe(row(tree, 'stat-ac1'));
    key(row(tree, 'stat-ac1'), 'Delete');
    expect(shape(session.template.layout.blocks)).toContain('section1(stat-hp1)');
    expect(document.activeElement).toBe(row(tree, 'section1'));
    expect(session.steps).toBe(2);
  });

  it('unfolds a container when a block inside it is selected elsewhere', () => {
    const { frame } = mountEditor();
    const tree = openOutline();
    fireEvent.click(row(tree, 'row00001'));
    act(() => row(tree, 'row00001').focus());
    key(row(tree, 'row00001'), 'ArrowLeft');
    expect(tree.querySelector('[data-outline-id="stat-sp1"]')).toBeNull();
    fireEvent.click(frame('stat-sp1'));
    expect(row(tree, 'stat-sp1').getAttribute('aria-selected')).toBe('true');
  });

  it('says so while there is no block', () => {
    mountEditor(new FakeSession({ ...sampleTemplate(), layout: { maxColumns: 1, blocks: [] } }));
    openDock('Structure');
    expect(screen.getByText('Blocks appear here as you add them.')).toBeTruthy();
  });
});
