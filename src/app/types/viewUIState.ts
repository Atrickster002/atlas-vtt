import type { ExploredBrushOptions } from '../lighting/exploredEdits';
import type { Point } from './visionTypes';

/** The tokens held at their starting positions. */
export type HeldTokens = Readonly<Record<string, Point>>;

export interface ViewUIState {

  // Panel visibility
  isGridSettingsOpen: boolean;
  isDMScreenOpen: boolean;
  isGridAlignmentOpen: boolean;
  isDiceLogOpen: boolean;
  isAssetManagerOpen: boolean;
  assetManagerInitialTab?: 'scenes' | 'maps' | 'encounters' | 'tokens' | 'party' | undefined;
  isCommandPaletteOpen: boolean;
  isDiceTrayOpen: boolean;
  /** The placed light whose popover is open, with its range rings on the map. */
  lightPopover: string | null;
  /** The light zone whose popover is open; never together with a light's. */
  lightZonePopover: string | null;
  /** The stairs (level link) whose popover is open. */
  levelLinkPopover: string | null;
  /** The opening or floor (level surface) whose popover is open. */
  levelSurfacePopover: string | null;
  /** The scene lighting settings panel, opened from the lighting tool's menu. */
  isSceneLightingPanelOpen: boolean;
  /** The tokens the pointer holds (pressed or dragged), each where it stood when taken; set through `holdTokens`. */
  heldTokens: HeldTokens;
  /** What the lighting tool's explored-memory mode does with a stroke: the one place the menu and the tool read it from. */
  exploredBrush: ExploredBrushOptions;
  /**
   * The level of the scene this view shows (`viewedLevelId` reads it): unset, or one the scene
   * does not have, is the first. Kept with the tab's camera, never with the scene, and never an undo step.
   */
  viewedLevel?: string | null | undefined;
  /** The toolbar editor is open in this view: tray, hide and show, inert tools. Never saved. */
  isToolbarEditing: boolean;
}
