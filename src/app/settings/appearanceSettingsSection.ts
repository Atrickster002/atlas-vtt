import type { SettingsService } from '../services/SettingsService';
import { SKIN_OPTIONS, isSkinChoice } from '../skin/skin';
import type { AtlasSettingSection } from './settingSections';

/** How Atlas' panels and controls look. */
export function appearanceSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: 'Appearance',
    rows: [{
      name: 'Look',
      desc: 'Paper draws Atlas as ink on torn paper. The Atlas VTT theme switches it on by itself.',
      aliases: ['skin', 'theme', 'paper', 'style', 'look', 'ink'],
      render: (setting) => {
        let unsubscribe: (() => void) | undefined;
        setting.addDropdown((dropdown) => {
          dropdown.addOptions(Object.fromEntries(SKIN_OPTIONS.map(({ value, label }) => [value, label])))
            .setValue(settings.getSkin())
            .onChange((value) => {
              if (isSkinChoice(value)) settings.setSkin(value);
            });
          unsubscribe = settings.onChange(() => { dropdown.setValue(settings.getSkin()); });
        });
        return unsubscribe;
      },
    }],
  };
}
