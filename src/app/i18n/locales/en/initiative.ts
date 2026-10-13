import type { Message } from '../../types';

export const initiative = {
  'initiative.card': 'initiative card',
  'initiative.edit': 'Edit Initiative',
  'initiative.editHint': 'Enter to save · Esc to cancel',
  'initiative.modifierField': 'Modifier field',
  'initiative.modifierHint': 'The statblock field whose number is added to every roll. Left empty, the field an Atlas template marks as initiative.',
  'initiative.modifierPlaceholder': 'e.g. initiative',
  'initiative.modifierReadError': 'The combatants\' statblocks could not be read, so nothing was rolled',
  'initiative.remove': 'Remove from Initiative',
  'initiative.roll': 'Roll Initiative',
  'initiative.statblocksLoading': {
    one: 'Fantasy Statblocks is still reading the vault: {count} combatant rolled without its statblock\'s modifier',
    other: 'Fantasy Statblocks is still reading the vault: {count} combatants rolled without their statblock\'s modifier',
  },
  'initiative.toBack': 'Move to Back',
  'initiative.toFront': 'Move to Front',
  'initiative.token': 'Token',
} as const satisfies Record<string, Message>;
