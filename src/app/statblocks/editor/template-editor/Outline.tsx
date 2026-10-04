import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CornerDownLeft, EyeOff, SquareFunction } from 'lucide-react';
import { Platform } from 'obsidian';
import { blockSpec } from '../../model/blockCatalogue';
import type { TemplateBlock } from '../../model/templateTypes';
import { blockName } from './blockNames';
import { useTemplateEditor } from './editorContext';
import { blockGlyph } from './editorGlyphs';
import { settingBadges, type SettingBadge } from './inspector/groupSummaries';
import type { ChromeStyle } from './LabelEditor';
import { keyCommand, type KeyCommand } from './keyCommands';
import { containersAround, outlineRows, outlineStep, type OutlineMove, type OutlineRow } from './outlineRows';
import { primaryOf, withSibling } from './selection';
import { useFocusKeptInOutline } from './useFocusKeptInOutline';

/** The tree's own keys (the WAI-ARIA tree pattern); every other block key goes on to the editor. */
const MOVES: Readonly<Record<string, OutlineMove>> = {
  ArrowUp: 'previous', ArrowDown: 'next', Home: 'first', End: 'last',
};

/** The editor's commands that select a block and focus it in the canvas; after them focus comes back here. */
const SELECTING: ReadonlySet<KeyCommand> = new Set<KeyCommand>([
  'move-up', 'move-down', 'move-in', 'move-out', 'duplicate', 'delete', 'group', 'ungroup', 'side-by-side', 'paste', 'escape',
]);

function rowSelector(id: string): string {
  return `[data-outline-id="${id.replace(/["\\]/g, '\\$&')}"]`;
}

/**
 * The Outline tab (§7.4): every block as a row of a `role="tree"`, with its
 * glyph and name, nested as the template nests them; containers fold. It
 * shares the selection and the block keys with the canvas (Delete, Mod+D,
 * Alt+arrows, `/`, Enter for the label), so it is the keyboard's way
 * through deep nesting: the arrows walk the rows and focus stays here.
 */
export function Outline(): React.JSX.Element {
  const { snapshot, selection, select } = useTemplateEditor();
  const { layout, fields } = snapshot.template;
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const primary = primaryOf(selection);
  const rows = useMemo(() => outlineRows(layout.blocks, folded), [layout.blocks, folded]);
  const focusable = rows.some((row) => row.block.id === primary) ? primary : rows[0]?.block.id ?? null;
  const keep = useFocusKeptInOutline(wrapperRef, rowSelector);

  // A block selected elsewhere inside a folded container unfolds it, so its row shows.
  useEffect(() => {
    if (primary === null) return;
    const around = containersAround(layout.blocks, primary);
    if (around.some((id) => folded.has(id))) setFolded((was) => new Set([...was].filter((id) => !around.includes(id))));
  }, [primary, layout.blocks, folded]);

  useEffect(() => {
    if (primary) wrapperRef.current?.querySelector(rowSelector(primary))?.scrollIntoView({ block: 'nearest' });
  }, [primary]);

  const go = (id: string | null): void => {
    if (id === null) return;
    select([id], false);
    wrapperRef.current?.querySelector<HTMLElement>(rowSelector(id))?.focus();
  };

  const fold = (id: string, open: boolean): void => {
    // Folding away the selected block selects the container instead, whose row stays.
    if (!open && primary !== null && containersAround(layout.blocks, primary).includes(id)) select([id], false);
    setFolded((was) => {
      const next = new Set(was);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    // The row focus is on, which the selection follows.
    const focused = event.currentTarget.doc.activeElement?.closest('[data-outline-id]')?.getAttribute('data-outline-id') ?? null;
    const at = focused ?? primary;
    const row = rows.find((candidate) => candidate.block.id === at) ?? null;
    const move = MOVES[event.key];
    if (plain && move) go(outlineStep(rows, at, move));
    else if (plain && event.key === 'ArrowRight' && row?.expanded === false) fold(row.block.id, true);
    else if (plain && event.key === 'ArrowRight') go(outlineStep(rows, at, 'first-child'));
    else if (plain && event.key === 'ArrowLeft' && row?.expanded === true) fold(row.block.id, false);
    else if (plain && event.key === 'ArrowLeft') go(outlineStep(rows, at, 'parent'));
    else if (plain && event.key === ' ' && row) select([row.block.id], false);
    else {
      // The editor takes the rest (Delete, Mod+D, Alt+arrows, Escape…); the row it selects keeps focus here.
      const command = keyCommand(event.nativeEvent, Platform.isMacOS);
      if (command && SELECTING.has(command)) keep();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div ref={wrapperRef} className="atlas-te-outline-wrap">
      {rows.length === 0 ? <p className="atlas-te-outline__empty">Blocks appear here as you add them.</p> : (
        <div className="atlas-te-outline" role="tree" aria-label="Blocks" aria-multiselectable="true" data-te-blocks="" onKeyDown={onKeyDown}>
          {rows.map((row) => (
            <OutlineItem
              key={row.block.id}
              row={row}
              name={blockName(row.block, fields)}
              selected={selection.includes(row.block.id)}
              focusable={row.block.id === focusable}
              onSelect={(extend) => select(extend ? withSibling(layout, selection, row.block.id) : [row.block.id], false)}
              onFold={(open) => fold(row.block.id, open)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const BADGES: Readonly<Record<SettingBadge, { Glyph: typeof EyeOff; words: string }>> = {
  condition: { Glyph: EyeOff, words: 'Shown only when another property says so' },
  'write-as': { Glyph: SquareFunction, words: 'Writes its value its own way' },
  fallback: { Glyph: CornerDownLeft, words: 'Shows a text when empty' },
};

/** The settings past the basics a block uses, as small glyphs at the row's end, so conditional and worked-out blocks show in the tree. */
function SettingBadges({ block }: { block: TemplateBlock }): React.JSX.Element | null {
  const badges = settingBadges(block);
  if (badges.length === 0) return null;
  return (
    <span className="atlas-te-outline__badges" aria-label={badges.map((badge) => BADGES[badge].words).join(', ')}>
      {badges.map((badge) => {
        const { Glyph } = BADGES[badge];
        return <Glyph key={badge} className="atlas-te-outline__badge" aria-hidden="true" />;
      })}
    </span>
  );
}

interface OutlineItemProps {
  row: OutlineRow;
  name: string;
  selected: boolean;
  focusable: boolean;
  onSelect: (extend: boolean) => void;
  onFold: (open: boolean) => void;
}

function OutlineItem({ row, name, selected, focusable, onSelect, onFold }: OutlineItemProps): React.JSX.Element {
  const Glyph = blockGlyph(row.block.type);
  const type = blockSpec(row.block.type).label;
  const style: React.CSSProperties & ChromeStyle = { '--atlas-te-outline-level': String(row.level - 1) };
  return (
    <div
      role="treeitem"
      className="atlas-te-outline__row"
      style={style}
      data-outline-id={row.block.id}
      aria-level={row.level}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-selected={selected}
      aria-expanded={row.expanded ?? undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={(event) => onSelect(event.shiftKey)}
    >
      {row.expanded === null ? <span className="atlas-te-outline__spacer" /> : (
        <span
          className="atlas-te-outline__fold"
          data-open={row.expanded || undefined}
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation();
            onFold(!row.expanded);
          }}
        >
          <ChevronRight />
        </span>
      )}
      <Glyph className="atlas-te-outline__glyph" aria-hidden="true" />
      <span className="atlas-te-outline__name">{name}</span>
      {name !== type && <span className="atlas-te-outline__type">{type}</span>}
      <SettingBadges block={row.block} />
    </div>
  );
}
