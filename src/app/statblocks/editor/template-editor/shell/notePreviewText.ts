/**
 * The Markdown the template editor renders beside its card (§2.2): a note's
 * body as the note view shows it, without its frontmatter, its own statblock
 * fence standing in as "Shown beside", and cut short where a long note would
 * cost the editor a frame. Pure.
 */

import { STATBLOCK_FENCE_LANGUAGE } from '../../../notes/statblockSource';

/** A note longer than this is cut at the next block boundary. */
export const PREVIEW_TEXT_LIMIT = 30_000;
export const READ_ON_TEXT = 'Open the note to read on.';
/** What the note view draws in place of the note's own statblock fence (note-statblock-panel.scss). */
export const FENCE_STUB = '<div class="atlas-te-fence-stub">Shown beside</div>';

/** Sample and Empty: a neutral note, never written to the vault. */
export const SAMPLE_NOTE_TITLE = 'Creature name';
export const SAMPLE_NOTE_BODY = 'Notes about this creature go here. The statblock beside it is what this template draws.';

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** The note's text after its frontmatter. */
export function withoutFrontmatter(text: string): string {
  return text.replace(FRONTMATTER, '');
}

/** Each fence in the language of the note's own statblock becomes the stub; other fences render as Obsidian renders them. */
export function withFenceStub(text: string, language: string = STATBLOCK_FENCE_LANGUAGE): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let fence: { marker: string; own: boolean } | null = null;
  for (const line of lines) {
    const open = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (!fence && open) {
      const own = open[2] === language;
      fence = { marker: open[1]!, own };
      out.push(own ? FENCE_STUB : line);
      continue;
    }
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      const closes = close !== undefined && close[0] === fence.marker[0] && close.length >= fence.marker.length;
      if (!fence.own) out.push(line);
      if (closes) fence = null;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Cut at the first blank line after `limit` characters, ending with a line that says the note goes on. */
export function capped(text: string, limit: number = PREVIEW_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  const boundary = text.indexOf('\n\n', limit);
  const cut = boundary === -1 ? limit : boundary;
  return `${text.slice(0, cut).trimEnd()}\n\n*${READ_ON_TEXT}*`;
}

/** The Markdown to render for a note's text. */
export function notePreviewText(text: string): string {
  return capped(withFenceStub(withoutFrontmatter(text)));
}
