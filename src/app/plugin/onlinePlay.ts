import { requireApiVersion, type Plugin } from 'obsidian';
import { SECRET_STORAGE_VERSION } from '../online/gm/account/tokenStore.ts';
import { ONLINE_COMMANDS } from '../online/gm/onlineCommands.ts';
import { setWorldMapGate } from '../online/gm/book/worldMapGate.ts';
import { OnlineFeature } from '../online/gm/OnlineFeature.ts';
import { onlineDataFile } from '../online/gm/onlineData.ts';
import type { SettingsService } from '../services/SettingsService';
import { collectionWorldMap } from '../services/worldMap';
import type { AtlasSettingSection } from '../settings/settingSections';
import { showNotice } from '../ui/notice';

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
      showNotice(`Online play needs Obsidian ${SECRET_STORAGE_VERSION} or newer.`);
    }
    if (on === (feature !== null)) return;
    if (feature !== null) plugin.removeChild(feature);
    setWorldMapGate(on ? async (collectionId, path) => (await collectionWorldMap(plugin.app, collectionId)) === path : null);
    feature = on ? plugin.addChild(new OnlineFeature(plugin, onlineDataFile(plugin.app))) : null;
  };
  // Registered once: a command asks whichever feature is loaded, and is not offered while none is.
  for (const { id, name } of ONLINE_COMMANDS) {
    plugin.addCommand({ id, name, checkCallback: (checking) => feature?.runCommand(id, checking) ?? false });
  }
  plugin.register(settings.onChange(sync));
  plugin.register(() => setWorldMapGate(null));
  sync();
  return { settingsSections: () => feature?.settingsSections() ?? [] };
}
