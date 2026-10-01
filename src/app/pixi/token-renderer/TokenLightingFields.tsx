import React, { useId } from 'react';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import { Select } from '../../packages/components/primitives/Select';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, type LightPresetId } from '../../lighting/lightPresets';
import { VISION_FIELDS, visionFieldLabel, type VisionForm } from '../../lighting/tokenLighting';
import { SensesEditor } from '../../react/components/senses/SensesEditor';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import { NumberOverrideField } from './NumberOverrideField';

/** A preset, no light, or an emission edited elsewhere that saving leaves as it is. */
export type LightChoice = LightPresetId | 'none' | 'custom';

interface TokenLightingFieldsProps {
  vision: VisionForm;
  onVisionChange: (vision: VisionForm) => void;
  light: LightChoice;
  onLightChange: (light: LightChoice) => void;
  /** Game unit of the map, e.g. "ft". */
  unit: string;
  /** The senses of the map's collection. */
  senses: readonly SenseDefinition[];
  /** The senses the token takes from its linked statblock while it has none of its own. */
  inheritedSenses?: readonly TokenSense[];
}

/** The Edit Token modal's section for how the token sees and what light it carries. */
export function TokenLightingFields({ vision, onVisionChange, light, onLightChange, unit, senses, inheritedSenses }: TokenLightingFieldsProps): React.ReactElement {
  const lightLabel = useId();
  const visionLabel = useId();
  const visionHint = useId();
  const options = [
    { value: 'none' as const, label: 'None' },
    ...LIGHT_PRESET_IDS.map((id) => ({ value: id, label: LIGHT_PRESETS[id].label })),
    ...(light === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
  ];
  return (
    <>
      <div className="atlas-edit-token__section-divider" />
      <div className="atlas-edit-token__section-label">Vision &amp; light</div>
      <div className="atlas-edit-token__field">
        <div className="atlas-edit-token__field atlas-edit-token__field--row">
          <span id={visionLabel} className="atlas-edit-token__label">Vision (party member)</span>
          <ToggleSwitch
            labelledBy={visionLabel}
            aria-describedby={visionHint}
            value={vision.enabled}
            onChange={() => onVisionChange({ ...vision, enabled: !vision.enabled })}
          />
        </div>
        <span id={visionHint} className="atlas-edit-token__hint">Players see what this token sees, and always see the token.</span>
      </div>
      {vision.enabled && (
        <>
          {VISION_FIELDS.map((field) => (
            <NumberOverrideField
              key={field.key}
              label={visionFieldLabel(field, unit)}
              value={vision[field.key]}
              onChange={(value) => onVisionChange({ ...vision, [field.key]: value })}
              placeholder={field.placeholder}
              resetLabel={field.resetLabel}
              {...(field.hint && { hint: field.hint })}
              {...(field.min !== undefined && { min: field.min })}
              {...(field.max !== undefined && { max: field.max })}
            />
          ))}
          <SensesEditor
            senses={vision.senses}
            onChange={(next) => onVisionChange({ ...vision, senses: next })}
            definitions={senses}
            unit={unit}
            emptyText="Sees by light only."
            {...(inheritedSenses && { inheritedSenses })}
          />
        </>
      )}
      <div className="atlas-edit-token__field">
        <span id={lightLabel} className="atlas-edit-token__label">Carried light</span>
        <Select value={light} options={options} onChange={onLightChange} labelledBy={lightLabel} />
      </div>
    </>
  );
}
