import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { VIEWED, type LevelStack } from '../../../levels/levelStack';
import type { CompositeStack } from '../engine/compositeFilter';

/**
 * The level stack on the graphics card, for the composites to read and to erase the viewed
 * level's map with: one texel per stack texel over the stack's box, with a border of texels that
 * show the viewed level. Red is the level a texel shows; alpha is 1 where that is not the viewed
 * level. Read only texel by texel (`texelFetch`, `nearest`), never filtered, so the picture and the
 * rule read the same byte.
 *
 * `eraser` is a sprite of it in world space with `erase` blending: put between the map's grid and
 * the tokens, it takes away the map and the grid's backing wherever the view shows another level,
 * so what is left of the scene there is the viewed level's own tokens. The border keeps the edge
 * of the sprite's quad, whose pixels a multisampled canvas covers in part, clear of every hole.
 */
export class LevelStackTexture {
  readonly eraser = new Sprite({ texture: Texture.EMPTY, label: 'level-openings-eraser', eventMode: 'none' });
  private texture: Texture | null = null;
  private stack: LevelStack | null = null;
  private bound: CompositeStack | null = null;

  constructor() {
    this.eraser.blendMode = 'erase';
    this.eraser.visible = false;
  }

  /** What the composites read: null while the stack shows only the viewed level. */
  get composite(): CompositeStack | null {
    return this.bound;
  }

  /**
   * Uploads `stack` and hands what the composites read to `bind` (null while the stack shows only
   * the viewed level) before the texture they read until now is destroyed. The same stack again does nothing.
   */
  update(stack: LevelStack | null, bind: (composite: CompositeStack | null) => void): void {
    if (stack === this.stack) return;
    this.stack = stack;
    const box = stack?.box;
    if (!stack || !box) {
      this.bound = null;
      bind(null);
      this.release();
      return;
    }
    const columns = box.columns + 2;
    const rows = box.rows + 2;
    const pixels = new Uint8Array(columns * rows * 4);
    for (let row = 0; row < box.rows; row++) {
      for (let column = 0; column < box.columns; column++) {
        const shown = stack.cells[row * box.columns + column]!;
        const at = ((row + 1) * columns + column + 1) * 4;
        pixels[at] = shown;
        pixels[at + 3] = shown === VIEWED ? 0 : 255;
      }
    }
    const previous = this.texture;
    this.texture = new Texture({
      source: new BufferImageSource({ resource: pixels, width: columns, height: rows, format: 'rgba8unorm', scaleMode: 'nearest', alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: false }),
    });
    const { texel } = stack.grid;
    this.eraser.texture = this.texture;
    this.eraser.position.set((box.x - 1) * texel, (box.y - 1) * texel);
    this.eraser.scale.set(texel);
    this.eraser.visible = true;
    this.bound = { texture: this.texture, box: { x: box.x - 1, y: box.y - 1, columns, rows }, texel, columns: stack.grid.columns, rows: stack.grid.rows };
    bind(this.bound);
    previous?.destroy(true);
  }

  /** Lets go of the texture, which nothing may read any more. */
  private release(): void {
    this.bound = null;
    this.eraser.visible = false;
    this.eraser.texture = Texture.EMPTY;
    this.texture?.destroy(true);
    this.texture = null;
  }

  destroy(): void {
    this.stack = null;
    this.release();
    this.eraser.destroy();
  }
}
