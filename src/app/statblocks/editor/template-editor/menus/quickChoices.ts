/**
 * A block menu's quick choices (spec §5.3): the one-click versions of the
 * settings that change a block's look most, each a submenu of choices with a
 * tick on the one in use. Each choice is one session step; "Show text…"
 * also opens Settings at the text it shows.
 */

import { fieldByKey } from '../../../model/fieldKeys';
import type { BlockType, TemplateBlock } from '../../../model/templateTypes';
import type { SurfaceAction } from '../../interaction/surfaceActions';
import { editBlock } from '../inspector/blockEdits';
import { TAG_LOOK_OPTIONS } from '../inspector/lookControls';
import type { EditorSession } from '../sessionTypes';

interface Choice<V extends string> {
  value: V;
  label: string;
}

function choices<V extends string>(
  id: string, label: string, icon: string, current: V, options: ReadonlyArray<Choice<V>>, pick: (value: V) => void,
): SurfaceAction {
  return {
    kind: 'submenu',
    id,
    label,
    icon,
    children: options.map((option) => ({
      kind: 'item', id: `${id}-${option.value}`, label: option.label, checked: option.value === current, run: () => pick(option.value),
    })),
  };
}

/** Blocks that hide while their property is empty, and may show a text instead. */
const SHOWS_WHEN_EMPTY: ReadonlySet<BlockType> = new Set(['stat', 'tags', 'text', 'pairs', 'spells', 'line', 'entries', 'track', 'scores']);

/** "If empty ▸ Hide · Show text…": a fallback text, written in Settings. */
function ifEmpty(session: EditorSession, block: TemplateBlock, openSettings: (() => void) | undefined): SurfaceAction {
  return choices('if-empty', 'If empty', 'eye-off', block.whenEmpty === 'fallback' ? 'fallback' : 'hide', [
    { value: 'hide', label: 'Hide' }, { value: 'fallback', label: 'Show text…' },
  ], (value) => {
    editBlock(session, block.id, block.type, value === 'hide'
      ? { whenEmpty: undefined }
      : { whenEmpty: 'fallback', fallback: block.fallback?.trim() ? block.fallback : '—' });
    if (value === 'fallback') openSettings?.();
  });
}

const SEPARATORS: ReadonlyArray<Choice<string>> = [
  { value: ', ', label: 'Comma' }, { value: ' · ', label: 'Dot' }, { value: ' ', label: 'Space' },
];

/** The quick choices of a block, most used first; at most two. */
export function quickChoices(session: EditorSession, block: TemplateBlock, openSettings?: () => void): SurfaceAction[] {
  const id = block.id;
  const empty = SHOWS_WHEN_EMPTY.has(block.type) ? [ifEmpty(session, block, openSettings)] : [];
  switch (block.type) {
    case 'section':
      return [choices('folds', 'Folds', 'chevrons-down-up', block.collapsible ?? 'no', [
        { value: 'no', label: 'No' }, { value: 'open', label: 'Starts open' }, { value: 'closed', label: 'Starts closed' },
      ], (fold) => editBlock(session, id, 'section', { collapsible: fold === 'no' ? undefined : fold }))];
    case 'row':
      return [choices('align', 'Align', 'align-horizontal-justify-start', block.align ?? 'start', [
        { value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'spread', label: 'Spread' },
      ], (align) => editBlock(session, id, 'row', { align: align === 'start' ? undefined : align }))];
    case 'title':
      return [choices('size', 'Size', 'type', String(block.level) as '1' | '2' | '3', [
        { value: '1', label: 'Large' }, { value: '2', label: 'Medium' }, { value: '3', label: 'Small' },
      ], (level) => editBlock(session, id, 'title', { level: Number(level) as 1 | 2 | 3 }))];
    case 'line':
      return [choices('separator', 'Between values', 'ellipsis', block.separator ?? ', ', SEPARATORS,
        (separator) => editBlock(session, id, 'line', { separator: separator === ', ' ? undefined : separator })), ...empty];
    case 'stat':
      return [choices('style', 'Style', 'paintbrush', block.look, [
        { value: 'run-in', label: 'Label first' }, { value: 'stacked', label: 'Label above' },
      ], (look) => editBlock(session, id, 'stat', { look })), ...empty];
    case 'scores':
      return [choices('layout', 'Layout', 'table', block.orientation, [
        { value: 'row', label: 'Labels on top' }, { value: 'table', label: 'Labels at the side' },
      ], (orientation) => editBlock(session, id, 'scores', { orientation })), ...empty];
    case 'tags':
      return [choices('style', 'Style', 'paintbrush', block.look, TAG_LOOK_OPTIONS, (look) => editBlock(session, id, 'tags', { look })), ...empty];
    case 'text':
      return empty;
    case 'entries':
      return [choices('names', 'Names', 'text-cursor', block.nameStyle ?? 'run-in', [
        { value: 'run-in', label: 'Run-in' }, { value: 'heading', label: 'As headings' },
      ], (nameStyle) => editBlock(session, id, 'entries', { nameStyle: nameStyle === 'run-in' ? undefined : nameStyle })), ...empty];
    case 'pairs':
      return [choices('numbers', 'Numbers', 'hash', block.display ?? 'plain', [
        { value: 'plain', label: '3' }, { value: 'signed', label: '+3' },
      ], (display) => editBlock(session, id, 'pairs', { display: display === 'plain' ? undefined : display })), ...empty];
    case 'track':
      return [
        choices('style', 'Style', 'paintbrush', block.look, [{ value: 'boxes', label: 'Boxes' }, { value: 'gauge', label: 'Gauge' }],
          (look) => editBlock(session, id, 'track', { look })),
        choices('counts', 'Counts', 'arrow-down-up', block.counts, [{ value: 'down', label: 'Down' }, { value: 'up', label: 'Up' }],
          (counts) => editBlock(session, id, 'track', { counts })),
      ];
    case 'image':
      return [choices('shape', 'Shape', 'circle', block.shape, [{ value: 'token', label: 'Token' }, { value: 'portrait', label: 'Portrait' }],
        (shape) => editBlock(session, id, 'image', { shape }))];
    case 'spells': {
      const named = fieldByKey(session.getSnapshot().template.fields, block.field)?.label.trim();
      return [choices('heading', 'Heading', 'heading', block.heading?.trim() ? 'shown' : 'none', [
        { value: 'shown', label: 'Shown' }, { value: 'none', label: 'None' },
      ], (shown) => editBlock(session, id, 'spells', { heading: shown === 'none' ? undefined : block.heading?.trim() || named || 'Heading' })), ...empty];
    }
    case 'heading':
      return [choices('size', 'Size', 'type', block.level, [{ value: 'section', label: 'Section' }, { value: 'minor', label: 'Minor' }],
        (level) => editBlock(session, id, 'heading', { level }))];
    default:
      return [];
  }
}
