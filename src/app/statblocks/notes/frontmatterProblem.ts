/**
 * Why Atlas may not change a note's properties: the reasons `applyFrontmatterPatches` refuses a
 * note, in words the statblock pane shows. Pure.
 */

import { isMap, parseDocument } from 'yaml';
import { frontmatterBounds, readersAgree } from './frontmatterBounds';
import { readFrontmatterDoc } from './yamlDocument';

export interface NoteProblem {
  /** The note's line (1-based) the problem is on, where it can be told. */
  line: number | null;
  message: string;
}

/** What keeps Atlas from writing the note's properties, or null when nothing does. */
export function frontmatterProblem(text: string): NoteProblem | null {
  const bounds = frontmatterBounds(text);
  if (!readersAgree(text, bounds)) {
    return {
      line: closingLine(text),
      message: 'Obsidian reads the end of this note\'s properties in two ways. Make the line that closes them exactly ---.',
    };
  }
  if (!bounds.exists) return null;

  const yaml = text.slice(bounds.from, bounds.to);
  if (readFrontmatterDoc(yaml)) return null;
  const doc = parseDocument(yaml);
  const error = doc.errors[0];
  if (error) {
    // An error found at the end of the text (an unclosed list) is on the last line of the YAML.
    const at = error.linePos?.[0].line;
    const lastLine = Math.max(1, yaml.split('\n').length - (yaml.endsWith('\n') ? 1 : 0));
    const line = at === undefined ? null : lineOf(text, bounds.from) + Math.min(at, lastLine) - 1;
    return { line, message: line === null ? 'The note\'s properties have a YAML error.' : `The note's properties have a YAML error on line ${line}.` };
  }
  if (doc.contents !== null && !(isMap(doc.contents) && doc.contents.srcToken?.type === 'block-map')) {
    return { line: lineOf(text, bounds.from), message: 'The note\'s properties are not written as one key per line.' };
  }
  return { line: null, message: 'Atlas can\'t change these properties safely.' };
}

/** The line (1-based) an offset of the text lies on. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let index = text.indexOf('\n'); index !== -1 && index < offset; index = text.indexOf('\n', index + 1)) line++;
  return line;
}

/** The first line after the opening one that starts with `---`: where the metadata cache ends the properties. */
function closingLine(text: string): number | null {
  const lines = text.split(/\r\n|\r|\n/);
  const index = lines.findIndex((line, at) => at > 0 && line.startsWith('---'));
  return index === -1 ? null : index + 1;
}
