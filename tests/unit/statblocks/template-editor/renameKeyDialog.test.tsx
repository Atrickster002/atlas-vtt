import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { AssetService, type CollectionMetadata } from '../../../../src/app/services/AssetService';
import { RenameKeyDialog } from '../../../../src/app/statblocks/editor/template-editor/inspector/RenameKeyDialog';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';
import { FakeSession, sampleTemplate } from './editorKit';

const HP: ResourceDefinition = { key: 'hp', name: 'Hit points', field: 'hp', direction: 'drains', color: '#cc3333', visibleToPlayers: true };
const NOTES = ['Bestiary/Bog.md', 'Bestiary/Fen.md'];

let harness: NoteHarness;
let session: FakeSession;
let settings: CollectionSettings;
let updateCollectionSettings: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

const note = (lines: string): string => `---\natlas-template: ${session.template.id}\nname: Bog\n${lines}---\nBody.\n`;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(() => {
  session = new FakeSession(sampleTemplate());
  harness = noteHarness({ [NOTES[0]!]: note('hp: 14\n'), [NOTES[1]!]: note('hp: 9\n') });
  settings = { conditions: [], resources: [HP], statblockRoles: [{ id: 'creature', name: 'Creature', templateId: session.template.id }] };
  const marsh: CollectionMetadata = { id: 'marsh', uid: 'marsh', version: 1, name: 'Marsh', tags: {}, settings, createdAt: 0, modifiedAt: 0 };
  updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollections: async () => [marsh],
    getAssets: async () => [],
    loadedCollections: () => [marsh],
    getCollectionSettings: () => settings,
    updateCollectionSettings,
  } as unknown as AssetService);
  onClose = vi.fn();
});

afterEach(() => {
  cleanup();
  NoteFieldWriter.release(harness.app);
  vi.restoreAllMocks();
});

/** Opens the dialog for the Hit points field and waits until it knows what reads the key. */
async function openDialog(): Promise<HTMLElement> {
  const anchor = document.body.appendChild(document.createElement('button'));
  const field = session.template.fields.find((candidate) => candidate.key === 'hp')!;
  render(
    <TooltipProvider>
      <RenameKeyDialog anchor={anchor} field={field} template={session.template} app={harness.app} notes={NOTES}
        session={session} announce={vi.fn()} onClose={onClose} />
    </TooltipProvider>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Rename key' });
  await within(dialog).findByRole('checkbox', { name: 'Also update the resource that uses it' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'New key' }), { target: { value: 'hit_points' } });
  return dialog;
}

describe('the Rename key dialog with statblocks that use the template', () => {
  it('lists the notes and the resource that reads the key, on demand', async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Used by 2 statblocks' }));
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Bestiary/Bog', 'Bestiary/Fen']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show it' }));
    expect(within(dialog).getByText(/resource in Marsh, reads/)).toBeTruthy();
    expect(within(dialog).getByRole<HTMLInputElement>('radio', { name: 'Rewrite the 2 notes now' }).checked).toBe(true);
    expect(within(dialog).getByRole<HTMLInputElement>('checkbox', { name: 'Also update the resource that uses it' }).checked).toBe(true);
  });

  it('rewrites the notes now: the template in one step, saved first, then the resource and every note', async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(session.steps).toBe(1);
    expect(session.template.fields.find((field) => field.key === 'hit_points')).toMatchObject({ formerKeys: ['hp'] });
    expect(session.flushes).toBe(1);
    expect(updateCollectionSettings).toHaveBeenCalledWith('marsh', { resources: [{ ...HP, field: 'hit_points' }] });
    expect(harness.files.get(NOTES[0]!)).toBe(note('hit_points: 14\n'));
    expect(harness.files.get(NOTES[1]!)).toBe(note('hit_points: 9\n'));
  });

  it('leaves the notes for their next edit, and the resource when asked to', async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Update each note when it is next edited' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Also update the resource that uses it' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(session.template.fields.find((field) => field.key === 'hit_points')).toMatchObject({ formerKeys: ['hp'] });
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(harness.files.get(NOTES[0]!)).toBe(note('hp: 14\n'));
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('leaves the notes and the resource alone when the template could not be saved first', async () => {
    const dialog = await openDialog();
    session.patch({ saveState: 'conflict' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await within(dialog).findByText(/The template couldn't be saved, so the notes, resources and filters were left as they are\./);
    expect(session.template.fields.some((field) => field.key === 'hit_points')).toBe(true);
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(harness.files.get(NOTES[0]!)).toBe(note('hp: 14\n'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops at Cancel and says which notes keep the old key', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const process = harness.app.vault.process.bind(harness.app.vault);
    harness.app.vault.process = vi.fn(async (file: TFile, edit: (data: string) => string) => {
      await gate;
      return process(file, edit);
    });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Also update the resource that uses it' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await within(dialog).findByText('Rewriting notes: 0 of 2');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => { open(); });

    await within(dialog).findByText(/Updated 1 of 2 notes\. One keeps “hp” until it is next edited\./);
    expect(onClose).not.toHaveBeenCalled();
    expect(harness.files.get(NOTES[0]!)).toBe(note('hit_points: 14\n'));
    expect(harness.files.get(NOTES[1]!)).toBe(note('hp: 9\n'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show it' }));
    expect(within(dialog).getByText('Not reached before Cancel.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
