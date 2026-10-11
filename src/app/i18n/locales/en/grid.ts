import type { Message } from '../../types';

export const grid = {
  'grid.hexNumbers': 'Cell numbers',
  'grid.line.dashed': 'Dashed',
  'grid.line.dotted': 'Dotted',
  'grid.line.solid': 'Solid',
  'grid.lineStyle': 'Line style',
  'grid.lineWidth': 'Line width',
  'grid.numberOpacity': 'Number opacity',
  'grid.numbers.columnRow': 'Column and row (0101)',
  'grid.numbers.off': 'Off',
  'grid.numbers.sequential': 'Sequential (1, 2, 3)',
  'grid.show': 'Show grid',
  'grid.snap': 'Snap to grid',
  'grid.snapHint': 'Tokens, pins and measurements settle on cell centres',
  'grid.detectOnNewScenes': 'Detect grid on new scenes',
  'grid.detectOnNewScenesHint': 'Off for games without a grid: new scenes have no grid and nothing snaps until you align one',
  'grid.type': 'Grid type',
  'grid.type.hexFlat': 'Hex (Flat)',
  'grid.type.hexPointy': 'Hex (Pointy)',
  'grid.type.square': 'Square',
} as const satisfies Record<string, Message>;
