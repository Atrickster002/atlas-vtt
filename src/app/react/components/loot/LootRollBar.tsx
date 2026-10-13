import React from 'react';
import { Dices, Minus, Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { RARITY_LABELS, RARITY_TONES, type RarityTone } from '../../../loot/lootRarity';
import { LOOT_MAX_COUNT } from '../../../stores/lootRollerSlice';
import { t } from '../../../i18n';

interface RarityTogglesProps {
  /** Items of each rarity in the ticked views; empty when no item names its rarity. */
  rarityCounts: ReadonlyMap<RarityTone, number>;
  excluded: ReadonlySet<RarityTone>;
  onExcludedChange: (excluded: RarityTone[]) => void;
}

/** A toggle per rarity of the ladder: switched-off rarities are never rolled. */
export function RarityToggles({ rarityCounts, excluded, onExcludedChange }: RarityTogglesProps): React.ReactElement | null {
  if (rarityCounts.size === 0) return null;
  const toggle = (tone: RarityTone): void => {
    const next = new Set(excluded);
    if (!next.delete(tone)) next.add(tone);
    onExcludedChange([...next]);
  };

  return (
    <div className="atlas-loot-rarities" role="group" aria-label={t('loot.rarities')}>
      {RARITY_TONES.map((tone) => {
        const on = !excluded.has(tone);
        const toneCount = rarityCounts.get(tone) ?? 0;
        const values = { count: toneCount, rarity: RARITY_LABELS[tone].toLowerCase() };
        return (
          <LabelTooltip key={tone} describe label={on ? t('loot.rarityOn', values) : t('loot.rarityOff', values)}>
            <button
              type="button"
              className={`atlas-loot-rarity${on ? ' is-on' : ''}`}
              data-rarity={tone}
              aria-pressed={on}
              onClick={() => toggle(tone)}
            >
              <span className="atlas-loot-rarity__gem" />
              <span className="atlas-loot-rarity__label">{RARITY_LABELS[tone]}</span>
              <span className="atlas-loot-rarity__count">{toneCount}</span>
            </button>
          </LabelTooltip>
        );
      })}
    </div>
  );
}

interface RollActionsProps {
  count: number;
  /** The stepper's unit: what one roll gives. */
  unit: 'items' | 'results';
  onCountChange: (count: number) => void;
  /** The button's text and, where it differs, its name for assistive technology. */
  rollLabel: string;
  rollName?: string;
  /** What a roll does, or why it cannot be made. */
  hint: string;
  disabled: boolean;
  onRoll: () => void;
}

/** How many to roll, and the Roll button. */
export function RollActions({ count, unit, onCountChange, rollLabel, rollName, hint, disabled, onRoll }: RollActionsProps): React.ReactElement {
  return (
    <div className="atlas-loot-rollbar__actions">
      <div className="atlas-loot-stepper" role="group" aria-label={t('loot.count')}>
        <LabelTooltip label={t('loot.fewer')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            disabled={count <= 1}
            onClick={() => onCountChange(count - 1)}
          >
            <Minus />
          </Button>
        </LabelTooltip>
        <span className="atlas-loot-stepper__value" aria-live="polite">
          {count}
          <span className="atlas-loot-stepper__unit">{t(unit === 'items' ? 'tables.unit.items' : 'tables.unit.results', { count })}</span>
        </span>
        <LabelTooltip label={t('loot.more')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            disabled={count >= LOOT_MAX_COUNT}
            onClick={() => onCountChange(count + 1)}
          >
            <Plus />
          </Button>
        </LabelTooltip>
      </div>
      <LabelTooltip describe label={hint}>
        {/* The span takes the hover while the button is disabled, so the hint still shows. */}
        <span className="atlas-loot-roll-trigger">
          <Button
            variant="default"
            className="atlas-loot-roll-button"
            disabled={disabled}
            onClick={onRoll}
            {...(rollName !== undefined && { 'aria-label': rollName })}
          >
            <Dices />
            {rollLabel}
          </Button>
        </span>
      </LabelTooltip>
    </div>
  );
}
