/**
 * The pane's "Link to a token…" (§7.2, D13): a statblock without a token gets
 * one through the token picker, which links the chosen token's art to the
 * note as the asset manager's link does.
 */

import { TFile, type App } from 'obsidian';
import { TokenPickerModal } from '../../packages/components/token-picker/TokenPickerModal';
import type { StatblockPaneActions } from './statblock-pane/paneTypes';

export function paneTokenLinkActions(app: App): Pick<StatblockPaneActions, 'linkToToken'> {
  return {
    linkToToken: (notePath) => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) new TokenPickerModal(app, file, () => undefined).open();
    },
  };
}
