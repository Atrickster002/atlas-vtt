import React, { useState } from 'react';
import type { Condition, FieldKey, TemplateBlock } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';
import { editBlock, withBlockChanges } from './blockEdits';
import { FieldSetting } from './FieldSetting';
import { ChoiceSetting, SelectSetting, TextSetting } from './InspectorControls';

type Test = Condition['is'];

const TESTS: Array<{ value: Test; label: string }> = [
  { value: 'present', label: 'has a value' },
  { value: 'absent', label: 'has no value' },
  { value: 'equal', label: 'is' },
  { value: 'not-equal', label: 'is not' },
  { value: 'above', label: 'is above' },
  { value: 'below', label: 'is below' },
];

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

/** A condition on `field` with test `is`, keeping the value the last one compared with where it still fits. */
export function conditionFor(field: FieldKey, is: Test, before: Condition | undefined): Condition {
  const previous = before && 'value' in before ? before.value : undefined;
  if (is === 'present' || is === 'absent') return { field, is };
  if (is === 'equal' || is === 'not-equal') return { field, is, value: previous ?? '' };
  const number = typeof previous === 'number' ? previous : Number(previous);
  return { field, is, value: Number.isFinite(number) ? number : 0 };
}

/** What a typed value compares as: a number where it reads as one, else the text. */
function comparedValue(text: string): string | number {
  const trimmed = text.trim();
  return NUMBER.test(trimmed) ? Number(trimmed) : trimmed;
}

export interface ConditionBuilderProps {
  block: TemplateBlock;
  session: EditorSession;
  disabled: boolean;
}

/**
 * Show only when (spec §10.3): always, or only when a property of the
 * statblock has a value, has none, is or is not a value, or is above or below
 * a number. The property may be one no block shows ("New property…"): a
 * switch a statblock sets without it showing on the card.
 */
export function ConditionBuilder({ block, session, disabled }: ConditionBuilderProps): React.JSX.Element {
  const condition = block.showWhen;
  // "Only when" holds no condition until a field is picked.
  const [choosing, setChoosing] = useState(false);
  const when = condition !== undefined || choosing ? 'when' : 'always';
  const set = (next: Condition | undefined): void => editBlock(session, block.id, block.type, { showWhen: next });
  const value = condition && 'value' in condition ? String(condition.value) : '';
  const numeric = condition?.is === 'above' || condition?.is === 'below';
  return (
    <>
      <ChoiceSetting
        label="Show"
        value={when}
        options={[{ value: 'always', label: 'Always' }, { value: 'when', label: 'Only when…' }]}
        disabled={disabled}
        onChange={(next) => {
          setChoosing(next === 'when');
          if (next === 'always') set(undefined);
        }}
      />
      {when === 'when' && (
        <>
          <FieldSetting
            label="Property"
            value={condition?.field ?? null}
            accepts={null}
            newType="text"
            session={session}
            disabled={disabled}
            onBind={(template, key) => withBlockChanges(template, block.id, block.type, {
              showWhen: conditionFor(key, condition?.is ?? 'present', condition),
            })}
          />
          {condition && (
            <SelectSetting<Test> label="When it" value={condition.is} options={TESTS} disabled={disabled}
              onChange={(is) => set(conditionFor(condition.field, is, condition))} />
          )}
          {condition && 'value' in condition && (
            <TextSetting
              label="Value"
              value={value}
              session={session}
              disabled={disabled}
              check={(text) => (numeric && !NUMBER.test(text.trim()) ? 'Type a number.' : null)}
              onText={(text) => {
                const compared = comparedValue(text);
                if (condition.is === 'equal' || condition.is === 'not-equal') set({ ...condition, value: compared });
                else if (typeof compared === 'number') set({ ...condition, value: compared });
              }}
            />
          )}
        </>
      )}
    </>
  );
}
