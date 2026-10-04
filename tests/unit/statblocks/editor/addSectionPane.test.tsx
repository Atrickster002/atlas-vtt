import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../../../src/app/statblocks/library/sessionRegistry';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from '../library/templateTexts';
import { NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
    updateCollectionSettings: async () => undefined,
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/statblocks/editor/openTemplateEditor', () => ({ openTemplateEditor: vi.fn(async () => null) }));

const OTHER_NOTE = 'Bestiary/Bog Hag.md';
const WARDEN = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', lair: 'A sunken causeway' };
const apps: App[] = [];

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
});

/** The pane over the Warden, whose template the metadata cache says `users` statblocks name. */
async function pane(frontmatter: Record<string, unknown> = WARDEN, users: string[] = [NOTE_PATH]): Promise<PaneHarness> {
  const files = { [NOTE_PATH]: '---\nstatblock: true\n---\n', [OTHER_NOTE]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText() };
  const harness = await renderPane({ frontmatter, files });
  apps.push(harness.app);
  vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
    users.includes(file.path) ? { frontmatter: { statblock: true, 'atlas-template': frontmatter['atlas-template'] } } : null));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add a section…' })).toBeTruthy());
  return harness;
}

const templateAt = async (harness: PaneHarness, path: string): Promise<StatblockTemplate> => {
  const file = harness.app.vault.getFileByPath(path)!;
  return JSON.parse(await harness.app.vault.read(file)) as StatblockTemplate;
};
const openMenu = (): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: 'Add a section…' }));
  return screen.getByRole('dialog', { name: 'Add a section' });
};
const choose = async (group: string, option: string | RegExp): Promise<void> => {
  const list = screen.getByRole('group', { name: group });
  await act(async () => { fireEvent.click(within(list).getByRole('option', { name: option })); });
};
const newSection = async (name: string, kind: RegExp): Promise<void> => {
  openMenu();
  fireEvent.change(screen.getByRole('combobox', { name: 'Find a section' }), { target: { value: name } });
  await choose('New', kind);
};

describe('Add a section… in the statblock pane', () => {
  it('names the reach before anything is chosen', async () => {
    await pane(WARDEN, [NOTE_PATH, OTHER_NOTE]);
    const menu = openMenu();
    expect(menu.textContent).toContain('Adds to Marsh creature · 2 statblocks (hidden where empty)');
  });

  it('adds a section to the template, in its place among the book\'s sections, and opens its first value', async () => {
    const harness = await pane();
    openMenu();
    await choose('Sections', /^Reactions/);
    const template = await waitFor(async () => {
      const read = await templateAt(harness, MARSH_PATH);
      expect(read.fields.at(-1)).toEqual({ key: 'reactions', label: 'Reactions', type: 'entries' });
      return read;
    });
    const ids = template.layout.blocks.map((block) => block.id);
    const added = template.layout.blocks.find((block) => block.type === 'entries' && block.field === 'reactions')!;
    expect(added).toMatchObject({ heading: 'Reactions', addLabel: 'Add reaction' });
    expect(ids.indexOf(added.id)).toBe(ids.indexOf('e7y2b6gh') + 1);
    expect(harness.writer.writes).toEqual([]);
    await waitFor(() => expect(document.activeElement?.closest('.atlas-sb-pane-editor, .atlas-sb-pane-entry-editor')).not.toBeNull());
    expect(document.querySelector('.atlas-sb-pane-live')?.textContent).toBe('Added Reactions to Marsh creature.');
  });

  it('changes a template other statblocks share for all of them, without asking', async () => {
    const harness = await pane(WARDEN, [NOTE_PATH, OTHER_NOTE]);
    await newSection('Habitat', /A stat called/);
    await waitFor(async () => expect((await templateAt(harness, MARSH_PATH)).fields.at(-1)).toEqual({ key: 'habitat', label: 'Habitat', type: 'text' }));
    expect(harness.writer.writes).toEqual([]);
  });

  it('offers the note\'s own values the template leaves out', async () => {
    const harness = await pane();
    openMenu();
    await choose('Values of this note', /Lair/);
    await waitFor(async () => expect((await templateAt(harness, MARSH_PATH)).fields.at(-1)?.key).toBe('lair'));
  });

  it('puts a built-in\'s new section into the collection\'s own copy, says so first, and switches only this note', async () => {
    const harness = await pane({ ...WARDEN, 'atlas-template': 'builtin:generic-creature' }, [NOTE_PATH, OTHER_NOTE]);
    const menu = openMenu();
    expect(menu.textContent).toContain('Adds to your own copy of Creature (makes it now)');
    fireEvent.change(screen.getByRole('combobox', { name: 'Find a section' }), { target: { value: 'Lair actions' } });
    await choose('Sections', /^Lair Actions/);
    const copyPath = `${TEMPLATE_FOLDER}/Creature copy.atlastemplate`;
    await waitFor(async () => expect((await templateAt(harness, copyPath)).fields.at(-1)?.key).toBe('lair_actions'));
    const copy = await templateAt(harness, copyPath);
    expect(copy.derivedFrom).toEqual({ templateId: 'builtin:generic-creature', revision: 1 });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['atlas-template'], base: 'builtin:generic-creature', next: copy.id }]);
    expect(document.querySelector('.atlas-te-toast')?.textContent).toContain('Made your own copy of Creature');
  });
});

describe('Put on the card in the tray', () => {
  it('adds the note\'s value to the template as the block its value suggests', async () => {
    const harness = await pane();
    fireEvent.click(screen.getByRole('button', { name: /More properties/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Put on the card' })); });
    await waitFor(() => {
      const current = TemplateLibrary.forApp(harness.app).current(MARSH_ID)!.template;
      expect(current.layout.blocks.at(-1)).toMatchObject({ field: 'lair' });
    });
  });
});
