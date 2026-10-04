import { describe, expect, it } from 'vitest';
import {
  moreOptionsInUse, propertySummary, settingBadges, themesSummary, visibilitySummary, writeAsSummary,
} from '../../../../src/app/statblocks/editor/template-editor/inspector/groupSummaries';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { sampleTemplate } from './editorKit';

const STAT: TemplateBlock = { id: 'stat0001', type: 'stat', field: 'hp', look: 'run-in' };

/** What folded Settings groups and Structure say (spec §10.3, §10.7). */
describe('settings summaries', () => {
  it('say in plain words what each folded group holds', () => {
    const template = sampleTemplate();
    expect(visibilitySummary(STAT, template)).toBe('Hides when empty');
    expect(visibilitySummary({ ...STAT, whenEmpty: 'fallback', showWhen: { field: 'ac', is: 'above', value: 12 } }, template))
      .toBe('Only when Armor class is above 12 · Shows text when empty');
    expect(writeAsSummary(STAT)).toBe('As it is');
    expect(writeAsSummary({ ...STAT, pattern: '{hp} ({hd})', rollFrom: 'hd' })).toBe('{hp} ({hd}) · rolls dice');
    expect(propertySummary({ key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' })).toBe('Number · Hit points');
    expect(themesSummary(STAT)).toBe('None');
  });

  it('dot the toolbar\'s Settings and badge Structure rows for what is set past the basics', () => {
    expect(moreOptionsInUse(STAT)).toBe(false);
    expect(moreOptionsInUse({ ...STAT, className: 'hp' })).toBe(true);
    expect(settingBadges({ ...STAT, showWhen: { field: 'ac', is: 'present' }, pattern: '{hp}', whenEmpty: 'fallback' })).toEqual(['condition', 'write-as', 'fallback']);
    expect(settingBadges(STAT)).toEqual([]);
  });
});
