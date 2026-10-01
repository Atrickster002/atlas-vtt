/**
 * UI Visibility State Slice
 * Manages ephemeral per-view UI panel visibility so that multiple Atlas views
 * (e.g. two maps side-by-side) have independent panel states.
 *
 * NOT persisted — the partialize whitelist in storeFactory.ts excludes these.
 */

import type { HeldTokens } from '../lighting/sightOnDrop';

/** State fields added to ViewAtlasState */
export interface UISlice {
  // Panel visibility
  isGridSettingsOpen: boolean;
  isDMScreenOpen: boolean;
  isGridAlignmentOpen: boolean;
  isDiceLogOpen: boolean;
  isAssetManagerOpen: boolean;
  assetManagerInitialTab?: 'scenes' | 'maps' | 'encounters' | 'tokens' | undefined;
  isCommandPaletteOpen: boolean;
  isDiceTrayOpen: boolean;
  /** The placed light whose popover is open, with its range rings on the map. */
  lightPopover: string | null;
  /** The scene lighting settings panel, opened from the lighting tool's menu. */
  isSceneLightingPanelOpen: boolean;
  /** The tokens the pointer holds (pressed or dragged), each where it stood when taken; set through `holdTokens`. */
  heldTokens: HeldTokens;

  // Actions
  setGridSettingsOpen: (open: boolean) => void;
  setDMScreenOpen: (open: boolean) => void;
  setGridAlignmentOpen: (open: boolean) => void;
  setDiceLogOpen: (open: boolean) => void;
  openAssetManager: (tab?: UISlice['assetManagerInitialTab']) => void;
  closeAssetManager: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setDiceTrayOpen: (open: boolean) => void;
  openLightPopover: (lightId: string) => void;
  closeLightPopover: () => void;
  setSceneLightingPanelOpen: (open: boolean) => void;
  setHeldTokens: (held: HeldTokens) => void;
}

/** Default state — all panels closed */
export function createInitialUIState(): Pick<
  UISlice,
  | 'isGridSettingsOpen'
  | 'isDMScreenOpen'
  | 'isGridAlignmentOpen'
  | 'isDiceLogOpen'
  | 'isAssetManagerOpen'
  | 'assetManagerInitialTab'
  | 'isCommandPaletteOpen'
  | 'isDiceTrayOpen'
  | 'lightPopover'
  | 'isSceneLightingPanelOpen'
  | 'heldTokens'
> {
  return {
    isGridSettingsOpen: false,
    isDMScreenOpen: false,
    isGridAlignmentOpen: false,
    isDiceLogOpen: false,
    isAssetManagerOpen: false,
    assetManagerInitialTab: undefined,
    isCommandPaletteOpen: false,
    isDiceTrayOpen: false,
    lightPopover: null,
    isSceneLightingPanelOpen: false,
    heldTokens: {},
  };
}

/** Action creators — `set` comes from the immer middleware in the store */
export function createUIActions(
  set: (fn: (draft: UISlice) => void) => void,
): Pick<
  UISlice,
  | 'setGridSettingsOpen'
  | 'setDMScreenOpen'
  | 'setGridAlignmentOpen'
  | 'setDiceLogOpen'
  | 'openAssetManager'
  | 'closeAssetManager'
  | 'setCommandPaletteOpen'
  | 'setDiceTrayOpen'
  | 'openLightPopover'
  | 'closeLightPopover'
  | 'setSceneLightingPanelOpen'
  | 'setHeldTokens'
> {
  return {
    setGridSettingsOpen: (open) => set((draft) => { draft.isGridSettingsOpen = open; }),
    setDMScreenOpen: (open) => set((draft) => { draft.isDMScreenOpen = open; }),
    setGridAlignmentOpen: (open) => set((draft) => { draft.isGridAlignmentOpen = open; }),
    setDiceLogOpen: (open) => set((draft) => { draft.isDiceLogOpen = open; }),
    openAssetManager: (tab) => set((draft) => {
      draft.isAssetManagerOpen = true;
      draft.assetManagerInitialTab = tab;
    }),
    closeAssetManager: () => set((draft) => {
      draft.isAssetManagerOpen = false;
      draft.assetManagerInitialTab = undefined;
    }),
    setCommandPaletteOpen: (open) => set((draft) => { draft.isCommandPaletteOpen = open; }),
    setDiceTrayOpen: (open) => set((draft) => { draft.isDiceTrayOpen = open; }),
    openLightPopover: (lightId) => set((draft) => { draft.lightPopover = lightId; }),
    closeLightPopover: () => set((draft) => { draft.lightPopover = null; }),
    setSceneLightingPanelOpen: (open) => set((draft) => { draft.isSceneLightingPanelOpen = open; }),
    setHeldTokens: (held) => set((draft) => { draft.heldTokens = held; }),
  };
}
