// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The generic tier: Atlas' own templates for homebrew collections and the
 * fallback of systems without a template of their own. Their keys are the
 * conventional ones (`hp`, `size`, `type`, `level`, `difficulty`), so
 * resources, creature filters, senses and the token's difficulty label read
 * them without meanings.
 */

import type { BuiltInTemplate, TemplateField } from '../model/templateTypes';
import { builtIn, headerRow, nameField, portraitField, runInStat, sizeField, stackedStat } from './presetParts';

function combatFields(): TemplateField[] {
  return [
    { key: 'ac', label: 'Armor', type: 'number', meaning: 'armor' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
  ];
}

function closingFields(): TemplateField[] {
  return [
    { key: 'description', label: 'Description', type: 'markdown' },
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries', prompt: 'Add an action' },
  ];
}

export const GENERIC_CREATURE: BuiltInTemplate = builtIn('builtin:generic-creature', 'Creature', 1, {
  fields: [
    nameField(),
    portraitField(),
    sizeField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    ...combatFields(),
    ...closingFields(),
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'gchead00', section: 'gcname00', image: 'gcimage0' }, [
        { id: 'gctitle0', type: 'title', field: 'name', level: 1 },
        { id: 'gcline00', type: 'line', fields: ['size', 'type'], pattern: '{size} {type}' },
      ]),
      { id: 'gcstrip0', type: 'row', blocks: [stackedStat('gcac0000', 'ac'), stackedStat('gchp0000', 'hp'), stackedStat('gcspeed0', 'speed')] },
      runInStat('gcsenses', 'senses'),
      runInStat('gclevel0', 'level'),
      { id: 'gcdesc00', type: 'text', field: 'description' },
      { id: 'gctraits', type: 'entries', field: 'traits' },
      { id: 'gcaction', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
    ],
  },
  sample: { name: 'Creature name' },
});

export const GENERIC_NPC: BuiltInTemplate = builtIn('builtin:generic-npc', 'NPC', 1, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'type', label: 'Who', type: 'text', meaning: 'creature-type' },
    { key: 'appearance', label: 'Appearance', type: 'text' },
    { key: 'personality', label: 'Personality', type: 'text' },
    { key: 'wants', label: 'Wants', type: 'text' },
    ...combatFields(),
    ...closingFields(),
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'gnhead00', section: 'gnname00', image: 'gnimage0' }, [
        { id: 'gntitle0', type: 'title', field: 'name', level: 1 },
        { id: 'gnline00', type: 'line', fields: ['type'], pattern: '{type}' },
      ]),
      runInStat('gnappear', 'appearance'),
      runInStat('gnperson', 'personality'),
      runInStat('gnwants0', 'wants'),
      { id: 'gnstrip0', type: 'row', blocks: [stackedStat('gnac0000', 'ac'), stackedStat('gnhp0000', 'hp'), stackedStat('gnspeed0', 'speed')] },
      runInStat('gnsenses', 'senses'),
      { id: 'gndesc00', type: 'text', field: 'description' },
      { id: 'gntraits', type: 'entries', field: 'traits' },
      { id: 'gnaction', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
    ],
  },
  sample: { name: 'Character name' },
});

export const GENERIC_HAZARD: BuiltInTemplate = builtIn('builtin:generic-hazard', 'Hazard', 1, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'type', label: 'Kind', type: 'text', meaning: 'creature-type' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    { key: 'difficulty', label: 'Difficulty', type: 'number' },
    { key: 'trigger', label: 'Trigger', type: 'text' },
    { key: 'description', label: 'Description', type: 'markdown' },
    { key: 'effects', label: 'Effects', type: 'entries', prompt: 'Add an effect' },
    { key: 'countermeasures', label: 'Countermeasures', type: 'text' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'ghhead00', section: 'ghname00', image: 'ghimage0' }, [
        { id: 'ghtitle0', type: 'title', field: 'name', level: 1 },
        { id: 'ghline00', type: 'line', fields: ['type', 'level'], pattern: '{type}[ · Level {level}]' },
      ]),
      runInStat('ghdiffic', 'difficulty'),
      runInStat('ghtrigge', 'trigger'),
      { id: 'ghdesc00', type: 'text', field: 'description' },
      { id: 'gheffect', type: 'entries', field: 'effects', heading: 'Effects', addLabel: 'Add effect' },
      runInStat('ghcounte', 'countermeasures'),
    ],
  },
  sample: { name: 'Hazard name' },
});
