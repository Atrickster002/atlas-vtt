import { DICE_DISPLAY_HINTS, DICE_DISPLAY_OPTIONS, isDiceDisplay } from '../dice3d/diceDisplay';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';

const DISPLAY_LABELS = Object.fromEntries(DICE_DISPLAY_OPTIONS.map(({ value, label }) => [value, label]));

/** How dice rolls are shown. */
export function diceSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: 'Dice',
    rows: [{
      name: 'Roll display',
      desc: DICE_DISPLAY_HINTS[settings.getDiceDisplay()],
      aliases: ['dice', 'roll', 'animation', '3d', 'toast', 'speed', 'fast'],
      render: (setting) => {
        let unsubscribe: (() => void) | undefined;
        setting.addDropdown((dropdown) => {
          dropdown.addOptions(DISPLAY_LABELS)
            .setValue(settings.getDiceDisplay())
            .onChange((value) => {
              if (isDiceDisplay(value)) settings.setDiceDisplay(value);
            });
          // The choice can also change from the command palette.
          unsubscribe = settings.onChange(() => {
            const display = settings.getDiceDisplay();
            dropdown.setValue(display);
            setting.setDesc(DICE_DISPLAY_HINTS[display]);
          });
        });
        return unsubscribe;
      },
    }],
  };
}
