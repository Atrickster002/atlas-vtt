import type { NotePin } from '../../types';
import type { PinActionEventDetail } from '../../types/atlasWindowEvents';

/** Asks the note pin tool to open or edit `pin`. */
export function dispatchPinAction(action: PinActionEventDetail['action'], pin: NotePin): void {
  window.dispatchEvent(new CustomEvent('atlas-pin-action', { detail: { action, pin } }));
}
