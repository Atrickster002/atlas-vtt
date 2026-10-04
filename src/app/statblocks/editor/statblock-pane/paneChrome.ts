import type { KeyboardEvent, MouseEvent } from 'react';
import type { TemplateBlock } from '../../model/templateTypes';
import type { BlockChrome, BlockDecoration } from '../../render/blockChrome';
import type { EditableSpots } from './editableSpots';
import type { EditTarget } from './paneEditContext';

/** Clicks on these keep their own meaning: a link opens, a die rolls, a section folds. */
const OWN_CLICKS = 'a, button, input, textarea, .atlas-dice-link, .internal-link';

function clickedInside(target: EventTarget | null, selector: string): Element | null {
  const node = target as { closest?: (selector: string) => Element | null } | null;
  return typeof node?.closest === 'function' ? node.closest(selector) : null;
}

/** The ordinal of the entry clicked in an Entries block, as it shows; undefined outside an entry. */
function clickedEntry(event: MouseEvent<HTMLDivElement>): number | undefined {
  const drawn = '.atlas-sb-trait:not(.atlas-sb-pane-entry-editor--new)';
  const entry = clickedInside(event.target, drawn);
  if (!entry) return undefined;
  const index = [...event.currentTarget.querySelectorAll(drawn)].indexOf(entry);
  return index < 0 ? undefined : index;
}

/**
 * How the pane dresses the card's blocks (§7.6): a block with values to edit
 * is a button that starts editing its first field, with a hover wash that
 * changes no box. The block being edited carries only a class.
 */
export function paneChrome(
  spots: EditableSpots,
  editing: EditTarget | null,
  writable: boolean,
  start: (target: EditTarget) => void,
): BlockChrome {
  return {
    decorate(block: TemplateBlock): BlockDecoration | null {
      const [first, ...rest] = spots.byBlock.get(block.id) ?? [];
      if (!first || !writable) return null;
      const begin = (entry?: number): void => start({ blockId: block.id, field: first.key, entry });
      if (editing?.blockId === block.id) {
        // A list of abilities stays drawn while one is typed: a click on another one types that one.
        if (block.type !== 'entries') return { className: 'atlas-sb-pane-editing' };
        return {
          className: 'atlas-sb-pane-editing atlas-sb-pane-editing--list',
          handlers: {
            onClick: (event: MouseEvent<HTMLDivElement>) => {
              if (clickedInside(event.target, `${OWN_CLICKS}, .atlas-sb-pane-entry-editor`)) return;
              const entry = clickedEntry(event);
              if (entry !== undefined) begin(entry);
            },
          },
        };
      }
      return {
        className: 'atlas-sb-pane-value',
        tabIndex: 0,
        role: 'button',
        attributes: { 'aria-label': `Edit ${[first, ...rest].map((field) => field.label).join(', ')}` },
        handlers: {
          onClick: (event: MouseEvent<HTMLDivElement>) => {
            if (clickedInside(event.target, OWN_CLICKS)) return;
            begin(clickedEntry(event));
          },
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            begin();
          },
        },
      };
    },
  };
}
