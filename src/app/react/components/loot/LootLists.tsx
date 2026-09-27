import React from 'react';
import { History, Map as MapIcon, Sparkles, X } from 'lucide-react';
import type { LootDraw } from '../../../loot/lootRoller';
import type { LootRoll } from '../../../loot/lootHistory';
import { formatRelativeTime } from '../../../utils/relativeTime';
import { plural } from '../../../utils/plural';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { LootResultCard } from './LootResultCard';

interface CardHandlers {
  onOpenSource: (draw: LootDraw) => void;
  onOpenLink: (link: string) => void;
  /** Items the players see in their loot window. */
  shownIds: ReadonlySet<string>;
  onShowToPlayers: (draw: LootDraw) => void;
}

type CardProps = Pick<React.ComponentProps<typeof LootResultCard>, 'onOpenSource' | 'onOpenLink' | 'shownToPlayers' | 'onShowToPlayers'>;

function cardProps(draw: LootDraw, { shownIds, ...handlers }: CardHandlers): CardProps {
  return { ...handlers, shownToPlayers: shownIds.has(draw.id) };
}

interface LootResultsProps extends CardHandlers {
  roll: LootRoll | undefined;
  /** The roll was just made here: its items land with a highlight. */
  fresh: boolean;
}

/** The items of the latest roll on this map. */
export function LootResults({ roll, fresh, ...handlers }: LootResultsProps): React.ReactElement {
  if (!roll) {
    return (
      <div className="atlas-loot-list__empty">
        <Sparkles />
        <span>Rolled items appear here</span>
      </div>
    );
  }
  return (
    <ul className="atlas-loot-list__cards">
      {roll.draws.map((draw, index) => (
        <LootResultCard key={draw.id} draw={draw} fresh={fresh} order={index} {...cardProps(draw, handlers)} />
      ))}
    </ul>
  );
}

interface LootHistoryProps extends CardHandlers {
  rolls: readonly LootRoll[];
  onRemove: (rollId: string) => void;
}

/** Every roll made in the collection, newest first, with when and where it was made. */
export function LootHistory({ rolls, onRemove, ...handlers }: LootHistoryProps): React.ReactElement {
  if (rolls.length === 0) {
    return (
      <div className="atlas-loot-list__empty">
        <History />
        <span>Rolls from every map of this collection are kept here</span>
      </div>
    );
  }
  return (
    <ol className="atlas-loot-history">
      {rolls.map((roll) => (
        <li key={roll.id} className="atlas-loot-history__roll">
          <div className="atlas-loot-history__meta">
            <span className="atlas-loot-history__when">{formatRelativeTime(roll.rolledAt)}</span>
            <span className="atlas-loot-history__map"><MapIcon />{roll.mapName}</span>
            <span className="atlas-loot-history__count">{plural(roll.draws.length, 'item')}</span>
            <LabelTooltip label="Remove this roll">
              <Button variant="ghost" size="icon" className="atlas-loot-history__remove" aria-label="Remove this roll" onClick={() => onRemove(roll.id)}>
                <X />
              </Button>
            </LabelTooltip>
          </div>
          <ul className="atlas-loot-list__cards">
            {roll.draws.map((draw) => (
              <LootResultCard key={draw.id} draw={draw} fresh={false} order={0} {...cardProps(draw, handlers)} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
