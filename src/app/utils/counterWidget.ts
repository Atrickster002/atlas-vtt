import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import type { AnyWidget, SteppedWidget } from '../types/widgetTypes';

export const DEFAULT_COUNTER_COLOR = '#ffc107';

/** Counters and clocks: widgets stepped by hand, whose value lives in `widgetValues`. */
export function isSteppedWidget(widget: AnyWidget): widget is SteppedWidget {
  return widget.type === 'counter' || widget.type === 'clock';
}

/**
 * Clamps a stepped widget's value to its range: a clock runs from 0 to its
 * segments, a counter from its min to its max (0–99 unless configured).
 */
export function clampCounterValue(widget: SteppedWidget, value: number): number {
  const [min, max] = widget.type === 'clock' ? [0, widget.segments] : [widget.min ?? 0, widget.max ?? 99];
  return Math.min(max, Math.max(min, value));
}

/** Current value of a counter or clock: the undo-tracked `widgetValues` entry wins over the definition's copy. */
export function readCounterValue(state: Pick<ViewAtlasState, 'widgetValues'>, widget: SteppedWidget): number {
  const value = state.widgetValues?.[widget.id] ?? widget.value;
  return typeof value === 'number' ? value : 0;
}

/** Steps a counter or clock by `delta` within its range. */
export function stepCounter(store: ViewAtlasStore, widgetId: string, delta: number): void {
  const state = store.getState();
  const widget = state.widgetSettings?.widgets?.[widgetId];
  if (!widget || !isSteppedWidget(widget)) return;
  state.setWidgetValue(widgetId, clampCounterValue(widget, readCounterValue(state, widget) + delta));
}
