import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frame, frames, mount, useEditorStyles, wait, walk } from './sidePanesHarness';

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
 * The keys of the template editor's floating panels in a real browser (§11.1,
 * §17 F1): Tab passes through every dock panel and Settings, both ways, with
 * no trap, and the outline keeps focus while its keys move and delete blocks.
 */
const dockButton = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-dock button')].find((element) => element.textContent === name)!;

describe('the template editor\'s side panes by keyboard', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('lets Tab pass through every dock panel and Settings both ways', async () => {
    mount(new FakeSession(sampleTemplate()), 1400);
    for (const name of ['Add', 'Structure', 'Properties', 'Template']) {
      await act(async () => { dockButton(name).click(); });
      await wait(250);
      page.getByRole('button', { name: 'Before' }).element().focus();
      expect(await walk('After', false), name).toEqual(['resize', 'header', 'canvas', 'dock', 'dock-panel', 'After']);
      expect(await walk('Before', true), name).toEqual(['dock-panel', 'dock', 'canvas', 'header', 'resize', 'Before']);
    }
    await userEvent.click(frame('stat-hp1'));
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await wait(250);
    page.getByRole('button', { name: 'Before' }).element().focus();
    expect(await walk('After', false)).toContain('settings');
    expect(await walk('Before', true)).toContain('settings');
  });

  it('keeps focus in the outline while its keys move and delete blocks', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1180);
    await act(async () => { dockButton('Structure').click(); });
    await wait(250);
    const row = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-outline-id="${id}"]`)!;
    await userEvent.click(row('stat-ac1'));
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await frames(2);
    expect(session.template.layout.blocks[1]).toMatchObject({ blocks: [{ id: 'stat-hp1' }, { id: 'stat-ac1' }] });
    expect(document.activeElement).toBe(row('stat-ac1'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(row('stat-hp1'));
    await userEvent.keyboard('{Delete}');
    await frames(2);
    expect(document.activeElement).toBe(row('stat-ac1'));
    expect(row('stat-ac1').getAttribute('aria-selected')).toBe('true');
  });
});
