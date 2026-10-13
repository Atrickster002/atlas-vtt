/**
 * Where a turn-order fight reads each combatant's initiative modifier: a statblock field, whether
 * it holds an ability score, and the fallback a game system may name.
 */

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { InitiativeModifierSource, InitiativeRules } from '../../../types/initiativeRulesTypes';
import { t } from '../../../i18n';
import { StatblockFieldChips } from './StatblockFieldChips';

interface InitiativeModifierFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
  fieldSuggestions: readonly FieldSuggestion[];
}

/** The rules with `modifier` and `fallback` as their sources, each absent where it is none. */
function withSources(
  { mode, roll, firstSide }: InitiativeRules,
  modifier: InitiativeModifierSource | undefined,
  fallback: InitiativeModifierSource | undefined,
): InitiativeRules {
  return { mode, roll, firstSide, ...(modifier?.field && { modifier }), ...(fallback && { modifierFallback: fallback }) };
}

export function InitiativeModifierFields({ initiative, onChange, fieldSuggestions }: InitiativeModifierFieldsProps): React.ReactElement {
  const field = initiative.modifier?.field ?? '';
  const abilityScore = initiative.modifier?.abilityScore === true;
  const fallback = initiative.modifierFallback;
  const setModifier = (next: { field?: string; abilityScore?: boolean }): void => {
    const merged = { field, abilityScore, ...next };
    onChange(withSources(initiative, { field: merged.field, ...(merged.abilityScore && { abilityScore: true }) }, fallback));
  };

  return (
    <div className="atlas-csm-field">
      <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-modifier">{t('initiative.modifierField')}</label>
      <input
        id="atlas-csm-initiative-modifier"
        type="text"
        className="atlas-csm-input"
        placeholder={t('initiative.modifierPlaceholder')}
        spellCheck={false}
        aria-describedby="atlas-csm-initiative-modifier-hint"
        value={field}
        onChange={(e) => setModifier({ field: e.target.value })}
      />
      <StatblockFieldChips suggestions={fieldSuggestions} value={field} onPick={(path) => setModifier({ field: path })} />
      <p id="atlas-csm-initiative-modifier-hint" className="atlas-csm-hint">{t('initiative.modifierHint')}</p>
      <div className="atlas-csm-toggle-row">
        <div>
          <div className="atlas-csm-toggle-label">{t('initiative.abilityScore')}</div>
          <div className="atlas-csm-hint">{t('initiative.abilityScoreHint')}</div>
        </div>
        <label className="atlas-csm-switch">
          <input
            type="checkbox"
            aria-label={t('initiative.abilityScore')}
            checked={abilityScore}
            disabled={field === ''}
            onChange={(e) => setModifier({ abilityScore: e.target.checked })}
          />
          <span className="atlas-csm-switch-track" />
        </label>
      </div>
      {fallback && (
        <div className="atlas-csm-toggle-row">
          <div className="atlas-csm-hint">
            {t(fallback.abilityScore ? 'initiative.fallbackScore' : 'initiative.fallback', { field: fallback.field })}
          </div>
          <LabelTooltip label={t('initiative.removeFallback')}>
            <Button variant="ghost" size="icon" aria-label={t('initiative.removeFallback')} onClick={() => onChange(withSources(initiative, initiative.modifier, undefined))}>
              <X />
            </Button>
          </LabelTooltip>
        </div>
      )}
    </div>
  );
}
