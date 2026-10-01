/**
 * Which resources a map hides. Every map shows the resources of its collection
 * unless its token settings list their key in `hiddenResources`; the player
 * window never reads this, it follows each resource's own player setting.
 */

/** The two resources every map had a switch for before resources were defined per collection. */
const LEGACY_SWITCHES = { showHPBars: 'hp', showStressBars: 'stress' } as const;

/** `hidden` with `key` in or out. */
function withHidden(hidden: readonly string[], key: string, isHidden: boolean): string[] {
  if (hidden.includes(key) === isHidden) return [...hidden];
  return isHidden ? [...hidden, key] : hidden.filter((other) => other !== key);
}

/** The hidden list after the GM switched `key` on or off in the scene's settings. */
export function toggleHidden(hidden: readonly string[] | undefined, key: string): string[] {
  const list = hidden ?? [];
  return withHidden(list, key, !list.includes(key));
}

/**
 * A map's token settings with `hiddenResources`. The old switches, where a file still
 * carries them, decide for HP and the secondary resource: files written by this version
 * mirror them from the list, so a difference means an older Atlas changed them. The
 * secondary bar was off unless switched on.
 */
export function withHiddenResources(settings: Record<string, unknown>): Record<string, unknown> {
  const { showHPBars, showStressBars, showResources, ...rest } = settings;
  const hasSwitches = 'showHPBars' in settings || 'showStressBars' in settings;
  if (!hasSwitches && !('showResources' in settings)) return settings;

  let hidden = Array.isArray(rest.hiddenResources) ? rest.hiddenResources.filter((key): key is string => typeof key === 'string') : [];
  if (hasSwitches) {
    hidden = withHidden(hidden, LEGACY_SWITCHES.showHPBars, showHPBars === false);
    hidden = withHidden(hidden, LEGACY_SWITCHES.showStressBars, showStressBars !== true);
  } else if (showResources === false) {
    // Earlier builds of this feature had one switch for all resources
    hidden = [LEGACY_SWITCHES.showHPBars, LEGACY_SWITCHES.showStressBars];
  }
  return { ...rest, hiddenResources: hidden };
}

/** The old switches as an older Atlas reads them, for the files this version writes. */
export function legacySwitches(hidden: readonly string[] | undefined): { showHPBars: boolean; showStressBars: boolean } {
  const list = hidden ?? [];
  return { showHPBars: !list.includes(LEGACY_SWITCHES.showHPBars), showStressBars: !list.includes(LEGACY_SWITCHES.showStressBars) };
}

/**
 * What a new scene hides: the bars the collection's old default widgets switched off.
 * Collections created since define the resources they show, so they hide none.
 */
export function hiddenOnNewScenes(defaultWidgets: Record<string, boolean> | undefined): string[] {
  return [
    ...(defaultWidgets?.hpBar === false ? [LEGACY_SWITCHES.showHPBars] : []),
    ...(defaultWidgets?.stressBar === false ? [LEGACY_SWITCHES.showStressBars] : []),
  ];
}
