import React from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { ArrowDown, ArrowUp, Eye, EyeOff, Skull, Trash2 } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import { fanOffsets, type SocketPlace } from './resourceSockets';

interface ResourceFanProps {
  place: SocketPlace;
  resource: ResourceDefinition;
  onChange: (partial: Partial<ResourceDefinition>) => void;
  onRemove: () => void;
}

/** Delay between two buttons leaving the socket, in seconds. */
const STAGGER_S = 0.028;
const ENTER_S = 0.26;
const EXIT_S = 0.12;

interface FanButton {
  label: string;
  icon: React.ReactNode;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
}

/**
 * The round buttons that fan out of a selected socket: colour, how the resource counts,
 * whether it defeats its token, whether players see it, and remove. They leave the socket
 * one after the other along an arc on its outer side.
 */
export function ResourceFan({ place, resource, onChange, onRemove }: ResourceFanProps): React.ReactElement {
  const isPresent = useIsPresent();
  const drains = resource.direction === 'drains';
  const defeats = resource.defeatedWhenSpent === true;
  const buttons: FanButton[] = [
    {
      label: drains ? 'Drains: starts full and counts down' : 'Fills: starts empty and counts up',
      icon: drains ? <ArrowDown /> : <ArrowUp />,
      onClick: () => onChange({ direction: drains ? 'fills' : 'drains' }),
    },
    {
      label: defeats ? 'Defeats the token when spent' : 'Does not defeat the token',
      icon: <Skull />, pressed: defeats,
      onClick: () => onChange({ defeatedWhenSpent: !defeats }),
    },
    {
      label: resource.visibleToPlayers ? 'Players see it' : 'Hidden from players',
      icon: resource.visibleToPlayers ? <Eye /> : <EyeOff />, pressed: resource.visibleToPlayers,
      onClick: () => onChange({ visibleToPlayers: !resource.visibleToPlayers }),
    },
    { label: 'Remove', icon: <Trash2 />, danger: true, onClick: onRemove },
  ];
  // The colour swatch leads the fan; the buttons follow
  const offsets = fanOffsets(buttons.length + 1, place.fanSide);
  const motionOf = (index: number): React.ComponentProps<typeof motion.div> => ({
    initial: { opacity: 0, x: 0, y: 0, scale: 0.4 },
    animate: { opacity: 1, ...offsets[index]!, scale: 1, transition: { duration: ENTER_S, ease: EASE_OUT_CONTROL_POINTS, delay: index * STAGGER_S } },
    exit: { opacity: 0, x: 0, y: 0, scale: 0.4, transition: { duration: EXIT_S, ease: EASE_OUT_CONTROL_POINTS } },
  });

  return (
    // A fan on its way out must not be found or clicked: the next one is already open
    <div className={cn('atlas-csm-fan', !isPresent && 'atlas-leaving')} style={{ left: place.fanX, top: place.y }} aria-hidden={isPresent ? undefined : true}>
      <motion.div className="atlas-csm-fan__item" {...motionOf(0)}>
        <LabelTooltip label="Colour" side={place.fanSide}>
          <input
            type="color"
            className="atlas-csm-fan__swatch"
            style={{ backgroundColor: resource.color }}
            value={resource.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </LabelTooltip>
      </motion.div>
      {buttons.map((button, index) => (
        <motion.div key={index} className="atlas-csm-fan__item" {...motionOf(index + 1)}>
          {/* On the fan's outer side, so a tooltip never covers the buttons beside it */}
          <LabelTooltip label={button.label} side={place.fanSide}>
            <button
              type="button"
              className={cn('atlas-csm-fan__button', button.pressed && 'atlas-pressed', button.danger && 'atlas-danger')}
              aria-pressed={button.pressed}
              onClick={button.onClick}
            >
              {button.icon}
            </button>
          </LabelTooltip>
        </motion.div>
      ))}
    </div>
  );
}
