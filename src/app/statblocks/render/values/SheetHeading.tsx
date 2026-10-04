import React from 'react';
import { cn } from '../../../../utils/cn';

interface SheetHeadingProps {
  children: React.ReactNode;
  /** A smaller heading without a rule, for a break inside a section. */
  minor?: boolean | undefined;
}

/**
 * A heading inside the card ("ACTIONS"): a Heading block, or the heading of a
 * Section, Entries, Text or Spells block. The class is the companion theme's,
 * which gives it its heading face.
 */
export function SheetHeading({ children, minor = false }: SheetHeadingProps): React.JSX.Element {
  return (
    <div
      className={cn('atlas-sb-section-heading', minor && 'atlas-sb-section-heading--minor')}
      role="heading"
      aria-level={3}
    >
      {children}
      {!minor && <div className="atlas-sb-rule" />}
    </div>
  );
}
