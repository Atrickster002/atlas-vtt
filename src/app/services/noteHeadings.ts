import { EditorView } from '@codemirror/view';
import { resolveSubpath, type App, type CachedMetadata, type HeadingCache, type TFile } from 'obsidian';

/** Heading lines of the editor, in source mode and live preview. */
const EDITOR_HEADING_SELECTOR = '.cm-line.HyperMD-header';
/** Headings of reading view and rendered markdown. */
const RENDERED_HEADING_SELECTOR = '[data-heading]';

/**
 * The line `heading` starts on in `file`; null when the note lacks it. Pins
 * store the heading as the metadata cache does, so it is looked up exactly:
 * `resolveSubpath` reads every `#` as a nested heading and would miss
 * "Room #3". It still resolves links written by hand, such as `Keep#Cellar`.
 */
export function headingLine(app: App, file: TFile, heading: string): number | null {
  const cache = app.metadataCache.getFileCache(file);
  return cache ? headingIndex(cache, heading)?.position.start.line ?? null : null;
}

/** The cached heading a pin's `heading` names: exactly as the cache stores it, else as `resolveSubpath` reads a link. */
function headingIndex(cache: CachedMetadata, heading: string): HeadingCache | undefined {
  const headings = cache.headings ?? [];
  const exact = headings.find((cached) => cached.heading === heading);
  const line = exact?.position.start.line ?? resolveSubpath(cache, `#${heading}`)?.start.line;
  return headings.find((cached) => cached.position.start.line === line);
}

/** A heading's section as offsets into its note: from the end of the heading's line to the next heading of its level or higher (null: the note's end). */
export interface HeadingSection {
  readonly heading: string;
  readonly start: number;
  readonly end: number | null;
}

/** The section `heading` opens in a note, as Obsidian resolves a link to it; null when the note lacks it. */
export function headingSection(cache: CachedMetadata, heading: string): HeadingSection | null {
  const found = headingIndex(cache, heading);
  if (found === undefined) return null;
  const headings = cache.headings ?? [];
  const next = headings.slice(headings.indexOf(found) + 1).find((cached) => cached.level <= found.level);
  return { heading: found.heading, start: found.position.end.offset, end: next?.position.start.offset ?? null };
}

/**
 * The editor's heading line on `line` (0-based, as the metadata cache counts).
 * Found by its place in the document, since the drawn text differs from the
 * heading's source once live preview renders links and formatting. Null while
 * the editor has not drawn it: it only draws the lines near the screen.
 */
export function findEditorHeading(container: HTMLElement, line: number): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>(EDITOR_HEADING_SELECTOR))
    .find((element) => editorLineOf(element) === line) ?? null;
}

/**
 * The rendered heading called `heading` nearest the top of `container`: a note
 * may repeat a heading, and the one scrolled to is the one at the top.
 * `data-heading` holds the heading's source text, exactly as the metadata cache
 * stores it. Null while it is not drawn.
 */
export function findRenderedHeading(container: HTMLElement, heading: string): HTMLElement | null {
  const top = container.getBoundingClientRect().top;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(RENDERED_HEADING_SELECTOR))) {
    if (element.dataset.heading !== heading) continue;
    const distance = Math.abs(element.getBoundingClientRect().top - top);
    if (distance < nearestDistance) {
      nearest = element;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function editorLineOf(element: HTMLElement): number | null {
  const editor = EditorView.findFromDOM(element);
  if (!editor) return null;
  return editor.state.doc.lineAt(editor.posAtDOM(element)).number - 1;
}
