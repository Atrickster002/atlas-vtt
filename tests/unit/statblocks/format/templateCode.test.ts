import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { templateHasCode } from '../../../../src/app/statblocks/format/templateCode';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { EVERY_BLOCK, FIVE_E_2024, MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

function read(extra: Record<string, unknown>, blocks: unknown[] = []): StatblockTemplate {
  const result = parseTemplate({
    format: TEMPLATE_FORMAT, version: 1, id: 'code-abc123', fields: [{ key: 'hp', label: 'HP', type: 'number' }],
    layout: { maxColumns: 2, blocks }, ...extra,
  });
  if (result.template === null) throw new Error(result.problems.join(' '));
  return result.template;
}

describe('templateHasCode', () => {
  it('finds none in templates built from native blocks', () => {
    expect(templateHasCode(MARSH_CREATURE)).toBe(false);
    expect(templateHasCode(FIVE_E_2024)).toBe(false);
  });

  it('counts a script block as code', () => {
    expect(templateHasCode(EVERY_BLOCK)).toBe(true);
    expect(templateHasCode(read({}, [{ type: 'section', blocks: [{ type: 'script', summary: 'x', fs: { type: 'property' } }] }]))).toBe(true);
  });

  it('finds a diceCallback hidden in a block\'s fsExtras', () => {
    expect(templateHasCode(read({}, [{ type: 'stat', field: 'hp', look: 'run-in', fsExtras: { diceCallback: 'return [];' } }]))).toBe(true);
  });

  it('finds code in the imported layout\'s extras and in unknown keys', () => {
    expect(templateHasCode(read({ importedFrom: { layoutId: 'l', layoutName: 'L', extras: { diceParsing: [{ regex: '', parser: 'x' }] } } }))).toBe(true);
    expect(templateHasCode(read({ future: { callback: 'return 1;' } }))).toBe(true);
    expect(templateHasCode(read({}, [{ type: 'stat', field: 'hp', look: 'run-in', callback: 'x' }]))).toBe(true);
  });

  it('finds code in blocks kept opaque and in values kept for writing back', () => {
    expect(templateHasCode(read({}, [{ type: 'javascript', code: 'return el;' }]))).toBe(true);
    expect(templateHasCode(read({}, [{ type: 'divider', showWhen: { callback: 'x' } }]))).toBe(true);
  });

  it('reads context: a table\'s modifier is code, a modifier elsewhere is not', () => {
    expect(templateHasCode(read({}, [{ type: 'table', modifier: 'x' }]))).toBe(true);
    expect(templateHasCode(read({ future: { modifier: 'x' } }))).toBe(false);
  });
});
