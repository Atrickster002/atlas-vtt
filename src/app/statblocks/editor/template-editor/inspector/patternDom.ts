/**
 * The pattern editor's editable line (§5.6, §7.4), built and read without
 * React: text nodes hold the pattern's text runs, and each value is a chip
 * the caret steps over as one character. Nodes are made with the document of
 * the element they go into, so the line works in a popout window too.
 */

import { patternPieces, type ChipLook } from './patternPieces';

const SOURCE = 'data-source';

/** The pattern a line shows: its text and its chips' values, in order. */
export function readPatternLine(root: Node): string {
  let pattern = '';
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) pattern += node.textContent ?? '';
    else if (node.instanceOf(HTMLElement) && node.hasAttribute(SOURCE)) pattern += node.getAttribute(SOURCE) ?? '';
    // A browser wraps or breaks typed text now and then; what it holds is still text.
    else if (node.nodeName !== 'BR') pattern += readPatternLine(node);
  });
  return pattern;
}

/** How many chips the line holds. */
export function chipsIn(root: HTMLElement): number {
  return root.querySelectorAll(`[${SOURCE}]`).length;
}

/** A chip for `source`, made at the end of `parent`; the caller moves it into place. */
function makeChip(parent: HTMLElement, source: string, look: ChipLook): HTMLElement {
  return parent.createSpan({
    cls: look.problem ? 'atlas-te-chip atlas-te-chip--problem' : 'atlas-te-chip',
    text: look.label,
    attr: { contenteditable: 'false', [SOURCE]: source },
  });
}

/** Fills the line with the pattern: its text runs as text, its values as chips. */
export function buildPatternLine(root: HTMLElement, pattern: string, lookOf: (source: string) => ChipLook): void {
  root.empty();
  for (const piece of patternPieces(pattern)) {
    if (piece.kind === 'text') root.appendText(piece.text);
    else makeChip(root, piece.source, lookOf(piece.source));
  }
}

function selectionOf(root: HTMLElement): Selection | null {
  return root.win.getSelection();
}

/** Puts the caret after the line's last character. */
export function caretToEnd(root: HTMLElement): void {
  const selection = selectionOf(root);
  if (!selection) return;
  const range = root.doc.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The text node the caret stands in and its offset there, when it stands in one inside the line. */
export function caretInText(root: HTMLElement): { node: Text; offset: number } | null {
  const selection = selectionOf(root);
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  return { node: node as Text, offset: selection.anchorOffset };
}

/** Replaces `from`–`to` of a text node with a chip for `source` and puts the caret right after it. */
export function chipInPlace(root: HTMLElement, node: Text, from: number, to: number, source: string, look: ChipLook): void {
  const range = root.doc.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  range.deleteContents();
  const chip = makeChip(root, source, look);
  range.insertNode(chip);
  const after = root.doc.createRange();
  after.setStartAfter(chip);
  after.collapse(true);
  const selection = selectionOf(root);
  selection?.removeAllRanges();
  selection?.addRange(after);
}

/** Puts plain text where the caret is, in place of what is selected. */
export function insertPlainText(root: HTMLElement, text: string): void {
  const selection = selectionOf(root);
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || !root.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = root.doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
