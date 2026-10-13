import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { LayoutImportDialog } from '../../../../src/app/statblocks/editor/fs-import/LayoutImportDialog';
import {
  blocksLine, keptScriptsLine, moveExplanation, moveLabel, movedLine, replaceQuestion, scriptsLine,
} from '../../../../src/app/statblocks/editor/fs-import/importReportText';
import type { LayoutStatblocks } from '../../../../src/app/statblocks/fs/fsLayoutStatblocks';
import { importFsLayout, type FsLayoutImport } from '../../../../src/app/statblocks/fs/fsImport';
import type { FsImportReport } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_LAYOUT } from './fsImportKit';

const MARSH = { id: 'marsh-layout', name: 'Marsh layout' };
const NOTES = ['Bestiary/Bog.md', 'Bestiary/Fen.md', 'Bestiary/Mire.md'];
const fsNote = (name: string): string => `---\nstatblock: true\nname: ${name}\nlayout: Marsh layout\n---\n`;
const HAG = 'Bestiary/Hag.md';
const HAG_TEXT = 'She waits.\n\n```statblock\nlayout: Marsh layout\nname: Hag\nhp: 9\n```\nThe end.\n';
const ALL: LayoutStatblocks = { frontmatter: NOTES, fences: [HAG] };

let vault: SessionVault;
let imported: FsLayoutImport;
let onClose: ReturnType<typeof vi.fn>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  vault = sessionVault({ ...Object.fromEntries(NOTES.map((path) => [path, fsNote(path.slice(9, -3))])), [HAG]: HAG_TEXT });
  await vault.settled();
  imported = await importFsLayout(vault.app, MARSH_LAYOUT);
  onClose = vi.fn();
});

afterEach(async () => {
  cleanup();
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
});

function show(statblocks: LayoutStatblocks = ALL, given: FsLayoutImport = imported): void {
  render(
    <TooltipProvider>
      <LayoutImportDialog app={vault.app} doc={document} layout={MARSH} imported={given} statblocks={statblocks} onClose={onClose} />
    </TooltipProvider>,
  );
}

const report = (scripts: FsImportReport['scripts']): FsImportReport => ({
  blocks: 11, fields: 9, scripts, dropped: [], partial: [], withoutCode: { total: 9, full: 9 },
});

describe('the report\'s words', () => {
  it('says what the import made, the scripts it kept and what can replace them', () => {
    const tracks = report([
      { blockId: 'a', summary: 'Hit points tracks drawn with JavaScript', suggestion: 'track' },
      { blockId: 'b', summary: 'Stress tracks drawn with JavaScript', suggestion: 'track' },
    ]);
    expect(`${blocksLine(tracks)} ${scriptsLine(tracks)} ${replaceQuestion(tracks)}`).toBe(
      '11 blocks imported. 2 scripts kept for Fantasy Statblocks (Hit points tracks drawn with JavaScript; Stress tracks drawn with JavaScript). Replace them with Track blocks?',
    );
    const mixed = report([...tracks.scripts, { blockId: 'c', summary: 'A button', suggestion: null }]);
    expect(replaceQuestion(mixed)).toBe('Replace the 2 that draw tracks with Track blocks?');
    expect(scriptsLine(report([]))).toBeNull();
    expect(replaceQuestion(report([{ blockId: 'c', summary: 'A button', suggestion: null }]))).toBeNull();
  });

  it('says what the batch does and did', () => {
    expect(moveLabel(214)).toBe('Move 214 statblocks to Atlas');
    expect(moveLabel(1)).toBe('Move 1 statblock to Atlas');
    expect(movedLine(214, 214)).toBe('Moved 214 statblocks.');
    expect(movedLine(12, 214)).toBe('Moved 12 of 214 statblocks.');
    expect(moveExplanation({ frontmatter: ['a'], fences: [] })).toBe('Statblocks in properties keep their values and layout.');
    expect(moveExplanation({ frontmatter: [], fences: ['a'] })).toBe('A code block becomes its note\'s properties and leaves the note; the rest of the note stays as it is.');
    expect(keptScriptsLine([])).toBeNull();
    expect(keptScriptsLine(['A button', 'A chart', 'A clock', 'A dial'])).toBe(
      'The template keeps 4 scripts for Fantasy Statblocks (A button; A chart; A clock; 1 more); Atlas shows them as placeholders.',
    );
  });
});

describe('LayoutImportDialog', () => {
  it('replaces the track-drawing script with Track blocks through the template\'s session', async () => {
    show({ frontmatter: [], fences: [] });
    expect(screen.getByRole('dialog', { name: 'Imported Marsh layout' })).toBeTruthy();
    expect(screen.getByText(/blocks imported\. 1 script kept for Fantasy Statblocks \(Hit points and Stress tracks drawn with JavaScript\)\./)).toBeTruthy();
    expect(screen.getByText('Replace it with Track blocks?')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replace with Track blocks' })); });
    await screen.findByText('Replaced with Track blocks.');
    const saved = JSON.parse(vault.files.get(imported.path)!) as StatblockTemplate;
    expect(saved.layout.blocks.filter((block) => block.type === 'track').map((block) => block.type === 'track' && block.field)).toEqual(['hp', 'stress']);
    expect(saved.layout.blocks.some((block) => block.type === 'script')).toBe(false);
  });

  it('lists the statblocks first, by kind, then moves them with progress, and says what it did', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Show the 4 statblocks' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Bog Properties', 'Fen Properties', 'Hag Code block', 'Mire Properties']);

    fireEvent.click(screen.getByRole('button', { name: 'Move 4 statblocks to Atlas' }));
    expect(screen.getByRole('progressbar', { name: 'Moving statblocks' })).toBeTruthy();
    await screen.findByText('Moved 4 statblocks.');
    for (const path of NOTES) expect(vault.files.get(path)).toBe(fsNote(path.slice(9, -3)).replace(/---\n$/, `atlas-template: ${imported.id}\n---\n`));
    expect(vault.files.get(HAG)).toBe(`---\nstatblock: true\natlas-template: ${imported.id}\nname: Hag\nlayout: Marsh layout\nhp: 9\n---\nShe waits.\n\nThe end.\n`);
    expect(screen.getByText(/^The template keeps 1 script for Fantasy Statblocks \(Hit points and Stress tracks drawn with JavaScript\); Atlas shows it as a placeholder\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stops at Cancel and lists the statblocks it left as they were, with why', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Move 4 statblocks to Atlas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText(/^Moved [0-3] of 4 statblocks\.$/);
    expect(vault.files.get(NOTES[2]!)).toBe(fsNote('Mire'));
    fireEvent.click(screen.getByRole('button', { name: /^Show the (\d statblocks left as they were|statblock left as it was)$/ }));
    expect(screen.getAllByText('Not reached before Cancel.').length).toBeGreaterThan(0);
  });

  it('is the batch alone for a layout imported before, and closes on Escape', async () => {
    show({ frontmatter: NOTES.slice(0, 1), fences: [] }, { ...imported, report: null });
    expect(screen.getByRole('dialog', { name: 'Marsh layout' })).toBeTruthy();
    expect(screen.getByText('Imported before as Marsh layout.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move 1 statblock to Atlas' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
