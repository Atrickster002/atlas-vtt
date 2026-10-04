// SPDX-License-Identifier: CC-BY-SA-4.0 OR GPL-3.0-only

/**
 * The Cairn creature. Keys follow the Cairn collection's notes: `title` is the
 * name a statblock shows (`name` stays unique in the bestiary, "Bandit
 * (Cairn)"), and `stats` holds STR, DEX and WIL in that order, so the Cairn
 * system preset's STR resource (`stats.0`) reads it.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { CAIRN_SOURCE } from './attributions';
import { builtIn, headerRow, nameField, portraitField, runInStat, stackedStat } from './presetParts';

export const CAIRN_CREATURE: BuiltInTemplate = builtIn('builtin:cairn-creature', 'Cairn', 1, {
  source: CAIRN_SOURCE,
  fields: [
    nameField(),
    { key: 'title', label: 'Display Name', type: 'text' },
    portraitField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'armor', label: 'Armor', type: 'number', meaning: 'armor' },
    { key: 'stats', label: 'Attributes', type: 'scores', slots: ['STR', 'DEX', 'WIL'] },
    { key: 'attacks', label: 'Attacks', type: 'text' },
    { key: 'description', label: 'Description', type: 'markdown' },
    { key: 'abilities', label: 'Abilities', type: 'entries' },
    { key: 'critical_damage', label: 'Critical Damage', type: 'text' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'cahead00', section: 'caname00', image: 'caimage0' }, [
        { id: 'catitle0', type: 'title', field: 'title', level: 1, whenEmpty: 'fallback', fallback: '{name}' },
        { id: 'caline00', type: 'line', fields: ['type'], pattern: '{type}' },
      ]),
      { id: 'castrip0', type: 'row', blocks: [stackedStat('cahp0000', 'hp'), stackedStat('caarmor0', 'armor')] },
      { id: 'castats0', type: 'scores', field: 'stats', orientation: 'row' },
      runInStat('caattack', 'attacks'),
      { id: 'cadesc00', type: 'text', field: 'description' },
      { id: 'caabilit', type: 'entries', field: 'abilities', addLabel: 'Add ability' },
      runInStat('cacritic', 'critical_damage'),
    ],
  },
  sample: { name: 'Creature name', title: 'Creature name' },
});
