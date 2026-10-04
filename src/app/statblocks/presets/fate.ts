// SPDX-License-Identifier: AGPL-3.0-only AND CC-BY-3.0

/**
 * The Fate NPC. Keys follow the Fate Core layout of Fantasy Statblocks, so its
 * notes render as they are; `stress` holds one number per stress track, which
 * the DM screen offers as boxes.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { FATE_SOURCE } from './attributions';
import { builtIn, headerRow, nameField, portraitField } from './presetParts';

export const FATE_NPC: BuiltInTemplate = builtIn('builtin:fate-npc', 'Fate NPC', 1, {
  source: FATE_SOURCE,
  fields: [
    nameField(),
    portraitField(),
    { key: 'description', label: 'Description', type: 'markdown' },
    { key: 'aspects', label: 'Aspects', type: 'markdown' },
    { key: 'temporaryAspects', label: 'Temporary Aspects', type: 'markdown' },
    { key: 'stress', label: 'Stress', type: 'scores', slots: ['Physical', 'Mental'] },
    { key: 'consequences', label: 'Consequences', type: 'entries' },
    { key: 'skills', label: 'Skills', type: 'entries' },
    { key: 'stunts', label: 'Stunts', type: 'entries' },
    { key: 'items', label: 'Items', type: 'entries' },
    { key: 'extras', label: 'Extras', type: 'entries' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      headerRow({ row: 'fahead00', section: 'faname00', image: 'faimage0' }, [
        { id: 'fatitle0', type: 'title', field: 'name', level: 1 },
        { id: 'fadesc00', type: 'text', field: 'description' },
        { id: 'faaspect', type: 'text', field: 'aspects', heading: 'Aspects' },
        { id: 'fatempor', type: 'text', field: 'temporaryAspects', heading: 'Temporary Aspects' },
      ]),
      { id: 'fadivid0', type: 'divider' },
      {
        id: 'fastress', type: 'section', heading: 'Stress', blocks: [
          { id: 'fastrscr', type: 'scores', field: 'stress', orientation: 'row' },
        ],
      },
      { id: 'faconseq', type: 'entries', field: 'consequences', heading: 'Consequences' },
      { id: 'faskills', type: 'entries', field: 'skills', heading: 'Skills', addLabel: 'Add skill' },
      { id: 'fastunts', type: 'entries', field: 'stunts', heading: 'Stunts', addLabel: 'Add stunt' },
      { id: 'faitems0', type: 'entries', field: 'items', heading: 'Items' },
      { id: 'faextras', type: 'entries', field: 'extras', heading: 'Extras' },
    ],
  },
  sample: { name: 'Character name', stress: [2, 2] },
});
