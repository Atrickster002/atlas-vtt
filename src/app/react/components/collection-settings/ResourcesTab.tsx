/**
 * ResourcesTab — the expendable resources tokens of a collection track (HP, Stress, ammunition…),
 * in the order of their slots on a token: two bars, then four wheels.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { draftResourceKey } from '../../../resources/resourceDefinitions';
import { MAX_RESOURCES, type ResourceDefinition } from '../../../resources/resourceTypes';
import { shapeOf } from '../../../resources/visibleResources';
import { ResourceEditorRow } from './ResourceEditorRow';

interface ResourcesTabProps {
  resources: ResourceDefinition[];
  onChange: (resources: ResourceDefinition[]) => void;
  /** Statblock fields of the collection's creatures that hold a quantity, offered for the field input. */
  fieldSuggestions: readonly string[];
}

export function ResourcesTab({ resources, onChange, fieldSuggestions }: ResourcesTabProps): React.ReactElement {
  const update = (index: number, partial: Partial<ResourceDefinition>): void => {
    onChange(resources.map((resource, i) => (i === index ? { ...resource, ...partial } : resource)));
  };

  const move = (index: number, by: -1 | 1): void => {
    const next = [...resources];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(index + by, 0, moved);
    onChange(next);
  };

  const add = (): void => {
    onChange([...resources, {
      // Tokens store their values under the key, so it is settled from the name once the resource is saved.
      key: draftResourceKey(),
      name: '',
      field: '',
      direction: 'drains',
      color: '#3b82f6',
      visibleToPlayers: false,
    }]);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        Resources are the values tokens spend during play, like HP, Stress or ammunition. A token
        shows up to six: the first two as bars below it, the others as wheels beside it while you
        hover or select it (two on its right, then two on its left). Each one reads its maximum from a statblock field, and tokens whose
        statblock lacks that field don&apos;t show it. A draining resource starts full and counts
        down, a filling one starts empty and counts up; switching that later reads the stored
        values the other way round.
      </p>

      {resources.length > 0 ? (
        <div className="atlas-csm-resource-list">
          {resources.map((resource, i) => (
            <ResourceEditorRow
              key={resource.key}
              resource={resource}
              shape={shapeOf(i)}
              fieldSuggestions={fieldSuggestions}
              canMoveUp={i > 0}
              canMoveDown={i < resources.length - 1}
              onChange={(partial) => update(i, partial)}
              onMove={(by) => move(i, by)}
              onRemove={() => onChange(resources.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      ) : (
        <div className="atlas-csm-empty">No resources defined. Tokens show no bars.</div>
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={add} disabled={resources.length >= MAX_RESOURCES}>
        <Plus />
        Add Resource
      </Button>
    </>
  );
}
