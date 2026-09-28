import React, { useId, useState } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { resolveWidgetIcon, type WidgetIcon } from '../../../types/widgetIcons';
import type { WidgetScope, WidgetType } from '../../../types/widgetTypes';
import { CLOCK_SEGMENT_OPTIONS, DEFAULT_CLOCK_SEGMENTS } from '../../../utils/clockWidget';
import { WidgetIconPicker } from '../WidgetIconPicker';
import { SettingToggleRow } from './SettingRows';

export interface WidgetDraft {
  type: WidgetType;
  label: string;
  icon: WidgetIcon;
  color: string;
  scope: WidgetScope;
  /** Wedges of a clock; ignored by other types. */
  segments: number;
  /** Whether a clock shows "filled/segments" in its centre; ignored by other types. */
  showCount: boolean;
}

interface WidgetEditorFormProps {
  /** Existing widget values when editing; omitted when creating. */
  initial?: Partial<WidgetDraft>;
  /** Only scenes inside a collection can share widgets with it. */
  canShareWithCollection: boolean;
  submitLabel: string;
  onSubmit: (draft: WidgetDraft) => void;
  onCancel: () => void;
}

const WIDGET_TYPES: { type: WidgetType; label: string }[] = [
  { type: 'counter', label: 'Counter' },
  { type: 'clock', label: 'Clock' },
  { type: 'timer', label: 'Timer' },
];

const DEFAULT_COLOR = '#ffc107';

export function WidgetEditorForm({
  initial,
  canShareWithCollection,
  submitLabel,
  onSubmit,
  onCancel,
}: WidgetEditorFormProps): React.ReactElement {
  const isNew = !initial;
  const [type, setType] = useState<WidgetType>(initial?.type ?? 'counter');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<WidgetIcon>(resolveWidgetIcon(initial?.icon));
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [scope, setScope] = useState<WidgetScope>(initial?.scope ?? 'scene');
  const [segments, setSegments] = useState(initial?.segments ?? DEFAULT_CLOCK_SEGMENTS);
  // New clocks show their count; existing ones keep what they were saved with.
  const [showCount, setShowCount] = useState(isNew || initial?.showCount === true);
  const typeLabelId = useId();
  const nameLabelId = useId();
  const segmentsLabelId = useId();

  const trimmedLabel = label.trim();

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!trimmedLabel) return;
    onSubmit({ type, label: trimmedLabel, icon, color, scope, segments, showCount });
  };

  return (
    <form className="atlas-widget-editor" onSubmit={submit}>
      {isNew && (
        <div className="atlas-widget-editor-types" role="radiogroup" aria-labelledby={typeLabelId}>
          <span id={typeLabelId} hidden>Widget type</span>
          {WIDGET_TYPES.map((option) => (
            <Button
              key={option.type}
              type="button"
              size="sm"
              variant={type === option.type ? 'default' : 'outline'}
              role="radio"
              aria-checked={type === option.type}
              onClick={() => setType(option.type)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      <div className="atlas-widget-editor-name-row">
        <span id={nameLabelId} hidden>Widget name</span>
        <input
          type="text"
          className="atlas-setting-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Widget name"
          aria-labelledby={nameLabelId}
          maxLength={24}
          autoFocus
        />
        <LabelTooltip label="Widget colour">
          <input
            type="color"
            className="atlas-widget-editor-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </LabelTooltip>
      </div>

      {type === 'clock' && (
        <div className="atlas-widget-editor-segments" role="radiogroup" aria-labelledby={segmentsLabelId}>
          <span id={segmentsLabelId} className="atlas-setting-hint">Segments</span>
          {CLOCK_SEGMENT_OPTIONS.map((count) => (
            <Button
              key={count}
              type="button"
              size="sm"
              variant={segments === count ? 'default' : 'outline'}
              role="radio"
              aria-checked={segments === count}
              onClick={() => setSegments(count)}
            >
              {count}
            </Button>
          ))}
        </div>
      )}

      {type === 'clock' && (
        <SettingToggleRow
          label="Show count"
          hint="Shows how many segments are filled in the clock's centre"
          value={showCount}
          onToggle={() => setShowCount(!showCount)}
        />
      )}

      <WidgetIconPicker label="Widget icon" value={icon} onChange={setIcon} color={color} />

      {canShareWithCollection && (
        <SettingToggleRow
          label="Show in every scene"
          hint="Every scene of this collection shows it with the same value. Off, it shows in the scenes where you switch it on"
          value={scope === 'collection'}
          onToggle={() => setScope(scope === 'collection' ? 'scene' : 'collection')}
        />
      )}

      <div className="atlas-widget-editor-actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={!trimmedLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
