/**
 * Which resources a map hides. Every map shows the resources of its collection
 * unless its token settings list their key in `hiddenResources`; the player
 * window never reads this, it follows each resource's own player setting.
 */
import { HP_RESOURCE, STRESS_RESOURCE } from './resourceDefinitions';
import { tokenSettingsFromFile, tokenSettingsToFile } from './resourceFileFormat';

/** The hidden list after the GM switched `key` on or off in the scene's settings. */
export function toggleHidden(hidden: readonly string[] | undefined, key: string): string[] {
  const list = hidden ?? [];
  return list.includes(key) ? list.filter((other) => other !== key) : [...list, key];
}

/**
 * What a new scene hides: the bars the collection's old default widgets switched off.
 * Collections created since define the resources they show, so they hide none.
 */
export function hiddenOnNewScenes(defaultWidgets: Record<string, boolean> | undefined): string[] {
  return [
    ...(defaultWidgets?.hpBar === false ? [HP_RESOURCE.key] : []),
    ...(defaultWidgets?.stressBar === false ? [STRESS_RESOURCE.key] : []),
  ];
}

/**
 * A scene file that shows the bars a new scene of its collection shows, for a scene that
 * joins the collection; null when it already does.
 */
export function showNewSceneBarsInJson(content: string, defaultWidgets: Record<string, boolean> | undefined): string | null {
  const data = JSON.parse(content) as { state?: { tokenSettings?: Record<string, unknown> } } | null;
  if (!data?.state) return null;
  const settings = tokenSettingsFromFile(data.state.tokenSettings ?? {});
  const hiddenNow: unknown[] = Array.isArray(settings.hiddenResources) ? settings.hiddenResources : [];
  const hidden = hiddenOnNewScenes(defaultWidgets);
  if (hiddenNow.length === hidden.length && hidden.every((key) => hiddenNow.includes(key))) return null;
  data.state.tokenSettings = tokenSettingsToFile({ ...settings, hiddenResources: hidden });
  return JSON.stringify(data, null, 2);
}
