import type { Message } from '../../types';

export const initiative = {
  'initiative.abilityScore': 'Ability score',
  'initiative.abilityScoreHint': 'The field holds a score such as DEX 16, which adds its modifier: (score − 10) ÷ 2, rounded down',
  'initiative.card': 'initiative card',
  'initiative.edit': 'Edit Initiative',
  'initiative.editHint': 'Enter to save · Esc to cancel',
  'initiative.fallback': 'Where a statblock has neither: {field}',
  'initiative.fallbackScore': 'Where a statblock has neither: {field}, read as an ability score',
  'initiative.modifier': 'Modifier',
  'initiative.modifierField': 'Modifier field',
  'initiative.modifierFromStatblock': 'auto',
  'initiative.modifierHint': 'The statblock field whose number is added to every roll. Where a statblock lacks it, the field its Atlas template marks as initiative.',
  'initiative.modifierPlaceholder': 'e.g. initiative',
  'initiative.modifierReadError': 'The combatants\' statblocks could not be read, so nothing was rolled',
  'initiative.remove': 'Remove from Initiative',
  'initiative.removeFallback': 'Remove fallback',
  'initiative.roll': 'Roll Initiative',
  'initiative.statblocksLoading': {
    one: 'Fantasy Statblocks is still reading the vault: {count} combatant rolled without its statblock\'s modifier',
    other: 'Fantasy Statblocks is still reading the vault: {count} combatants rolled without their statblock\'s modifier',
  },
  'initiative.total': 'Initiative',
  'initiative.toBack': 'Move to Back',
  'initiative.toFront': 'Move to Front',
  'initiative.token': 'Token',
} as const satisfies Record<string, Message>;
