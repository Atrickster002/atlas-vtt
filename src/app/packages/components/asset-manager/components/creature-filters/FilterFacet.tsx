import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../../primitives/button';

interface FilterFacetProps {
  title: string;
  /** Shown beside the title, e.g. the picked range. */
  summary?: string | undefined;
  /** The facet narrows the list; marks its title. */
  active: boolean;
  children: React.ReactNode;
}

/** One filter in the sidebar: a title that folds its controls away. */
export function FilterFacet({ title, summary, active, children }: FilterFacetProps): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <div className={`atlas-filter-facet${active ? ' atlas-active' : ''}`}>
      <Button
        variant="ghost"
        className="atlas-filter-facet__header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown className={`atlas-filter-facet__chevron${open ? '' : ' atlas-collapsed'}`} />
        <span className="atlas-filter-facet__title">{title}</span>
        {summary && <span className="atlas-filter-facet__summary">{summary}</span>}
      </Button>
      {open && <div id={bodyId} className="atlas-filter-facet__body">{children}</div>}
    </div>
  );
}
