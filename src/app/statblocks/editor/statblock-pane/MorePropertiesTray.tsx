import React, { forwardRef, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import type { StatblockTemplate, TemplateField } from '../../model/templateTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { readField, type FieldRecord } from '../../values/fieldValues';
import { ChipsEditor } from './ListValueInput';
import { usePaneEdit } from './paneEditContext';
import { noteSectionChoice } from './sectionChoices';
import { keysOutsideTemplate } from './templateChoices';
import { TrayValueRow } from './TrayValueRow';

/** Obsidian's own properties, edited here while the note's Properties are hidden (D7). */
const NOTE_FIELDS: readonly TemplateField[] = [
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'aliases', label: 'Aliases', type: 'list' },
  { key: 'cssclasses', label: 'CSS classes', type: 'list' },
];

interface MorePropertiesTrayProps {
  record: FieldRecord;
  template: StatblockTemplate;
  /** Whether a value of the note can be put on the card: its template can change. */
  addToCard: boolean;
}

/**
 * "More properties (n)" under the card (§7.2): the note's own tags, aliases
 * and CSS classes as chips, and every key the template does not show, each
 * editable as raw text and removable from the note. Collapsed until opened.
 */
export const MorePropertiesTray = forwardRef<HTMLButtonElement, MorePropertiesTrayProps>(({ record, template, addToCard }, toggleRef) => {
  const pane = usePaneEdit();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const others = keysOutsideTemplate(record, template);
  const count = NOTE_FIELDS.filter((field) => !isEmptyValue(record[field.key])).length + others.length;

  return (
    <section className="atlas-sb-pane-tray">
      <Button
        ref={toggleRef}
        type="button"
        variant="ghost"
        size="sm"
        className="atlas-sb-pane-tray__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronRight aria-hidden="true" className="atlas-sb-pane-tray__chevron" />
        More properties ({count})
      </Button>
      {open && (
        <div id={contentId} className="atlas-sb-pane-tray__content">
          <h3 className="atlas-sb-pane-tray__heading">Note</h3>
          {NOTE_FIELDS.map((field) => (
            <div key={field.key} className="atlas-sb-pane-tray__row">
              <span className="atlas-sb-pane-tray__key">{field.label}</span>
              <ChipsEditor field={field} read={readField(record, field)} write={pane.write} autoFocus={false} />
            </div>
          ))}
          <h3 className="atlas-sb-pane-tray__heading">Not in this template</h3>
          {others.length === 0 && <p className="atlas-sb-pane-tray__empty">The template shows every property of this note.</p>}
          {others.map((key) => (
            <TrayValueRow
              key={key}
              field={{ key, label: key, type: 'text' }}
              onAddToTemplate={addToCard ? () => void pane.addSection(noteSectionChoice(key, record), null) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
});

MorePropertiesTray.displayName = 'MorePropertiesTray';
