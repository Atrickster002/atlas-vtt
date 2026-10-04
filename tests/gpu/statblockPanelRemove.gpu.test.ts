import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import { findBlock } from '../../src/app/statblocks/model/treeQueries';
import { MARSH_ID, MARSH_PATH, marshText } from '../unit/statblocks/library/templateTexts';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { centreOf, mouse } from './realMouse';
import { frames, useEditorStyles } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => undefined }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const WARDEN = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', speed: '30 ft.' };
const SPEED = 'p9g7k2jw';
const apps: App[] = [];

afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
});

async function pane(): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: WARDEN, files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText() } });
  apps.push(harness.app);
  vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
    file.path === NOTE_PATH ? { frontmatter: { statblock: true, 'atlas-template': MARSH_ID } } : null));
  await vi.waitFor(() => expect(TemplateLibrary.forApp(harness.app).get(MARSH_ID)).not.toBeNull());
  await frames(2);
  return harness;
}

const hasSpeed = (app: App): boolean => findBlock(TemplateLibrary.forApp(app).current(MARSH_ID)!.template.layout.blocks, SPEED) !== null;
const menuRow = (text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((row) => row.textContent?.startsWith(text));

/**
 * Removing a block from the statblock beside its note, with real mouse input
 * (spec §5.5, M4, M5, B2): pointing at a block shows its ⋯ handle in the
 * gutter; its menu, also by right-click, ends in the red row that names the
 * template it changes; two clicks remove the block; the toast's Undo puts it back.
 */
describe('removing a block in the panel', () => {
  useEditorStyles();

  it('shows a ⋯ handle on hover whose menu removes the block from the template in two clicks', async () => {
    const harness = await pane();
    const speed = blockOf(harness.result.container, SPEED);
    await mouse.hover(centreOf(speed).x, centreOf(speed).y);
    await frames(2);
    const handle = document.querySelector<HTMLButtonElement>('.atlas-sb-handle[data-glyph="menu"]');
    expect(handle).not.toBeNull();
    // In the gutter, left of the block: it covers none of the block's text.
    expect(handle!.getBoundingClientRect().right).toBeLessThanOrEqual(speed.getBoundingClientRect().left + 4);

    await act(async () => {
      await mouse.click(centreOf(handle!).x, centreOf(handle!).y);
      await frames(3);
    });
    const rows = [...document.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent);
    expect(rows.at(-1)).toBe('Remove Speed from Marsh creature');
    expect(speed.hasAttribute('data-sb-menu-target')).toBe(true);
    const remove = menuRow('Remove Speed')!;
    await act(async () => {
      await mouse.click(centreOf(remove).x, centreOf(remove).y);
      await frames(3);
    });
    await vi.waitFor(() => expect(hasSpeed(harness.app)).toBe(false));
    expect(harness.writer.writes).toEqual([]);

    const undo = [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-toast button')].find((button) => button.textContent === 'Undo')!;
    await act(async () => {
      await mouse.click(centreOf(undo).x, centreOf(undo).y);
      await frames(2);
    });
    expect(hasSpeed(harness.app)).toBe(true);
  });

  it('opens the same menu by right-click, where Clear deletes this note\'s value only', async () => {
    const harness = await pane();
    const speed = blockOf(harness.result.container, SPEED);
    await act(async () => {
      await mouse.rightClick(centreOf(speed).x, centreOf(speed).y);
      await frames(3);
    });
    const clear = menuRow('Clear Speed on this statblock');
    expect(clear).toBeDefined();
    await act(async () => {
      await mouse.click(centreOf(clear!).x, centreOf(clear!).y);
      await frames(2);
    });
    expect(harness.writer.patches()).toEqual([{ op: 'delete', path: ['speed'], base: '30 ft.' }]);
    expect(hasSpeed(harness.app)).toBe(true);
  });
});
