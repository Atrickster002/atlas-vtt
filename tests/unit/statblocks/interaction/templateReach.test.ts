import { describe, expect, it } from 'vitest';
import {
  addHeaderText, copyMadeText, removedLiveText, removedToastText, removeRowText, templateReachOf,
} from '../../../../src/app/statblocks/editor/statblock-pane/templateReach';

/** How far a change of a note's template reaches, in the panel's words (spec §5.5, §13). */
describe('templateReach', () => {
  const own = templateReachOf({ builtIn: false, name: 'Hill folk', usage: 1, copy: null });
  const shared = templateReachOf({ builtIn: false, name: 'Hill folk', usage: 3, copy: null });
  const withCopy = templateReachOf({ builtIn: true, name: '5E (2014 rules)', usage: 12, copy: { id: 'copy-1', usage: 2 } });
  const noCopy = templateReachOf({ builtIn: true, name: '5E (2014 rules)', usage: 12, copy: null });

  it('names the remove row for each kind of template', () => {
    expect(removeRowText(own, 'Spells')).toBe('Remove Spells from Hill folk');
    expect(removeRowText(shared, 'Spells')).toBe('Remove Spells from Hill folk · 3 statblocks');
    expect(removeRowText(withCopy, 'Spells')).toBe('Remove Spells from your copy of 5E (2014 rules) · 3 statblocks');
    expect(removeRowText(noCopy, 'Spells')).toBe('Remove Spells (makes your own copy of 5E (2014 rules))');
  });

  it('names the add menu\'s header for each kind', () => {
    expect(addHeaderText(shared)).toBe('Adds to Hill folk · 3 statblocks (hidden where empty)');
    expect(addHeaderText(withCopy)).toBe('Adds to your copy of 5E (2014 rules) · 3 statblocks');
    expect(addHeaderText(noCopy)).toBe('Adds to your own copy of 5E (2014 rules) (makes it now)');
  });

  it('says what a removal did, values kept, and how to undo it', () => {
    expect(removedToastText(own, 'Spells')).toBe('Removed Spells from Hill folk. The values stay in the note.');
    expect(removedToastText(shared, 'Spells')).toBe('Removed Spells from Hill folk. The values stay in the notes.');
    expect(removedLiveText(shared, 'Spells', true)).toBe('Removed Spells from Hill folk, 3 statblocks. Press Command Z to undo.');
    expect(removedLiveText(own, 'Spells', false)).toBe('Removed Spells from Hill folk. Press Ctrl Z to undo.');
    expect(copyMadeText('5E (2014 rules)', 'Aboleth')).toBe('Made your own copy of 5E (2014 rules). Aboleth uses it now.');
  });
});
