import { describe, expect, it } from 'vitest';
import { clearPatches, hasValues } from '../../../../src/app/statblocks/editor/statblock-pane/paneTemplateEdits';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const spells: TemplateBlock = { id: 'spells01', type: 'spells', field: 'spells', heading: 'Spellcasting' };
const defenses: TemplateBlock = {
  id: 'sec00001', type: 'section', heading: 'Defenses', blocks: [
    { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' },
    { id: 'stat-hp1', type: 'stat', field: 'hp', look: 'run-in' },
  ],
};
const shown = template([defenses, spells], [
  { key: 'ac', label: 'Armor Class', type: 'number' },
  { key: 'hp', label: 'Hit Points', type: 'number', formerKeys: ['hit_points'] },
  { key: 'spells', label: 'Spells', type: 'spells' },
]);

/** "Clear … on this statblock" (spec §5.5, B3): deletes this note's values of what the block shows, nothing else. */
describe('clearPatches', () => {
  it('deletes the value of every property a block shows, a container\'s blocks included, under the key the note uses', () => {
    expect(clearPatches(shown, defenses, { ac: 17, hit_points: 135, spells: 'Fireball' })).toEqual([
      { op: 'delete', path: ['ac'], base: 17 },
      { op: 'delete', path: ['hit_points'], base: 135 },
    ]);
  });

  it('has nothing to clear where the note holds no value for the block', () => {
    expect(clearPatches(shown, spells, { ac: 17 })).toEqual([]);
    expect(hasValues(shown, spells, { ac: 17 })).toBe(false);
    expect(hasValues(shown, spells, { spells: ['Fireball'] })).toBe(true);
  });
});
