import React, { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import { senseSummary } from '../../../gameSystems/senseEditing';
import { findSense } from '../../../gameSystems/senseRules';
import { senseRows, type SenseRow } from '../../../lighting/tokenLighting';
import { Button } from '../../../packages/components/primitives/button';
import type { SenseDefinition, TokenSense } from '../../../types/senseTypes';
import { numberText } from '../../../utils/numberInput';
import { InheritedSenseRow, SenseRowFields } from './SenseRows';

interface SensesEditorProps {
  /** The senses being edited; null while the token has none of its own. */
  senses: SenseRow[] | null;
  onChange: (senses: SenseRow[] | null) => void;
  /** The senses of the collection, which the list offers. */
  definitions: readonly SenseDefinition[];
  /** Game unit of the map, e.g. "ft". */
  unit: string;
  /** Shown while the list is empty. */
  emptyText: string;
  /**
   * The senses the token takes from its linked statblock while it has none of its own. They
   * show read-only until "Edit senses" copies them onto the token.
   */
  inheritedSenses?: readonly TokenSense[];
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** Whether `row` still says what the statblock says about its sense. */
function fromStatblock(row: SenseRow, inherited: readonly TokenSense[]): boolean {
  return inherited.some((sense) => sense.id === row.id && numberText(sense.range) === row.range.trim());
}

/**
 * A list of senses: one row per sense with its range where it takes one, a way to remove it,
 * and the collection's other senses to add, each with what it does.
 */
export function SensesEditor({ senses, onChange, definitions, unit, emptyText, inheritedSenses = [] }: SensesEditorProps): React.ReactElement {
  const labelId = useId();
  const offerId = useId();
  const [adding, setAdding] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const offer = useRef<HTMLDivElement>(null);
  const ranges = useRef(new Map<string, HTMLInputElement>());

  // Whether the token's own list stands in place of its statblock's by the GM's choice: it came
  // with one beside a statblock, or "Edit senses" took the statblock's. Only then is an emptied
  // list kept ("no senses, whatever the statblock says"); otherwise the token has no list again.
  const cameWithOwn = useRef(senses !== null);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const detached = chosen ?? (cameWithOwn.current && inheritedSenses.length > 0);

  const following = senses === null && inheritedSenses.length > 0;
  const rows = senses ?? [];
  const available = following ? [] : definitions.filter((definition) => !rows.some((row) => row.id === definition.id));

  // The list opens below the button, where a scrolling dialog may not show it yet.
  useEffect(() => {
    if (!adding) return;
    void offer.current?.scrollIntoView?.({ block: 'nearest' });
    offer.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [adding]);

  // The sense just added takes the focus in its range field, or the list's button when it has
  // none; so does the button when a sense was removed, whose own button is gone.
  useEffect(() => {
    if (focusId === null) return;
    (ranges.current.get(focusId) ?? addButton.current)?.focus();
    setFocusId(null);
  }, [focusId]);

  const add = (definition: SenseDefinition): void => {
    onChange([...rows, { id: definition.id, range: '' }]);
    setAdding(false);
    setFocusId(definition.id);
  };

  const remove = (index: number): void => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 || detached ? next : null);
    setAdding(false);
    setFocusId(rows[index]?.id ?? null);
  };

  const onOfferKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEP[event.key];
    if (event.key === 'Escape') {
      // The key closes this list only, not the dialog around it.
      event.preventDefault();
      setAdding(false);
      addButton.current?.focus();
    } else if (step !== undefined) {
      event.preventDefault();
      const buttons = [...(offer.current?.querySelectorAll('button') ?? [])];
      const current = buttons.findIndex((button) => button === event.target);
      buttons[Math.min(buttons.length - 1, Math.max(0, current + step))]?.focus();
    }
  };

  return (
    <div className="atlas-senses" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="atlas-senses__label">Senses</span>
      {following || rows.length > 0 ? (
        <ul className="atlas-senses__list" role="list">
          {following
            ? inheritedSenses.map((sense) => (
              <InheritedSenseRow key={sense.id} sense={sense} definition={findSense(definitions, sense.id)} unit={unit} />
            ))
            : rows.map((row, index) => (
              <SenseRowFields
                key={row.id}
                row={row}
                definition={findSense(definitions, row.id)}
                unit={unit}
                fromStatblock={fromStatblock(row, inheritedSenses)}
                inputRef={(input) => {
                  if (input) ranges.current.set(row.id, input);
                  else ranges.current.delete(row.id);
                }}
                onRangeChange={(range) => onChange(rows.map((other, i) => (i === index ? { ...other, range } : other)))}
                onRemove={() => remove(index)}
              />
            ))}
        </ul>
      ) : (
        <p className="atlas-senses__empty">{emptyText}</p>
      )}

      {(following || available.length > 0 || (senses !== null && inheritedSenses.length > 0)) && (
        <div className="atlas-senses__actions">
          {following && (
            <Button variant="outline" size="sm" onClick={() => { setChosen(true); onChange(senseRows(inheritedSenses)); }}>
              <Pencil />
              Edit senses
            </Button>
          )}
          {available.length > 0 && (
            <Button ref={addButton} variant="outline" size="sm" aria-expanded={adding} aria-controls={adding ? offerId : undefined} onClick={() => setAdding(!adding)}>
              <Plus />
              Add sense
            </Button>
          )}
          {senses !== null && inheritedSenses.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(false); setChosen(false); onChange(null); }}>
              <RotateCcw />
              Follow statblock
            </Button>
          )}
        </div>
      )}

      {adding && available.length > 0 && (
        <div ref={offer} id={offerId} className="atlas-senses__offer" role="group" aria-labelledby={`${offerId}-label`} onKeyDown={onOfferKeyDown}>
          <span id={`${offerId}-label`} hidden>Senses to add</span>
          {available.map((definition) => (
            <Button key={definition.id} variant="ghost" className="atlas-sense-offer" onClick={() => add(definition)}>
              <span className="atlas-sense-offer__name">{definition.name}</span>
              <span className="atlas-sense-offer__text">{senseSummary(definition)}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
