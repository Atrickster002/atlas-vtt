import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

export const DRAW_STEEL: SystemPreset = {
  id: builtInPresetId('drawsteel'),
  name: 'Draw Steel',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    conditions: conditionsOf('drawsteel', [
      { name: 'Bleeding', color: '#b91c1c', icon: 'bleeding-wound' }, // from PF2e Wounded
      { name: 'Dazed', color: '#facc15', icon: 'knocked-out-stars' }, // from D&D 5e Stunned / PF2e Stunned
      { name: 'Frightened', color: '#7c3aed', icon: 'terror' },        // from D&D 5e / PF2e Frightened
      { name: 'Grabbed', color: '#ea580c', icon: 'grab' },             // from D&D 5e Grappled / PF2e Grabbed
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },          // from D&D 5e / PF2e Prone
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },    // from D&D 5e / PF2e Restrained
      { name: 'Slowed', color: '#0284c7', icon: 'snail' },             // from PF2e Slowed
      { name: 'Taunted', color: '#ec4899', icon: 'eye' },              // from PF2e Fascinated
      { name: 'Weakened', color: '#b45309', icon: 'arm-sling' },       // from PF2e Enfeebled
    ]),
    // Draw Steel tracks Stamina (with a Winded threshold) and Class Heroic Resources
    defaultWidgets: {
      hpBar: true,
      stressBar: true
    },
  },
};