import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { StatblockLinkFilter } from '../../../../../types/creatureFilterTypes';
import type { StatblockFilterControl } from '../../hooks/useCreatureFilters';
import { HeaderMenu } from '../HeaderMenu';

const CHOICES: ReadonlyArray<{ value: StatblockLinkFilter; label: string; short: string }> = [
  { value: 'any', label: 'All characters', short: 'All' },
  { value: 'linked', label: 'With statblock', short: 'With statblock' },
  { value: 'unlinked', label: 'Without statblock', short: 'Without statblock' },
];

/** Beside the Characters heading: show all characters, or only those with or without a linked statblock. */
export function StatblockFilterMenu({ control }: { control: StatblockFilterControl }): React.JSX.Element {
  const current = CHOICES.find((choice) => choice.value === control.value) ?? CHOICES[0]!;
  return (
    <HeaderMenu
      className="atlas-statblock-filter"
      label={`Characters: ${current.label.toLowerCase()}`}
      triggerClassName={`atlas-statblock-filter__trigger${control.value === 'any' ? '' : ' atlas-filtering'}`}
      triggerContent={(
        <>
          <span>{current.short}</span>
          <ChevronDown />
        </>
      )}
      items={CHOICES.map((choice) => ({
        key: choice.value,
        label: choice.label,
        detail: control.counts[choice.value],
        checked: choice.value === control.value,
        onSelect: () => control.onChange(choice.value),
      }))}
    />
  );
}
