import React, { useId, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { linkDirection, linkLevels, linkTargets } from '../../../levels/levelLinks';
import { levelObjects } from '../../../levels/levelObjects';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { AREA_HANDLE_RADIUS } from '../../../pixi/areas/areaGeometry';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import type { LevelLinkDirection, SceneLevel } from '../../../types/sceneLevelTypes';
import { areaHandlePoint } from '../../../vision/polygonArea';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { levelLabel } from './levelEditing';

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts. */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace', 'Delete']);

const DIRECTIONS: readonly { value: LevelLinkDirection; label: string }[] = [
  { value: 'up', label: t('levels.stairsUp') },
  { value: 'down', label: t('levels.stairsDown') },
  { value: 'both', label: t('levels.stairsBoth') },
];

/**
 * The popover of the stairs the GM edits (store `levelLinkPopover`), beside their badge on the map:
 * which other levels they join, which way they lead, and Delete. Every control writes to the store
 * at once, one undo step each.
 */
export function LevelLinkPopoverHost(): React.ReactElement {
  const linkId = useAtlasStore((state) => state.levelLinkPopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{linkId && <LevelLinkPopover key="level-link-popover" linkId={linkId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LevelLinkPopover({ linkId }: { linkId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const current = useAtlasStore((state) => levelObjects(state).levelLinks?.[linkId]);
  const levels = useAtlasStore((state) => state.levels);
  const here = useAtlasStore((state) => viewedLevelId(state));
  // While it leaves, the popover still shows the stairs it had, also when they were deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const link = shown.current;
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, linkId, (state, id) => {
    const area = levelObjects(state).levelLinks?.[id];
    return area ? { ...areaHandlePoint(area.polygon), bright: 0, dim: 0, marker: AREA_HANDLE_RADIUS } : null;
  });

  if (!link || !levels || here === null) return null;
  const joined = linkLevels(link, levels);
  const others = [...levels].reverse().filter((level) => level.id !== here);
  const toggle = (level: SceneLevel): void => {
    const next = joined.includes(level.id) ? joined.filter((id) => id !== level.id) : [...joined, level.id];
    // Kept bottom first, as the scene lists its levels.
    store.getState().updateLevelLink(link.id, { levels: levels.map((entry) => entry.id).filter((id) => id === here || next.includes(id)) });
  };

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-light-popover--stairs"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={t('levels.stairs')}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          store.getState().closeLevelLinkPopover();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <span className="atlas-light-popover__heading">{t('levels.stairsLeadTo')}</span>
      {others.map((level) => (
        <LevelRow key={level.id} name={levelLabel(levels, level)} joined={joined.includes(level.id)}
          // The last level the stairs join besides this one stays: stairs to nowhere are deleted instead.
          locked={joined.includes(level.id) && joined.length <= 2} onToggle={() => toggle(level)} />
      ))}
      <div className="atlas-light-popover__section">
        <SegmentedControl<LevelLinkDirection>
          className="atlas-segmented--fit"
          value={linkDirection(link)}
          options={DIRECTIONS}
          ariaLabel={t('levels.stairsWay')}
          onChange={(direction) => store.getState().updateLevelLink(link.id, { direction: direction === 'both' ? undefined : direction })}
        />
        {linkTargets(link, here, levels).length === 0 && <p className="atlas-light-popover__hint">{t('levels.stairsNowhere')}</p>}
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <span />
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLevelLink(link.id)}>
          <Trash2 />
          <span>{t('common.delete')}</span>
        </Button>
      </div>
    </motion.section>
  );
}

/** One other level of the scene: whether the stairs reach it. */
function LevelRow({ name, joined, locked, onToggle }: { name: string; joined: boolean; locked: boolean; onToggle: () => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{name}</span>
      <ToggleSwitch size="s" value={joined} labelledBy={id} disabled={locked} onChange={onToggle} />
    </div>
  );
}

