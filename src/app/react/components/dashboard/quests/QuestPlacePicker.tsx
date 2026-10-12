import React, { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { QuestPlace } from '../../../../campaigns/quests/questTypes';
import { Button } from '../../../../packages/components/primitives/button';
import { CloseButton } from '../../../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { cn } from '../../../../../utils/cn';
import { t } from '../../../../i18n';

interface QuestPlacePickerProps {
  title: string;
  place: QuestPlace | undefined;
  /** The campaign's world map; null while it has none, and then no place can be set. */
  mapUrl: string | null;
  onPlace: (place: QuestPlace | null) => void;
  disabled: boolean;
}

/** How far an arrow key moves the place, in shares of the map; Shift moves it ten times as far. */
const KEY_STEP = 0.01;
const ARROWS: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const share = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Where a quest leads on the campaign's world map: a button that opens the map, on which a click
 * (or the arrow keys) sets the place. The place shows at once, before the note has been written.
 */
export function QuestPlacePicker({ title, place, mapUrl, onPlace, disabled }: QuestPlacePickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<QuestPlace | null | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const shown = draft === undefined ? place : draft ?? undefined;
  const unavailable = disabled || mapUrl === null;

  // The note's own place wins once it was written (or changed elsewhere).
  useEffect(() => setDraft(undefined), [place?.x, place?.y]);

  // The map opens where it can be seen whole: the page scrolls to it, if it must.
  useEffect(() => {
    if (isOpen) panelRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const close = (): void => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const set = (next: QuestPlace | null): void => {
    setDraft(next);
    onPlace(next);
  };

  const pick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || event.detail === 0) return;
    set({ x: share((event.clientX - box.left) / box.width), y: share((event.clientY - box.top) / box.height) });
  };

  const onMapKeyDown = (event: React.KeyboardEvent): void => {
    const arrow = ARROWS[event.key];
    if (arrow === undefined) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP * 10 : KEY_STEP;
    const from = shown ?? { x: 0.5, y: 0.5 };
    set({ x: share(from.x + arrow[0] * step), y: share(from.y + arrow[1] * step) });
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const label = mapUrl === null ? t('quest.noWorldMap') : shown ? t('quest.placed') : t('quest.place');

  return (
    <div ref={rootRef} className={cn('quest-place', isOpen && 'is-open')}>
      <LabelTooltip label={label}>
        <button
          ref={triggerRef}
          type="button"
          className={cn('quest-place__trigger', shown && 'is-placed', isOpen && 'atlas-open')}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-disabled={unavailable || undefined}
          onClick={() => { if (!unavailable) setIsOpen((open) => !open); }}
        >
          <MapPin aria-hidden="true" />
        </button>
      </LabelTooltip>
      {isOpen && mapUrl !== null && (
        <div ref={panelRef} className="quest-place__panel" role="dialog" aria-labelledby={labelId} onKeyDown={onKeyDown}>
          <span id={labelId} hidden>{t('quest.placeOf', { title })}</span>
          <div className="quest-place__header">
            <span className="quest-place__title">{title}</span>
            {shown && (
              <Button variant="ghost" className="quest-place__remove" onClick={() => set(null)}>
                {t('quest.removePlace')}
              </Button>
            )}
            <CloseButton onClick={close} aria-label={t('quest.closePlace')} />
          </div>
          <button type="button" className="quest-place__map" aria-labelledby={labelId} autoFocus onClick={pick} onKeyDown={onMapKeyDown}>
            <img src={mapUrl} alt="" draggable={false} />
            {shown && (
              <span className="quest-place__pin" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }}>
                <MapPin aria-hidden="true" />
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
