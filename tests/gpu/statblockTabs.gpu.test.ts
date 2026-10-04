import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { FakeSession, template } from '../unit/statblocks/template-editor/editorKit';
import { centreOf, mouse } from './realMouse';
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

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'reactions', label: 'Reactions', type: 'entries' },
  { key: 'lair', label: 'Lair', type: 'markdown' },
];

const TABS: TemplateBlock = {
  id: 'tabs0001', type: 'tabs', blocks: [
    { id: 'tabactn1', type: 'section', heading: 'Actions', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
    { id: 'tabreac1', type: 'section', heading: 'Reactions', blocks: [{ id: 'reacts01', type: 'entries', field: 'reactions' }] },
    { id: 'tablair1', type: 'section', heading: 'Lair', blocks: [{ id: 'lairtext', type: 'text', field: 'lair' }] },
  ],
};
const VALUES = { name: 'Bog hag', actions: [{ name: 'Claw', desc: 'One target.' }], lair: 'A drowned mill.' };

/** A submenu opens once the pointer has rested on its row a moment (Radix: 100 ms). */
const SUBMENU_OPENS_MS = 200;

const tabs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.atlas-sb-sheet [role="tab"]')];
const tabNames = (): string[] => tabs().map((tab) => tab.textContent ?? '');
const openPanel = (): HTMLElement | null => document.querySelector<HTMLElement>('.atlas-sb-sheet [role="tabpanel"]:not([hidden])');
const selected = (): string | null | undefined => document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id');
const menuRow = (label: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((row) => row.textContent?.startsWith(label));

async function clickAt(element: Element): Promise<void> {
  const { x, y } = centreOf(element);
  await act(async () => {
    await mouse.hover(x, y);
    await mouse.click(x, y);
    await frames(3);
  });
}

async function rightClickAt(element: Element): Promise<void> {
  const { x, y } = centreOf(element);
  await act(async () => {
    await mouse.rightClick(x, y);
    await frames(3);
  });
}

/** Opens a submenu row by pointing at it, then moves along to the row inside it and clicks that. */
async function chooseIn(submenu: string, row: string): Promise<void> {
  const trigger = menuRow(submenu);
  if (!trigger) throw new Error(`No ${submenu} row.`);
  const from = centreOf(trigger);
  await act(async () => {
    await mouse.hover(from.x, from.y);
    await wait(SUBMENU_OPENS_MS);
  });
  const target = menuRow(row);
  if (!target) throw new Error(`No ${row} row.`);
  const to = centreOf(target);
  await act(async () => {
    for (let step = 1; step <= 8; step++) {
      await mouse.hover(from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8);
      await frames(1);
    }
    await mouse.click(to.x, to.y);
    await frames(3);
  });
}

/**
 * Tabs with real mouse and keyboard input: the read-only card shows a tab
 * only for a Section that shows something and the editing card every one,
 * clicks and the arrow keys open tabs, and the template editor splits a
 * list into tabs and adds a tab, each one undo step.
 */
describe('tabs on the statblock card', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('switches with a click and the arrow keys, and shows the open tab in the accent', async () => {
    render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full' }));
    await frames(2);
    expect(tabNames()).toEqual(['Actions', 'Lair']);
    expect(openPanel()?.textContent).toContain('Claw');
    await clickAt(tabs()[1]!);
    expect(openPanel()?.textContent).toContain('A drowned mill.');
    expect(document.activeElement).toBe(tabs()[1]);
    const open = getComputedStyle(tabs()[1]!);
    expect(open.borderBottomColor).toBe('rgb(127, 109, 242)');
    expect(getComputedStyle(tabs()[0]!).borderBottomColor).not.toBe(open.borderBottomColor);
    expect(getComputedStyle(document.querySelector('.atlas-sb-tabs')!).breakInside).toBe('avoid');

    await userEvent.keyboard('{ArrowLeft}');
    expect(openPanel()?.textContent).toContain('Claw');
    expect(document.activeElement).toBe(tabs()[0]);
    await userEvent.keyboard('{End}');
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('leaves out an empty Section\'s tab when read, and shows it while editing', async () => {
    const view = render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full' }));
    expect(tabNames()).toEqual(['Actions', 'Lair']);
    view.unmount();
    render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full', mode: 'editing' }));
    expect(tabNames()).toEqual(['Actions', 'Reactions', 'Lair']);
  });
});

describe('tabs in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  const LIST: TemplateBlock[] = [
    { id: 'title001', type: 'title', field: 'name', level: 1 },
    { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' },
    { id: 'divider1', type: 'divider' },
  ];

  it('splits a list into tabs and adds a tab from the block menus, each one undo step', async () => {
    const session = new FakeSession(template(LIST, FIELDS));
    mount(session, 1280);
    await frames(2);

    await rightClickAt(frame('actions1'));
    await chooseIn('Arrange', 'Split into tabs');
    const [, tabsBlock] = session.template.layout.blocks;
    expect(tabsBlock).toMatchObject({ type: 'tabs', blocks: [{ heading: 'Actions', blocks: [{ id: 'actions1' }] }, { heading: 'Tab 2', blocks: [] }] });
    expect(session.steps).toBe(1);
    expect(tabNames()).toEqual(['Actions', 'Tab 2']);
    expect(openPanel()?.querySelector('[data-block-id="actions1"]')).not.toBeNull();

    await rightClickAt(document.querySelector('.atlas-te-stage .atlas-sb-tabstrip')!);
    await clickAt(menuRow('Add tab')!);
    expect(session.steps).toBe(2);
    expect(tabNames()).toEqual(['Actions', 'Tab 2', 'Tab 3']);
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('true');
    const now = session.template.layout.blocks[1];
    expect(selected()).toBe(now?.type === 'tabs' ? now.blocks[2]?.id : 'no tabs');
  });

  it('opens a tab on a click, letting go of a block it hides, and opens the tab of a block the keys select', async () => {
    const session = new FakeSession(template([LIST[0]!, TABS], FIELDS));
    mount(session, 1280);
    await frames(2);
    await clickAt(frame('actions1'));
    expect(selected()).toBe('actions1');

    await clickAt(tabs()[2]!);
    expect(openPanel()?.querySelector('[data-block-id="lairtext"]')).not.toBeNull();
    expect(selected()).toBeUndefined();
    expect(session.steps).toBe(0);

    await clickAt(frame('lairtext'));
    expect(selected()).toBe('lairtext');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowUp}');
    await frames(2);
    expect(selected()).toBe('reacts01');
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(openPanel()?.querySelector('[data-block-id="reacts01"]')).not.toBeNull();
  });

  it('refuses a block that is no Section dropped on the strip', async () => {
    const session = new FakeSession(template([LIST[0]!, TABS, { id: 'divider1', type: 'divider' }], FIELDS));
    mount(session, 1280);
    await frames(2);
    const { x, y } = centreOf(frame('divider1'));
    await mouse.hover(x, y);
    await frames(2);
    const handle = document.querySelector<HTMLElement>('.atlas-sb-handle[data-glyph="grip"]')!;
    const strip = centreOf(document.querySelector('.atlas-te-stage .atlas-sb-tabstrip')!);
    const from = centreOf(handle);
    await mouse.down(from.x, from.y);
    for (let step = 1; step <= 16; step++) {
      await mouse.move(from.x + ((strip.x - from.x) * step) / 16, from.y + ((strip.y - from.y) * step) / 16);
      await frames(1);
    }
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
    await act(async () => {
      await mouse.up(strip.x, strip.y);
      await frames(4);
    });
    expect(session.steps).toBe(0);
  });
});
