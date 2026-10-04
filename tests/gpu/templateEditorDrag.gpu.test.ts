import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { userEvent } from 'vitest/browser';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { FakeSession, sampleTemplate, shape } from '../unit/statblocks/template-editor/editorKit';
import { drop, dropLine, gripOf, openPopout, pickUpAndMove, pointer, pointIn, press } from './dragHarness';
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

/** Long enough for the copy to settle (180 ms) and the landing wash to start. */
const SETTLED_MS = 260;
const live = (): string => document.querySelector('.atlas-te-live')?.textContent?.trim() ?? '';
const sectionShape = (session: FakeSession): string => shape(session.template.layout.blocks);

/**
 * Drag and drop in the template editor with the real stylesheet (§7.6, §14.2):
 * where the line shows is where the block lands, only a block's handle drags
 * it, a block's left and right edges set blocks side by side, the keyboard
 * moves blocks too, focus and
 * announcements follow the block.
 */
describe('dragging blocks in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('lands a block dragged across nesting exactly where the line showed', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), { x: hp.left + hp.width / 2, y: hp.top + 2 });
    const line = dropLine();
    expect(line?.orientation).toBe('horizontal');
    expect(live()).toBe('Section Defenses, position 2 of 3.');
    // The whole drag is one gesture: nothing saves meanwhile, and a change written elsewhere is a conflict.
    expect(session.gestureOpen).toBe(true);

    await drop(window, { x: hp.left + hp.width / 2, y: hp.top + 2 });
    await wait(SETTLED_MS);
    expect(session.gestureOpen).toBe(false);
    expect(sectionShape(session)).toBe('title001 section1(stat-ac1 divider1 stat-hp1) row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
    const ac = frame('stat-ac1').getBoundingClientRect();
    const divider = frame('divider1').getBoundingClientRect();
    expect(line!.y).toBeGreaterThanOrEqual(ac.bottom - 1);
    expect(line!.y).toBeLessThanOrEqual(divider.top + 1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('divider1');
    expect(live()).toBe('Moved Divider to section Defenses, position 2 of 3.');
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
  });

  it('sets a block beside another over the band along its edge, with a line down that edge, and between them over its middle', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const ac = frame('stat-ac1').getBoundingClientRect();
    const at = { x: ac.right - Math.min(ac.width * 0.08, 20), y: ac.top + ac.height / 2 + 1 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('title001'))), at);
    const line = dropLine();
    expect(line?.orientation).toBe('vertical');
    expect(line!.x).toBeGreaterThanOrEqual(ac.right - 1);
    expect(live()).toBe('Beside Armor class, on its right.');

    await drop(window, at);
    await wait(SETTLED_MS);
    expect(sectionShape(session)).toMatch(/^section1\((\w+)\(stat-ac1 title001\) stat-hp1\) row00001\(stat-sp1 stat-cr1\) divider1$/);
    expect(session.steps).toBe(1);
    const title = frame('title001').getBoundingClientRect();
    const placed = frame('stat-ac1').getBoundingClientRect();
    expect(title.left).toBeGreaterThanOrEqual(placed.right - 1);
    expect(Math.abs(title.top - placed.top)).toBeLessThan(placed.height);

    const hp = frame('stat-hp1').getBoundingClientRect();
    const middle = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), middle);
    expect(dropLine()?.orientation).toBe('horizontal');
    await drop(window, middle);
  });

  it('starts no drag from a press on a block\'s body: only its handle drags it', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(frame('divider1')), { x: hp.left + hp.width / 2, y: hp.top + 2 });
    expect(dropLine()).toBeNull();
    expect(session.gestureOpen).toBe(false);
    await drop(window, { x: hp.left + hp.width / 2, y: hp.top + 2 });
    expect(session.steps).toBe(0);
  });

  it('moves a block with Space and the arrow keys, and Escape puts it back', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await userEvent.click(frame('stat-hp1'));
    await userEvent.keyboard(' ');
    expect(live()).toMatch(/^Picked up Hit points\. Choose a place with the arrow keys/);
    await wait(20);
    await userEvent.keyboard('{ArrowDown}');
    await frames(2);
    expect(live()).toBe('The top level, position 3 of 5.');
    expect(dropLine()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await frames(2);
    expect(session.steps).toBe(0);
    expect(live()).toBe('Cancelled. Hit points stays where it was.');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');

    await userEvent.keyboard(' ');
    await wait(20);
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    await wait(SETTLED_MS);
    expect(sectionShape(session)).toBe('title001 section1(stat-ac1) stat-hp1 row00001(stat-sp1 stat-cr1) divider1');
    expect(session.steps).toBe(1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
    expect(live()).toBe('Moved Hit points to the top level, position 3 of 5.');
  });

  it('cancels a pointer drag on Escape, also with the pressed block selected, and the release drops nothing', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await userEvent.click(frame('divider1'));
    const hp = frame('stat-hp1').getBoundingClientRect();
    const at = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), at);
    expect(dropLine()).not.toBeNull();
    expect(session.gestureOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    await frames(2);
    expect(dropLine()).toBeNull();
    expect(session.gestureOpen).toBe(false);
    expect(live()).toBe('Cancelled. Divider stays where it was.');
    await drop(window, at);
    await wait(SETTLED_MS);
    expect(session.steps).toBe(0);
    expect(sectionShape(session)).toBe('title001 section1(stat-ac1 stat-hp1) row00001(stat-sp1 stat-cr1) divider1');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('divider1');
  });

  it('inserts an Add panel row where it is dropped and selects it, without opening its label', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    // The palette is the dock's Add panel.
    const add = [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-dock button')].find((element) => element.textContent === 'Add')!;
    await act(async () => { add.click(); });
    await act(() => wait(300));
    const tile = document.querySelector<HTMLElement>('.atlas-te-palette__row[data-item="block:stat"]')!;
    // The Add panel scrolls: the row is brought into its view before the press.
    tile.scrollIntoView({ block: 'center' });
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    const at = { x: hp.left + hp.width / 2, y: hp.bottom - 2 };
    await pickUpAndMove(window, pointIn(tile), at);
    expect(document.querySelector('.atlas-te-drag-overlay .atlas-te-drag-face--item .atlas-statblock')).not.toBeNull();
    await drop(window, at);
    await act(() => wait(SETTLED_MS));
    const section = session.template.layout.blocks[1];
    expect(section && 'blocks' in section ? section.blocks.map((block) => block.type) : []).toEqual(['stat', 'stat', 'stat']);
    expect(session.steps).toBe(1);
    const inserted = section && 'blocks' in section ? section.blocks[2]?.id : undefined;
    expect(document.querySelector('.atlas-te-label-input')).toBeNull();
    expect(document.activeElement?.getAttribute('data-block-id')).toBe(inserted);
  });

  it('keeps one owner of each transform: the drag slides frames, framer animates none of them', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(await gripOf(frame('stat-ac1'))), { x: hp.left + hp.width / 2, y: hp.bottom - 3 });
    await wait(80);
    const slid = [...document.querySelectorAll<HTMLElement>('[data-te-shift]')];
    expect(slid.map((element) => element.dataset.blockId).sort()).toEqual(['stat-ac1', 'stat-hp1']);
    for (const element of slid) {
      expect(getComputedStyle(element).transform).not.toBe('none');
      expect(element.style.transform).toBe('');
      expect(element.getAnimations().every((animation) => animation instanceof CSSTransition)).toBe(true);
    }
    const scripted = document.getAnimations().filter((animation) => !(animation instanceof CSSTransition || animation instanceof CSSAnimation));
    const targets = scripted.map((animation) => (animation.effect as KeyframeEffect | null)?.target).filter((target) => target instanceof Element);
    expect(targets.filter((target) => target.closest('[data-te-shift], .atlas-te-drag-overlay'))).toEqual([]);
    expect(document.querySelector('.atlas-te-drag-overlay')?.getAnimations()).toEqual([]);
    await drop(window, { x: hp.left + hp.width / 2, y: hp.bottom - 3 });
    expect(document.querySelectorAll('[data-te-shift]')).toHaveLength(0);
    expect(sectionShape(session)).toMatch(/section1\(stat-hp1 stat-ac1\)/);
  });

  it('drags in a second window as in the first, through a change of the card mid-drag, binding nothing to the first', async () => {
    const session = new FakeSession(sampleTemplate());
    const popout = openPopout();
    // What a drag binds in the first window while it runs (a menu that mounts after the drop binds its own).
    let spies: Array<MockInstance<typeof window.addEventListener>> = [];
    const watchFirstWindow = (): void => {
      vi.restoreAllMocks();
      spies = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')];
    };
    // A tooltip's trigger (the handle's) listens once for the press's end on the global document, Radix's own; the drag binds nothing there.
    const once = (options: unknown): boolean => typeof options === 'object' && options !== null && (options as AddEventListenerOptions).once === true;
    const boundInFirstWindow = (): string[] => spies
      .flatMap((spy) => spy.mock.calls.filter(([, , options]) => !once(options)).map(([type]) => type))
      .filter((type) => /pointer|mouse|key|touch/.test(type));
    try {
      const h = React.createElement;
      const noop = (): void => undefined;
      render(h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin' }, h('div', { className: 'atlas-statblock-editor', style: { height: 700, width: 1000 } },
        h(TemplateEditor, {
          session, host: { openTemplate: noop, openNote: noop, close: noop }, previewPath: null, onShowWithChange: noop, collectionId: null, onCollectionChange: noop,
        })))), { container: popout.container, baseElement: popout.win.document.body });
      const { win } = popout;
      const doc = win.document;
      await frames(3, win);
      watchFirstWindow();
      // Over the section's heading the top level's blocks have slid back where the targets are worked out.
      await pickUpAndMove(win, pointIn(await gripOf(frame('divider1', doc))), pointIn(frame('section1', doc), 0.5, 0.05));
      await wait(250);
      act(() => session.apply((template) => ({
        ...template, layout: { ...template.layout, blocks: [{ id: 'heading9', type: 'heading', text: 'Added during the drag', level: 'section' }, ...template.layout.blocks] },
      })));
      await frames(3, win);
      const hp = frame('stat-hp1', doc).getBoundingClientRect();
      pointer(win, 'pointermove', { x: hp.left + hp.width / 2, y: hp.top + 2 });
      await frames(3, win);
      const line = dropLine(doc);
      expect(boundInFirstWindow()).toEqual([]);
      expect(doc.querySelector('.atlas-te-drag-layer .atlas-te-drag-overlay')).not.toBeNull();
      expect(document.querySelector('.atlas-te-drag-layer')).toBeNull();
      await drop(win, { x: hp.left + hp.width / 2, y: hp.top + 2 });
      await wait(SETTLED_MS);
      expect(shape(session.template.layout.blocks)).toBe('heading9 title001 section1(stat-ac1 divider1 stat-hp1) row00001(stat-sp1 stat-cr1)');
      expect(line!.y).toBeGreaterThanOrEqual(frame('stat-ac1', doc).getBoundingClientRect().bottom - 1);
      expect(line!.y).toBeLessThanOrEqual(frame('divider1', doc).getBoundingClientRect().top + 1);
      expect(doc.activeElement?.getAttribute('data-block-id')).toBe('divider1');
      expect(doc.querySelector('.atlas-te-live')?.textContent?.trim()).toBe('Moved Divider to section Defenses, position 2 of 3.');

      // The keyboard, too: Space lifts, the arrows choose, Space drops.
      watchFirstWindow();
      press(frame('stat-hp1', doc), ' ', 'Space');
      await wait(20);
      press(doc.activeElement ?? doc.body, 'ArrowDown');
      await frames(2, win);
      expect(doc.querySelector('.atlas-te-live')?.textContent?.trim()).toBe('The top level, position 4 of 5.');
      expect(boundInFirstWindow()).toEqual([]);
      press(doc.activeElement ?? doc.body, ' ', 'Space');
      await wait(SETTLED_MS);
      expect(shape(session.template.layout.blocks)).toBe('heading9 title001 section1(stat-ac1 divider1) stat-hp1 row00001(stat-sp1 stat-cr1)');
      expect(doc.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
    } finally {
      vi.restoreAllMocks();
      cleanup();
      popout.close();
    }
  });
});
