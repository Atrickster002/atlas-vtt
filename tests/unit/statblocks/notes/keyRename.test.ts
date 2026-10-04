import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { renameKeyInNotes, type KeyRename } from '../../../../src/app/statblocks/notes/keyRename';
import { noteHarness, type NoteHarness } from './noteHarness';

const MARSH = 'marsh-creature-k7m2qa';
const RENAME: KeyRename = { templateId: MARSH, from: ['hp', 'vigor'], to: 'hit_points' };
const note = (lines: string, body = 'The warden waits.\n', template = MARSH): string =>
  `---\nstatblock: true\natlas-template: ${template}\nname: Warden\n${lines}---\n${body}`;

let harness: NoteHarness;
afterEach(() => { NoteFieldWriter.release(harness.app); });

describe('renameKeyInNotes', () => {
  it('moves the value in closed notes and through an open editor, keeping its typing, and reports progress', async () => {
    harness = noteHarness({ 'a.md': note('hp: 14\n'), 'b.md': note('hp: 9\n'), 'c.md': note('hp: 21\n') });
    const open = harness.open('b.md');
    open.editor.type(note('hp: 9\n', 'Typed, not saved.\n'));
    const progress = vi.fn();

    const result = await renameKeyInNotes(harness.app, ['a.md', 'b.md', 'c.md'], RENAME, { onProgress: progress });

    expect(result).toEqual({ renamed: ['a.md', 'b.md', 'c.md'], unchanged: [], skipped: [], notReached: [] });
    expect(harness.files.get('a.md')).toBe(note('hit_points: 14\n'));
    expect(harness.files.get('c.md')).toBe(note('hit_points: 21\n'));
    expect(open.editor.getValue()).toBe(note('hit_points: 9\n', 'Typed, not saved.\n'));
    expect(open.editor.transactions).toHaveLength(1);
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('moves the value the template reads: the current key first, else the newest former key', async () => {
    harness = noteHarness({ 'old.md': note('vigor: 7\n'), 'both.md': note('hp: 5\nvigor: 7\n') });

    const result = await renameKeyInNotes(harness.app, ['old.md', 'both.md'], RENAME);

    expect(result.renamed).toEqual(['old.md', 'both.md']);
    expect(harness.files.get('old.md')).toBe(note('hit_points: 7\n'));
    expect(harness.files.get('both.md')).toBe(note('hit_points: 5\nvigor: 7\n'));
  });

  it('can run twice: a renamed note stays renamed and is not written again', async () => {
    harness = noteHarness({ 'a.md': note('hp: 14\n') });
    await renameKeyInNotes(harness.app, ['a.md'], RENAME);
    vi.mocked(harness.app.vault.process).mockClear();

    const again = await renameKeyInNotes(harness.app, ['a.md'], RENAME);

    expect(again).toEqual({ renamed: [], unchanged: ['a.md'], skipped: [], notReached: [] });
    expect(harness.files.get('a.md')).toBe(note('hit_points: 14\n'));
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('drops an old value equal to the new key\'s, and keeps a note whose two values differ', async () => {
    harness = noteHarness({ 'same.md': note('hp: 14\nhit_points: 14\n'), 'differ.md': note('hp: 14\nhit_points: 20\n') });

    const result = await renameKeyInNotes(harness.app, ['same.md', 'differ.md'], RENAME);

    expect(result.renamed).toEqual(['same.md']);
    expect(result.skipped).toEqual([{ path: 'differ.md', reason: 'It holds different values under “hp” and “hit_points”.' }]);
    expect(harness.files.get('same.md')).toBe(note('hit_points: 14\n'));
    expect(harness.files.get('differ.md')).toBe(note('hp: 14\nhit_points: 20\n'));
  });

  it('leaves a note that names another template now, one it cannot read and one without the key', async () => {
    harness = noteHarness({
      'moved.md': note('hp: 14\n', 'Body.\n', 'other-template-a1b2c3'),
      'broken.md': `---\natlas-template: ${MARSH}\nhp: [3\n---\n`,
      'empty.md': note('speed: 30 ft.\n'),
    });

    const result = await renameKeyInNotes(harness.app, ['moved.md', 'broken.md', 'empty.md'], RENAME);

    expect(result.renamed).toEqual([]);
    expect(result.unchanged).toEqual(['empty.md']);
    expect(result.skipped).toEqual([
      { path: 'moved.md', reason: 'Its template was changed meanwhile.' },
      { path: 'broken.md', reason: expect.stringMatching(/YAML error/) as string },
    ]);
    expect(harness.files.get('moved.md')).toBe(note('hp: 14\n', 'Body.\n', 'other-template-a1b2c3'));
  });

  it('stops at Cancel: the notes reached are renamed, the rest keep the old key', async () => {
    harness = noteHarness({ 'a.md': note('hp: 14\n'), 'b.md': note('hp: 9\n'), 'c.md': note('hp: 21\n') });
    const cancel = new AbortController();

    const result = await renameKeyInNotes(harness.app, ['a.md', 'b.md', 'c.md'], RENAME, {
      signal: cancel.signal,
      onProgress: (done) => { if (done === 1) cancel.abort(); },
    });

    expect(result).toEqual({ renamed: ['a.md'], unchanged: [], skipped: [], notReached: ['b.md', 'c.md'] });
    expect(harness.files.get('a.md')).toBe(note('hit_points: 14\n'));
    expect(harness.files.get('b.md')).toBe(note('hp: 9\n'));
  });

  it('reports a note deleted before the batch reached it', async () => {
    harness = noteHarness({ 'a.md': note('hp: 14\n') });
    harness.files.delete('a.md');

    const result = await renameKeyInNotes(harness.app, ['a.md'], RENAME);

    expect(result.skipped).toEqual([{ path: 'a.md', reason: 'The note no longer exists.' }]);
  });
});
