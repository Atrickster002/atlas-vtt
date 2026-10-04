import React, { useId, useRef, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { TemplateSource } from '../../../model/templateTypes';
import { AttributionText } from '../../gallery/AttributionPopover';
import { EditorDialog } from './EditorDialog';

export interface AttributionBlockProps {
  source: TemplateSource;
  disabled: boolean;
  onRemove: () => void;
}

/**
 * The credit a licensed template carries (§10.5): one quiet line ("Includes
 * SRD 5.1 material · CC BY 4.0") that opens to the full attribution, as the
 * gallery's cards show it. Copies keep it; removing it is in there, and asks
 * first, naming what the licence asks for.
 */
export function AttributionBlock({ source, disabled, onRemove }: AttributionBlockProps): React.JSX.Element {
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpener(null);
    buttonRef.current?.focus();
  };
  return (
    <div className="atlas-te-credit atlas-te-span">
      <div className="atlas-te-credit__line">
        <span>Includes {source.label}</span>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((was) => !was)}>
          {open ? 'Hide' : 'Read'}
        </Button>
      </div>
      {open && (
        <div id={detailId} className="atlas-te-credit__detail">
          <AttributionText source={source} />
          <Button ref={buttonRef} type="button" variant="ghost" size="sm" className="atlas-te-credit__remove" disabled={disabled}
            onClick={() => setOpener(buttonRef.current)}>
            Remove attribution…
          </Button>
        </div>
      )}
      {opener && (
        <EditorDialog
          anchor={opener}
          title="Remove attribution?"
          onClose={close}
          footer={(
            <>
              <Button type="button" variant="outline" size="sm" onClick={close}>Cancel</Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => { setOpener(null); onRemove(); }}>Remove</Button>
            </>
          )}
        >
          <p className="atlas-te-dialog__text">The licence ({source.licences.join(', ')}) asks for this credit wherever you share the template or what you make with it.</p>
        </EditorDialog>
      )}
    </div>
  );
}
