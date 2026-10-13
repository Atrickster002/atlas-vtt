import { NO_STRETCH, readMapStretch, sameStretch, type MapStretch } from '../grid/mapStretch';
import type { GridState } from '../types/gridTypes';
import type { LevelAlignment, SceneLevel } from '../types/sceneLevelTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { firstLevelId, viewedLevelId, type LevelView, type SceneLevels } from './sceneLevels';

/** The alignments of a scene's levels, by level id; a level without one has none here. */
export type LevelAlignments = Record<string, LevelAlignment>;

/** What a level's image placement is read from. */
export interface AlignedScene {
  levels?: SceneLevels;
  grid: GridState | null;
  levelAlignments?: LevelAlignments | undefined;
}

/** Scales a level's image is fitted with; anything else is no fit of a printed grid. */
const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

/** A level's alignment as a file has it; undefined for anything that is none. The stretch is read like the scene's. */
export function readLevelAlignment(value: unknown): LevelAlignment | undefined {
  if (!isRecord(value) || !isRecord(value.offset)) return undefined;
  const { scale, offset } = value;
  if (!isFiniteNumber(scale) || scale < MIN_SCALE || scale > MAX_SCALE) return undefined;
  if (!isFiniteNumber(offset.x) || !isFiniteNumber(offset.y)) return undefined;
  return { offset: { x: Math.max(0, offset.x), y: Math.max(0, offset.y) }, scale, stretch: readMapStretch(value.stretch) };
}

/** How a level's alignment draws its image: the stretch scaled, placed at its offset. */
function placementOf({ offset, scale, stretch }: LevelAlignment): MapStretch {
  const placed = offset.x > 0 || offset.y > 0;
  return {
    x: stretch.x * scale,
    y: stretch.y * scale,
    ...(stretch.rotation ? { rotation: stretch.rotation } : {}),
    ...(placed ? { offset: { x: offset.x, y: offset.y } } : {}),
  };
}

/**
 * How level `levelId`'s map image is drawn on the scene's grid: the one function that answers it.
 * A level with an alignment of its own is drawn by it, wherever it stands; the first level without
 * one is drawn as the scene's grid alignment says (`GridState.mapStretch`), as every scene was
 * before levels; any other level without one is drawn as it is.
 */
export function levelImagePlacement(scene: AlignedScene, levelId: string | null): MapStretch {
  const alignment = levelId === null ? undefined : scene.levelAlignments?.[levelId];
  if (alignment) return placementOf(alignment);
  if (levelId === null || levelId === firstLevelId(scene.levels)) return readMapStretch(scene.grid?.mapStretch);
  return NO_STRETCH;
}

/** How the image of the level a view shows is drawn. */
export function viewedImagePlacement(state: AlignedScene & LevelView): MapStretch {
  return levelImagePlacement(state, viewedLevelId(state));
}

/**
 * Whether aligning on level `levelId` aligns the scene's grid (the first level without an
 * alignment of its own, as before levels), or fits that level's image to the grid as it is.
 */
export function alignsSceneGrid(scene: AlignedScene, levelId: string | null): boolean {
  return levelId === null || (levelId === firstLevelId(scene.levels) && !scene.levelAlignments?.[levelId]);
}

/** The alignments the levels of a scene file carry, by level id; undefined where none does. */
export function levelAlignmentsOf(levels: readonly SceneLevel[] | undefined): LevelAlignments | undefined {
  const entries = (levels ?? []).flatMap((level) => (level.alignment ? [[level.id, level.alignment] as const] : []));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** `levels` without the alignments they carried, which the view state keeps beside them. */
export function withoutAlignments(levels: SceneLevel[] | undefined): SceneLevel[] | undefined {
  if (!levels?.some((level) => level.alignment !== undefined)) return levels;
  return levels.map(({ alignment: _alignment, ...level }) => level);
}

/** How level `levelId`'s image is drawn on its own, from its corner, while its grid is found anew: its alignment's stretch alone. */
export function levelImageOnItsOwn(scene: AlignedScene, levelId: string | null): MapStretch {
  return (levelId === null ? undefined : scene.levelAlignments?.[levelId]?.stretch) ?? NO_STRETCH;
}

/** Whether two alignments draw the image alike. */
export function sameAlignment(a: LevelAlignment | undefined, b: LevelAlignment | undefined): boolean {
  if (!a || !b) return a === b;
  return sameStretch(placementOf(a), placementOf(b));
}
