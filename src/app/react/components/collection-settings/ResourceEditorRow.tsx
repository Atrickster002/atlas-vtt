import React, { useId } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Skull, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { ResourceDefinition, ResourceDirection, ResourceShape } from '../../../resources/resourceTypes';

interface ResourceEditorRowProps {
  resource: ResourceDefinition;
  /** Where the resource shows on a token, which its place in the list decides. */
  shape: ResourceShape;
  fieldSuggestions: readonly string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (partial: Partial<ResourceDefinition>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

const DIRECTIONS: ReadonlyArray<{ value: ResourceDirection; label: string; hint: string }> = [
  { value: 'drains', label: 'Drains', hint: 'Drains: starts full and counts down, like HP' },
  { value: 'fills', label: 'Fills', hint: 'Fills: starts empty and counts up, like Stress' },
];

/** Two or more exclusive choices as a row of toggle buttons. */
function Choice<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; hint: string }>;
  value: T;
  onChange: (value: T) => void;
}): React.ReactElement {
  return (
    <div className="atlas-csm-resource-choice" role="group" aria-label={label}>
      {options.map((option) => (
        <LabelTooltip key={option.value} label={option.hint}>
          <Button variant="ghost" size="sm" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </Button>
        </LabelTooltip>
      ))}
    </div>
  );
}

/** One resource of a collection: its name, statblock field, colour and how it counts and shows. */
export function ResourceEditorRow({
  resource, shape, fieldSuggestions, canMoveUp, canMoveDown, onChange, onMove, onRemove,
}: ResourceEditorRowProps): React.ReactElement {
  const suggestionsId = useId();
  const defeats = resource.defeatedWhenSpent === true;

  return (
    <div className="atlas-csm-resource">
      <div className="atlas-csm-resource-row">
        <div className="atlas-csm-color-swatch" style={{ backgroundColor: resource.color }}>
          <LabelTooltip label="Pick resource colour">
            <input type="color" value={resource.color} onChange={(e) => onChange({ color: e.target.value })} />
          </LabelTooltip>
        </div>
        <input
          type="text"
          className="atlas-csm-input"
          placeholder="Name"
          aria-label="Resource name"
          value={resource.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          type="text"
          className="atlas-csm-input"
          placeholder="Statblock field, e.g. hp"
          aria-label="Statblock field"
          aria-invalid={resource.field.trim() === '' ? true : undefined}
          list={suggestionsId}
          value={resource.field}
          onChange={(e) => onChange({ field: e.target.value })}
        />
        <datalist id={suggestionsId}>
          {fieldSuggestions.map((field) => <option key={field} value={field} />)}
        </datalist>
        <LabelTooltip label="Remove resource">
          <Button variant="ghost" size="icon" className="atlas-csm-condition-delete" onClick={onRemove}>
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>

      <div className="atlas-csm-resource-row">
        <Choice label="How it counts" options={DIRECTIONS} value={resource.direction} onChange={(direction) => onChange({ direction })} />
        <span className="atlas-csm-resource-shape">{shape === 'bar' ? 'Bar' : 'Wheel, on hover'}</span>
        <div className="atlas-csm-resource-toggles">
          <LabelTooltip label={defeats ? 'A token is defeated when this is spent' : 'Mark tokens defeated when this is spent'}>
            <Button variant="ghost" size="icon" className="atlas-csm-condition-valued" aria-pressed={defeats}
              onClick={() => onChange({ defeatedWhenSpent: !defeats })}>
              <Skull />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={resource.visibleToPlayers ? 'Players see this resource' : 'Hidden from players'}>
            <Button variant="ghost" size="icon" className="atlas-csm-condition-valued" aria-pressed={resource.visibleToPlayers}
              onClick={() => onChange({ visibleToPlayers: !resource.visibleToPlayers })}>
              {resource.visibleToPlayers ? <Eye /> : <EyeOff />}
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Move up">
            <Button variant="ghost" size="icon" className="atlas-csm-condition-valued" disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ChevronUp />
            </Button>
          </LabelTooltip>
          <LabelTooltip label="Move down">
            <Button variant="ghost" size="icon" className="atlas-csm-condition-valued" disabled={!canMoveDown} onClick={() => onMove(1)}>
              <ChevronDown />
            </Button>
          </LabelTooltip>
        </div>
      </div>
    </div>
  );
}
