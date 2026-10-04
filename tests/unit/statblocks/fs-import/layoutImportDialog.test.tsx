import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { LayoutImportDialog } from '../../../../src/app/statblocks/editor/fs-import/LayoutImportDialog';
import { adoptLabel, blocksLine, replaceQuestion, scriptsLine } from '../../../../src/app/statblocks/editor/fs-import/importReportText';
import { importFsLayout, type FsLayoutImport } from '../../../../src/app/statblocks/fs/fsImport';
import type { FsImportReport } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_LAYOUT } from './fsImportKit';

const MARSH = { id: 'marsh-layout', name: 'Marsh layout' };
const NOTES = ['Bestiary/Bog.md', 'Bestiary/Fen.md', 'Bestiary/Mire.md'];
const fsNote = (name: string): string => `---\nstatblock: true\nname: ${name}\nlayout: Marsh layout\n---\n`;

let vault: SessionVault;
let imported: FsLayoutImport;
let onClose: ReturnType<typeof vi.fn>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  vault = sessionVault(Object.fromEntries(NOTES.map((path) => [path, fsNote(path.slice(9, -3))])));
  await vault.settled();
  imported = await importFsLayout(vault.app, MARSH_LAYOUT);
  onClose = vi.fn();
});

afterEach(async () => {
  cleanup();
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
});

function show(notes: readonly string[] = NOTES, given: FsLayoutImport = imported): void {
  render(
    <TooltipProvider>
      <LayoutImportDialog app={vault.app} doc={document} layout={MARSH} imported={given} notes={notes} onClose={onClose} />
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
    expect(adoptLabel('Marsh layout', 214, 'Basic 5e')).toBe('Use Marsh layout for the 214 notes using layout Basic 5e');
  });
});

describe('LayoutImportDialog', () => {
  it('replaces the track-drawing script with Track blocks through the template\'s session', async () => {
    show([]);
    expect(screen.getByRole('dialog', { name: 'Imported Marsh layout' })).toBeTruthy();
    expect(screen.getByText(/blocks imported\. 1 script kept for Fantasy Statblocks \(Hit points and Stress tracks drawn with JavaScript\)\./)).toBeTruthy();
    expect(screen.getByText('Replace it with Track blocks?')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replace with Track blocks' })); });
    await screen.findByText('Replaced with Track blocks.');
    const saved = JSON.parse(vault.files.get(imported.path)!) as StatblockTemplate;
    expect(saved.layout.blocks.filter((block) => block.type === 'track').map((block) => block.type === 'track' && block.field)).toEqual(['hp', 'stress']);
    expect(saved.layout.blocks.some((block) => block.type === 'script')).toBe(false);
  });

  it('lists the notes first, then gives them the template with progress, and says what it did', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Show the 3 notes' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Bog', 'Fen', 'Mire']);

    fireEvent.click(screen.getByRole('button', { name: 'Use Marsh layout for the 3 notes using layout Marsh layout' }));
    expect(screen.getByRole('progressbar', { name: 'Switching notes' })).toBeTruthy();
    await screen.findByText('Switched 3 notes.');
    for (const path of NOTES) expect(vault.files.get(path)).toBe(fsNote(path.slice(9, -3)).replace(/---\n$/, `atlas-template: ${imported.id}\n---\n`));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stops at Cancel and lists the notes it left as they were', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Use Marsh layout for the 3 notes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText(/^Switched [0-2] of 3 notes\.$/);
    expect(vault.files.get(NOTES[2]!)).toBe(fsNote('Mire'));
    fireEvent.click(screen.getByRole('button', { name: /^Show the \d notes? left as (they were|it was)$/ }));
    expect(screen.getAllByText('Not reached before Cancel.').length).toBeGreaterThan(0);
  });

  it('is the batch alone for a layout imported before, and closes on Escape', async () => {
    show(NOTES.slice(0, 1), { ...imported, report: null });
    expect(screen.getByRole('dialog', { name: 'Marsh layout' })).toBeTruthy();
    expect(screen.getByText('Imported before as Marsh layout.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use Marsh layout for the note using layout Marsh layout' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
