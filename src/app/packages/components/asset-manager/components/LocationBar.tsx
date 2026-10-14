import React from 'react';
import { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';
import { SelectionInfo, type SelectionInfoProps } from './SelectionInfo';
import { SortControls, type SortControlsProps } from './SortControls';

export interface LocationBarProps extends BreadcrumbProps {
  selection: SelectionInfoProps;
  sort: SortControlsProps;
}

/** The row above the content: where the open folder lies, what is selected in it, and how its assets are sorted. */
export function LocationBar({ selection, sort, ...breadcrumb }: LocationBarProps): React.JSX.Element {
  return (
    <div className="atlas-asset-manager-location">
      <Breadcrumb {...breadcrumb} />
      <SelectionInfo {...selection} />
      <SortControls {...sort} />
    </div>
  );
}
