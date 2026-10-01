/**
 * ExplodingDiceFields — Which dice of the collection roll again on a high or
 * low face, and how. The settings are switches and one sentence that says what
 * they do to the collection's own die; the number of faces, which few games
 * change, is folded away.
 */

import React, { useState } from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { MAX_EXPLODING_FACES, parseDefaultRoll, withExplodeScope, type ExplodeChoice } from '../../../gameSystems/diceRules';
import { describeExplodeRule, highFaceNames, lowFaceNames } from '../../../gameSystems/explodeRuleText';
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

const OFF_HINT = 'No die rolls again. A single roll can still explode: write ! after its dice, such as 2d6! (once) or 2d6!i (again and again).';

/** The die the settings speak of where the default roll is not valid yet. */
const FALLBACK_SIDES = 20;

/** A whole number of faces from what was typed, kept within the rule's limits. */
function faceCount(text: string, least: number): number {
  const count = Math.round(Number(text));
  return Number.isNaN(count) ? least : Math.min(MAX_EXPLODING_FACES, Math.max(least, count));
}

interface SwitchRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps): React.ReactElement {
  return (
    <div className="atlas-csm-toggle-row">
      <div>
        <div className="atlas-csm-toggle-label">{label}</div>
        <div className="atlas-csm-hint">{hint}</div>
      </div>
      <label className="atlas-csm-switch">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="atlas-csm-switch-track" />
      </label>
    </div>
  );
}

export function ExplodingDiceFields({ dice, onChange }: ExplodingDiceFieldsProps): React.ReactElement {
  const rule = dice.explode;
  const sides = parseDefaultRoll(dice.defaultRoll)?.sides ?? FALLBACK_SIDES;
  const update = (change: Partial<ExplodeRule>): void => {
    if (rule) onChange({ ...dice, explode: { ...rule, ...change } });
  };
  // The face counts unfold by themselves where a rule counts more than one face, so nothing set stays
  // hidden, and then stay open: stepping a count back to 1 must not fold away the field being edited.
  const [facesShown, setFacesShown] = useState(false);
  if (rule && (rule.highFaces > 1 || rule.lowFaces > 1) && !facesShown) setFacesShown(true);

  return (
    <>
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Exploding Dice</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={rule?.dice ?? 'off'}
          options={SCOPE_OPTIONS}
          onChange={(value) => onChange(withExplodeScope(dice, value as ExplodeChoice))}
        />
        <p className="atlas-csm-hint">{rule ? describeExplodeRule(rule, sides) : OFF_HINT}</p>
      </div>

      {rule && (
        <>
          <SwitchRow
            label="New dice explode too"
            hint="A die rolled for an explosion can explode in turn, up to ten times."
            checked={rule.repeats}
            onChange={(repeats) => update({ repeats })}
          />
          <SwitchRow
            label="Lowest face rolls again and subtracts"
            hint={`A d${sides} that shows ${lowFaceNames(sides, Math.max(1, rule.lowFaces), rule.highFaces) || '1'} is rolled again and the new die is taken off the roll.`}
            checked={rule.lowFaces > 0}
            onChange={(on) => update({ lowFaces: on ? 1 : 0 })}
          />

          <details className="atlas-csm-details" open={facesShown} onToggle={(e) => setFacesShown(e.currentTarget.open)}>
            <summary>Explode on more than one face</summary>
            <div className="atlas-csm-field">
              <label className="atlas-csm-label" htmlFor="atlas-csm-explode-high">Highest faces that explode</label>
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
              <p className="atlas-csm-hint">On a d{sides}: {highFaceNames(sides, rule.highFaces)}.</p>
            </div>
            {rule.lowFaces > 0 && (
              <div className="atlas-csm-field">
                <label className="atlas-csm-label" htmlFor="atlas-csm-explode-low">Lowest faces that subtract</label>
                <input
                  id="atlas-csm-explode-low"
                  type="number"
                  className="atlas-csm-input atlas-csm-input--number"
                  min={1}
                  max={MAX_EXPLODING_FACES}
                  step={1}
                  value={rule.lowFaces}
                  onChange={(e) => update({ lowFaces: faceCount(e.target.value, 1) })}
                />
                <p className="atlas-csm-hint">On a d{sides}: {lowFaceNames(sides, rule.lowFaces, rule.highFaces) || 'none'}.</p>
              </div>
            )}
          </details>
        </>
      )}
    </>
  );
}
