/**
 * Whether a block shows, and with what: its own values, its fallback, or (in
 * the editing mode) a prompt where its empty fields would be.
 */

import { blockVisibility, evaluateCondition } from '../expressions/conditions';
import { patternRefs } from '../expressions/patternRefs';
import { blockSpec } from '../model/blockCatalogue';
import { boundField, fieldsShownBy } from '../model/treeQueries';
import { isContainerBlock, type ContainerBlock, type FieldKey, type TemplateBlock } from '../model/templateTypes';
import type { SheetState } from './sheetState';
import { blockText, isPatternBlock } from './values/blockText';
import { hasText, shownPattern, type ShownText } from './values/shownText';

export type BlockDisplay =
  /** The block's own values; `text` is what a Title, Line or Stat writes. */
  | { state: 'value'; text?: ShownText }
  /** Its fields are empty: its fallback pattern shows in their place. */
  | { state: 'fallback'; text: ShownText }
  /** Editing: its fields are empty, and a prompt stands where they would show. */
  | { state: 'prompt'; prompt: string };

/** What stands in for a block's values: its fallback or a prompt. */
export type StandInDisplay = Exclude<BlockDisplay, { state: 'value' }>;

const VALUE: BlockDisplay = { state: 'value' };

/**
 * The fields whose emptiness hides a block: the ones it is bound to and the
 * ones its own pattern reads. Its fallback's fields do not count, or a derived
 * fallback (5E 2024's initiative from Dexterity) would never show.
 */
export function visibilityFields(block: TemplateBlock): FieldKey[] {
  return fieldsShownBy(block, (pattern) => (pattern === block.fallback ? [] : patternRefs(pattern)));
}

/** "Damage Immunities" -> "damage immunities"; acronyms such as HP or CR keep their capitals. */
function inPrompt(label: string): string {
  return label.split(/(\s+)/).map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase())).join('');
}

/** What the editing mode shows for an empty block: its field's prompt, else "Add <label>" ("Add speed"). */
function promptFor(block: TemplateBlock, sheet: SheetState): string {
  const key = boundField(block);
  const field = key ? sheet.fields.get(key) : undefined;
  const own = field?.prompt?.trim() || (block.type === 'entries' ? block.addLabel?.trim() : undefined);
  if (own) return own;
  const label = field?.label?.trim();
  return label ? `Add ${inPrompt(label)}` : blockSpec(block.type).label;
}

/** A block whose fields are empty: its fallback where it has one that says something, else a prompt or nothing. */
function emptyDisplay(block: TemplateBlock, sheet: SheetState): BlockDisplay | null {
  if (block.whenEmpty === 'fallback' && block.fallback?.trim()) {
    const text = shownPattern(block.fallback, sheet);
    if (hasText(text) || text.problems.length > 0) return { state: 'fallback', text };
  }
  return sheet.mode === 'editing' ? { state: 'prompt', prompt: promptFor(block, sheet) } : null;
}

/** A block that binds a field but is not bound yet (the editor's new block). */
function isUnbound(block: TemplateBlock): boolean {
  if (block.type === 'text') return !block.field && !block.text?.trim();
  return blockSpec(block.type).binds.length > 0 && !boundField(block);
}

function tokenHolds(block: TemplateBlock, sheet: SheetState): boolean {
  if (block.type === 'image') return Boolean(sheet.token?.art);
  if (block.type === 'track') return Boolean(block.resource && sheet.token?.resources?.[block.resource]);
  return false;
}

function containerShows(block: ContainerBlock, sheet: SheetState): boolean {
  return sheet.mode === 'editing' || block.blocks.some((child) => blockDisplay(child, sheet) !== null);
}

function decide(block: TemplateBlock, sheet: SheetState): BlockDisplay | null {
  if (block.type === 'opaque' || sheet.folded.has(block.id)) return null;
  if (block.showWhen && !evaluateCondition(block.showWhen, sheet.reader)) return null;
  if (isContainerBlock(block)) return containerShows(block, sheet) ? VALUE : null;
  if (block.type === 'script' || block.type === 'divider') return VALUE;
  if (block.type === 'heading') return block.text.trim() || sheet.mode === 'editing' ? VALUE : null;
  if (isUnbound(block)) return sheet.mode === 'editing' ? { state: 'prompt', prompt: promptFor(block, sheet) } : null;
  if (tokenHolds(block, sheet)) return VALUE;
  if (block.type === 'text' && !block.field) return VALUE;

  if (blockVisibility(block, sheet.reader, visibilityFields(block)) !== 'show') return emptyDisplay(block, sheet);
  if (!isPatternBlock(block)) return VALUE;

  const text = blockText(block, sheet);
  if (hasText(text)) return { state: 'value', text };
  return emptyDisplay(block, sheet) ?? (text.problems.length > 0 ? { state: 'value', text } : null);
}

/** Answers for one sheet state, so a container asking about its children and the children rendering agree for free. */
const decided = new WeakMap<SheetState, WeakMap<TemplateBlock, BlockDisplay | null>>();

/** How a block shows for the statblock, or null when it does not. Never throws. */
export function blockDisplay(block: TemplateBlock, sheet: SheetState): BlockDisplay | null {
  let answers = decided.get(sheet);
  if (!answers) {
    answers = new WeakMap();
    decided.set(sheet, answers);
  }
  if (answers.has(block)) return answers.get(block) ?? null;
  const display = decide(block, sheet);
  answers.set(block, display);
  return display;
}
