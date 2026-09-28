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

/** The fields of the collection's statblocks that no filter reads yet, each added with one click. */
export function CreatureFieldSuggestions({ fields, statblockCount, pending, onAdd }: CreatureFieldSuggestionsProps): React.JSX.Element {
  if (pending && fields.length === 0) {
    return (
      <div className="atlas-csm-empty atlas-csm-creature-fields__status">
        <LoadingSpinner size={16} />
        Reading statblocks…
      </div>
    );
  }
  if (statblockCount === 0) {
    return <div className="atlas-csm-empty">Link statblocks to this collection’s characters to see their fields here.</div>;
  }
  if (fields.length === 0) {
    return <div className="atlas-csm-empty">No other fields to filter by.</div>;
  }
  return (
    <ul className="atlas-csm-creature-fields" aria-label="Statblock fields">
      {fields.map((field) => (
        <li key={field.field} className="atlas-csm-creature-field">
          <div className="atlas-csm-creature-field__text">
            <code className="atlas-csm-creature-field__name">{field.field}</code>
            <span className="atlas-csm-hint">
              {field.kind === 'range' ? 'Range' : 'Options'} · {describeValues(field)}
            </span>
          </div>
          <span className="atlas-csm-creature-field__count">
            {field.count} of {statblockCount}
          </span>
          <LabelTooltip label={`Filter by ${field.field}`}>
            <Button variant="ghost" size="icon" className="atlas-csm-creature-field__add" onClick={() => onAdd(field)}>
              <Plus />
            </Button>
          </LabelTooltip>
        </li>
      ))}
    </ul>
  );
}
