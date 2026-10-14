/** Online play's commands. Each is offered only while online play is switched on and has something to do. */
export const ONLINE_COMMANDS = [
  { id: 'start-online-table', name: 'Start online table' },
  { id: 'toggle-online-panel', name: 'Toggle online panel' },
  { id: 'copy-online-table-link', name: 'Copy online table link' },
  { id: 'make-selected-player-tokens', name: 'Make selected tokens player tokens' },
  { id: 'make-selected-gm-tokens', name: 'Make selected tokens GM tokens' },
  { id: 'stop-online-table', name: 'Stop online table' },
] as const;

export type OnlineCommandId = (typeof ONLINE_COMMANDS)[number]['id'];
