import { isRecord } from '../services/assetMetadataGuards';

/**
 * Atlas reads a base's items through its own Bases view type: no public API
 * runs a base's query on its own, so Atlas renders one of the base's views,
 * off screen, with this view type and gets the results Obsidian computes.
 */
export const LOOT_QUERY_VIEW = 'atlas-loot';

/** A view of a `.base` file, as written in the file. */
type BaseView = Record<string, unknown> & { name: string };

function viewsOf(base: unknown): BaseView[] {
  const views = isRecord(base) ? base.views : undefined;
  if (!Array.isArray(views)) return [];
  return views.filter((view): view is BaseView => isRecord(view) && typeof view.name === 'string' && view.name.trim() !== '');
}

/** The names of a base's views, in the order the base lists them. */
export function baseViewNames(base: unknown): string[] {
  return viewsOf(base).map((view) => view.name);
}

/**
 * The base config that runs `viewName` of `base` with Atlas's view type: the
 * base's own filters, formulas and property names, and the view's filters,
 * sort and visible properties. Null when the base has no such view.
 */
export function lootQueryConfig(base: unknown, viewName: string): Record<string, unknown> | null {
  const view = viewsOf(base).find((entry) => entry.name === viewName);
  if (!view || !isRecord(base)) return null;
  const { filters, formulas, properties } = base;
  return {
    ...(filters !== undefined && { filters }),
    ...(isRecord(formulas) && { formulas }),
    ...(isRecord(properties) && { properties }),
    views: [{ ...view, type: LOOT_QUERY_VIEW }],
  };
}
