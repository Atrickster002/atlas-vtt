import React, { useEffect, useId, useRef, useState } from 'react';
import { DropdownSwatchGrid } from '../../packages/components/primitives/DropdownSwatchGrid';
import { Slider } from '../../packages/components/primitives/slider';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { editEmission, emissionOfPreset, withEmissionValue } from '../../lighting/lightEmissionForm';
import { LIGHT_GLYPH_PATHS, LIGHT_GLYPH_VIEW_BOX } from '../../lighting/lightGlyphs';
import { LIGHT_KINDS, LIGHT_KIND_LABELS, lightKindOf } from '../../lighting/lightPresets';
import { formatRange, rangeSliderScale, type RangeField } from '../../lighting/lightRanges';
import type { LightEmission, LightKind } from '../../types/lightingTypes';

/** The glyph of a kind of light, as on its map marker; it takes the text colour. */
export function LightGlyph({ kind }: { kind: LightKind }): React.ReactElement {
  return (
    <svg className="atlas-light-glyph" viewBox={LIGHT_GLYPH_VIEW_BOX} aria-hidden="true">
      <path d={LIGHT_GLYPH_PATHS[kind]} fill="currentColor" />
    </svg>
  );
}

interface EmissionFieldProps {
  emission: LightEmission;
  onChange: (next: LightEmission) => void;
}

/**
 * The kinds of light as chips with their marker glyphs. A kind brings its preset; "Custom"
 * keeps the light as it is and gives it the plain marker.
 */
export function KindChips({ emission, onChange }: EmissionFieldProps): React.ReactElement {
  const labelId = useId();
  const current = lightKindOf(emission);
  return (
    <div className="atlas-light-popover__kinds" role="group" aria-labelledby={labelId}>
      <span id={labelId} hidden>Kind of light</span>
      {LIGHT_KINDS.map((kind) => (
        <LabelTooltip key={kind} label={LIGHT_KIND_LABELS[kind]}>
          <button
            type="button"
            className="atlas-light-kind"
            aria-pressed={kind === current}
            onClick={() => onChange(kind === 'custom' ? { ...emission, kind } : { ...emissionOfPreset(kind), kind })}
          >
            <LightGlyph kind={kind} />
          </button>
        </LabelTooltip>
      ))}
    </div>
  );
}

/** Colours lights commonly have: the kinds' own, and a few for magic. */
const LIGHT_COLOR_SWATCHES = [
  { value: '#ffb347', label: 'Candle amber' },
  { value: '#ff9a3c', label: 'Torch orange' },
  { value: '#ffd28a', label: 'Lantern gold' },
  { value: '#fff1d6', label: 'Warm white' },
  { value: '#8fb8ff', label: 'Arcane blue' },
  { value: '#7ee0a8', label: 'Fey green' },
  { value: '#ff6b5e', label: 'Ember red' },
] as const;

interface ColorSwatchesProps {
  color: string;
  onChange: (color: string) => void;
  /** The system picker opened and closed: every colour tried in between is one undo step. */
  onPickStart: () => void;
  onPickEnd: () => void;
}

/** The light's colour: common ones as swatches, any other from the system picker in the last cell. */
export function ColorSwatches({ color, onChange, onPickStart, onPickEnd }: ColorSwatchesProps): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const custom = !LIGHT_COLOR_SWATCHES.some((swatch) => swatch.value === color.toLowerCase());

  useEffect(() => {
    const element = input.current;
    if (!element) return undefined;
    const end = (): void => {
      if (!picking.current) return;
      picking.current = false;
      onPickEnd();
    };
    // `change` comes once, when the picker closes; React's onChange is the live `input` event.
    element.addEventListener('change', end);
    element.addEventListener('blur', end);
    return () => {
      element.removeEventListener('change', end);
      element.removeEventListener('blur', end);
      end();
    };
  }, [onPickEnd]);

  return (
    <DropdownSwatchGrid label="Colour" swatches={LIGHT_COLOR_SWATCHES} value={color} onChange={onChange}>
      <span className={`atlas-swatch atlas-swatch--custom${custom ? ' atlas-swatch--active' : ''}`} style={custom ? { background: color } : undefined}>
        <LabelTooltip label="Custom colour">
          <input
            ref={input}
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'}
            onChange={(event) => {
              if (!picking.current) {
                picking.current = true;
                onPickStart();
              }
              onChange(event.target.value);
            }}
          />
        </LabelTooltip>
      </span>
    </DropdownSwatchGrid>
  );
}

interface RangeFieldsProps extends EmissionFieldProps {
  /** "ft", "m" or nothing. */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  onSliderPointerDown: (event: React.PointerEvent) => void;
}

/**
 * Bright and dim range: typed exactly, or dragged on one slider whose two thumbs cannot cross,
 * as dim is never below bright. The rings on the map show the same two ranges.
 */
export function RangeFields({ emission, unit, unitDistance, onChange, onSliderPointerDown }: RangeFieldsProps): React.ReactElement {
  const { max, step } = rangeSliderScale(unitDistance, emission.dim);
  return (
    <div className="atlas-light-popover__field">
      <div className="atlas-light-popover__ranges">
        <RangeInput label="Bright" field="bright" emission={emission} onChange={onChange} />
        <RangeInput label="Dim" field="dim" emission={emission} onChange={onChange} />
        {unit && <span className="atlas-light-popover__unit">{unit}</span>}
      </div>
      <Slider
        value={[emission.bright, emission.dim]}
        min={0}
        max={max}
        step={step}
        thumbLabels={['Bright range', 'Dim range']}
        getValueText={(value) => `${formatRange(value)} ${unit}`.trim()}
        onPointerDown={onSliderPointerDown}
        onValueChange={([bright, dim]) => {
          if (bright !== undefined && bright !== emission.bright) onChange(withEmissionValue(emission, 'bright', bright));
          else if (dim !== undefined && dim !== emission.dim) onChange(withEmissionValue(emission, 'dim', dim));
        }}
      />
    </div>
  );
}

interface RangeInputProps extends EmissionFieldProps {
  label: string;
  field: RangeField;
}

/** Commits on Enter or when it loses focus, so half-typed numbers never reach the map. */
function RangeInput({ label, field, emission, onChange }: RangeInputProps): React.ReactElement {
  const id = useId();
  const value = formatRange(emission[field]);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (): void => {
    const next = editEmission(emission, field, text);
    if (next === emission) setText(value);
    else onChange(next);
  };
  return (
    <label className="atlas-light-popover__range" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
      />
    </label>
  );
}
