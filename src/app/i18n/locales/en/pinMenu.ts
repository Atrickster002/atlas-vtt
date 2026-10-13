import type { Message } from '../../types';

export const pinMenu = {
  'pinMenu.open': 'Open Note',
  'pinMenu.edit': 'Edit Pin',
  'pinMenu.readable': 'Readable by players',
} as const satisfies Record<string, Message>;
