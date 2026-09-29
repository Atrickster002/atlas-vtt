import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Draw Steel: a square is each typically represents 5 feet of distance,
 * however the system measures each square as 1 unit.
 * HP is tracked as Stamina, with a Winded threshold.
 */

export const DRAW_STEEL: SystemPreset = {
  id: builtInPresetId('drawSteel'),
  name: 'Draw Steel',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'units',
      unitDistance: 1,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('drawSteel', [
      { name: 'Bleeding', color: '#b91c1c', icon: 'bleeding-wound' },
      { name: 'Dazed', color: '#facc15', icon: 'knocked-out-stars' },
      { name: 'Frightened', color: '#7c3aed', icon: 'terror' },
      { name: 'Grabbed', color: '#ea580c', icon: 'grab' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Slowed', color: '#0284c7', icon: 'snail' },
      { name: 'Taunted', color: '#ec4899', icon: 'eye' },
      { name: 'Weakened', color: '#b45309', icon: 'arm-sling' },
      // { name: 'Winded', color: '#f97316', icon: 'tired-eye' },
    ]),
    defaultWidgets: { hpBar: true, }
  },
};
