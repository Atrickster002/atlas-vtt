import React from 'react';
import { CoinIcon } from '../CoinIcon';
import type { LootDraw } from '../../../loot/lootRoller';
import { LootInlineText } from './LootInlineText';
import { LootItemKind } from './LootItemKind';

interface LootItemContentProps {
  draw: LootDraw;
  /** Opens wikilinks in the item's text; without it they show as plain text. */
  onOpenLink?: (link: string) => void;
  /** Controls at the end of the heading, e.g. the DM's show-to-players button. */
  actions?: React.ReactNode;
}

/** Values longer than this (features, effects) take a whole row of the property grid. */
const WIDE_PROPERTY_LENGTH = 24;

/**
 * What a loot card shows about an item, in the DM's loot roller and in the
 * players' loot window alike: name, rarity and type, price, description and
 * properties.
 */
export function LootItemContent({ draw, onOpenLink, actions }: LootItemContentProps): React.ReactElement {
  return (
    <>
      <div className="atlas-loot-card__head">
        <span className="atlas-loot-card__title">
          <span className="atlas-loot-card__name">
            <LootInlineText text={draw.name} {...(onOpenLink && { onOpenLink })} />
          </span>
          <LootItemKind draw={draw} className="atlas-loot-card__kind" />
        </span>
        {draw.price && (
          <span className="atlas-loot-card__price">
            <CoinIcon />
            <LootInlineText text={draw.price} />
          </span>
        )}
        {actions}
      </div>

      {draw.description && (
        <p className="atlas-loot-card__description">
          <LootInlineText text={draw.description} {...(onOpenLink && { onOpenLink })} />
        </p>
      )}

      {draw.properties.length > 0 && (
        <dl className="atlas-loot-card__properties">
          {draw.properties.map((property) => (
            <div
              key={property.label}
              className={`atlas-loot-card__property${property.value.length > WIDE_PROPERTY_LENGTH ? ' atlas-loot-card__property--wide' : ''}`}
            >
              <dt>{property.label}</dt>
              <dd><LootInlineText text={property.value} {...(onOpenLink && { onOpenLink })} /></dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
