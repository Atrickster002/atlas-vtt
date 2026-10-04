import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';
import { TemplateEditorView } from '../../../../src/app/statblocks/editor/TemplateEditorView';
import { openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../../../src/app/statblocks/editor/templateEditorState';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { FakeLeaf, fakeWorkspace } from '../editor/workspaceKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const BUILT_IN = 'builtin:generic-creature';
const views: TemplateEditorView[] = [];
const apps: App[] = [];

afterEach(async () => {
  for (const view of views.splice(0)) await act(async () => { await view.onClose(); });
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function open(switchedOn = true): Promise<{ app: App; view: TemplateEditorView; files: Map<string, string> }> {
  const { app, files } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
  apps.push(app);
  // "Used by n statblocks" reads the notes from the metadata cache; this vault holds none.
  (app.vault as unknown as Record<string, unknown>).getMarkdownFiles = () => [];
  if (switchedOn) withStatblockEditor(app);
  const leaf = new FakeLeaf({ type: TEMPLATE_EDITOR_VIEW_TYPE }, app);
  const view = new TemplateEditorView(leaf as unknown as WorkspaceLeaf);
  views.push(view);
  document.body.appendChild(view.contentEl);
  await act(async () => { await view.onOpen(); });
  return { app, view, files };
}

describe('TemplateEditorView', () => {
  it('owns .atlastemplate files and nothing else', async () => {
    const { view } = await open();
    expect(view.getViewType()).toBe('atlas-statblock-template');
    expect(view.canAcceptExtension('atlastemplate')).toBe(true);
    expect(view.canAcceptExtension('md')).toBe(false);
    expect(view.canAcceptExtension('atlasmap')).toBe(false);
  });

  it('opens a built-in by id, editable over its own copy to be, and saves the state it restores without writing', async () => {
    const { view, files } = await open();
    const before = new Map(files);
    const state = { templateId: BUILT_IN, previewPath: 'Bestiary/Bog Hag.md', collectionId: 'campaign', fromNote: 'Bestiary/Bog Hag.md' };
    await act(async () => { await view.setState(state, { history: false }); });
    expect(view.getState()).toEqual({ ...state, previewMode: null });
    expect(screen.getByText('Built in. Your first change makes your own copy for Bog Hag.')).toBeTruthy();
    expect(files).toEqual(before);
  });

  it('opens a template file once the library has read it, and restores without writing', async () => {
    const { view, files } = await open();
    const before = files.get(MARSH_PATH);
    await act(async () => { await view.setState({ file: MARSH_PATH, previewPath: null, collectionId: null }, { history: false }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marsh creature' })).toBeTruthy());
    expect(view.getState()).toEqual({ file: MARSH_PATH, previewPath: null, previewMode: null, collectionId: null, fromNote: null });
    expect(view.getDisplayText()).toBe('Marsh creature');
    expect(files.get(MARSH_PATH)).toBe(before);
  });

  it('shows nothing to edit while the statblock editor is switched off', async () => {
    const { view } = await open(false);
    await act(async () => { await view.setState({ templateId: BUILT_IN }, { history: false }); });
    expect(screen.getByText('Turn on the statblock editor under Experimental features to edit templates.')).toBeTruthy();
  });

  it('asks the editor first for the keys Obsidian would take, and lets them through when it has none', async () => {
    const { view } = await open();
    const keys = (view.scope as unknown as { keys: Array<{ modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }> }).keys;
    expect(keys.map(({ modifiers, key }) => `${modifiers.join('+')}+${key}`)).toEqual(expect.arrayContaining(['Mod+g', 'Mod+Shift+g', 'Mod+z', 'Mod+Alt+r']));
    expect(keys[0]?.func(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(true);
  });
});

describe('openTemplateEditor', () => {
  it('opens a template in a tab of its own, previewing a statblock, behind the switch', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    expect(await openTemplateEditor(app, { templateId: BUILT_IN })).toBeNull();

    withStatblockEditor(app);
    await openTemplateEditor(app, { templateId: BUILT_IN, previewPath: 'Bestiary/Bog Hag.md', collectionId: 'campaign', select: 'abc' });
    const [leaf] = fake.leaves;
    expect(leaf?.getViewState()).toEqual({
      type: TEMPLATE_EDITOR_VIEW_TYPE,
      state: { templateId: BUILT_IN, previewPath: 'Bestiary/Bog Hag.md', collectionId: 'campaign', fromNote: null },
      active: true,
    });
    expect(leaf?.eState).toEqual({ select: 'abc' });

    // A second open of the same template reuses its tab.
    await openTemplateEditor(app, { templateId: BUILT_IN });
    expect(fake.leaves).toHaveLength(1);
  });

  it('opens a vault template by its file', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    withStatblockEditor(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    await waitFor(() => expect(TemplateLibrary.forApp(app).get(MARSH_ID)).not.toBeNull());
    await openTemplateEditor(app, { templateId: MARSH_ID });
    expect(fake.leaves[0]?.getViewState().state).toEqual({ file: MARSH_PATH, previewPath: null, collectionId: null, fromNote: null });
  });

  it('opens in a note\'s own leaf from "Edit template", which can go back to the note', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    withStatblockEditor(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    const noteLeaf = new FakeLeaf({ type: 'markdown', state: { file: 'Bestiary/Bog Hag.md' } }, app);
    await openTemplateEditor(app, { templateId: BUILT_IN, previewPath: 'Bestiary/Bog Hag.md', leaf: noteLeaf as unknown as WorkspaceLeaf, fromNote: 'Bestiary/Bog Hag.md' });
    expect(noteLeaf.getViewState()).toMatchObject({ type: TEMPLATE_EDITOR_VIEW_TYPE, state: { templateId: BUILT_IN, fromNote: 'Bestiary/Bog Hag.md' } });
    expect(fake.leaves).toHaveLength(0);
  });
});
