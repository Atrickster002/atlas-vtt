import type { Editor } from 'obsidian';

/** The `origin` of Atlas' transactions; CodeMirror's `userEvent` in the editor written to. */
export const STATBLOCK_EDIT_ORIGIN = 'atlas-statblock';

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * The one replacement that turns `before` into `after`, as small as their common start and end
 * allow; null when they are equal. A caret outside the replaced range keeps its place, so trimming
 * keeps the caret of someone typing in the frontmatter in Source mode (spike S2). A surrogate pair
 * is never split.
 */
export function smallestChange(before: string, after: string): TextChange | null {
  if (before === after) return null;
  const limit = Math.min(before.length, after.length);
  let start = 0;
  while (start < limit && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start--;

  let end = 0;
  while (end < limit - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  if (end > 0 && isLowSurrogate(before.charCodeAt(before.length - end))) end--;

  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

/** The CodeMirror view behind Obsidian's editor, as far as a refused write needs it. */
interface EditorWithView {
  cm?: { dispatch(spec: { changes: TextChange; filter: false; userEvent: string }): void };
}

/**
 * Writes `after` into an editor that holds `before` as one transaction: one undo step in the
 * note, the caret and folds kept, other leaves on the note following, and Obsidian saving it.
 *
 * Live Preview filters some transactions: it drops one that deletes the whole line of a property
 * whose value names an image (`image`, `token-image`), so unlinking a token left the art behind.
 * Where the editor did not take the change, it goes to CodeMirror once more with its filters
 * passed by (`editor.cm`, the one internal used here): still one undo step, Obsidian's
 * `editor-change` still fires.
 */
export function writeToEditor(editor: Editor, before: string, after: string): void {
  const change = smallestChange(before, after);
  if (!change) return;
  editor.transaction(
    { changes: [{ from: editor.offsetToPos(change.from), to: editor.offsetToPos(change.to), text: change.insert }] },
    STATBLOCK_EDIT_ORIGIN,
  );
  if (editor.getValue() !== before) return;
  (editor as unknown as EditorWithView).cm?.dispatch({ changes: change, filter: false, userEvent: STATBLOCK_EDIT_ORIGIN });
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
