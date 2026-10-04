import { describe, expect, it } from 'vitest';
import {
  FENCE_STUB, READ_ON_TEXT, capped, notePreviewText, withFenceStub, withoutFrontmatter,
} from '../../../../../src/app/statblocks/editor/template-editor/shell/notePreviewText';
import {
  SHOW_EMPTY, SHOW_SAMPLE, newestFirst, sameShowWith, showWithOf, showWithState,
} from '../../../../../src/app/statblocks/editor/template-editor/shell/showWith';

describe('the note beside the template editor\'s card', () => {
  it('leaves the frontmatter out, as the note view hides Properties', () => {
    expect(withoutFrontmatter('---\nstatblock: true\nname: Aboleth\n---\nThe aboleth lairs below.')).toBe('The aboleth lairs below.');
    expect(withoutFrontmatter('No frontmatter here.')).toBe('No frontmatter here.');
  });

  it('draws the note\'s own statblock fence as "Shown beside", and every other fence as it is', () => {
    const text = 'Before\n```atlas-statblock\n```\nMiddle\n```js\nconst a = 1;\n```\nAfter';
    expect(withFenceStub(text)).toBe(`Before\n${FENCE_STUB}\nMiddle\n\`\`\`js\nconst a = 1;\n\`\`\`\nAfter`);
    // A longer fence closes only with as many marks.
    expect(withFenceStub('````atlas-statblock\n```\n````\nAfter')).toBe(`${FENCE_STUB}\nAfter`);
  });

  it('cuts a long note at the next block boundary and says it goes on', () => {
    const long = `${'a'.repeat(40)}\n\n${'b'.repeat(40)}`;
    expect(capped(long, 30)).toBe(`${'a'.repeat(40)}\n\n*${READ_ON_TEXT}*`);
    expect(capped('short', 30)).toBe('short');
  });

  it('puts the three together', () => {
    expect(notePreviewText('---\na: 1\n---\n# Lair\n```atlas-statblock\n```')).toBe(`# Lair\n${FENCE_STUB}`);
  });
});

describe('Show with', () => {
  it('shows the statblock it was opened from or chose, Sample or Empty as chosen, else the newest statblock, else Sample', () => {
    expect(showWithOf('Bestiary/Aboleth.md', null, 'Bestiary/Hag.md')).toEqual({ kind: 'note', path: 'Bestiary/Aboleth.md' });
    expect(showWithOf(null, 'empty', 'Bestiary/Hag.md')).toEqual(SHOW_EMPTY);
    expect(showWithOf(null, 'sample', 'Bestiary/Hag.md')).toEqual(SHOW_SAMPLE);
    expect(showWithOf(null, null, 'Bestiary/Hag.md')).toEqual({ kind: 'note', path: 'Bestiary/Hag.md' });
    expect(showWithOf(null, null, null)).toEqual(SHOW_SAMPLE);
  });

  it('saves a choice so that it comes back, and orders statblocks by their last change', () => {
    for (const choice of [SHOW_SAMPLE, SHOW_EMPTY, { kind: 'note' as const, path: 'A.md' }]) {
      const { previewPath, previewMode } = showWithState(choice);
      expect(sameShowWith(showWithOf(previewPath, previewMode, 'Other.md'), choice)).toBe(true);
    }
    const mtimes: Record<string, number> = { 'A.md': 1, 'B.md': 3, 'C.md': 2 };
    expect(newestFirst(['A.md', 'B.md', 'C.md', 'Gone.md'], (path) => mtimes[path] ?? null)).toEqual(['B.md', 'C.md', 'A.md']);
  });
});
