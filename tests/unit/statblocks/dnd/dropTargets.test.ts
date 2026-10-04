import { describe, expect, it } from 'vitest';
import type { Box } from '../../../../src/app/statblocks/editor/dnd/dropGeometry';
import {
  dropTargetAt, isNoMove, keyboardTargets, sameTarget, type DragSubject, type DropScene, type DropTarget,
} from '../../../../src/app/statblocks/editor/dnd/dropTargets';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

/**
 * One column 300 wide: a title; a section "S" whose heading takes 40–60, with
 * ac and hp; a row of sp and cr side by side; an empty section; a divider.
 */
function scene(): DropScene {
  const blocks: TemplateBlock[] = [
    { id: 'title', type: 'title', field: 'name', level: 1 },
    {
      id: 'S', type: 'section', heading: 'Defenses', blocks: [
        { id: 'ac', type: 'stat', field: 'ac', look: 'run-in' },
        { id: 'hp', type: 'stat', field: 'hp', look: 'run-in' },
      ],
    },
    {
      id: 'R', type: 'row', blocks: [
        { id: 'sp', type: 'stat', field: 'speed', look: 'stacked' },
        { id: 'cr', type: 'stat', field: 'cr', look: 'stacked' },
      ],
    },
    { id: 'E', type: 'section', blocks: [] },
    { id: 'D', type: 'divider' },
  ];
  const boxes = new Map<string, Box>([
    ['title', box(0, 0, 300, 30)],
    ['S', box(0, 40, 300, 140)],
    ['ac', box(0, 64, 300, 84)],
    ['hp', box(0, 92, 300, 112)],
    ['R', box(0, 150, 300, 200)],
    ['sp', box(0, 150, 140, 200)],
    ['cr', box(160, 150, 300, 200)],
    ['E', box(0, 210, 300, 230)],
    ['D', box(0, 240, 300, 242)],
  ]);
  return { layout: template(blocks).layout, boxes, card: box(0, 0, 300, 242) };
}

const moving = (id: string, type: DragSubject['types'][number]): DragSubject => ({ types: [type], movingId: id });
const fresh = (...types: Array<DragSubject['types'][number]>): DragSubject => ({ types, movingId: null });

describe('dropTargetAt', () => {
  it('puts a block between two blocks of the top level, on the line in the middle of their gap', () => {
    const target = dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 25 });
    expect(target).toEqual({ kind: 'between', parentId: null, index: 1, line: { orientation: 'horizontal', x: 0, y: 35, length: 300 } });
  });

  it('goes into a section before its first block, the line just above that block', () => {
    const target = dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 66 });
    expect(target).toMatchObject({ kind: 'between', parentId: 'S', index: 0, line: { y: 60 } });
  });

  it('takes the nearest gap of a container when the pointer is between its blocks', () => {
    const target = dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 88 });
    expect(target).toMatchObject({ kind: 'between', parentId: 'S', index: 1, line: { orientation: 'horizontal', y: 88 } });
  });

  it('drops beside a block of a stack over the band along its left or right edge, its middle staying a gap', () => {
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 290, y: 98 })).toEqual({
      kind: 'beside', targetId: 'hp', side: 'end', line: { orientation: 'vertical', x: 304, y: 92, length: 20 },
    });
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 10, y: 98 })).toMatchObject({ kind: 'beside', targetId: 'hp', side: 'start' });
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 98 })).toMatchObject({ kind: 'between', parentId: 'S' });
  });

  it('goes beside a group without a heading that shares the edge, and into its Row where it stands in one', () => {
    const name: TemplateBlock = { id: 'name', type: 'title', field: 'name', level: 1 };
    const line: TemplateBlock = { id: 'line', type: 'line', fields: ['size'] };
    const art: TemplateBlock = { id: 'art', type: 'image', field: 'image', shape: 'token' };
    const boxes = new Map<string, Box>([['G', box(0, 0, 300, 60)], ['name', box(0, 0, 300, 30)], ['line', box(0, 34, 300, 60)], ['art', box(0, 70, 80, 150)]]);
    const loose: DropScene = { layout: template([{ id: 'G', type: 'section', blocks: [name, line] }, art]).layout, boxes, card: box(0, 0, 300, 150) };
    expect(dropTargetAt(loose, moving('art', 'image'), { x: 290, y: 15 })).toMatchObject({ kind: 'beside', targetId: 'G', side: 'end' });
    const headed: DropScene = { ...loose, layout: template([{ id: 'G', type: 'section', heading: 'Lore', blocks: [name, line] }, art]).layout };
    expect(dropTargetAt(headed, moving('art', 'image'), { x: 290, y: 15 })).toMatchObject({ kind: 'beside', targetId: 'name' });
    const inRow: DropScene = {
      layout: template([{ id: 'R', type: 'row', blocks: [{ id: 'G', type: 'section', blocks: [name, line] }] }, art]).layout,
      boxes: new Map(boxes).set('R', box(0, 0, 300, 60)), card: loose.card,
    };
    expect(dropTargetAt(inRow, moving('art', 'image'), { x: 290, y: 15 })).toMatchObject({ kind: 'between', parentId: 'R', index: 1 });
  });

  it('offers no beside where the pair may not stand side by side: inside a Row, or for a block a Row does not take', () => {
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 135, y: 175 })).toMatchObject({ kind: 'between', parentId: 'R' });
    expect(dropTargetAt(scene(), moving('R', 'row'), { x: 290, y: 15 })).toMatchObject({ kind: 'between', parentId: null });
  });

  it('draws a vertical line of the row\'s height between the blocks of a row', () => {
    const target = dropTargetAt(scene(), moving('D', 'divider'), { x: 120, y: 175 });
    expect(target).toEqual({ kind: 'between', parentId: 'R', index: 1, line: { orientation: 'vertical', x: 150, y: 150, length: 50 } });
  });

  it('never makes a row inside a row, and walks out to the row\'s own place instead', () => {
    const target = dropTargetAt(scene(), fresh('row'), { x: 120, y: 160 });
    expect(target).toMatchObject({ kind: 'between', parentId: null, index: 2, line: { y: 145 } });
  });

  it('offers no edge zones to a drop of several blocks', () => {
    const target = dropTargetAt(scene(), fresh('stat', 'stat'), { x: 10, y: 100 });
    expect(target).toMatchObject({ kind: 'between', parentId: 'S', index: 1 });
  });

  it('goes into an empty section, which takes a drop over at least 28 px', () => {
    expect(dropTargetAt(scene(), moving('D', 'divider'), { x: 150, y: 220 })).toEqual({ kind: 'into', parentId: 'E', outline: box(0, 210, 300, 238) });
    const flat = scene();
    const boxes = new Map(flat.boxes).set('E', box(0, 210, 300, 210));
    expect(dropTargetAt({ ...flat, boxes }, moving('D', 'divider'), { x: 150, y: 225 })).toMatchObject({ kind: 'into', parentId: 'E' });
  });

  it('never goes into the moved block itself or anything inside it', () => {
    expect(dropTargetAt(scene(), moving('S', 'section'), { x: 150, y: 70 })).toBeNull();
    expect(dropTargetAt(scene(), moving('R', 'row'), { x: 120, y: 175 })).toBeNull();
  });

  it('shows nothing where the drop would leave the block where it is', () => {
    expect(dropTargetAt(scene(), moving('hp', 'stat'), { x: 150, y: 88 })).toBeNull();
    expect(dropTargetAt(scene(), moving('ac', 'stat'), { x: 150, y: 100 })).toBeNull();
  });

  it('takes an empty template\'s first block into the card', () => {
    const empty: DropScene = { layout: template([]).layout, boxes: new Map(), card: box(0, 0, 300, 120) };
    expect(dropTargetAt(empty, fresh('stat'), { x: 10, y: 10 })).toEqual({ kind: 'into', parentId: null, outline: box(0, 0, 300, 120) });
    expect(dropTargetAt(empty, fresh('stat'), { x: 10, y: 200 })).toBeNull();
  });

  it('puts the line at the nearer edge where neighbours stand in different columns', () => {
    const blocks: TemplateBlock[] = ['a', 'b', 'c'].map((id) => ({ id, type: 'divider' }));
    const columns: DropScene = {
      layout: template(blocks).layout,
      boxes: new Map([['a', box(0, 0, 100, 40)], ['b', box(0, 50, 100, 90)], ['c', box(120, 0, 220, 40)]]),
      card: box(0, 0, 220, 90),
    };
    const atTop = dropTargetAt(columns, moving('a', 'divider'), { x: 170, y: 5 });
    expect(atTop).toMatchObject({ kind: 'between', parentId: null, index: 2, line: { x: 120, y: -4, length: 100 } });
    const atBottom = dropTargetAt(columns, moving('a', 'divider'), { x: 50, y: 85 });
    expect(atBottom).toMatchObject({ kind: 'between', parentId: null, index: 2, line: { x: 0, y: 94 } });
  });
});

describe('keyboardTargets', () => {
  const describeTarget = (target: DropTarget): string => (target.kind === 'between'
    ? `${target.parentId ?? 'root'}@${target.index}`
    : target.kind === 'into' ? `into ${target.parentId ?? 'card'}` : target.kind);

  it('lists every place in reading order, without the moved block\'s own and nothing inside it', () => {
    const { targets, start } = keyboardTargets(scene(), moving('hp', 'stat'));
    expect(targets.map(describeTarget)).toEqual(['root@0', 'root@1', 'S@0', 'root@2', 'R@0', 'R@1', 'R@2', 'root@3', 'into E', 'root@4', 'root@5']);
    expect(targets[start]).toMatchObject({ parentId: null, index: 2 });
    expect(targets[start - 1]).toMatchObject({ parentId: 'S', index: 0 });
  });

  it('leaves out the lists that may not hold the block', () => {
    const { targets } = keyboardTargets(scene(), moving('R', 'row'));
    expect(targets.map(describeTarget)).toEqual(['root@0', 'root@1', 'S@0', 'S@1', 'S@2', 'into E', 'root@4', 'root@5']);
  });
});

describe('isNoMove and sameTarget', () => {
  it('counts a drop into the moved block\'s own container as no move', () => {
    const { layout } = scene();
    expect(isNoMove(layout, moving('ac', 'stat'), { kind: 'into', parentId: 'S', outline: box(0, 0, 1, 1) })).toBe(true);
    expect(isNoMove(layout, moving('ac', 'stat'), { kind: 'into', parentId: 'E', outline: box(0, 0, 1, 1) })).toBe(false);
  });

  it('tells targets apart by what they do and where they draw', () => {
    const line = { orientation: 'horizontal' as const, x: 0, y: 10, length: 5 };
    expect(sameTarget({ kind: 'between', parentId: null, index: 1, line }, { kind: 'between', parentId: null, index: 1, line: { ...line } })).toBe(true);
    expect(sameTarget({ kind: 'between', parentId: null, index: 1, line }, { kind: 'between', parentId: null, index: 1, line: { ...line, y: 12 } })).toBe(false);
    expect(sameTarget({ kind: 'refused' }, { kind: 'refused' })).toBe(true);
    expect(sameTarget(null, { kind: 'refused' })).toBe(false);
  });
});

describe('tabs', () => {
  /** A Tabs block "T" whose strip takes 0–20 and whose open tab "A" holds ac; its closed tab "B" holds hp and draws nothing. */
  function tabsScene(): DropScene {
    const blocks: TemplateBlock[] = [
      {
        id: 'T', type: 'tabs', blocks: [
          { id: 'A', type: 'section', blocks: [{ id: 'ac', type: 'stat', field: 'ac', look: 'run-in' }] },
          { id: 'B', type: 'section', blocks: [{ id: 'hp', type: 'stat', field: 'hp', look: 'run-in' }] },
        ],
      },
      { id: 'D', type: 'divider' },
    ];
    const boxes = new Map<string, Box>([
      ['T', box(0, 0, 300, 60)],
      ['A', box(0, 28, 300, 60)],
      ['ac', box(0, 30, 300, 50)],
      ['D', box(0, 70, 300, 72)],
    ]);
    return { layout: template(blocks).layout, boxes, card: box(0, 0, 300, 72) };
  }

  it('refuses a block that is no Section over the strip, and takes it into the open tab', () => {
    expect(dropTargetAt(tabsScene(), fresh('stat'), { x: 150, y: 10 })).toEqual({ kind: 'refused' });
    expect(dropTargetAt(tabsScene(), moving('D', 'divider'), { x: 150, y: 48 })).toMatchObject({ kind: 'between', parentId: 'A', index: 1 });
  });

  it('takes a Section over the strip as a new tab', () => {
    expect(dropTargetAt(tabsScene(), fresh('section'), { x: 150, y: 10 })).toMatchObject({ kind: 'between', parentId: 'T' });
  });

  it('offers the keys no place in a closed tab', () => {
    const { targets } = keyboardTargets(tabsScene(), moving('D', 'divider'));
    expect(targets.some((target) => target.kind !== 'refused' && target.parentId === 'B')).toBe(false);
    expect(targets.some((target) => target.kind !== 'refused' && target.parentId === 'T')).toBe(false);
  });
});
