/**
 * The keys of the template editor's shell (§11.1), asked before the block
 * keys: Mod+Alt+1…4 open the dock's panels, Shift+Enter opens Settings, and
 * Escape puts away an unpinned dock panel, then Settings, before it reaches
 * the selection. Only while focus is inside the editor (its root's listener).
 */

import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { DOCK_PANELS } from '../dock/dockPanels';
import type { FloatingPanels } from '../dock/useFloatingPanels';

/** Text being typed keeps Enter and Escape. */
function typing(target: EventTarget | null): boolean {
  const element = target as Partial<HTMLElement> | null;
  if (!element || typeof element.closest !== 'function') return false;
  return element.isContentEditable === true || (element as Element).closest('input, textarea, select') !== null;
}

/** True when the shell took the key. */
export function handleShellKey(event: KeyboardEvent, floats: Pick<FloatingPanels, 'toggleDock' | 'openSettings' | 'escape'>): boolean {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.altKey && !event.shiftKey) {
    // By code: Alt changes the character a digit types on macOS.
    const panel = DOCK_PANELS.find((spec) => event.code === `Digit${spec.digit}`);
    if (!panel) return false;
    floats.toggleDock(panel.id);
    return true;
  }
  if (event.key === 'Enter' && event.shiftKey && !mod && !event.altKey && !typing(event.target)) {
    floats.openSettings();
    return true;
  }
  if (event.key === 'Escape' && !typing(event.target) && !handledByAnotherControl(event)) return floats.escape();
  return false;
}
