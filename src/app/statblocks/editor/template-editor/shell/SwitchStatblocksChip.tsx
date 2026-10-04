import React, { useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { noteName } from '../../../../utils/pathUtils';
import type { TemplateId } from '../../../model/templateTypes';
import { switchTemplates } from '../../../notes/templateSwitch';
import { switchChipText } from './builtInLine';

export interface SwitchStatblocksChipProps {
  app: App;
  from: TemplateId;
  to: TemplateId;
  builtInName: string;
  notes: readonly string[];
}

/** The statblocks the popover names before it switches them; more are counted. */
const LISTED = 8;

/**
 * "11 more on 5E (2014 rules) · Switch…" (spec §9.1): a quiet chip under the
 * card of a collection's own copy. It switches nothing by itself: its popover
 * names the statblocks, and only "Switch them" moves them to the copy, in one
 * batch of `atlas-template` patches.
 */
export function SwitchStatblocksChip({ app, from, to, builtInName, notes }: SwitchStatblocksChipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpen(false);
    chipRef.current?.focus({ preventScroll: true });
  };
  const rest = notes.length - LISTED;
  return (
    <span className="atlas-te-switch">
      <Button ref={chipRef} type="button" variant="ghost" size="sm" className="atlas-te-switch__chip" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
        {switchChipText(builtInName, notes.length)}
      </Button>
      {open && (
        <div
          className="atlas-te-switch__popover"
          role="dialog"
          aria-label="Switch statblocks to this template"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        >
          <p className="atlas-te-switch__text">These statblocks use {builtInName}. Switch them to this template?</p>
          <ul className="atlas-te-switch__list">
            {notes.slice(0, LISTED).map((path) => <li key={path}>{noteName(path)}</li>)}
            {rest > 0 && <li>and {rest} more</li>}
          </ul>
          <span className="atlas-te-switch__actions">
            <Button type="button" variant="ghost" size="sm" onClick={close}>Not now</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              autoFocus
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void switchTemplates(app, notes.map((path) => ({ path, from })), to).finally(() => {
                  setBusy(false);
                  close();
                });
              }}
            >
              Switch them
            </Button>
          </span>
        </div>
      )}
    </span>
  );
}
