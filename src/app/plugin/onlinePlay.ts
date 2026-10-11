import { Notice, requireApiVersion, type Plugin } from 'obsidian';
import { SECRET_STORAGE_VERSION } from '../online/gm/account/tokenStore.ts';
import { ONLINE_COMMANDS } from '../online/gm/onlineCommands.ts';
import { OnlineFeature } from '../online/gm/OnlineFeature.ts';
import { onlineDataFile } from '../online/gm/onlineData.ts';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from '../settings/settingSections';

/** Online play as the plugin holds it. */
export interface OnlinePlay {
  /** Its sections of Atlas's settings; none while it is switched off. */
  settingsSections(): AtlasSettingSection[];
}

/**
 * Online play runs only while the GM has its experimental switch on: switching it on loads it,
 * switching it off closes the table's connection and takes its controls away. Off, Atlas does no
 * work for it and connects to nothing. It needs the Obsidian that keeps the account token safe.
 */
export function registerOnlinePlay(plugin: Plugin, settings: SettingsService): OnlinePlay {
  let feature: OnlineFeature | null = null;
  let toldTooOld = false;
  const sync = (): void => {
    const wanted = settings.isExperimentalOn('onlinePlay');
    const on = wanted && requireApiVersion(SECRET_STORAGE_VERSION);
    if (wanted && !on && !toldTooOld) {
      toldTooOld = true;
      new Notice(`Online play needs Obsidian ${SECRET_STORAGE_VERSION} or newer.`);
    }
    if (on === (feature !== null)) return;
    if (feature !== null) plugin.removeChild(feature);
    feature = on ? plugin.addChild(new OnlineFeature(plugin, onlineDataFile(plugin.app))) : null;
  };
  // Registered once: a command asks whichever feature is loaded, and is not offered while none is.
  for (const { id, name } of ONLINE_COMMANDS) {
    plugin.addCommand({ id, name, checkCallback: (checking) => feature?.runCommand(id, checking) ?? false });
  }
  plugin.register(settings.onChange(sync));
  sync();
  return { settingsSections: () => feature?.settingsSections() ?? [] };
}
