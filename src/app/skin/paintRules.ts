import type { PaintKind } from './paint/paintShapes';

/** Which elements the paper skin paints, and with what. The first rule an element matches decides. */
export interface PaintRule {
  selector: string;
  kind: PaintKind;
}

/** Windows and dialogs: sheets with a deep tear. */
const SHEETS = [
  '.atlas-asset-manager-container',
  '.atlas-modal',
  '.atlas-collection-settings-modal',
  '.atlas-transfer-dialog',
  '.atlas-token-creator__window',
  '.atlas-create-scene-container',
  '.atlas-create-collection',
  '.atlas-statblock-link',
  '.atlas-tag-manager-content',
  '.atlas-command-palette-container',
  '.atlas-note-preview-window',
  '.atlas-player-loot__window',
  '.atlas-asset-manager-move-container',
  '.atlas-onboarding-card',
  '.atlas-hotkey-help-card',
  '.atlas-text-dialog',
  '.modal.atlas-native-modal',
  '.atlas-dm-notes-section',
];

/** Bars, menus, popovers and cards: notes with a fine tear. */
const NOTES = [
  '.atlas-vtt-toolbar',
  '.atlas-scene-tab-bar',
  '.atlas-scene-switcher__panel',
  '.atlas-widget',
  '.atlas-ctx-menu',
  '.atlas-dropdown-content',
  '.atlas-select-content',
  '.atlas-am-menu',
  '.atlas-search-suggestions',
  '.atlas-active-filter-group__list',
  '.atlas-collection-dropdown-content',
  '.atlas-move-folder-list',
  '.atlas-asset-manager-header .atlas-filter-panel',
  '.atlas-asset-manager-sidebar.atlas-floating',
  '.atlas-grid-alignment-panel',
  '.atlas-progress-modal',
  '.atlas-dice-panel',
  '.atlas-dice-roll__chip',
  '.dice-roll-log',
  '.atlas-loot-roller',
  '.atlas-light-panel',
  '.atlas-light-popover',
  '.atlas-token-value-editor',
  '.atlas-note-pin-dropdown',
  '.pin-place-flyout',
  '.atlas-statblock',
  '.atlas-statblock-missing-hint',
  '.atlas-player-initiative',
  '.atlas-initiative-tracker',
  '.atlas-map-link-preview',
  '.tooltip-content',
  '.atlas-toast',
];

/** What is switched on or chosen: a stroke of ink behind it. */
const BRUSHED = [
  '.btn--toolbar.is-active',
  '.atlas-tab-button.atlas-active',
  '.atlas-segmented__option.atlas-active',
  '.atlas-scene-tab--active',
  '.atlas-collection-settings-tab.atlas-active',
  '.atlas-dropdown-mode-btn--active',
  '.atlas-loot-pane-tab.atlas-active',
];

/** Keys: buttons that are pressed, and the frames of tool groups. */
const KEYS = [
  '.btn--default',
  '.btn--destructive',
  '.btn--secondary',
  '.btn--outline',
  '.atlas-tool-group',
  '.atlas-native-modal button',
  '.atlas-text-dialog button',
  '.atlas-modal-footer button',
  '.atlas-asset-manager-create-btn',
  '.atlas-csm-add-btn',
];

/** Rows and cards inside a panel: a box drawn by hand. */
const FRAMES = [
  '.atlas-initiative-card',
  '.dice-log-entry',
  '.atlas-loot-card',
  '.atlas-csm-preset',
  '.atlas-csm-condition',
  '.atlas-csm-creature-field',
  '.atlas-csm-toggle-row',
  '.atlas-csm-sense-list',
  '.atlas-csm-token-stage',
  '.atlas-csm-loot-base',
  '.atlas-sb-token-list',
];

const rules = (selectors: string[], kind: PaintKind): PaintRule[] => selectors.map((selector) => ({ selector, kind }));

export const PAINT_RULES: readonly PaintRule[] = [
  ...rules(BRUSHED, 'brush'),
  ...rules(SHEETS, 'sheet'),
  ...rules(NOTES, 'note'),
  ...rules(KEYS, 'key'),
  ...rules(FRAMES, 'frame'),
];

/** Every painted selector as one, for a single query. */
export const PAINT_SELECTOR = PAINT_RULES.map((rule) => rule.selector).join(',');

/** The kind of paint an element gets, if any. */
export function paintKindOf(element: Element): PaintKind | null {
  return PAINT_RULES.find((rule) => element.matches(rule.selector))?.kind ?? null;
}
