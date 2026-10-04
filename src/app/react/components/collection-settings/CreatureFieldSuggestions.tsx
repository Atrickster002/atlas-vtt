import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DiscoveredField } from '../../../creatures/creatureFieldDiscovery';

interface CreatureFieldSuggestionsProps {
  fields: readonly DiscoveredField[];
  /** How many statblocks the fields come from. */
  statblockCount: number;
  pending: boolean;
  onAdd: (field: DiscoveredField) => void;
}

function describeValues(field: DiscoveredField): string {
  // Values may hold commas themselves ("fire, poison"), so they are set apart with a dot.
  if (field.kind === 'options') return field.samples.join(' · ');
  const [first, ...rest] = field.samples;
  return rest.length > 0 ? `${first} – ${rest.at(-1)}` : first ?? '';
}

/** What a field holds: its kind, and a few of its values where any are known. */
function describeField(field: DiscoveredField): string {
  const values = describeValues(field);
  return `${field.kind === 'range' ? 'Range' : 'Options'}${values ? ` · ${values}` : ''}`;
}

/**
 * The fields of the collection's role templates and statblocks that no filter reads yet, each
 * added with one click. A template's field is named as the template names it.
 */
export function CreatureFieldSuggestions({ fields, statblockCount, pending, onAdd }: CreatureFieldSuggestionsProps): React.JSX.Element {
  if (pending && fields.length === 0) {
    return (
      <div className="atlas-csm-empty atlas-csm-creature-fields__status">
        <LoadingSpinner size={16} />
        Reading statblocks…
      </div>
    );
  }
  if (fields.length === 0) {
    return statblockCount === 0
      ? <div className="atlas-csm-empty">Link statblocks to this collection’s characters to see their fields here.</div>
      : <div className="atlas-csm-empty">No other fields to filter by.</div>;
  }
  return (
    <ul className="atlas-csm-creature-fields" aria-label="Statblock fields">
      {fields.map((field) => (
        <li key={field.field} className="atlas-csm-creature-field">
          <div className="atlas-csm-creature-field__text">
            {field.label && <span className="atlas-csm-creature-field__label">{field.label}</span>}
            <code className="atlas-csm-creature-field__name">{field.field}</code>
            <span className="atlas-csm-hint">{describeField(field)}</span>
          </div>
          {statblockCount > 0 && (
            <span className="atlas-csm-creature-field__count">
              {field.count} of {statblockCount}
            </span>
          )}
          <LabelTooltip label={`Filter by ${field.label ?? field.field}`}>
            <Button variant="ghost" size="icon" className="atlas-csm-creature-field__add" onClick={() => onAdd(field)}>
              <Plus />
            </Button>
          </LabelTooltip>
        </li>
      ))}
    </ul>
  );
}
