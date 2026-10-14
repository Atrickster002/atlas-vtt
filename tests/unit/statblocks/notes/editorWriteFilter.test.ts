import { describe, expect, it, vi } from 'vitest';
import type { Editor } from 'obsidian';
import { STATBLOCK_EDIT_ORIGIN, writeToEditor } from '../../../../src/app/statblocks/notes/editorWrite';
import { FakeEditor } from './noteHarness';

const BEFORE = '---\nname: Aboleth\nimage: art/aboleth.webp\ntoken-image: art/old.webp\n---\n';
const AFTER = '---\nname: Aboleth\n---\n';

/** An editor whose transactions a filter drops, as Live Preview drops deleting a property naming an image. */
function filteringEditor(): { editor: FakeEditor & { cm: { dispatch: ReturnType<typeof vi.fn> } }; dispatched: unknown[] } {
  const dispatched: unknown[] = [];
  const editor = Object.assign(new FakeEditor(BEFORE, () => undefined), {
    cm: {
      dispatch: vi.fn((spec: { changes: { from: number; to: number; insert: string } }) => {
        dispatched.push(spec);
        const { from, to, insert } = spec.changes;
        editor.text = editor.text.slice(0, from) + insert + editor.text.slice(to);
      }),
    },
  });
  editor.transaction = (): void => undefined;
  return { editor, dispatched };
}

describe('writing into an editor', () => {
  it('writes through the editor\'s transaction when the editor takes it', () => {
    const editor = Object.assign(new FakeEditor(BEFORE, () => undefined), { cm: { dispatch: vi.fn() } });
    writeToEditor(editor as unknown as Editor, BEFORE, AFTER);
    expect(editor.getValue()).toBe(AFTER);
    expect(editor.transactions).toHaveLength(1);
    expect(editor.cm.dispatch).not.toHaveBeenCalled();
  });

  it('passes a filter that drops the change by, once, as one change of Atlas\' origin', () => {
    const { editor, dispatched } = filteringEditor();
    writeToEditor(editor as unknown as Editor, BEFORE, AFTER);
    expect(editor.getValue()).toBe(AFTER);
    expect(dispatched).toEqual([{
      changes: { from: BEFORE.indexOf('image:'), to: BEFORE.indexOf('---\n', 4), insert: '' },
      filter: false,
      userEvent: STATBLOCK_EDIT_ORIGIN,
    }]);
  });
});
