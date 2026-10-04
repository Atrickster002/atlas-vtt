/**
 * The glyphs and plain names the template editor's side panes show for
 * blocks, field types and meanings. The catalogue names its icons as lucide
 * names; these are the components behind them.
 */

import {
  AlignLeft, CircleDot, CircleHelp, Code, Columns3, Dices, Gauge, Hash, Heading, Image, List, ListTree, Minus, PanelTop, ScrollText,
  SquareStack, Star, Subtitles, Table, Tags, Text, Type, type LucideIcon,
} from 'lucide-react';
import { blockSpec, type BlockIcon } from '../../model/blockCatalogue';
import type { BlockType, FieldMeaning, FieldType } from '../../model/templateTypes';

const BLOCK_GLYPHS: Readonly<Record<BlockIcon, LucideIcon>> = {
  heading: Heading, text: Text, hash: Hash, subtitles: Subtitles, list: List, table: Table, gauge: Gauge, image: Image,
  'square-stack': SquareStack, 'columns-3': Columns3, minus: Minus, code: Code, 'circle-help': CircleHelp, 'panel-top': PanelTop,
};

export function blockGlyph(type: BlockType): LucideIcon {
  return BLOCK_GLYPHS[blockSpec(type).icon];
}

/** What a field holds, in the words the editor uses. */
export const FIELD_TYPE_LABELS: Readonly<Record<FieldType, string>> = {
  text: 'Text', markdown: 'Paragraphs', number: 'Number', rating: 'Rating', dice: 'Dice', choice: 'One of a list',
  list: 'Words', scores: 'Table values', entries: 'Names and text', pairs: 'Labels and values', image: 'Picture',
  spells: 'Groups with items',
};

const FIELD_TYPE_GLYPHS: Readonly<Record<FieldType, LucideIcon>> = {
  text: Type, markdown: AlignLeft, number: Hash, rating: Star, dice: Dices, choice: CircleDot,
  list: Tags, scores: Table, entries: ScrollText, pairs: List, image: Image, spells: ListTree,
};

export function fieldTypeGlyph(type: FieldType): LucideIcon {
  return FIELD_TYPE_GLYPHS[type];
}

/** What Atlas uses a field for (`meaning`), as badges and the Advanced group's choices name it. */
export const MEANING_LABELS: Readonly<Record<FieldMeaning, string>> = {
  'hit-points': 'Hit points', armor: 'Armor', rating: 'Rating', size: 'Size', 'creature-type': 'Creature type',
  senses: 'Senses', initiative: 'Initiative', traits: 'Traits',
};
