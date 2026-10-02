import type { Renderer } from 'pixi.js';
import { wallRadius } from '../../../lighting/lightingConstants';
import { allSegments, splitBlocking } from '../../../lighting/segments';
import type { WallSegment } from '../../../types/wallTypes';
import type { MapBounds } from '../../../vision/visibility';
import { CapsuleField } from './CapsuleField';

/** The fields the composite reads: the walls that stop light, and those that stop sight. */
export interface BoundFields {
  light: CapsuleField;
  sight: CapsuleField;
}

/**
 * The wall fields of one map, each a distance field over the walls that concern its readers:
 *
 * - `tiles`: the two-way solid walls that block light, which every light's tile is traced through
 *   (a one-way wall joins a light's own field where it blocks from the light's side; a limited
 *   wall is in no tile's field: `LimitedMasks`);
 * - `light()`: every wall that blocks light, one-way and limited ones too, which bounce, the
 *   zones and the composite's wall faces treat as solid and as blocking both ways;
 * - `sight()`: every wall that blocks sight, limited ones too, which the explored memory's blur
 *   must not cross.
 *
 * A scene whose walls all block both and both ways has one field, read under all three names;
 * the second exists once there is a one-way or a limited wall and the third once a wall blocks one thing
 * only, and both are then kept (idle while unused), so the composite never holds a destroyed
 * field. A wall that blocks one thing is in the fields of that thing alone: to the other it is
 * no wall, in the leak guarantee of each field as anywhere else.
 */
export class WallFields {
  readonly tiles: CapsuleField;
  private lightField: CapsuleField | null = null;
  private sightField: CapsuleField | null = null;
  private hasOneWay = false;
  private hasKinds = false;
  private current: BoundFields;

  constructor(private readonly renderer: Renderer, private readonly bounds: MapBounds, private readonly texel: number) {
    this.tiles = this.create();
    this.current = { light: this.tiles, sight: this.tiles };
  }

  light(): CapsuleField {
    return this.hasOneWay ? this.lightField! : this.tiles;
  }

  sight(): CapsuleField {
    return this.hasKinds ? this.sightField! : this.light();
  }

  /** The fields the composite binds, the same object for as long as they are the same fields. */
  bound(): BoundFields {
    if (this.current.light !== this.light() || this.current.sight !== this.sight()) this.current = { light: this.light(), sight: this.sight() };
    return this.current;
  }

  rebuild(walls: readonly WallSegment[]): void {
    const light = splitBlocking(walls, 'light');
    this.tiles.build(light.twoWay);
    // Limited walls are walls for all but the tiles, like one-way ones.
    this.hasOneWay = light.oneWay.length > 0 || light.limited.length > 0;
    if (this.hasOneWay) {
      this.lightField ??= this.create();
      this.lightField.build(allSegments(light));
    }
    this.hasKinds = walls.some((wall) => wall.blocks !== undefined);
    if (this.hasKinds) {
      this.sightField ??= this.create();
      this.sightField.build(allSegments(splitBlocking(walls, 'sight')));
    }
  }

  destroy(): void {
    this.sightField?.destroy();
    this.lightField?.destroy();
    this.tiles.destroy();
  }

  private create(): CapsuleField {
    return new CapsuleField(this.renderer, [0, 0, this.bounds.width, this.bounds.height], this.texel, wallRadius(this.texel));
  }
}
