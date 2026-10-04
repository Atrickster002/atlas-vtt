/**
 * Empty headed sections fold into chips under the card (spec §8.2): one pure
 * rule, used by the note panel and by every template-editor preview, so both
 * draw the same card. A Section, or an Abilities, Spells or Text block with a
 * heading, folds while every property it shows is empty, unless it has a
 * fallback, its condition fails (then it is not drawn at all, as at runtime),
 * it is the template's main list of abilities (the first that says what one
 * of it is called, "Add action", else the first: a new statblock keeps its
 * prompt), or it was unfolded on this card.
 */

import { evaluateCondition } from '../expressions/conditions';
import { patternRefs } from '../expressions/patternRefs';
import { fieldsShownBy, flattenReadingOrder } from '../model/treeQueries';
import { isContainerBlock, type StatblockTemplate, type TemplateBlock } from '../model/templateTypes';
import { isEmptyValue } from '../values/emptyValue';
import { readerFor, type FieldRecord, type ValueReader } from '../values/fieldValues';

/** A folded block: its id and the heading its chip shows. */
export interface FoldedBlock {
  blockId: string;
  heading: string;
}

/** The heading a block draws, or null for a block without one. */
export function foldHeading(block: TemplateBlock, labelOf: (key: string) => string | undefined): string | null {
  switch (block.type) {
    case 'section': return block.heading?.trim() || (block.headingField ? labelOf(block.headingField) ?? null : null);
    case 'entries': case 'spells': case 'text': return block.heading?.trim() || null;
    default: return null;
  }
}

/** Blocks that only arrange or decorate: they never hold a value, so they never keep a section open. */
function holdsValues(block: TemplateBlock): boolean {
  return !isContainerBlock(block) && block.type !== 'divider' && block.type !== 'heading' && block.type !== 'opaque';
}

/** Whether every property a block shows (a container: every block in it) is empty, and nothing in it falls back. */
function emptyThroughout(block: TemplateBlock, reader: ValueReader): boolean {
  const blocks = isContainerBlock(block) ? flattenReadingOrder(block.blocks).filter(holdsValues) : [block];
  if (blocks.some((each) => each.type === 'script' || (each.type === 'text' && !each.field))) return false;
  return blocks.every((each) => {
    if (each.whenEmpty === 'fallback' && each.fallback?.trim()) return false;
    return fieldsShownBy(each, (pattern) => (pattern === each.fallback ? [] : patternRefs(pattern))).every((key) => isEmptyValue(reader(key)));
  });
}

/**
 * The blocks that fold on a card of `template` with `record`, in reading
 * order. A folded Section folds with everything in it; blocks inside a
 * folded Section are not listed again. A tab's Section never folds: its tab
 * stays, and holds the prompts of what it shows.
 */
export function foldedBlocks(template: StatblockTemplate, record: FieldRecord, unfolded: ReadonlySet<string> = new Set()): FoldedBlock[] {
  const reader = readerFor(record, template.fields);
  const labels = new Map(template.fields.map((field) => [field.key, field.label]));
  const lists = flattenReadingOrder(template.layout.blocks).filter((block) => block.type === 'entries');
  const firstAbilities = (lists.find((block) => block.type === 'entries' && block.addLabel?.trim()) ?? lists[0])?.id;
  const folded: FoldedBlock[] = [];
  const visit = (blocks: readonly TemplateBlock[], tabs: boolean): void => {
    for (const block of blocks) {
      if (block.showWhen && !evaluateCondition(block.showWhen, reader)) continue;
      const heading = tabs ? null : foldHeading(block, (key) => labels.get(key));
      if (heading && block.id !== firstAbilities && !unfolded.has(block.id) && emptyThroughout(block, reader)) {
        folded.push({ blockId: block.id, heading });
        continue;
      }
      if (isContainerBlock(block)) visit(block.blocks, block.type === 'tabs');
    }
  };
  visit(template.layout.blocks, false);
  return folded;
}

/** The ids of the folded blocks, as the sheet takes them. */
export function foldedIds(folded: readonly FoldedBlock[]): ReadonlySet<string> {
  return new Set(folded.map((block) => block.blockId));
}
