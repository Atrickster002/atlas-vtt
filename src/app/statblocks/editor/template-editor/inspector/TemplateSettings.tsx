import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { Slider } from '../../../../packages/components/primitives/slider';
import { AssetService } from '../../../../services/AssetService';
import { builtInTemplate } from '../../../library/builtInTemplates';
import { useTemplateLibrary } from '../../../library/useTemplateLibrary';
import { isBuiltInTemplateId, type StatblockTemplate, type TemplateLayout } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { useTemplateUsage } from '../useTemplateUsage';
import { AttributionBlock } from './AttributionBlock';
import { ChoiceSetting, Setting, SettingNote, TextSetting } from './InspectorControls';
import './inspector.scss';

const DEFAULT_COLUMN_WIDTH = 22;
const COLUMN_WIDTHS = { min: 14, max: 40 };

function withMaxColumns(template: StatblockTemplate, maxColumns: TemplateLayout['maxColumns']): StatblockTemplate {
  return maxColumns === template.layout.maxColumns ? template : { ...template, layout: { ...template.layout, maxColumns } };
}

/** The default width is stored as no width, as a new template has it. */
function withColumnWidth(template: StatblockTemplate, width: number): StatblockTemplate {
  const columnWidth = width === DEFAULT_COLUMN_WIDTH ? undefined : width;
  if (columnWidth === template.layout.columnWidth) return template;
  const layout = { ...template.layout };
  if (columnWidth === undefined) delete layout.columnWidth;
  else layout.columnWidth = columnWidth;
  return { ...template, layout };
}

function withDescription(template: StatblockTemplate, text: string): StatblockTemplate {
  if (text.trim()) return text === template.description ? template : { ...template, description: text };
  if (template.description === undefined) return template;
  const next = { ...template };
  delete next.description;
  return next;
}

function withoutSource(template: StatblockTemplate): StatblockTemplate {
  const next = { ...template };
  delete next.source;
  return next;
}

/**
 * The least column width in em, as a slider. A drag is one undo step, from
 * the press to the release; each arrow key press is one of its own. The drag
 * ends on its window's pointerup, which comes even when the value did not
 * change (Radix commits only a changed value), and with the slider.
 */
function ColumnWidth({ template, disabled }: { template: StatblockTemplate; disabled: boolean }): React.JSX.Element {
  const { session } = useTemplateEditor();
  const endDrag = useRef<(() => void) | null>(null);
  const labelId = useId();
  const width = template.layout.columnWidth ?? DEFAULT_COLUMN_WIDTH;
  useEffect(() => () => endDrag.current?.(), []);
  const startDrag = (event: React.PointerEvent): void => {
    if (disabled || endDrag.current) return;
    // The handle that began the gesture ends it, even if the editor's session changed meanwhile.
    const held = session;
    const win = event.currentTarget.ownerDocument.defaultView ?? window;
    const end = (): void => {
      win.removeEventListener('pointerup', end);
      win.removeEventListener('pointercancel', end);
      endDrag.current = null;
      held.endGesture();
    };
    endDrag.current = end;
    held.beginGesture();
    win.addEventListener('pointerup', end);
    win.addEventListener('pointercancel', end);
  };
  return (
    <>
      <span id={labelId} className="atlas-te-setting__label">Column width</span>
      <div className="atlas-te-setting__control">
        <div className="atlas-te-setting__inline">
          <Slider
            aria-labelledby={labelId}
            className="atlas-te-slider"
            value={[width]}
            min={COLUMN_WIDTHS.min}
            max={COLUMN_WIDTHS.max}
            step={1}
            disabled={disabled}
            getValueText={(value) => `${value} em`}
            onPointerDown={startDrag}
            onValueChange={([value]) => {
              if (value !== undefined) session.apply((current) => withColumnWidth(current, value));
            }}
          />
          <span className="atlas-te-setting__value">{width} em</span>
        </div>
      </div>
    </>
  );
}

/** The kinds of statblock that start from this template, each named with its collection. */
function useRoleNames(): string[] {
  const { app, snapshot } = useTemplateEditor();
  const usage = useTemplateUsage(app, snapshot.id);
  return useMemo(() => {
    const collections = app ? new Map(AssetService.getInstance(app).loadedCollections().map((collection) => [collection.id, collection.name])) : new Map<string, string>();
    return usage.roles.map((role) => `${role.roleName} in ${collections.get(role.collectionId) ?? role.collectionId}`);
  }, [app, usage.roles]);
}

/** "Based on 5E (2024 rules) monster", and whether that built-in changed since the copy was made. */
function useBasedOn(template: StatblockTemplate): string | null {
  const { app } = useTemplateEditor();
  const library = useTemplateLibrary(app ?? null);
  const from = template.derivedFrom;
  if (!from) return null;
  const builtIn = isBuiltInTemplateId(from.templateId) ? builtInTemplate(from.templateId) : null;
  const name = builtIn?.name ?? library?.templates.find((entry) => entry.template.id === from.templateId)?.name;
  if (!name) return 'Based on a template that is no longer here.';
  const changed = builtIn && from.revision !== undefined && builtIn.revision > from.revision;
  return changed ? `Based on ${name}, which has changed since.` : `Based on ${name}.`;
}

/**
 * The template's own settings (spec §10.7, ◆ Template): its description,
 * columns and their width, the kinds of statblock that start from it, what
 * it was copied from, and the credit a licensed template carries. In the
 * Settings panel with nothing selected it has a header of its own; in the
 * dock's panel the panel's title names it.
 */
export function TemplateSettings({ headerEnd, header = false }: { headerEnd?: React.ReactNode; header?: boolean }): React.JSX.Element {
  const { session, snapshot } = useTemplateEditor();
  const { template, readOnly } = snapshot;
  const roles = useRoleNames();
  const basedOn = useBasedOn(template);
  const titleId = useId();
  return (
    <div className="atlas-te-insp__content">
      {header && (
        <div className="atlas-te-insp__header">
          <Settings2 className="atlas-te-insp__glyph" aria-hidden="true" />
          <span id={titleId} className="atlas-te-insp__name">Template</span>
          {headerEnd}
        </div>
      )}
      <section className="atlas-te-group" aria-labelledby={header ? titleId : undefined} aria-label={header ? undefined : 'Template'}>
        <TextSetting label="Description" value={template.description ?? ''} placeholder="What it is for" session={session} disabled={readOnly} multiline
          onText={(text) => session.apply((current) => withDescription(current, text))} />
        <ChoiceSetting label="Columns" value={String(template.layout.maxColumns) as '1' | '2' | '3'} disabled={readOnly}
          options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
          onChange={(count) => session.apply((current) => withMaxColumns(current, Number(count) as 1 | 2 | 3))} />
        <ColumnWidth template={template} disabled={readOnly} />
        <Setting label="Starts new statblocks for" wide>
          {() => (roles.length > 0
            ? <ul className="atlas-te-setting__roles">{roles.map((role) => <li key={role}>{role}</li>)}</ul>
            : <span className="atlas-te-setting__hint">Nothing yet. A collection's settings choose which template a new statblock starts from.</span>)}
        </Setting>
        {basedOn && <SettingNote>{basedOn}</SettingNote>}
        {template.source && (
          <AttributionBlock source={template.source} disabled={readOnly}
            onRemove={() => session.apply(withoutSource)} />
        )}
      </section>
    </div>
  );
}
