import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock } from '../../../../../src/app/online/protocol/index.ts';
import { allBuiltInTemplates } from '../../../../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../../../../src/app/statblocks/model/sampleValues';
import { StatblockSheet } from '../../../../../src/app/statblocks/render/StatblockSheet';
import { resolvedOf, statblockTexts, wordsOf } from './sheetKit';

/** The words of the card as Atlas draws it for a reader. */
function cardWords(template: Parameters<typeof StatblockSheet>[0]['template'], fields: Record<string, unknown>): Set<string> {
  const { container, unmount } = render(<StatblockSheet template={template} fields={fields} name="Parity" variant="full" />);
  const texts: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node.textContent ?? '');
  unmount();
  return wordsOf(texts);
}

describe('a player\'s sheet and the Atlas card', () => {
  for (const builtIn of allBuiltInTemplates()) {
    it(`show the same text for ${builtIn.name}`, () => {
      const fields = sampleRecord(builtIn.template);
      const statblock = statblockSheet({ resolved: resolvedOf(builtIn.template, fields), definitions: [], resources: undefined });
      expect(statblock).not.toBeNull();
      expect(parseBookStatblock(statblock)).toEqual(statblock);
      const card = cardWords(builtIn.template, fields);
      const sheet = wordsOf(statblockTexts(statblock!));
      const unnamed = wordsOf(statblockTexts(statblock!, false));
      expect([...card].filter((word) => !sheet.has(word)), 'on the card, not on the sheet').toEqual([]);
      expect([...unnamed].filter((word) => !card.has(word)), 'on the sheet, not on the card').toEqual([]);
    });
  }
});
