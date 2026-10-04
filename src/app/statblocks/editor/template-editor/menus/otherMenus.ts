/** The template editor's menus on other targets (spec §5.4): empty card space, and a template from a newer Atlas. */

import { SEPARATOR, tidy, type SurfaceAction } from '../../interaction/surfaceActions';
import { shortcutText } from '../shortcutText';

export interface EmptyCardInput {
  editable: boolean;
  canPaste: boolean;
  addAtEnd: () => void;
  pasteAtEnd: () => void;
  openSettings?: (() => void) | undefined;
}

/** A right-click on the card where no block is. */
export function emptyCardMenu(input: EmptyCardInput): SurfaceAction[] {
  return tidy([
    { kind: 'item', id: 'add-at-end', label: 'Add at the end…', icon: 'plus', hint: '/', disabled: !input.editable, run: input.addAtEnd },
    ...(input.canPaste ? [{ kind: 'item', id: 'paste-at-end', label: 'Paste at the end', icon: 'clipboard-paste', hint: shortcutText(['Mod'], 'V'), disabled: !input.editable, run: input.pasteAtEnd } satisfies SurfaceAction] : []),
    SEPARATOR,
    ...(input.openSettings ? [{ kind: 'item', id: 'template-settings', label: 'Template settings…', icon: 'settings-2', run: input.openSettings } satisfies SurfaceAction] : []),
  ]);
}

/** A template from a newer Atlas: the card renders, nothing changes it here. */
export function newerTemplateMenu(): SurfaceAction[] {
  return [{ kind: 'item', id: 'newer', label: 'This template is from a newer Atlas. Update Atlas to edit it.', disabled: true, run: () => undefined }];
}
