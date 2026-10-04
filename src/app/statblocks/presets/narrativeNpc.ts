// SPDX-License-Identifier: AGPL-3.0-only

/** A character for story-first games in Atlas' own form: who they are, what drives and troubles them, and who they know. */

import type { BuiltInTemplate } from '../model/templateTypes';
import { builtIn, headerRow, nameField, portraitField, runInStat } from './presetParts';

export const NARRATIVE_NPC: BuiltInTemplate = builtIn('builtin:narrative-npc', 'Narrative NPC', 1, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'concept', label: 'Concept', type: 'text', meaning: 'creature-type' },
    { key: 'drive', label: 'Drive', type: 'text' },
    { key: 'trouble', label: 'Trouble', type: 'text' },
    { key: 'appearance', label: 'Appearance', type: 'text' },
    { key: 'relationships', label: 'Relationships', type: 'entries', prompt: 'Add a relationship' },
    { key: 'notes', label: 'Notes', type: 'markdown' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'nnhead00', section: 'nnname00', image: 'nnimage0' }, [
        { id: 'nntitle0', type: 'title', field: 'name', level: 1 },
        { id: 'nnline00', type: 'line', fields: ['concept'], pattern: '{concept}' },
      ]),
      runInStat('nndrive0', 'drive'),
      runInStat('nntroubl', 'trouble'),
      runInStat('nnappear', 'appearance'),
      { id: 'nnrelati', type: 'entries', field: 'relationships', heading: 'Relationships', addLabel: 'Add relationship' },
      { id: 'nnnotes0', type: 'text', field: 'notes', heading: 'Notes' },
    ],
  },
  sample: { name: 'Character name' },
});
