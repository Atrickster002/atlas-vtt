import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor, type TemplateEditorHost } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { FakeSession, sampleTemplate, template } from '../unit/statblocks/template-editor/editorKit';

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

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada;
    --text-muted: #b3b3b3; --text-faint: #777; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px;
    --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --input-height: 30px; }
`;
const h = React.createElement;
const noop = (): void => undefined;
const host: TemplateEditorHost = { openTemplate: noop, openNote: noop, close: noop };
/** The platform's own undo key in a text field: Playwright sends macOS's editing command for Meta+Z. */
const NATIVE_UNDO = navigator.platform.includes('Mac') ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}';

function mount(session: FakeSession): void {
  render(h(TooltipProvider, null,
    h('div', { className: 'atlas-vtt-plugin' },
      h('button', null, 'Before'),
      h('div', { className: 'atlas-statblock-editor', 'data-surface': 'template-editor', style: { height: 720, width: 1180 } },
        h(TemplateEditor, {
          session, host, previewPath: null, onShowWithChange: noop, collectionId: null, onCollectionChange: noop,
        })),
      h('button', null, 'After'))));
}

/** Where focus is: the editor region it lies in, the stop outside the editor, or the block it is on. */
function whereFocus(): string {
  const active = document.activeElement;
  if (!active || active === document.body) return 'body';
  const region = active.closest('[data-te-region]')?.getAttribute('data-te-region');
  if (region) return region;
  if (active.closest('.atlas-sb-note-panel__handle')) return 'resize';
  if (active.closest('.atlas-te-layer')) return 'toolbar';
  return active.textContent?.trim() ?? active.tagName;
}

/** Presses Tab (or Shift+Tab) until focus reaches `stop`, noting each place it passes. */
async function walk(stop: string, back: boolean): Promise<string[]> {
  const visited: string[] = [];
  for (let presses = 0; presses < 40 && whereFocus() !== stop; presses++) {
    await userEvent.keyboard(back ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
    visited.push(whereFocus());
  }
  return visited;
}

/** Collapses runs of one place into one: the regions in the order Tab met them. */
const regionsOf = (visited: readonly string[]): string[] => visited.filter((place, index) => place !== visited[index - 1]);

describe('the template editor by keyboard', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1200, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('leaves every region with Tab and Shift+Tab, stopping once on the canvas: the panel\'s edge, the capsule, the card, the dock', async () => {
    mount(new FakeSession(sampleTemplate()));
    page.getByRole('button', { name: 'Before' }).element().focus();
    const forward = await walk('After', false);
    expect(regionsOf(forward)).toEqual(['resize', 'header', 'canvas', 'dock', 'After']);
    expect(forward.filter((place) => place === 'canvas')).toHaveLength(1);

    const backward = await walk('Before', true);
    expect(regionsOf(backward)).toEqual(['dock', 'canvas', 'header', 'resize', 'Before']);
    expect(backward.filter((place) => place === 'canvas')).toHaveLength(1);
  });

  it('leaves the canvas with Tab while a block is selected, and comes back to that block', async () => {
    mount(new FakeSession(sampleTemplate()));
    await userEvent.click(document.querySelector('[data-block-id="stat-hp1"]')!);
    await userEvent.keyboard('{Tab}');
    expect(whereFocus()).toBe('dock');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
  });

  it('builds a table and a list from a blank template by keyboard alone', async () => {
    const session = new FakeSession(template([]));
    mount(session);
    page.getByRole('button', { name: 'Before' }).element().focus();
    await walk('canvas', false);
    expect(document.activeElement?.textContent).toBe('Name');

    await userEvent.keyboard('/');
    await userEvent.keyboard('Table');
    await userEvent.keyboard('{Enter}');
    const [table] = session.template.layout.blocks;
    expect(table).toMatchObject({ type: 'scores', field: '' });
    expect(document.activeElement?.getAttribute('data-block-id')).toBe(table?.id);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('Abilities{Enter}');
    expect(session.template.fields).toEqual([{ key: 'stats', label: 'Abilities', type: 'scores' }]);

    await userEvent.keyboard('/');
    await userEvent.keyboard('List');
    await userEvent.keyboard('{Enter}');
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['scores', 'entries']);
    expect(session.steps).toBe(3);
  });

  it('moves blocks into and out of containers with Alt+arrows', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(document.querySelector('[data-block-id="row00001"]')!);
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(session.template.layout.blocks.map((block) => block.id)).toEqual(['title001', 'section1', 'divider1']);
    expect(document.querySelector('.atlas-te-live')?.textContent).toBe('Moved Side by side to section Defenses, position 3 of 3.');
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(session.template.layout.blocks.map((block) => block.id)).toEqual(['title001', 'section1', 'row00001', 'divider1']);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('row00001');
  });

  it('undoes the text of a focused input with Mod+Z, never the template', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(document.querySelector('[data-block-id="stat-ac1"]')!);
    await userEvent.keyboard('{Delete}');
    expect(session.steps).toBe(1);

    await userEvent.click(document.querySelector('[data-block-id="stat-hp1"]')!);
    await userEvent.keyboard('{Enter}');
    const input = page.getByRole('textbox', { name: 'Label' }).element() as HTMLInputElement;
    expect(input.value).toBe('Hit points');
    await userEvent.keyboard('Vigour');
    expect(input.value).toBe('Vigour');
    await userEvent.keyboard(NATIVE_UNDO);
    expect(input.value).toBe('Hit points');
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.template.layout.blocks.some((block) => block.id === 'section1' && 'blocks' in block && block.blocks.length === 1)).toBe(true);

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(document.querySelector('[data-block-id="stat-ac1"]')).not.toBeNull();
  });
});
