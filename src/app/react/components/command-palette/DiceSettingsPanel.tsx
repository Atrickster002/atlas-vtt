import React from 'react';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { DICE_DISPLAY_HINTS, DICE_DISPLAY_OPTIONS } from '../../../dice3d/diceDisplay';
import { SettingsService } from '../../../services/SettingsService';
import { SettingRow } from './SettingRows';

/** How dice rolls look, for every map. */
export function DiceSettingsPanel(): React.ReactElement {
  const { app } = useAtlasUI();
  const display = useDiceDisplay(app ?? undefined);
  const settings = SettingsService.forApp(app ?? undefined);

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">Rolls</h3>
        <SettingRow label="Roll display" hint={DICE_DISPLAY_HINTS[display]}>
          <SegmentedControl
            ariaLabel="Roll display"
            value={display}
            options={DICE_DISPLAY_OPTIONS}
            onChange={(value) => settings?.setDiceDisplay(value)}
          />
        </SettingRow>
      </div>
    </div>
  );
}
