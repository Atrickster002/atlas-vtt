import React from 'react';
import { Tutorial } from '../../../onboarding/Tutorial';
import { LOOT_RESULT_STEPS, LOOT_TUTORIAL_LABEL, lootRollerSteps } from '../../../onboarding/lootTutorials';
import { useAtlasSettings, useHotkeyLabels } from '../../../keyboard/useMapHotkeys';

interface LootRollerTutorialsProps {
  /** The ticked views name rarities, so the rarity toggles show. */
  hasRarities: boolean;
  /** A roll was just made in this window, so its cards show. */
  rolled: boolean;
}

/** The loot roller's tour the first time it has items, then the tour of the first roll's cards. */
export function LootRollerTutorials({ hasRarities, rolled }: LootRollerTutorialsProps): React.ReactElement | null {
  const settings = useAtlasSettings();
  const hotkeyLabel = useHotkeyLabels();
  if (!settings) return null;
  if (settings.shouldShowTutorial('lootRoller')) {
    return (
      <Tutorial
        settings={settings}
        id="lootRoller"
        label={LOOT_TUTORIAL_LABEL}
        steps={lootRollerSteps(hotkeyLabel('lootRoller'), hasRarities)}
      />
    );
  }
  if (!rolled) return null;
  return <Tutorial settings={settings} id="lootResults" label={LOOT_TUTORIAL_LABEL} steps={LOOT_RESULT_STEPS} />;
}
