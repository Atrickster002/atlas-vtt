import { isPersistedMapEnvelope } from './MapPersistence';

/**
 * The map or snapshot JSON without the widgets `drop` picks (their definition,
 * value and switched-off entry), or null when the file has none of them.
 */
export function dropWidgetsFromJson(content: string, drop: (widgetId: string) => boolean): string | null {
  const data: unknown = JSON.parse(content);
  const state = isPersistedMapEnvelope(data) ? data.state : undefined;
  const settings = state?.widgetSettings;
  if (!state || !settings) return null;

  const dropped = Object.keys(settings.widgets ?? {}).filter(drop);
  const offWidgets = settings.offWidgets?.filter((id) => !drop(id)) ?? [];
  if (dropped.length === 0 && offWidgets.length === (settings.offWidgets?.length ?? 0)) return null;

  const next = { ...settings };
  if (settings.widgets) {
    const widgets = { ...settings.widgets };
    for (const id of dropped) delete widgets[id];
    next.widgets = widgets;
  }
  if (offWidgets.length > 0) next.offWidgets = offWidgets;
  else delete next.offWidgets;
  state.widgetSettings = next;
  for (const id of dropped) {
    if (state.widgetValues) delete state.widgetValues[id];
  }
  return JSON.stringify(data, null, 2);
}
