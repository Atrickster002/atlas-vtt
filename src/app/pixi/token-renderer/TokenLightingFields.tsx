import React, { useId } from 'react';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import { VISION_FIELDS, visionFieldLabel, type LightForm, type VisionForm } from '../../lighting/tokenLighting';
import { SensesEditor } from '../../react/components/senses/SensesEditor';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import { LightEmissionFields } from '../lighting/LightEmissionFields';
import { NumberOverrideField } from './NumberOverrideField';

/** What the map and its collection say about vision and light, for the token being edited. */
export interface TokenLightingContext {
  /** Game unit of the map, e.g. "ft". */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  /** The farthest a light may reach on this map (`maxLightRange`). */
  maxLightRange: number;
  /** The senses of the map's collection. */
  senses: readonly SenseDefinition[];
  /** The lights of the map's collection. */
  lightPresets: readonly LightPresetDefinition[];
  /** The senses the token takes from its linked statblock while it has none of its own. */
  inheritedSenses?: readonly TokenSense[];
}

interface TokenLightingFieldsProps {
  vision: VisionForm;
  onVisionChange: (vision: VisionForm) => void;
  light: LightForm;
  onLightChange: (light: LightForm) => void;
  context: TokenLightingContext;
}

/** The Edit Token modal's section for how the token sees and what light it carries. */
export function TokenLightingFields({ vision, onVisionChange, light, onLightChange, context }: TokenLightingFieldsProps): React.ReactElement {
  const lightLabel = useId();
  const visionLabel = useId();
  const visionHint = useId();
  const { unit, inheritedSenses } = context;
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
        <span id={visionHint} className="atlas-edit-token__hint">Players see what it sees, and always see it.</span>
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
            definitions={context.senses}
            unit={unit}
            emptyText="Sees by light only."
            {...(inheritedSenses && { inheritedSenses })}
          />
        </>
      )}
      <div className="atlas-edit-token__field atlas-edit-token__field--row">
        <span id={lightLabel} className="atlas-edit-token__label">Carried light</span>
        <ToggleSwitch labelledBy={lightLabel} value={light.on} onChange={() => onLightChange({ ...light, on: !light.on })} />
      </div>
      {light.on && (
        <div className="atlas-edit-token__light">
          <LightEmissionFields
            emission={light.emission}
            onChange={(emission) => onLightChange({ ...light, emission })}
            presets={context.lightPresets}
            unit={unit}
            unitDistance={context.unitDistance}
            maxRange={context.maxLightRange}
          />
        </div>
      )}
    </>
  );
}
