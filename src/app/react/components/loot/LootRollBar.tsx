import React from 'react';
import { Dices, Minus, Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { RARITY_LABELS, RARITY_TONES, type RarityTone } from '../../../loot/lootRarity';
import { LOOT_MAX_COUNT } from '../../../stores/lootRollerSlice';

interface LootRollBarProps {
  /** Items of each rarity in the ticked views; empty when no item names its rarity. */
  rarityCounts: ReadonlyMap<RarityTone, number>;
  excluded: ReadonlySet<RarityTone>;
  onExcludedChange: (excluded: RarityTone[]) => void;
  count: number;
  /** Items the ticked views can yield with the current rarities. */
  available: number;
  onCountChange: (count: number) => void;
  onRoll: () => void;
}

/** Rarity toggles, how many items to roll, and the Roll button. */
export function LootRollBar({ rarityCounts, excluded, onExcludedChange, count, available, onCountChange, onRoll }: LootRollBarProps): React.ReactElement {
  const toggle = (tone: RarityTone): void => {
    const next = new Set(excluded);
    if (!next.delete(tone)) next.add(tone);
    onExcludedChange([...next]);
  };

  return (
    <div className="atlas-loot-rollbar">
      {rarityCounts.size > 0 && (
        <div className="atlas-loot-rarities" role="group" aria-label="Rarities to roll">
          {RARITY_TONES.map((tone) => {
            const on = !excluded.has(tone);
            return (
              <button
                key={tone}
                type="button"
                className={`atlas-loot-rarity${on ? ' is-on' : ''}`}
                data-rarity={tone}
                aria-pressed={on}
                onClick={() => toggle(tone)}
              >
                <span className="atlas-loot-rarity__gem" />
                <span className="atlas-loot-rarity__label">{RARITY_LABELS[tone]}</span>
                <span className="atlas-loot-rarity__count">{rarityCounts.get(tone) ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="atlas-loot-rollbar__actions">
        <div className="atlas-loot-stepper" role="group" aria-label="Number of items">
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            aria-label="Roll fewer items"
            disabled={count <= 1}
            onClick={() => onCountChange(count - 1)}
          >
            <Minus />
          </Button>
          <span className="atlas-loot-stepper__value" aria-live="polite">
            {count}
            <span className="atlas-loot-stepper__unit">{count === 1 ? 'item' : 'items'}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-loot-stepper__button"
            aria-label="Roll more items"
            disabled={count >= LOOT_MAX_COUNT}
            onClick={() => onCountChange(count + 1)}
          >
            <Plus />
          </Button>
        </div>
        <Button variant="default" className="atlas-loot-roll-button" disabled={available === 0} onClick={onRoll}>
          <Dices />
          Roll loot
        </Button>
      </div>
    </div>
  );
}
