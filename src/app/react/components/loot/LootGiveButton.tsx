import React from 'react';
import { Gift } from 'lucide-react';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../context-menu/AtlasContextMenu';
import { giveLoot, type LootRecipient } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';
import { useLootRecipients } from './useLootRecipients';

function give(recipient: LootRecipient, draw: LootDraw): void {
  const values = { item: draw.name, name: recipient.name };
  showNotice(giveLoot(recipient.id, draw) ? t('loot.give.done', values) : t('loot.give.failed', values));
}

/** One row per person: their name, then the character the item goes to. Without a character there is nobody to hand it to. */
function recipientEntries(recipients: readonly LootRecipient[], draw: LootDraw): ContextMenuEntry[] {
  return recipients.map((recipient) => ({
    type: 'item',
    label: recipient.name,
    detail: recipient.character ?? t('loot.give.noCharacter'),
    disabled: recipient.character === null,
    onClick: () => give(recipient, draw),
  }));
}

interface LootGiveButtonProps {
  draw: LootDraw;
}

/** Hands a rolled item to one of the people at the table; there is no button while nobody is there. */
export function LootGiveButton({ draw }: LootGiveButtonProps): React.ReactElement | null {
  const recipients = useLootRecipients();
  if (recipients.length === 0) return null;
  return (
    <ActionsMenuButton
      label={t('loot.give.label')}
      icon={Gift}
      className="atlas-loot-card__action"
      entries={recipientEntries(recipients, draw)}
    />
  );
}
