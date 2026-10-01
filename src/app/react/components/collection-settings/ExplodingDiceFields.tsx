/**
 * ExplodingDiceFields — Which dice of the collection roll again on a high or
 * low face, and how.
 */

import React from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { MAX_EXPLODING_FACES, withExplodeScope, type ExplodeChoice } from '../../../gameSystems/diceRules';
import type { DiceRules, ExplodeRule } from '../../../types/diceRulesTypes';

interface ExplodingDiceFieldsProps {
  dice: DiceRules;
  onChange: (dice: DiceRules) => void;
}

const SCOPE_OPTIONS: Record<ExplodeChoice, string> = {
  off: 'Off',
  default: 'Default dice',
  all: 'All dice',
};

const SCOPE_DESCRIPTIONS: Record<ExplodeChoice, string> = {
  off: 'No die rolls again. A single roll can still explode: write ! after its dice, such as 2d6! (once) or 2d6!i (again and again).',
  default: 'A default die that shows its highest face is rolled again and the new die is added.',
  all: 'Every die that shows its highest face is rolled again and the new die is added.',
};

const REPEAT_OPTIONS = { once: 'Once', again: 'Again and again' } as const;

/** A whole number of faces from what was typed, kept within the rule's limits. */
function faceCount(text: string, least: number): number {
  const count = Math.round(Number(text));
  return Number.isNaN(count) ? least : Math.min(MAX_EXPLODING_FACES, Math.max(least, count));
}

export function ExplodingDiceFields({ dice, onChange }: ExplodingDiceFieldsProps): React.ReactElement {
  const rule = dice.explode;
  const choice: ExplodeChoice = rule?.dice ?? 'off';
  const update = (change: Partial<ExplodeRule>): void => {
    if (rule) onChange({ ...dice, explode: { ...rule, ...change } });
  };

  return (
    <>
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Exploding Dice</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={choice}
          options={SCOPE_OPTIONS}
          onChange={(value) => onChange(withExplodeScope(dice, value as ExplodeChoice))}
        />
        <p className="atlas-csm-hint">{SCOPE_DESCRIPTIONS[choice]}</p>
      </div>

      {rule && (
        <>
          <div className="atlas-csm-field">
            <label className="atlas-csm-label">Rolls Again</label>
            <ObsidianMenuDropdown
              className="atlas-setting-dropdown atlas-csm-dropdown"
              value={rule.repeats ? 'again' : 'once'}
              options={REPEAT_OPTIONS}
              onChange={(value) => update({ repeats: value === 'again' })}
            />
            <p className="atlas-csm-hint">
              {rule.repeats
                ? 'A die rolled for an explosion explodes too, up to ten times.'
                : 'A die rolled for an explosion counts as it lands.'}
            </p>
          </div>

          <div className="atlas-csm-field">
            <label className="atlas-csm-label" htmlFor="atlas-csm-explode-high">Highest Faces That Explode</label>
            <input
              id="atlas-csm-explode-high"
              type="number"
              className="atlas-csm-input atlas-csm-input--number"
              min={1}
              max={MAX_EXPLODING_FACES}
              step={1}
              value={rule.highFaces}
              onChange={(e) => update({ highFaces: faceCount(e.target.value, 1) })}
            />
            <p className="atlas-csm-hint">1 explodes on the highest face only, 2 on the two highest (9 and 10 on a d10).</p>
          </div>

          <div className="atlas-csm-field">
            <label className="atlas-csm-label" htmlFor="atlas-csm-explode-low">Lowest Faces That Subtract</label>
            <input
              id="atlas-csm-explode-low"
              type="number"
              className="atlas-csm-input atlas-csm-input--number"
              min={0}
              max={MAX_EXPLODING_FACES}
              step={1}
              value={rule.lowFaces}
              onChange={(e) => update({ lowFaces: faceCount(e.target.value, 0) })}
            />
            <p className="atlas-csm-hint">
              A die that shows one of these faces is rolled again and the new die is subtracted. 0 for none, 1 for a die that subtracts on a 1.
            </p>
          </div>
        </>
      )}
    </>
  );
}
