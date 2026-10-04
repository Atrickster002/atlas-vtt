import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerNoteWriterFlush } from '../../../../src/app/plugin/noteWriterFlush';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { AUTOSAVE_DELAY_MS } from '../../../../src/app/statblocks/library/templateWriter';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { closeSessionVault, described, openSession, sessionVault, type SessionVault } from './sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from './templateTexts';

let vault: SessionVault;
const opened: TemplateSession[] = [];
const open = (id = MARSH_ID): Promise<TemplateSession> => openSession(vault, opened, id);
const COPY_PATH = `${TEMPLATE_FOLDER}/Marsh creature copy.atlastemplate`;
const processCalls = (): number => vi.mocked(vault.app.vault.process).mock.calls.length;
const descriptionAt = (path: string): string | undefined => (JSON.parse(vault.files.get(path)!) as StatblockTemplate).description;

beforeEach(() => {
  vi.useFakeTimers();
  vault = sessionVault();
});

afterEach(async () => {
  for (const session of opened.splice(0)) session.release();
  await closeSessionVault(vault);
  vi.useRealTimers();
});

describe('TemplateSession: changes made elsewhere', () => {
  it('takes in a change to a clean session and forgets its history', async () => {
    const session = await open();
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    vault.writeExternally(MARSH_PATH, marshText({ description: 'From sync' }));
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', canUndo: false, conflict: null });
    expect(session.getSnapshot().template.description).toBe('From sync');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(processCalls()).toBe(1);
  });

  it('stops saving a dirty session and overwrites nothing until the user chooses', async () => {
    const session = await open();
    session.apply(described('Mine'));
    const theirs = marshText({ description: 'Theirs' });
    vault.writeExternally(MARSH_PATH, theirs);
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ saveState: 'conflict', conflict: 'changed' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(vault.files.get(MARSH_PATH)).toBe(theirs);
  });

  it('raises a conflict for a change written during a gesture that has changed nothing yet (a block held mid-drag)', async () => {
    const session = await open();
    session.beginGesture();
    const theirs = marshText({ description: 'Theirs' });
    vault.writeExternally(MARSH_PATH, theirs);
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ conflict: 'changed' });
    session.apply(described('Dropped'));
    session.endGesture();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(session.getSnapshot()).toMatchObject({ saveState: 'conflict', canUndo: true });
    expect(session.getSnapshot().template.description).toBe('Dropped');
    expect(vault.files.get(MARSH_PATH)).toBe(theirs);
  });

  it('refuses a write when the disk changed before the vault said so', async () => {
    const session = await open();
    const theirs = marshText({ description: 'Theirs' });
    vault.files.set(MARSH_PATH, theirs);
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(vault.files.get(MARSH_PATH)).toBe(theirs);
    expect(session.getSnapshot()).toMatchObject({ saveState: 'conflict', conflict: 'changed' });
  });

  it('refuses at the swap when the disk changes between reading and writing', async () => {
    const session = await open();
    const theirs = marshText({ description: 'Theirs' });
    const read = vi.mocked(vault.app.vault.read);
    const reader = read.getMockImplementation()!;
    read.mockImplementationOnce(async (file) => {
      const text = await reader(file);
      vault.files.set(MARSH_PATH, theirs);
      return text;
    });
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(vault.files.get(MARSH_PATH)).toBe(theirs);
    expect(session.getSnapshot().conflict).toBe('changed');
  });

  it('sees a write made right after its own, even when the vault reports only one', async () => {
    const session = await open();
    const process = vi.mocked(vault.app.vault.process);
    const writer = process.getMockImplementation()!;
    process.mockImplementationOnce(async (file, fn) => {
      const written = await writer(file, fn);
      vault.files.set(MARSH_PATH, marshText({ description: 'Right after' }));
      return written;
    });
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', conflict: null, canUndo: false });
    expect(session.getSnapshot().template.description).toBe('Right after');
  });

  it('keeps mine over theirs, uses theirs, or saves mine as a copy', async () => {
    const session = await open();
    session.apply(described('Mine'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Theirs' }));
    await vault.settled();
    await session.resolveConflict('keep-mine');
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Mine' });
    expect(session.getSnapshot()).toMatchObject({ conflict: null, saveState: 'saved' });

    session.apply(described('Mine again'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Theirs again' }));
    await vault.settled();
    await session.resolveConflict('use-other');
    expect(session.getSnapshot()).toMatchObject({ conflict: null, saveState: 'saved', canUndo: false });
    expect(session.getSnapshot().template.description).toBe('Theirs again');

    session.apply(described('Keep as copy'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Third' }));
    await vault.settled();
    await session.resolveConflict('save-copy');
    const copy = JSON.parse(vault.files.get(COPY_PATH)!) as StatblockTemplate;
    expect(copy).toMatchObject({ description: 'Keep as copy' });
    expect(copy.id).not.toBe(MARSH_ID);
    expect(session.getSnapshot().template.description).toBe('Third');
  });

  it('offers to recreate a file deleted under unsaved edits', async () => {
    const session = await open();
    session.apply(described('Mine'));
    vault.deleteExternally(MARSH_PATH);
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ conflict: 'deleted', saveState: 'conflict' });
    await session.resolveConflict('recreate');
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ id: MARSH_ID, description: 'Mine' });
    expect(session.getSnapshot()).toMatchObject({ conflict: null, saveState: 'saved', path: MARSH_PATH });
  });

  it('keeps a draft in conflict as a copy when the last holder lets go', async () => {
    const session = await open();
    session.apply(described('Mine'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Theirs' }));
    await vault.settled();
    opened.splice(0);
    session.release();
    await vi.waitFor(() => expect(vault.files.has(COPY_PATH)).toBe(true));
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Theirs' });
  });
});

describe('template edits on the way out', () => {
  function registerHooks(): () => void {
    const cleanups: Array<() => void> = [];
    const plugin = {
      app: vault.app,
      registerEvent: (ref: unknown) => { cleanups.push(() => vault.workspace.offref(ref as Parameters<typeof vault.workspace.offref>[0])); },
      register: (cleanup: () => void) => { cleanups.push(cleanup); },
    };
    registerNoteWriterFlush(plugin as unknown as Plugin);
    return () => { cleanups.splice(0).forEach((cleanup) => cleanup()); };
  }

  it('writes pending steps in the quit tasks Obsidian awaits, and keeps a draft in conflict as a copy', async () => {
    const unload = registerHooks();
    const session = await open();
    session.apply(described('Before quitting'));
    const tasks: Array<() => Promise<unknown>> = [];
    vault.workspace.trigger('quit', { add: (task: () => Promise<unknown>) => tasks.push(task) });
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    expect(descriptionAt(MARSH_PATH)).toBe('Before quitting');

    session.apply(described('Mine'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Theirs' }));
    await vault.settled();
    await tasks[0]!();
    expect(descriptionAt(COPY_PATH)).toBe('Mine');
    unload();
  });

  it('writes when a window closes, and lets every session go when the plugin unloads', async () => {
    const unload = registerHooks();
    const session = await open();
    session.apply(described('Window closed'));
    vault.workspace.trigger('window-close', {}, window);
    await vi.waitFor(() => expect(descriptionAt(MARSH_PATH)).toBe('Window closed'));
    session.apply(described('Unloaded'));
    unload();
    await vi.waitFor(() => expect(descriptionAt(MARSH_PATH)).toBe('Unloaded'));
    expect(TemplateSession.open(vault.app, MARSH_ID)?.getSnapshot()).not.toBe(session.getSnapshot());
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  });
});
