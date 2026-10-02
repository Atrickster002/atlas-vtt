/**
 * Escape presses a tooltip took to close itself. Its layer (Radix) prevents the key's default
 * when it dismisses, which everything else reads as "a control used this key" and then leaves
 * the key alone: with a tooltip showing, the first Escape closed only the tooltip.
 */
const tooltipDismissals = new WeakSet<Event>();

/** A select's options or a menu, while open. */
const OPEN_LIST = '[role="listbox"], [role="menu"]';

/**
 * A tooltip closes on this Escape; called by the tooltip before its layer prevents the default.
 * While a list is open the key is that list's all the same: the tooltip is the topmost layer and
 * takes the key first, alone where the list is a layer too (a menu, which then stays open), so
 * whoever asks who took the event would close what holds the list. The key then counts as used
 * by a control, as it does when the list closes on it without a tooltip.
 */
export function noteTooltipDismissal(event: Event): void {
  const doc = event.target instanceof Node ? event.target.ownerDocument ?? document : document;
  if (!doc.querySelector(OPEN_LIST)) tooltipDismissals.add(event);
}

/** Whether a control used the key for itself (an open list that closed, a switch): its default was prevented, and not by a tooltip closing. */
export function handledByAnotherControl(event: Event): boolean {
  return event.defaultPrevented && !tooltipDismissals.has(event);
}
