import React from 'react';
import { cn } from '../../../../utils/cn';
import { hitPointsAttribute } from '../shared/hitPoints';

interface LabelledLineProps {
  label: string;
  children: React.ReactNode;
  /** `run-in`: "**Armor Class** 14"; `stacked`: the label over the value. */
  look?: 'run-in' | 'stacked' | undefined;
  className?: string | undefined;
  /** The line holds the creature's hit points, whose dice roll hit points for its tokens. */
  hitPoints?: boolean | undefined;
  /** The label's id, for a value that names itself by it (a meter). */
  labelId?: string | undefined;
}

/**
 * A label and its values: a Stat, a Pairs or Tags line, a Track. Dice rolled
 * from the values are named after the label.
 */
export function LabelledLine({ label, children, look = 'run-in', className, hitPoints = false, labelId }: LabelledLineProps): React.JSX.Element {
  return (
    <div className={cn('atlas-sb-labelled', `atlas-sb-labelled--${look}`, className)} {...hitPointsAttribute(hitPoints)}>
      {label && <span id={labelId} className="atlas-sb-label">{label}</span>}
      {children}
    </div>
  );
}
