import type { AnyWidget } from '../../../types/widgetTypes';
import type { WidgetRecord } from '../../../utils/collectionWidgets';

export interface WidgetRow {
  widget: AnyWidget;
  /** Whether the scene holds the widget (it may still be switched off there). */
  inScene: boolean;
  /** Whether the widget is switched on in this scene. */
  active: boolean;
}

/**
 * The scene's widgets and the rest of its collection's, which the scene has
 * never switched on, in their order.
 */
export function widgetRows(
  sceneWidgets: readonly AnyWidget[],
  isOn: (widget: AnyWidget) => boolean,
  library: WidgetRecord,
): WidgetRow[] {
  const sceneIds = new Set(sceneWidgets.map((widget) => widget.id));
  const elsewhere = Object.values(library).filter((widget) => !sceneIds.has(widget.id));
  return [
    ...sceneWidgets.map((widget) => ({ widget, inScene: true, active: isOn(widget) })),
    ...elsewhere.map((widget) => ({ widget, inScene: false, active: false })),
  ].sort((a, b) => a.widget.order - b.widget.order);
}
