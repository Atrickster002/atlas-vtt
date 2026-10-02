/**
 * Escape presses a tooltip took to close itself. Its layer (Radix) prevents the key's default
 * when it dismisses, which everything else reads as "a control used this key" and then leaves
 * the key alone: with a tooltip showing, the first Escape closed only the tooltip.
 */
const tooltipDismissals = new WeakSet<Event>();

/** A tooltip closes on this Escape; called by the tooltip before its layer prevents the default. */
export function noteTooltipDismissal(event: Event): void {
  tooltipDismissals.add(event);
}

/** Whether a control used the key for itself (an open list that closed, a switch): its default was prevented, and not by a tooltip closing. */
export function handledByAnotherControl(event: Event): boolean {
  return event.defaultPrevented && !tooltipDismissals.has(event);
}
