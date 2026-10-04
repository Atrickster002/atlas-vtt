import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../../../src/app/statblocks/library/sessionRegistry';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

const settingsWrites = vi.hoisted(() => [] as Array<{ id: string; settings: unknown }>);
vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
    updateCollectionSettings: async (id: string, settings: unknown) => { settingsWrites.push({ id, settings }); },
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const OTHER_NOTE = 'Bestiary/Bog Hag.md';
const ACTIONS = [{ name: 'Bite', desc: 'It bites.' }, { name: 'Lash', desc: 'It lashes.' }];
const WARDEN = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', speed: '30 ft.', actions: ACTIONS };
const SPEED = 'p9g7k2jw';
const apps: App[] = [];

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
});

async function pane(users: string[] = [NOTE_PATH], frontmatter: Record<string, unknown> = WARDEN): Promise<PaneHarness> {
  const files = { [NOTE_PATH]: '---\nstatblock: true\n---\n', [OTHER_NOTE]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText() };
  const harness = await renderPane({ frontmatter, files });
  apps.push(harness.app);
  const templateId = String(frontmatter['atlas-template']);
  vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
    users.includes(file.path) ? { frontmatter: { statblock: true, 'atlas-template': templateId } } : null));
  await waitFor(() => expect(TemplateLibrary.forApp(harness.app).get(templateId)).not.toBeNull());
  return harness;
}

const rows = (): string[] => screen.getAllByRole('menuitem').map((row) => row.textContent ?? '');
const hasSpeed = (app: App): boolean => findBlock(TemplateLibrary.forApp(app).current(MARSH_ID)!.template.layout.blocks, SPEED) !== null;

/** Removing and clearing from the statblock beside its note (spec §5.5, M4, B3, G2). */
describe('the panel\'s block menu', () => {
  it('names the reach before the click, removes the block from the template in one step, and Undo puts it back', async () => {
    const harness = await pane();
    fireEvent.contextMenu(blockOf(harness.result.container, SPEED));
    await waitFor(() => expect(rows()).toContain('Remove Speed from Marsh creature'));
    expect(rows()).toContain('Clear Speed on this statblock');
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Speed from Marsh creature' })); });
    await waitFor(() => expect(hasSpeed(harness.app)).toBe(false));
    // The values stay in the note: nothing was written there.
    expect(harness.writer.writes).toEqual([]);
    expect(screen.getByText('Removed Speed from Marsh creature. The values stay in the note.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo' })); });
    expect(hasSpeed(harness.app)).toBe(true);
  });

  it('says how many statblocks a shared template reaches', async () => {
    const harness = await pane([NOTE_PATH, OTHER_NOTE]);
    fireEvent.contextMenu(blockOf(harness.result.container, SPEED));
    await waitFor(() => expect(rows()).toContain('Remove Speed from Marsh creature · 2 statblocks'));
  });

  it('clears this statblock\'s value, one write to the note, and leaves the template alone', async () => {
    const harness = await pane();
    fireEvent.contextMenu(blockOf(harness.result.container, SPEED));
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'Clear Speed on this statblock' })); });
    expect(harness.writer.patches()).toEqual([{ op: 'delete', path: ['speed'], base: '30 ft.' }]);
    expect(hasSpeed(harness.app)).toBe(true);
  });
});

describe('removing from a built-in', () => {
  it('says the change makes the collection\'s own copy, makes it once, switches this note to it and removes the block there', async () => {
    settingsWrites.length = 0;
    const harness = await pane([NOTE_PATH, OTHER_NOTE], { ...WARDEN, 'atlas-template': 'builtin:generic-creature' });
    fireEvent.contextMenu(blockOf(harness.result.container, 'gcaction'));
    const row = await screen.findByRole('menuitem', { name: 'Remove Actions (makes your own copy of Creature)' });
    await act(async () => { fireEvent.click(row); });
    await waitFor(() => expect(settingsWrites).toHaveLength(1));
    const copyId = (settingsWrites[0]?.settings as { templateCopies: Record<string, string> }).templateCopies['builtin:generic-creature']!;
    expect(settingsWrites[0]?.id).toBe('campaign');
    await waitFor(() => expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['atlas-template'], base: 'builtin:generic-creature', next: copyId }]));
    await waitFor(() => expect(findBlock(TemplateLibrary.forApp(harness.app).current(copyId)!.template.layout.blocks, 'gcaction')).toBeNull());
    // The built-in itself never changes.
    expect(findBlock(TemplateLibrary.forApp(harness.app).current('builtin:generic-creature')!.template.layout.blocks, 'gcaction')).not.toBeNull();
    expect(screen.getByText('Made your own copy of Creature. Marsh Warden uses it now.')).toBeTruthy();
  });
});

describe('the panel\'s ability menu', () => {
  it('opens by right-click on an ability, and moves it within its list by its identity', async () => {
    const harness = await pane();
    const lash = blockOf(harness.result.container, 'e7y2b6gh').querySelectorAll('.atlas-sb-trait')[1]!;
    fireEvent.contextMenu(lash);
    await waitFor(() => expect(rows()[0]).toMatch(/^Edit Lash/));
    expect(screen.getByRole('menuitem', { name: /^Move down/ }).getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /^Move up/ })); });
    expect(harness.writer.patches()).toEqual([{ op: 'move', list: 'actions', item: ACTIONS[1], after: null }]);
  });

  it('opens with Shift+F10 in an ability being typed, keeping the browser\'s menu for a right-click there', async () => {
    const harness = await pane();
    fireEvent.click(blockOf(harness.result.container, 'e7y2b6gh').querySelectorAll('.atlas-sb-trait')[0]!);
    const [name] = await screen.findAllByRole('textbox', { name: 'Action name' });
    if (!name) throw new Error('No ability is being typed.');
    expect(fireEvent.contextMenu(name)).toBe(true);
    fireEvent.keyDown(name, { key: 'F10', shiftKey: true });
    await waitFor(() => expect(rows().some((row) => row.startsWith('Delete Bite'))).toBe(true));
  });
});
