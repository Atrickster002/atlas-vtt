import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Image, Replace, Trash2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { LevelElevation, SceneLevel } from '../../../types/sceneLevelTypes';
import { t } from '../../../i18n';

interface SceneLevelRowProps {
  level: SceneLevel;
  name: string;
  isViewed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onShow: () => void;
  onRename: (name: string) => void;
  onElevation: (elevation: LevelElevation) => void;
  onMove: (direction: 1 | -1) => void;
  onPickImage: () => void;
  /** Whether the level has an image another can take the place of. */
  hasImage: boolean;
  /** Picks an image of the same shape that takes the image's place, scaled onto it. */
  onReplaceImage: () => void;
  onDelete: () => void;
}

/** A number field that commits a finite number on blur or Enter, and goes back to `value` otherwise. */
function NumberField({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (): void => {
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
    else setText(String(value));
  };
  return (
    <input
      className="atlas-scene-level__number"
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}

function RowButton({ label, icon, onClick, disabled = false, destructive = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; destructive?: boolean }): React.ReactElement {
  return (
    <LabelTooltip side="top" label={label}>
      <button type="button" className={cn('atlas-scene-level__button', destructive && 'atlas-scene-level__button--destructive')} disabled={disabled} onClick={onClick}>
        {icon}
      </button>
    </LabelTooltip>
  );
}

/** One level in the Levels page: its name, elevation and the actions on it. */
export function SceneLevelRow(props: SceneLevelRowProps): React.ReactElement {
  const { level, name, isViewed } = props;
  const [draft, setDraft] = useState(level.name);
  useEffect(() => setDraft(level.name), [level.name]);
  const { bottom, top } = level.elevation;

  return (
    <div className={cn('atlas-scene-level', isViewed && 'atlas-scene-level--viewed')} onClick={props.onShow}>
      <input
        className="atlas-scene-level__name"
        type="text"
        value={draft}
        placeholder={name}
        aria-label={t('levels.name', { name })}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft.trim() !== level.name) props.onRename(draft.trim()); }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      />
      <div className="atlas-scene-level__elevation" onClick={(event) => event.stopPropagation()}>
        <NumberField value={bottom} label={t('levels.bottom', { name })} onCommit={(value) => props.onElevation({ bottom: value, top: Math.max(value, top) })} />
        <span aria-hidden="true">–</span>
        <NumberField value={top} label={t('levels.top', { name })} onCommit={(value) => props.onElevation({ bottom: Math.min(bottom, value), top: value })} />
      </div>
      <div className="atlas-scene-level__actions" onClick={(event) => event.stopPropagation()}>
        <RowButton label={t('levels.moveUp', { name })} icon={<ArrowUp />} disabled={!props.canMoveUp} onClick={() => props.onMove(1)} />
        <RowButton label={t('levels.moveDown', { name })} icon={<ArrowDown />} disabled={!props.canMoveDown} onClick={() => props.onMove(-1)} />
        <RowButton label={t('levels.changeImage', { name })} icon={<Image />} onClick={props.onPickImage} />
        <RowButton label={t('levels.replaceImage', { name })} icon={<Replace />} disabled={!props.hasImage} onClick={props.onReplaceImage} />
        <RowButton label={t('levels.delete', { name })} icon={<Trash2 />} destructive onClick={props.onDelete} />
      </div>
    </div>
  );
}
