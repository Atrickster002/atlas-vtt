import { describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';

const opened = vi.hoisted(() => [] as string[]);
vi.mock('../../../../src/app/packages/components/token-picker/TokenPickerModal', () => ({
  TokenPickerModal: class {
    constructor(_app: unknown, private readonly file: TFile) {}
    open(): void {
      opened.push(this.file.path);
    }
  },
}));

import { paneTokenLinkActions } from '../../../../src/app/statblocks/editor/tokenLinkAction';

describe('the pane\'s Link to a token…', () => {
  it('opens the token picker for the statblock note, and nothing for a path that is no note', () => {
    const note = new TFile('Bestiary/Marsh Warden.md');
    const app = { vault: { getAbstractFileByPath: (path: string) => (path === note.path ? note : null) } } as unknown as App;
    const { linkToToken } = paneTokenLinkActions(app);
    linkToToken?.(note.path, 'campaign');
    linkToToken?.('Gone.md', 'campaign');
    expect(opened).toEqual([note.path]);
  });
});
