import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { FakeSession, sampleTemplate, shape } from '../unit/statblocks/template-editor/editorKit';
import { centreOf, mouse, pressAndMove } from './realMouse';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links and the header's file actions reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => undefined }));
vi.mock('../../src/app/statblocks/editor/template-editor/templateEditorActions', () => ({
  duplicateTemplate: async () => null,
  newStatblockFromTemplate: async () => undefined,
}));

const SETTLED_MS = 260;
type Rect = { left: number; top: number; right: number; bottom: number };
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const menuRows = (): string[] => [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent ?? '');

/** Points at a block with the real mouse; its handle shows in the gutter. */
async function grip(id: string): Promise<HTMLElement> {
  const { x, y } = centreOf(frame(id));
  await mouse.hover(x, y);
  await frames(2);
  const handle = document.querySelector<HTMLElement>('.atlas-sb-handle[data-glyph="grip"]');
  if (!handle) throw new Error(`No handle for ${id}.`);
  return handle;
}

/**
 * Handles, menus and the toolbar in the template editor, with real mouse
 * input (spec §3–§5, M5, M6, B1, B2, D1): every block shows a ⋮⋮ handle in
 * its gutter on hover, which drags it and opens its menu; a right-click
 * selects and opens the same menu, whose last row deletes; the toolbar of
 * five controls sits below the selected block.
 */
describe('handles and menus in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('shows a 24 × 24 handle in the gutter of the block pointed at, covering none of its text', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    for (const id of ['title001', 'stat-ac1', 'divider1']) {
      const handle = await grip(id);
      const box = handle.getBoundingClientRect();
      expect(box.width).toBe(24);
      expect(box.height).toBe(24);
      expect(box.right).toBeLessThanOrEqual(frame(id).getBoundingClientRect().left + 4);
      expect(handle.tabIndex).toBe(-1);
    }
  });

  it('moves a block dragged by its handle to where the line showed, as one undo step', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const handle = await grip('divider1');
    const hp = frame('stat-hp1').getBoundingClientRect();
    const to = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    const connected: boolean[] = [];
    await pressAndMove(centreOf(handle), to, 20, () => connected.push(handle.isConnected));
    expect(document.querySelector('.atlas-te-drop-line')).not.toBeNull();
    await act(async () => {
      await mouse.up(to.x, to.y);
      await wait(SETTLED_MS);
    });
    expect(connected.every(Boolean)).toBe(true);
    expect(shape(session.template.layout.blocks)).toBe('title001 section1(stat-ac1 divider1 stat-hp1) row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
  });

  it('never drags from a block\'s body, a label or a sample value: the press selects', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    const to = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pressAndMove(centreOf(frame('divider1')), to, 16);
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    expect(session.steps).toBe(0);
  });

  it('opens the block\'s menu by a click on its handle and by right-click, which selects first; Delete is the last row', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const handle = await grip('stat-hp1');
    await act(async () => {
      await mouse.click(centreOf(handle).x, centreOf(handle).y);
      await frames(3);
    });
    expect(menuRows().at(-1)).toMatch(/^Delete/);
    await userEvent.keyboard('{Escape}');
    await frames(2);

    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.rightClick(ac.x, ac.y);
      await frames(3);
    });
    expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe('stat-ac1');
    const rows = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const remove = rows.at(-1)!;
    expect(remove.textContent).toMatch(/^Delete/);
    await act(async () => {
      await mouse.click(centreOf(remove).x, centreOf(remove).y);
      await frames(3);
    });
    expect(shape(session.template.layout.blocks)).toContain('section1(stat-hp1)');
    expect(session.steps).toBe(1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
  });

  it('sets the toolbar of five controls below the selected block, never over it', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.click(ac.x, ac.y);
      await frames(3);
    });
    const toolbar = document.querySelector<HTMLElement>('.atlas-te-toolbar')!;
    expect(toolbar.querySelectorAll('button')).toHaveLength(5);
    const box = toolbar.getBoundingClientRect();
    const block = frame('stat-ac1').getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(block.bottom + 8);
    expect(intersects(box, block)).toBe(false);
    expect(box.width).toBeLessThanOrEqual(220);
  });

  it('keeps the toolbar shown and in reach while the pointer crosses the line below on its way there', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.click(ac.x, ac.y);
      await frames(3);
    });
    const toolbar = document.querySelector<HTMLElement>('.atlas-te-toolbar')!;
    const box = toolbar.getBoundingClientRect();
    const hp = frame('stat-hp1').getBoundingClientRect();
    // The toolbar stands at the block's right end, over the empty end of the line below, never its label.
    expect(box.right).toBeCloseTo(frame('stat-ac1').getBoundingClientRect().right, 0);
    expect(box.left).toBeGreaterThan(hp.left + 40);
    // Down from the block, over the line below, onto every control and the gaps between them: the toolbar stays.
    const more = centreOf(toolbar.querySelector<HTMLElement>('.atlas-te-toolbar__more button')!);
    await mouse.hover(more.x, hp.top + 1);
    await frames(2);
    for (let x = box.left + 2; x < box.right - 2; x += 4) {
      await mouse.hover(x, more.y);
      const at = document.elementFromPoint(x, more.y);
      expect(at && toolbar.contains(at)).toBe(true);
    }
    await frames(2);
    expect(getComputedStyle(toolbar).opacity).toBe('1');
    expect(getComputedStyle(toolbar).visibility).toBe('visible');
    await act(async () => {
      await mouse.click(more.x, more.y);
      await frames(3);
    });
    expect(menuRows().length).toBeGreaterThan(0);
    expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe('stat-ac1');
  });

  it('opens the menu of what a toolbar button covers on a right-click there', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.click(ac.x, ac.y);
      await frames(3);
    });
    const blockUnder = (at: { x: number; y: number }): string | null | undefined => document.elementsFromPoint(at.x, at.y)
      .find((element) => element.closest('.atlas-te-stage [data-block-id]'))?.closest('[data-block-id]')?.getAttribute('data-block-id');
    const button = document.querySelector<HTMLElement>('.atlas-te-toolbar button')!;
    const at = centreOf(button);
    const id = blockUnder(at);
    await act(async () => {
      await mouse.rightClick(at.x, at.y);
      await frames(3);
    });
    // A line under the button gets its own menu; the card's gaps get the card's.
    expect(menuRows().length).toBeGreaterThan(0);
    if (id) {
      expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe(id);
      expect(menuRows().at(-1)).toMatch(/^Delete/);
    }
    // While a block's menu is open the toolbar keeps out of its way (§4.2).
    expect(document.querySelector('.atlas-te-toolbar')?.hasAttribute('data-hidden')).toBe(true);
  });
});
