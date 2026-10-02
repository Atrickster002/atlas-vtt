import type { PaintVariant } from './paint/paintShapes';

/**
 * What a painted element is. The role decides the silhouette here and the fill in the
 * skin's stylesheet, as in Armarium: a `PaperSheet` in one of its tones, a key plate, or a
 * plate of ink.
 */
export type PaintRole = 'window' | 'sheet' | 'leaf' | 'note' | 'key' | 'ink';

export const ROLE_VARIANT: Record<PaintRole, PaintVariant> = {
  window: 'torn-window',
  sheet: 'torn-sheet',
  leaf: 'torn-leaf',
  note: 'torn-note',
  key: 'key-plate',
  ink: 'brush-plate',
};

/** Windows and dialogs whose content paints up to their edge: a sheet that tears outwards only. */
const WINDOWS = [
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
  '.atlas-loot-roller',
  '.dice-roll-log',
];

/** Lists that open over the page: Armarium's dropdown sheet. */
const SHEETS = [
  '.atlas-ctx-menu',
  '.atlas-dropdown-content',
  '.atlas-select-content',
  '.atlas-am-menu',
  '.atlas-search-suggestions',
  '.atlas-active-filter-group__list',
  '.atlas-collection-dropdown-content',
  '.atlas-move-folder-list',
  '.atlas-asset-manager-header .atlas-filter-panel',
  '.atlas-note-pin-dropdown',
  '.pin-place-flyout',
];

/** What lies on the map: bars, trackers, cards. Armarium's leaf, with a fine fray. */
const LEAVES = [
  '.atlas-vtt-toolbar',
  '.atlas-scene-tab-bar',
  '.atlas-scene-switcher__panel',
  '.atlas-initiative-tracker',
  '.atlas-player-initiative',
  '.atlas-asset-manager-sidebar.atlas-floating',
  '.atlas-grid-alignment-panel',
  '.atlas-progress-modal',
  '.atlas-dice-panel',
  '.atlas-light-panel',
  '.atlas-light-popover',
  '.atlas-token-value-editor',
  '.atlas-statblock',
  '.atlas-statblock-missing-hint',
  '.atlas-map-link-preview',
];

/** Small slips of paper. */
const NOTES = [
  '.atlas-widget',
  '.atlas-dice-roll__chip',
  '.atlas-toast',
  '.atlas-initiative-card',
];

/** What is chosen among tabs lies on a stroke of ink, and so does the name of a window or a section. */
const INKED = [
  '.atlas-tab-button.atlas-active',
  '.atlas-segmented__option.atlas-active',
  '.atlas-scene-tab--active',
  '.atlas-collection-settings-tab.atlas-active',
  '.atlas-dropdown-mode-btn--active',
  '.atlas-loot-pane-tab.atlas-active',
  // Title plates.
  '.atlas-collection-settings-header :is(h1, h2, h3)',
  '.atlas-modal-header :is(h1, h2, h3)',
  '.atlas-section-header h3',
];

/** Keys: buttons, and the tool that is in hand. */
const KEYS = [
  '.btn--toolbar.is-active',
  '.btn--default',
  '.btn--destructive',
  '.btn--secondary',
  '.btn--outline',
  '.atlas-native-modal button',
  '.atlas-text-dialog button',
  '.atlas-modal-footer button',
  '.atlas-asset-manager-create-btn',
  '.atlas-csm-add-btn',
];

export interface PaintRule {
  selector: string;
  role: PaintRole;
}

const rules = (selectors: string[], role: PaintRole): PaintRule[] => selectors.map((selector) => ({ selector, role }));

/** Which elements the paper skin paints. The first rule an element matches decides. */
export const PAINT_RULES: readonly PaintRule[] = [
  ...rules(INKED, 'ink'),
  ...rules(WINDOWS, 'window'),
  ...rules(SHEETS, 'sheet'),
  ...rules(LEAVES, 'leaf'),
  ...rules(NOTES, 'note'),
  ...rules(KEYS, 'key'),
];

/** Every painted selector as one, for a single query. */
export const PAINT_SELECTOR = PAINT_RULES.map((rule) => rule.selector).join(',');

/** The role an element is painted in, if any. */
export function paintRoleOf(element: Element): PaintRole | null {
  return PAINT_RULES.find((rule) => element.matches(rule.selector))?.role ?? null;
}
