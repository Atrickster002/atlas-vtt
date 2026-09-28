import React from 'react';
import type { LootDraw } from '../../../loot/lootRoller';
import { LootInlineText } from './LootInlineText';

interface LootItemKindProps {
  draw: LootDraw;
  /** Block class; the rarity word gets `${className}__rarity`. */
  className: string;
}

/** The line under an item's name: its rarity and what kind of item it is, e.g. "Epic · Primary Weapon". */
export function LootItemKind({ draw, className }: LootItemKindProps): React.ReactElement | null {
  if (!draw.type && !draw.rarity) return null;
  return (
    <span className={className}>
      {draw.rarity && <span className={`${className}__rarity`}><LootInlineText text={draw.rarity} /></span>}
      {draw.rarity && draw.type && <span aria-hidden="true"> · </span>}
      {draw.type && <LootInlineText text={draw.type} />}
    </span>
  );
}
