import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { flushTemplateSessions } from '../../../../src/app/statblocks/library/sessionRegistry';
import { AUTOSAVE_DELAY_MS } from '../../../../src/app/statblocks/library/templateWriter';
import { updateBlock } from '../../../../src/app/statblocks/model/treeOps';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import {
  closeSessionVault, described, heading, insertDivider, openSession, sessionVault, type SessionVault,
} from './sessionVault';
import { MARSH_ID, MARSH_PATH, marshText } from './templateTexts';

let vault: SessionVault;
const opened: TemplateSession[] = [];
const open = (id = MARSH_ID): Promise<TemplateSession> => openSession(vault, opened, id);
const processCalls = (): number => vi.mocked(vault.app.vault.process).mock.calls.length;

beforeEach(() => {
  vi.useFakeTimers();
  vault = sessionVault();
});

afterEach(async () => {
  for (const session of opened.splice(0)) session.release();
  await closeSessionVault(vault);
  vi.useRealTimers();
});

describe('TemplateSession: history', () => {
  it('records exactly one step for one tree edit, and undo takes it back', async () => {
    const session = await open();
    const before = session.getSnapshot().template;
    session.apply(insertDivider);
    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false, saveState: 'dirty' });
    session.undo();
    expect(session.getSnapshot()).toMatchObject({ template: before, canUndo: false, canRedo: true });
    session.redo();
    expect(session.getSnapshot().template.layout.blocks[0]?.type).toBe('divider');
  });

  it('records nothing for an edit that changes nothing, even one that copies the template', async () => {
    const session = await open();
    const before = session.getSnapshot();
    session.apply((template) => ({ ...template }));
    session.apply((template) => ({ ...template, layout: updateBlock(template.layout, 'nowhere', 'stat', { label: 'X' }).layout }));
    expect(session.getSnapshot()).toBe(before);
  });

  it('makes one step of a gesture and writes nothing while it lasts', async () => {
    const session = await open();
    const before = session.getSnapshot().template;
    session.beginGesture();
    for (const text of ['A', 'At', 'Att', 'Attacks']) session.apply(heading(text));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(processCalls()).toBe(0);
    session.endGesture();
    session.undo();
    expect(session.getSnapshot()).toMatchObject({ template: before, canUndo: false });
  });

  it('puts back what an abandoned gesture changed and leaves no step', async () => {
    const session = await open();
    session.apply(described('First'));
    const before = session.getSnapshot().template;
    session.beginGesture();
    session.apply(heading('Moves'));
    session.apply(insertDivider);
    session.abandonGesture();
    expect(session.getSnapshot().template).toBe(before);
    session.undo();
    expect(session.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('ignores undo and redo during a gesture', async () => {
    const session = await open();
    session.apply(described('First'));
    session.beginGesture();
    session.apply(described('Second'));
    session.undo();
    expect(session.getSnapshot().template.description).toBe('Second');
    session.endGesture();
  });
});

describe('TemplateSession: autosave', () => {
  it('writes 600 ms after the last committed step, and a later step moves the write', async () => {
    const session = await open();
    session.apply(described('One'));
    await vi.advanceTimersByTimeAsync(400);
    session.apply(described('Two'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(processCalls()).toBe(0);
    expect(session.getSnapshot().saveState).toBe('dirty');
    await vi.advanceTimersByTimeAsync(1);
    expect(processCalls()).toBe(1);
    expect(vault.files.get(MARSH_PATH)).toBe(serializeTemplate(session.getSnapshot().template));
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', canUndo: true });
  });

  it('ignores its own write coming back from the vault and keeps its history', async () => {
    const session = await open();
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', canUndo: true, conflict: null });
    expect(TemplateLibrary.forApp(vault.app).get(MARSH_ID)?.template.description).toBe('Mine');
  });

  it('retries a failed write with growing pauses and keeps the draft', async () => {
    const session = await open();
    vi.mocked(vault.app.vault.process).mockRejectedValueOnce(new Error('Disk full.'));
    session.apply(described('Mine'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.getSnapshot()).toMatchObject({ saveState: 'error', saveProblem: 'Couldn\'t save: Disk full. Retrying' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', saveProblem: null });
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Mine' });
  });

  it('writes a pending step at once on flush and when the last holder lets go', async () => {
    const session = await open();
    session.apply(described('Flushed'));
    await flushTemplateSessions(vault.app);
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Flushed' });
    session.apply(described('Released'));
    opened.splice(0);
    session.release();
    await vi.waitFor(() => expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Released' }));
  });
});

describe('TemplateSession: sharing and read-only templates', () => {
  it('gives two views of one template one draft, history and save state', async () => {
    const first = await open();
    const second = await open();
    first.apply(described('Shared'));
    expect(second.getSnapshot()).toBe(first.getSnapshot());
    second.undo();
    expect(first.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    first.release();
    second.apply(described('Still open'));
    expect(second.getSnapshot().template.description).toBe('Still open');
  });

  it('ends a gesture a view still holds when it lets go, so the other views undo and save again', async () => {
    const first = await open();
    const second = await open();
    first.beginGesture();
    first.apply(described('Held'));
    first.release();
    // The view's React tree unmounts after the release; its cleanup reaches a released handle.
    first.endGesture();
    second.apply(described('After'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'After' });
    second.undo();
    expect(second.getSnapshot().template.description).toBe('Held');
    second.undo();
    expect(second.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
  });

  it('ends only the gestures a view began itself', async () => {
    const first = await open();
    const second = await open();
    first.beginGesture();
    first.apply(described('Typing'));
    second.endGesture();
    second.abandonGesture();
    first.apply(heading('Moves'));
    first.endGesture();
    expect(first.getSnapshot().template.description).toBe('Typing');
    first.undo();
    expect(first.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
  });

  it('shows a draft through the library while it is unsaved', async () => {
    const session = await open();
    const library = TemplateLibrary.forApp(vault.app);
    session.apply(described('Draft'));
    expect(library.current(MARSH_ID)?.template).toBe(session.getSnapshot().template);
    expect(library.current(MARSH_ID)).toBe(library.current(MARSH_ID));
    expect(library.get(MARSH_ID)?.template.description).toBe(MARSH_CREATURE.description);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(library.current(MARSH_ID)).toBe(library.get(MARSH_ID));
  });

  it('opens a built-in read-only and a template of a newer Atlas read-only', async () => {
    const builtIn = await open('builtin:generic-creature');
    const before = builtIn.getSnapshot();
    expect(before).toMatchObject({ readOnly: true, readOnlyReason: 'built-in', path: null, saveState: 'saved' });
    builtIn.apply(described('Changed'));
    builtIn.beginGesture();
    builtIn.apply(described('Changed'));
    builtIn.endGesture();
    expect(builtIn.getSnapshot()).toBe(before);
    expect(await builtIn.rename('Mine')).toEqual({ ok: false, problem: 'Built-in templates can\'t be renamed.' });

    vault.writeExternally(MARSH_PATH, marshText({ version: 2 }));
    await vault.settled();
    const newer = await open();
    expect(newer.getSnapshot()).toMatchObject({ readOnly: true, readOnlyReason: 'newer' });
    newer.apply(described('Changed'));
    expect(newer.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    expect(TemplateSession.open(vault.app, 'unknown-abc123')).toBeNull();
  });
});

describe('TemplateSession: rename', () => {
  it('writes pending edits, then renames the file to the new name', async () => {
    const session = await open();
    session.apply(described('Before the rename'));
    expect(await session.rename('Bog creature')).toEqual({ ok: true });
    const path = 'atlas-vtt/statblock-templates/Bog creature.atlastemplate';
    expect(vault.files.has(MARSH_PATH)).toBe(false);
    expect(JSON.parse(vault.files.get(path)!)).toMatchObject({ id: MARSH_ID, description: 'Before the rename' });
    expect(session.getSnapshot()).toMatchObject({ name: 'Bog creature', path, saveState: 'saved' });
    session.apply(described('After'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(JSON.parse(vault.files.get(path)!)).toMatchObject({ description: 'After' });
  });

  it('refuses a name that is empty, unusable or taken', async () => {
    vault.files.set('atlas-vtt/statblock-templates/Swamp.atlastemplate', '{}');
    const session = await open();
    expect(await session.rename('  ')).toMatchObject({ ok: false, problem: 'Give the template a name.' });
    expect(await session.rename('Bog/creature')).toMatchObject({ ok: false });
    expect(await session.rename('swamp')).toMatchObject({ ok: false, problem: 'There is already a template named “swamp” here.' });
    expect(await session.rename('Marsh creature')).toEqual({ ok: true });
    expect(session.getSnapshot().path).toBe(MARSH_PATH);
  });
});
