import { useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { classes } from './classes.ts';
import type { ShownReaction } from './logAuthors.ts';
import type { RowApi, RowFlags } from './panelTypes.ts';
import { RowTools } from './RowTools.tsx';

export interface RowShellProps extends RowFlags {
  readonly id: string;
  readonly className: string;
  readonly reactions: readonly ShownReaction[];
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly api: RowApi;
  readonly children: ReactNode;
}

/** What a tap on a row is meant for itself: its buttons and fields. */
const CONTROLS = 'button, textarea, input, a';

/**
 * A chat message's or a roll's row: its place in the list, and its tools while the mouse is over
 * it, the keyboard is in it, a finger tapped it or it asks before deleting. The tools exist only
 * then, so a long log holds a few buttons, not a thousand.
 */
export function RowShell({ id, className, reactions, canEdit, canDelete, api, children, editing, asking, tapped, highlighted, tabStop }: RowShellProps): ReactElement {
  const row = useRef<HTMLDivElement>(null);
  const pointer = useRef('mouse');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = !editing && (hovered || focused || tapped || asking);

  // A row that leaves with the focus in it hands the focus to the list, never to the page behind the panel.
  useLayoutEffect(() => {
    const node = row.current;
    return () => {
      if (node?.contains(node.ownerDocument.activeElement) === true) node.closest<HTMLElement>('.atlas-online-log__list')?.focus({ preventScroll: true });
    };
  }, []);

  const onPointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') setHovered(true);
  };
  const onPointerLeave = (): void => {
    setHovered(false);
    if (asking && !focused && !tapped) api.askDelete(null);
  };
  // Only the keyboard's focus shows the tools: a click focuses what it hits, too.
  const onFocus = (event: FocusEvent): void => setFocused(event.target.matches(':focus-visible'));
  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocused(false);
    if (asking && !hovered && !tapped) api.askDelete(null);
  };
  const onClick = (event: MouseEvent): void => {
    if (pointer.current !== 'mouse' && (event.target as Element).closest(CONTROLS) === null) api.tap(id);
  };

  return (
    <div
      ref={row}
      className={classes('atlas-online-log__row', className, active && 'is-active', highlighted && 'is-highlighted')}
      data-entry={id}
      tabIndex={tabStop ? 0 : -1}
      onPointerDown={(event) => { pointer.current = event.pointerType; }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
    >
      {active && <RowTools id={id} reactions={reactions} canEdit={canEdit} canDelete={canDelete} asking={asking} api={api} />}
      {children}
    </div>
  );
}
