import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { allBuiltInTemplates } from '../../src/app/statblocks/library/builtInTemplates';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { sampleRecord } from '../../src/app/statblocks/model/sampleValues';
import type { BuiltInTemplate } from '../../src/app/statblocks/model/templateTypes';
import { NotePanelRoot } from '../../src/app/statblocks/editor/note-panel/NotePanelRoot';
import { defaultPanelWidth, savePanelPrefs } from '../../src/app/statblocks/editor/note-panel/panelPrefs';
import { StatblockEditorRoot } from '../../src/app/statblocks/editor/StatblockEditorRoot';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FakeSession } from '../unit/statblocks/template-editor/editorKit';
import { FakeSource, FakeWriter } from '../unit/statblocks/editor/paneKit';
import { THEME, frames } from './sidePanesHarness';

// Dice links, the token socket and the editor's file actions reach the map view and the token link
// service, whose Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => undefined }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/template-editor/templateEditorActions', () => ({
  duplicateTemplate: async () => null,
  newStatblockFromTemplate: async () => undefined,
}));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
    loadedCollections: () => [],
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

/**
 * WYSIWYG (§2, §17 A1/M7): the template editor draws a statblock exactly as
 * the note view draws it beside its note. The same note, template and stored
 * panel width in a note view and in the template editor (Show with that note,
 * nothing hovered) give the panel the same width, the card the same place in
 * it, and every block the same box, within half a pixel.
 */
const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 820;
const TOLERANCE = 0.5;
const NOTE_PATH = 'Bestiary/Marsh Warden.md';
/** What a readable line takes without a theme's variables: 700 px and 32 px on either side (`noteRoom.ts`). */
const READABLE_LINE = 764;
const OBSIDIAN = `
  * { box-sizing: border-box; }
  .workspace-leaf-content { position: relative; display: flex; flex-direction: column; width: ${VIEW_WIDTH}px; height: ${VIEW_HEIGHT}px; }
  .view-header { height: 40px; flex: none; }
  .view-content { width: 100%; height: calc(100% - 40px); }
`;
const h = React.createElement;
const noop = (): void => undefined;

interface Box { x: number; y: number; width: number; height: number }

function boxIn(element: Element, origin: DOMRect): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
}

/** The card's place in its panel host, and every block's box in the card. */
function measure(leaf: Element): { host: Box; card: Box; blocks: Map<string, Box> } {
  const host = leaf.querySelector('.atlas-sb-note-panel')!;
  const card = host.querySelector('.atlas-sb-pane-card')!;
  const hostRect = host.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const blocks = new Map<string, Box>();
  for (const frame of card.querySelectorAll('[data-block-id]')) blocks.set(frame.getAttribute('data-block-id') ?? '', boxIn(frame, cardRect));
  return { host: boxIn(host, leaf.getBoundingClientRect()), card: boxIn(card, hostRect), blocks };
}

function expectClose(actual: Box, expected: Box, what: string): void {
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[side] - expected[side]), `${what} ${side}: ${actual[side]} vs ${expected[side]}`).toBeLessThanOrEqual(TOLERANCE);
  }
}

/** One app for both views: the note holds the template's sample values, which the metadata cache reports. */
function appFor(builtIn: BuiltInTemplate): { app: App; frontmatter: Record<string, unknown> } {
  const { app } = createInMemoryApp({ files: { [NOTE_PATH]: '---\nstatblock: true\n---\nThe warden keeps the marsh.\n' } });
  const frontmatter = { statblock: true, 'atlas-template': builtIn.id, ...sampleRecord(builtIn.template) };
  vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter });
  return { app, frontmatter };
}

/** The note view as Obsidian builds it, decorated by `NoteStatblockPanel`: the note in Live Preview and the panel beside it. */
async function mountNoteView(app: App, frontmatter: Record<string, unknown>, panelWidth: number): Promise<HTMLElement> {
  const leaf = document.body.createDiv({ cls: ['workspace-leaf-content', 'atlas-sb-note', 'atlas-sb-note--hide-properties', 'note-view'] });
  leaf.createDiv({ cls: 'view-header' });
  const content = leaf.createDiv({ cls: 'view-content' });
  content.createDiv({ cls: ['markdown-source-view', 'mod-cm6', 'is-live-preview', 'is-readable-line-width'] });
  const host = content.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-note-panel'] });
  host.style.setProperty('--atlas-sb-panel-width', `${panelWidth}px`);
  const source = new FakeSource();
  source.set(NOTE_PATH, frontmatter);
  await act(async () => {
    render(h(TooltipProvider, null, h(NotePanelRoot, {
      pane: {
        app, services: { source, writer: new FakeWriter() }, notePath: NOTE_PATH, collectionId: 'campaign', propertiesShown: false,
        announcement: '', focusRequest: 0, pendingCommit: { current: null }, actions: { showProperties: noop, changeCollection: noop },
      },
      width: panelWidth, stacked: false, availableWidth: () => content.clientWidth, onResize: noop, onCancelResize: noop, onResetWidth: noop,
    })), { container: host });
  });
  return leaf;
}

/** The template editor's view, Show with the same note. */
async function mountTemplateEditor(app: App, builtIn: BuiltInTemplate): Promise<HTMLElement> {
  const leaf = document.body.createDiv({ cls: ['workspace-leaf-content', 'template-view'] });
  leaf.createDiv({ cls: 'view-header' });
  const content = leaf.createDiv({ cls: ['view-content', 'atlas-vtt-plugin', 'atlas-template-editor-view'] });
  const session = new FakeSession(builtIn.template, { name: builtIn.name, path: null, readOnly: true, readOnlyReason: 'built-in' });
  await act(async () => {
    render(h(StatblockEditorRoot, {
      surface: {
        kind: 'template-editor',
        props: {
          app, session, problem: null, host: { openTemplate: noop, openNote: noop, close: noop }, previewPath: NOTE_PATH, previewMode: null,
          onShowWithChange: noop, collectionId: 'campaign', onCollectionChange: noop,
        },
      },
    }), { container: content });
  });
  return leaf;
}

const apps: App[] = [];

describe('the template editor draws the statblock as the note view does', () => {
  const style = document.createElement('style');
  style.textContent = THEME + OBSIDIAN + css;

  beforeEach(async () => {
    await page.viewport(VIEW_WIDTH + 40, 2 * VIEW_HEIGHT + 40);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.replaceChildren();
    for (const app of apps.splice(0)) TemplateLibrary.release(app);
  });

  async function compare(builtIn: BuiltInTemplate, chosenWidth: number | null): Promise<void> {
    const { app, frontmatter } = appFor(builtIn);
    apps.push(app);
    if (chosenWidth !== null) savePanelPrefs(app, { width: chosenWidth, hidden: false });
    const panelWidth = chosenWidth ?? defaultPanelWidth({ available: VIEW_WIDTH, readableLine: READABLE_LINE });
    const note = await mountNoteView(app, frontmatter, panelWidth);
    const editor = await mountTemplateEditor(app, builtIn);
    // The library, the collection and the editor's measured room settle over a few frames.
    await act(async () => { await frames(4); });

    const inNote = measure(note);
    const inEditor = measure(editor);
    expect(inNote.blocks.size, `${builtIn.id}: blocks drawn`).toBeGreaterThan(0);
    expectClose(inEditor.host, inNote.host, `${builtIn.id} panel`);
    expect([...inEditor.blocks.keys()]).toEqual([...inNote.blocks.keys()]);
    for (const [id, box] of inNote.blocks) expectClose(inEditor.blocks.get(id)!, box, `${builtIn.id} ${id}`);
    expectClose(inEditor.card, inNote.card, `${builtIn.id} card`);
  }

  it.each(allBuiltInTemplates().map((builtIn) => [builtIn.id, builtIn] as const))(
    'puts every block of %s where the note view does, at the panel\'s default width',
    async (_id, builtIn) => { await compare(builtIn, null); },
  );

  it.each([[420], [680], [900]])('follows the width chosen beside the notes: %ipx', async (width) => {
    await compare(allBuiltInTemplates().find((builtIn) => builtIn.id === 'builtin:5e-2014-monster')!, width);
  });
});
