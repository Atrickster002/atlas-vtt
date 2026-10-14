import { TFile, type App } from 'obsidian';
import { bookLine, MAX_FOUND_TITLE, type FoundNote, type QuestImage } from '../../protocol/index.ts';
import { questBody, withoutComments } from '../../../campaigns/quests/questText';
import type { QuestImages } from '../../../plugin/questImages';
import { headingSection } from '../../../services/noteHeadings';
import { pinNoteLink } from '../../../tools/pinNoteLink';
import { questTextParts, type QuestTextAsset } from '../book/questTexts.ts';

/** What players read of a pin's note: the note's file, a title, and its text as Markdown. */
export interface NoteReading {
  readonly path: string;
  readonly title: string;
  readonly body: string;
}

/** A found note as players are sent it, and what its assets are served from: the whole text's bytes, the images' vault paths by hash. */
export interface FoundHandout {
  readonly note: FoundNote;
  readonly text: QuestTextAsset | null;
  readonly images: ReadonlyMap<string, string>;
}

/** The note a pin's link names, from the map it is on: a path as written, else as Obsidian resolves the link; only Markdown. */
export function noteFile(app: App, linkpath: string, mapPath: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(linkpath) ?? app.metadataCache.getFirstLinkpathDest(linkpath, mapPath);
  return file instanceof TFile && file.extension === 'md' ? file : null;
}

/**
 * What players read of the note a pin links (`notePath`, from the map `mapPath`): the whole note
 * without its frontmatter, or, for `note#heading`, only that heading's section (to the next heading
 * of its level or higher, as Obsidian resolves the link), without the heading's own line, which is
 * the title. The GM's comments (`%% %%`, `<!-- -->`) are left out. Null where the note or its
 * heading is gone or is no Markdown.
 */
export async function readPinNote(app: App, notePath: string, mapPath: string): Promise<NoteReading | null> {
  const { linkpath, heading } = pinNoteLink(notePath);
  const file = noteFile(app, linkpath, mapPath);
  if (file === null) return null;
  const content = await app.vault.cachedRead(file);
  if (heading === null) return { path: file.path, title: file.basename, body: questBody(content) };
  const cache = app.metadataCache.getFileCache(file);
  const section = cache === null ? null : headingSection(cache, heading);
  if (section === null) return null;
  return { path: file.path, title: section.heading, body: withoutComments(content.slice(section.start, section.end ?? content.length)) };
}

/** A title as players are sent it: one line, cut with an ellipsis where it is longer than a title may be. */
function shownTitle(title: string): string {
  const characters = [...title.replace(/\s+/g, ' ').trim()];
  const cut = characters.length <= MAX_FOUND_TITLE ? characters.join('') : `${characters.slice(0, MAX_FOUND_TITLE - 1).join('')}…`;
  return bookLine(cut, MAX_FOUND_TITLE) ?? '…';
}

/**
 * A reading as players are sent it, as a quest's text is (`questTextParts`): its opening, the whole
 * text by hash where the opening is not all of it, and the vault images its text embeds, each read
 * from its bytes (`QuestImages`).
 */
export async function foundHandout(reading: NoteReading, images: QuestImages): Promise<FoundHandout> {
  const parts = await questTextParts(reading.body);
  const resolved = images.resolve(reading.path, parts.embeds);
  const refs = await Promise.all(resolved.map((embed) => images.refOf(embed.file)));
  const shown: QuestImage[] = [];
  const paths = new Map<string, string>();
  resolved.forEach(({ target, width, height, file }, index) => {
    const image = refs[index];
    if (image === null || image === undefined) return;
    shown.push({ target, width, height, image });
    paths.set(image.hash, file.path);
  });
  const note: FoundNote = {
    title: shownTitle(reading.title), body: parts.opening,
    ...(parts.whole !== null && { text: parts.whole.ref }),
    ...(shown.length > 0 && { images: shown }),
  };
  return { note, text: parts.whole, images: paths };
}
