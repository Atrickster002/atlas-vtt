import React, { useId, useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { ToolButton } from '../../../packages/components/primitives/ToolButton';
import { blocksReadingField, fieldsNotShown, removeField } from '../../model/fieldOps';
import { sampleRecord } from '../../model/sampleValues';
import type { TemplateField } from '../../model/templateTypes';
import { useFieldDrag } from '../dnd/useDragSources';
import { useTemplateEditor } from './editorContext';
import { fieldTypeGlyph, FIELD_TYPE_LABELS, MEANING_LABELS } from './editorGlyphs';
import { useGestureText } from './inspector/useGestureText';
import { NewPropertyForm } from './properties/NewPropertyForm';
import { TablesTab } from './properties/TablesTab';
import { hasOwnSample, sampleIsTyped, sampleToText, textToSample, withSample } from './sampleText';

/** The sample a field previews with, typed as one line; typing it is one undo step. */
function SampleInput({ field, labelledBy }: { field: TemplateField; labelledBy: string }): React.JSX.Element {
  const { session, snapshot } = useTemplateEditor();
  const { template, readOnly } = snapshot;
  const value = useMemo(() => sampleToText(field, sampleRecord(template)[field.key]), [field, template]);
  const text = useGestureText({
    value,
    session,
    onText: (typed) => session.apply((current) => withSample(current, field, textToSample(field, typed, sampleRecord(current)[field.key]))),
  });
  return (
    <div className="atlas-te-fields__sample">
      <input {...text} type="text" className="atlas-te-input" aria-labelledby={labelledBy} disabled={readOnly} spellCheck={false}
        placeholder="Empty" />
      {hasOwnSample(template, field.key) && (
        <ToolButton icon={RotateCcw} label="Use the default sample" isActive={false} disabled={readOnly}
          onClick={() => session.apply((current) => withSample(current, field, undefined))} />
      )}
    </div>
  );
}

/** A property's glyph, label, kind and what Atlas reads it as; the drag carries the same face. Its name in notes stays in Settings. */
export function FieldFace({ field, labelId, used }: { field: TemplateField; labelId?: string | undefined; used?: number | undefined }): React.JSX.Element {
  const Glyph = fieldTypeGlyph(field.type);
  return (
    <>
      <Glyph className="atlas-te-fields__glyph" aria-hidden="true" />
      <span id={labelId} className="atlas-te-fields__label">{field.label || field.key}</span>
      <span className="atlas-te-fields__type">{FIELD_TYPE_LABELS[field.type]}</span>
      {used !== undefined && <span className="atlas-te-fields__used">in {used === 1 ? '1 statblock' : `${used} statblocks`}</span>}
      {field.meaning && <span className="atlas-te-fields__badge">{MEANING_LABELS[field.meaning]}</span>}
    </>
  );
}

function FieldRow({ field, removable }: { field: TemplateField; removable?: boolean | undefined }): React.JSX.Element {
  const { snapshot, session, select, announce, collectionKeys } = useTemplateEditor();
  const labelId = useId();
  const drag = useFieldDrag(field, snapshot.readOnly);
  const goToBlock = (): void => {
    const [first] = blocksReadingField(snapshot.template, field.key);
    if (first) select([first.id], true);
    else announce(`No block shows ${field.label || field.key} yet.`);
  };
  return (
    <li className="atlas-te-fields__row">
      <div
        ref={drag.ref}
        className="atlas-te-fields__head"
        role="button"
        tabIndex={0}
        onPointerDown={drag.onPointerDown}
        onClick={goToBlock}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          goToBlock();
        }}
      >
        <FieldFace field={field} labelId={labelId} used={collectionKeys.get(field.key)} />
      </div>
      {sampleIsTyped(field) && <SampleInput field={field} labelledBy={labelId} />}
      {removable && (
        <ToolButton icon={Trash2} label={`Delete ${field.label || field.key}: statblocks keep their values`} isActive={false} disabled={snapshot.readOnly}
          onClick={() => {
            session.apply((current) => removeField(current, field.key));
            announce(`Deleted the ${field.label || field.key} property. Statblocks keep their values.`);
          }} />
      )}
    </li>
  );
}

type PropertiesTab = 'card' | 'off-card' | 'tables';

/**
 * The Properties panel (spec §10.7): the properties the card shows, in form
 * order (the order Tab walks in a statblock), each with its kind, how many
 * statblocks of the collection hold it and its sample; the ones no block
 * shows, which conditions and formulas may read, with "New property"; and
 * the lookup tables patterns turn one value into another with. A property's
 * name selects the first block that shows it; dragged onto the card, it gets
 * the natural block for its kind there.
 */
export function PropertiesPanel(): React.JSX.Element {
  const { snapshot } = useTemplateEditor();
  const { template } = snapshot;
  const [tab, setTab] = useState<PropertiesTab>('card');
  const hidden = useMemo(() => new Set(fieldsNotShown(template).map((field) => field.key)), [template]);
  const shown = template.fields.filter((field) => !hidden.has(field.key));
  const apart = template.fields.filter((field) => hidden.has(field.key));
  return (
    <div className="atlas-te-fields">
      <SegmentedControl<PropertiesTab>
        ariaLabel="Properties"
        value={tab}
        onChange={setTab}
        className="atlas-te-fields__tabs"
        options={[{ value: 'card', label: 'On the card' }, { value: 'off-card', label: 'Not on the card' }, { value: 'tables', label: 'Tables' }]}
      />
      {tab === 'card' && (shown.length > 0
        ? <ul className="atlas-te-fields__list" aria-label="On the card">{shown.map((field) => <FieldRow key={field.key} field={field} />)}</ul>
        : <p className="atlas-te-fields__empty">Properties appear here as you name blocks.</p>)}
      {tab === 'off-card' && (
        <>
          {apart.length > 0
            ? <ul className="atlas-te-fields__list" aria-label="Not on the card">{apart.map((field) => <FieldRow key={field.key} field={field} removable />)}</ul>
            : <p className="atlas-te-fields__empty">Every property is on the card. A property that is not can still decide when a block shows, or feed a formula.</p>}
          <NewPropertyForm />
        </>
      )}
      {tab === 'tables' && <TablesTab />}
    </div>
  );
}
