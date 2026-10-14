import { levelObjects, levelObjectsOn } from '../../../levels/levelObjects';
import { levelStack, levelsBelow, levelsShownBelow, stackGrid, type LevelStack, type StackLevel } from '../../../levels/levelStack';
import { levelSurfaceList } from '../../../levels/levelSurfaces';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import type { MapBounds } from '../../../vision/visibility';
import type { LightingState } from '../LightingRenderer';

/** A level below drawn, as the stack asks about it: whether its picture is ready, and its map. */
export interface StackedLevel {
  ready(): boolean;
  bounds(): MapBounds | null;
}

/** The levels below the view draws: none in a scene of one level or while the viewed level has no opening. */
export function wantedBelow(state: LightingState): string[] {
  const viewed = viewedLevelId(state);
  if (!hasLevels(state.levels) || viewed === null) return [];
  if (!levelSurfaceList(levelObjects(state).levelSurfaces).some((surface) => surface.open)) return [];
  return levelsShownBelow(state.levels, viewed);
}

/**
 * The view's level stack from the scene (`levelStack`), worked out again only when what it is made
 * of changed: the levels, the level shown, the map's size, the surfaces of every level from the
 * one shown down, and which levels below are drawn and ready, with their maps.
 */
export class BelowStackBuilder {
  private stack: LevelStack | null = null;
  private inputs: readonly unknown[] = [];

  current(): LevelStack | null {
    return this.stack;
  }

  build(state: LightingState, viewBounds: MapBounds, wanted: readonly string[], level: (id: string) => StackedLevel | undefined): LevelStack | null {
    const viewed = viewedLevelId(state);
    if (wanted.length === 0 || viewed === null || !state.levels) {
      this.reset();
      return null;
    }
    const below = levelsBelow(state.levels, viewed);
    const ready = wanted.filter((id) => level(id)?.ready());
    const bounds = ready.map((id) => level(id)!.bounds());
    const surfaces = [levelObjects(state).levelSurfaces, ...below.map((entry) => levelObjectsOn(state, entry.id).levelSurfaces)];
    const inputs = [state.levels, viewed, viewBounds.width, viewBounds.height, ...surfaces, ...ready, ...bounds.flatMap((rect) => [rect?.width, rect?.height])];
    if (this.stack && inputs.length === this.inputs.length && inputs.every((input, i) => input === this.inputs[i])) return this.stack;
    this.inputs = inputs;
    const stacked = (id: string, index: number): StackLevel => ({
      id,
      surfaces: levelSurfaceList(surfaces[index]),
      pictured: ready.includes(id) ? bounds[ready.indexOf(id)] ?? undefined : undefined,
    });
    this.stack = levelStack(stacked(viewed, 0), below.map((entry, i) => stacked(entry.id, i + 1)), ready, stackGrid(viewBounds));
    return this.stack;
  }

  reset(): void {
    this.stack = null;
    this.inputs = [];
  }
}
