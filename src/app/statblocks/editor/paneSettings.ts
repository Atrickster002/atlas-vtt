import type { AtlasSettings, SettingsService } from '../../services/SettingsService';

export type StatblockPaneSettings = AtlasSettings['statblockPane'];

/** The pane's settings as stored, each `false` unless the file says `true`. */
export function statblockPaneSettings(settings: SettingsService | undefined): StatblockPaneSettings {
  const stored: Partial<Record<keyof StatblockPaneSettings, unknown>> = settings?.getSetting('statblockPane') ?? {};
  return { hintDismissed: stored.hintDismissed === true };
}

/** Stores one or more of the pane's settings, keeping the others. */
export function setStatblockPaneSettings(settings: SettingsService, change: Partial<StatblockPaneSettings>): void {
  const current = statblockPaneSettings(settings);
  const next = { ...current, ...change };
  if (next.hintDismissed === current.hintDismissed) return;
  settings.setSetting('statblockPane', next);
}
