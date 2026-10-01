import React, { useId } from 'react';
import { editEmission } from '../../lighting/lightEmissionForm';
import { Select } from '../../packages/components/primitives/Select';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { LightAnimation, LightEmission } from '../../types/lightingTypes';
import { SliderField } from './lightingPanelFields';
import { LightPresetChips } from './LightPresetChips';
import { ColorSwatches, RangeFields } from './lightPopoverFields';

const FLICKERS: { value: LightAnimation; label: string }[] = [
  { value: 'none', label: 'Steady' },
  { value: 'torch', label: 'Torch' },
  { value: 'candle', label: 'Candle' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'magic', label: 'Shimmer' },
];

const NOTHING = (): void => undefined;

interface LightEmissionFieldsProps {
  emission: LightEmission;
  onChange: (next: LightEmission) => void;
  /** The lights of the map's collection. */
  presets: readonly LightPresetDefinition[];
  /** "ft", "m" or nothing. */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  /** The farthest a light may reach on this map (`maxLightRange`). */
  maxRange: number;
  /** A slider is pressed, or the system colour picker opens and closes: where a host that writes at once makes the gesture one undo step. */
  onSliderPointerDown?: (event: React.PointerEvent) => void;
  onPickStart?: () => void;
  onPickEnd?: () => void;
}

/**
 * Everything a light gives off, as the light popover and Edit Token edit it: preset, colour,
 * bright and dim range, intensity, softness and flicker. Every control reports the whole
 * emission at once.
 */
export function LightEmissionFields({
  emission, onChange, presets, unit, unitDistance, maxRange, onSliderPointerDown = NOTHING, onPickStart = NOTHING, onPickEnd = NOTHING,
}: LightEmissionFieldsProps): React.ReactElement {
  const flickerId = useId();
  return (
    <>
      <LightPresetChips emission={emission} presets={presets} onChange={onChange} />
      <div className="atlas-light-popover__section">
        <ColorSwatches color={emission.color} onChange={(color) => onChange({ ...emission, color })} onPickStart={onPickStart} onPickEnd={onPickEnd} />
      </div>
      <div className="atlas-light-popover__section">
        <RangeFields emission={emission} unit={unit} unitDistance={unitDistance} maxRange={maxRange} onChange={onChange} onSliderPointerDown={onSliderPointerDown} />
        <SliderField label="Intensity" value={emission.intensity} min={0} max={2} step={0.05} display={`${Math.round(emission.intensity * 100)} %`}
          onPointerDown={onSliderPointerDown} onChange={(value) => onChange(editEmission(emission, 'intensity', String(value)))} />
        <SliderField label="Softness" value={emission.sourceRadius ?? 1} min={0} max={5} step={0.25} display={String(emission.sourceRadius ?? 1)}
          onPointerDown={onSliderPointerDown} onChange={(value) => onChange(editEmission(emission, 'sourceRadius', String(value)))} />
        <div className="atlas-light-popover__flicker">
          <span id={flickerId}>Flicker</span>
          <Select value={emission.animation} options={FLICKERS} labelledBy={flickerId} onChange={(animation) => onChange({ ...emission, animation })} />
        </div>
      </div>
    </>
  );
}
