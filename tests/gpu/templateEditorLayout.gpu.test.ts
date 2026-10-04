import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SRD_5_2_1_SOURCE } from '../../src/app/statblocks/presets/attributions';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frame, frames, mount, px, useEditorStyles, wait } from './sidePanesHarness';

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

/**
 * The template editor's shell with the real stylesheet (§2, §14, §17 D):
 * the note view's row with the dock and the floating panels over the note
 * column, never over the card where the view is wide; padding equals the gap,
 * corners are concentric, only transform and opacity animate, and below
 * 720 px the card stands above the note.
 */
const TOLERANCE = 0.5;
/**
 * Elevated surfaces have a 1.5 px border (`$border-width-m`), which Chrome
 * draws 1 px wide at a device pixel ratio of 1, as here. Insets measured from
 * the outer edge are put back to the border the corners were worked out for.
 */
const BORDER = 1.5;
const drawnBorder = (element: Element): number => px(getComputedStyle(element).borderTopWidth);
const ANIMATABLE = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate']);
/** Padding on all four sides and the gaps between children, of one container. */
function spacing(element: Element): { padding: number[]; rowGap: number; columnGap: number } {
  const style = getComputedStyle(element);
  return {
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px),
    rowGap: px(style.rowGap),
    columnGap: px(style.columnGap),
  };
}

function expectUniform(element: Element, what: string, axes: Array<'rowGap' | 'columnGap'> = ['rowGap']): number {
  const { padding, ...gaps } = spacing(element);
  const [first = 0] = padding;
  for (const side of padding) expect(side, `${what}: padding on every side`).toBeCloseTo(first, 1);
  for (const axis of axes) expect(gaps[axis], `${what}: ${axis} equals padding`).toBeCloseTo(first, 1);
  expect(first, `${what}: has padding`).toBeGreaterThan(0);
  return first;
}

/** A panel's close button sits the same gap from the top and the end, its corner concentric with the panel's. */
function expectConcentricClose(panel: Element, what: string): void {
  const button = panel.querySelector('.atlas-close-btn')!;
  const outer = panel.getBoundingClientRect();
  const inner = button.getBoundingClientRect();
  const correction = BORDER - drawnBorder(panel);
  const top = inner.top - outer.top + correction;
  const end = outer.right - inner.right + correction;
  expect(top, `${what}: the same gap above and beside the close button`).toBeCloseTo(end, 0);
  const panelRadius = px(getComputedStyle(panel).borderTopRightRadius);
  const buttonRadius = px(getComputedStyle(button).borderTopRightRadius);
  expect(Math.abs(buttonRadius + end - panelRadius), `${what}: close button concentric (${buttonRadius} + ${end} vs ${panelRadius})`).toBeLessThan(TOLERANCE);
}

/**
 * What animated while `act` ran and for a moment after: the properties of Web
 * Animations and CSS transitions in the editor, and any style property a
 * script set to more than two values on one element (a tween in JS).
 */
async function animatedWhile(run: () => void | Promise<void>): Promise<string[]> {
  const seen = new Map<Element, Map<string, Set<string>>>();
  const props = new Set<string>();
  const note = (): void => {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || !effect.target?.closest('.atlas-vtt-plugin')) continue;
      if (animation instanceof CSSTransition) props.add(animation.transitionProperty);
      else for (const keyframe of effect.getKeyframes()) {
        for (const name of Object.keys(keyframe)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(name)) props.add(name);
      }
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (!(record.target instanceof HTMLElement) || !record.target.closest('.atlas-vtt-plugin')) continue;
      const style = record.target.style;
      const values = seen.get(record.target) ?? new Map<string, Set<string>>();
      seen.set(record.target, values);
      for (let index = 0; index < style.length; index++) {
        const name = style.item(index);
        if (name.startsWith('--')) continue;
        const list = values.get(name) ?? new Set<string>();
        list.add(style.getPropertyValue(name));
        values.set(name, list);
      }
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
  await act(async () => { await run(); });
  for (let sample = 0; sample < 12; sample++) {
    note();
    await frames(2);
  }
  observer.disconnect();
  for (const values of seen.values()) for (const [name, list] of values) if (list.size > 2) props.add(name);
  return [...props].filter((name) => !ANIMATABLE.has(name));
}

const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - TOLERANCE && a.right > b.left + TOLERANCE && a.top < b.bottom - TOLERANCE && a.bottom > b.top + TOLERANCE;
const card = (): DOMRect => document.querySelector('.atlas-sb-pane-card')!.getBoundingClientRect();

async function openDock(name: string): Promise<HTMLElement> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-dock button')].find((element) => element.textContent === name)!;
  await act(async () => { button.click(); });
  await wait(300);
  return document.querySelector<HTMLElement>('.atlas-te-dock-panel')!;
}

async function openSettings(id: string): Promise<HTMLElement> {
  await act(async () => { frame(id).click(); });
  await act(async () => { frame(id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); });
  await wait(300);
  return document.querySelector<HTMLElement>('.atlas-te-settings')!;
}

describe('the template editor as the note view', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('is the note view\'s row: the note on the left, the panel at its width on the right, under a capsule of one line', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    await frames(3);
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    expect(note.right).toBeCloseTo(panel.left, 0);
    expect(panel.right).toBeCloseTo(root.getBoundingClientRect().right, 0);
    const capsule = root.querySelector<HTMLElement>('.atlas-te-capsule')!;
    const control = px(getComputedStyle(capsule).getPropertyValue('--input-height')) || 30;
    const inner = capsule.clientHeight - px(getComputedStyle(capsule).paddingTop) - px(getComputedStyle(capsule).paddingBottom);
    expect(inner, 'the capsule holds one line of controls').toBeCloseTo(control, 0);
    expect(root.querySelector('.atlas-te-floating')).toBeNull();
  });

  it('starts the note\'s text past the dock, with Obsidian\'s file margins written as two values', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    root.style.setProperty('--file-margins', '32px 32px');
    await frames(3);
    const reader = root.querySelector<HTMLElement>('.atlas-te-note__reader > .markdown-preview-view')!;
    const dock = root.querySelector('.atlas-te-dock')!.getBoundingClientRect();
    const textStart = reader.getBoundingClientRect().left + px(getComputedStyle(reader).paddingInlineStart);
    expect(textStart, 'the text starts past the dock').toBeGreaterThanOrEqual(dock.right);
  });

  it('keeps the capsule on one line at every panel width from 320 px', async () => {
    const root = mount(new FakeSession(sampleTemplate(), { name: 'A template with a rather long name indeed' }), 1180);
    for (const width of [960, 600, 420, 360, 320]) {
      root.querySelector<HTMLElement>('.atlas-sb-note-panel')!.style.setProperty('--atlas-sb-panel-width', `${width}px`);
      root.querySelector<HTMLElement>('.atlas-sb-note-panel')!.style.width = `${width}px`;
      await wait(60);
      const capsule = root.querySelector<HTMLElement>('.atlas-te-capsule')!;
      // Centred on one line: every part's middle at the same height.
      const middles = new Set([...capsule.children].map((child) => {
        const box = child.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      }));
      expect(middles.size, `one line at ${width}px`).toBe(1);
      expect(capsule.scrollWidth, `nothing hangs out at ${width}px`).toBeLessThanOrEqual(capsule.clientWidth + 1);
    }
  });

  it('pads the dock panel and the Settings groups as much as they space their children, and gives the Add panel\'s rows room', async () => {
    mount(new FakeSession(sampleTemplate()), 1400);
    await frames(2);
    const panel = await openDock('Add');
    expect(panel.getBoundingClientRect().width).toBeCloseTo(280, 0);
    expectUniform(panel.querySelector('.atlas-te-floating__content')!, 'dock panel');
    for (const row of [...panel.querySelectorAll<HTMLElement>('.atlas-te-palette__row')].slice(0, 6)) {
      expect(row.getBoundingClientRect().height, 'an Add panel row').toBeGreaterThanOrEqual(40 - TOLERANCE);
    }
    expectConcentricClose(panel, 'dock panel');

    const settings = await openSettings('stat-ac1');
    expect(settings.getBoundingClientRect().width).toBeCloseTo(300, 0);
    for (const group of settings.querySelectorAll('.atlas-te-group')) {
      expectUniform(group, `settings group ${group.getAttribute('data-group') ?? ''}`, ['rowGap', 'columnGap']);
    }
    expectConcentricClose(settings, 'settings');
  });

  it('keeps every floating panel off the card where the view is at least 900 px wide', async () => {
    for (const width of [1400, 900]) {
      mount(new FakeSession(sampleTemplate()), width);
      await frames(3);
      const dock = document.querySelector('.atlas-te-dock')!.getBoundingClientRect();
      expect(overlaps(dock, card()), `the dock at ${width}px`).toBe(false);
      const panel = await openDock('Structure');
      expect(overlaps(panel.getBoundingClientRect(), card()), `the dock panel at ${width}px`).toBe(false);
      const settings = await openSettings('stat-hp1');
      expect(overlaps(settings.getBoundingClientRect(), card()), `Settings at ${width}px`).toBe(false);
      const open = document.querySelector('.atlas-te-dock-panel');
      if (open) expect(overlaps(open.getBoundingClientRect(), settings.getBoundingClientRect()), `the two panels at ${width}px`).toBe(false);
      cleanup();
    }
  });

  it('shows the dock panel and Settings one at a time below 900 px', async () => {
    mount(new FakeSession(sampleTemplate()), 899);
    await frames(3);
    await openDock('Structure');
    await openSettings('stat-hp1');
    await wait(300);
    expect(document.querySelector('.atlas-te-dock-panel')).toBeNull();
    expect(document.querySelector('.atlas-te-settings')).not.toBeNull();
  });

  it('stands the card above the note below 720 px, with the dock\'s panels in the capsule\'s menu', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 719);
    await frames(3);
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    expect(panel.bottom).toBeLessThanOrEqual(note.top + TOLERANCE);
    expect(root.querySelector('.atlas-te-dock')).toBeNull();
    expect(card().width).toBeGreaterThanOrEqual(320);
  });

  it('keeps the block toolbar on its block when a conflict bar opens above the card and when it goes', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1180);
    await act(async () => { frame('stat-hp1').click(); });
    await frames(2);
    const toolbar = (): DOMRect => document.querySelector('.atlas-te-toolbar')!.getBoundingClientRect();
    const offset = (): number => toolbar().top - frame('stat-hp1').getBoundingClientRect().top;
    const resting = offset();
    const blockTop = frame('stat-hp1').getBoundingClientRect().top;
    await act(async () => { session.patch({ conflict: 'changed', saveState: 'conflict' }); });
    await frames(3);
    expect(frame('stat-hp1').getBoundingClientRect().top, 'the bar moved the card down').toBeGreaterThan(blockTop + 10);
    expect(offset()).toBeCloseTo(resting, 0);
    await act(async () => { session.patch({ conflict: null, saveState: 'saved' }); });
    await frames(3);
    expect(offset()).toBeCloseTo(resting, 0);
  });

  it('keeps the Settings panel\'s border whole where it is taller than the room: it scrolls inside it', async () => {
    mount(new FakeSession(sampleTemplate()), 1400);
    await frames(3);
    const settings = await openSettings('stat-hp1');
    for (const name of ['Visibility', 'Write as', 'Property', 'For themes']) {
      const header = [...settings.querySelectorAll<HTMLElement>('.atlas-te-group__header')].find((element) => element.querySelector('span')?.textContent === name);
      if (header?.getAttribute('aria-expanded') !== 'true') await act(async () => { header?.click(); });
    }
    await wait(400);
    expect(settings.scrollHeight, 'the open groups are taller than the room').toBeGreaterThan(settings.clientHeight);
    expect(settings.getBoundingClientRect().bottom, 'its bottom border shows inside the editor').toBeLessThanOrEqual(document.querySelector('.atlas-te')!.getBoundingClientRect().bottom);
  });

  it('animates only transform and opacity: the dock panel, Settings, its crossfade and its groups', async () => {
    mount(new FakeSession(sampleTemplate()), 1400);
    await frames(2);
    const dockButton = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-dock button')].find((element) => element.textContent === name)!;
    expect(await animatedWhile(() => dockButton('Add').click()), 'a dock panel opening').toEqual([]);
    expect(await animatedWhile(() => dockButton('Structure').click()), 'the dock panel swapping').toEqual([]);
    expect(await animatedWhile(() => frame('stat-ac1').click()), 'selecting a block').toEqual([]);
    expect(await animatedWhile(() => {
      frame('stat-ac1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    }), 'Settings opening').toEqual([]);
    expect(await animatedWhile(() => frame('stat-hp1').click()), 'Settings following the selection').toEqual([]);
    const visibility = [...document.querySelectorAll<HTMLElement>('.atlas-te-settings .atlas-te-group__header')].find((header) => header.querySelector('span')?.textContent === 'Visibility')!;
    expect(await animatedWhile(() => visibility.click()), 'opening a group').toEqual([]);
  });

  it('keeps the dialogs\' close buttons concentric', async () => {
    mount(new FakeSession({ ...sampleTemplate(), source: SRD_5_2_1_SOURCE }), 1400);
    await openSettings('stat-ac1');
    await wait(300);
    // The content shown now: the one before fades out beside it.
    const content = (): HTMLElement => [...document.querySelectorAll<HTMLElement>('.atlas-te-settings .atlas-te-insp__fade')].at(-1)!;
    const advanced = [...content().querySelectorAll<HTMLElement>('.atlas-te-group__header')].find((header) => header.querySelector('span')?.textContent === 'Property')!;
    if (advanced.getAttribute('aria-expanded') !== 'true') await act(async () => { advanced.click(); });
    await wait(300);
    const rename = [...content().querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === 'Rename…')!;
    await act(async () => { rename.click(); });
    await wait(400);
    expectConcentricClose(document.querySelector('.atlas-te-dialog')!, 'Rename key');
  });
});
