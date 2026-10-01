import { CANDLE_LOOK, LANTERN_LOOK, SPELL_LOOK, STEADY_MAGIC_LOOK, TORCH_LOOK, lightsOf } from './lightPresetHelpers';

/**
 * D&D 5e (SRD 5.2.1): bright light to the first radius, dim light for the stated distance
 * beyond it. The most common four come first; the bullseye lantern's cone is not a preset yet.
 */
export const DND_5E_LIGHTS = lightsOf('dnd5e', {
  candle: { name: 'Candle', bright: 5, dim: 10, ...CANDLE_LOOK },
  torch: { name: 'Torch', bright: 20, dim: 40, ...TORCH_LOOK },
  'hooded-lantern': { name: 'Hooded lantern', bright: 30, dim: 60, ...LANTERN_LOOK },
  light: { name: 'Light', bright: 20, dim: 40, ...SPELL_LOOK },
  lamp: { name: 'Lamp', bright: 15, dim: 45, ...LANTERN_LOOK, color: '#ffc46b', sourceRadius: 1 },
  'continual-flame': { name: 'Continual Flame', bright: 20, dim: 40, ...STEADY_MAGIC_LOOK, color: '#ffc46b' },
  daylight: { name: 'Daylight', bright: 60, dim: 120, ...STEADY_MAGIC_LOOK, sourceRadius: 4 },
});
