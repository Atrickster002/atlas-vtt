// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A creature of the classic basic/expert style in Atlas' own form: armor
 * class, hit dice, attacks, movement, saves, morale, alignment, experience,
 * number appearing and treasure. The fields are the era's common mechanics;
 * no publisher's name or text.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { builtIn, headerRow, nameField, portraitField, runInStat } from './presetParts';

export const BX_CREATURE: BuiltInTemplate = builtIn('builtin:bx-creature', 'B/X-style creature', 1, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'description', label: 'Description', type: 'markdown' },
    // Text, so both armor scales fit: "7 [12]".
    { key: 'ac', label: 'Armor Class', type: 'text', meaning: 'armor' },
    // A rating, as hit dice read: "3+1*".
    { key: 'hit_dice', label: 'Hit Dice', type: 'rating', meaning: 'rating' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'movement', label: 'Movement', type: 'text' },
    { key: 'attacks', label: 'Attacks', type: 'text' },
    { key: 'saves', label: 'Saves', type: 'text' },
    { key: 'morale', label: 'Morale', type: 'number' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'xp', label: 'XP', type: 'number' },
    { key: 'number_appearing', label: 'Number Appearing', type: 'text' },
    { key: 'treasure', label: 'Treasure', type: 'text' },
    { key: 'traits', label: 'Special Abilities', type: 'entries' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'bxhead00', section: 'bxname00', image: 'bximage0' }, [
        { id: 'bxtitle0', type: 'title', field: 'name', level: 1 },
      ]),
      { id: 'bxdesc00', type: 'text', field: 'description' },
      {
        id: 'bxstrip0', type: 'row', blocks: [
          { id: 'bxac0000', type: 'stat', field: 'ac', label: 'AC', look: 'stacked' },
          { id: 'bxhd0000', type: 'stat', field: 'hit_dice', label: 'HD', look: 'stacked' },
          { id: 'bxhp0000', type: 'stat', field: 'hp', label: 'HP', look: 'stacked' },
          { id: 'bxmove00', type: 'stat', field: 'movement', label: 'MV', look: 'stacked' },
        ],
      },
      runInStat('bxattack', 'attacks'),
      runInStat('bxsaves0', 'saves'),
      runInStat('bxmoral0', 'morale'),
      runInStat('bxalign0', 'alignment'),
      runInStat('bxxp0000', 'xp'),
      runInStat('bxappear', 'number_appearing'),
      runInStat('bxtreasu', 'treasure'),
      { id: 'bxtraits', type: 'entries', field: 'traits', heading: 'Special Abilities', addLabel: 'Add ability' },
    ],
  },
  sample: { name: 'Creature name' },
});
