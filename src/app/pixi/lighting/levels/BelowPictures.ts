import { RenderTexture, type Matrix, type Renderer, type WebGLRenderer } from 'pixi.js';
import type { LevelStack } from '../../../levels/levelStack';
import type { TileView } from '../../mapImage/levelOfDetail';
import type { LightingMode } from '../engine/compositeFilter';

/** A render of the view the levels below are drawn for: one each for the canvas and the player window's frame. */
export interface BelowPicture {
  key: 'canvas' | 'frame';
  /** World pixels to the render's points. */
  camera: Matrix;
  /** The render's size in points, and its pixels per point. */
  width: number;
  height: number;
  resolution: number;
  mode: LightingMode;
  /** The map's tiles the render shows, where it is not the view's own camera. */
  tiles?: TileView | undefined;
}

/**
 * The textures the levels below are drawn into, one for each picture of the view (`BelowPicture`):
 * of that picture's size and pixels, so its composite takes from them texel on pixel, kept while
 * those stay. `unbind` lets the view's composite go of one before it is destroyed.
 */
export class BelowPictures {
  private readonly targets = new Map<BelowPicture['key'], RenderTexture>();

  constructor(private readonly renderer: Renderer, private readonly unbind: () => void) {}

  /** The texture of `picture`, made anew where its size or pixels changed. */
  targetFor({ key, width, height, resolution }: BelowPicture): RenderTexture {
    const current = this.targets.get(key);
    const [pixelWidth, pixelHeight] = [Math.max(1, Math.round(width * resolution)), Math.max(1, Math.round(height * resolution))];
    if (current && current.source.pixelWidth === pixelWidth && current.source.pixelHeight === pixelHeight && current.source.resolution === resolution) return current;
    if (current) this.drop(key, current);
    const target = RenderTexture.create({ width: pixelWidth / resolution, height: pixelHeight / resolution, resolution, antialias: false, scaleMode: 'nearest' });
    this.targets.set(key, target);
    return target;
  }

  /** Whether `picture` shows any texel of the stack that is not the viewed level. */
  shows(stack: LevelStack, picture: BelowPicture): boolean {
    const box = stack.box;
    if (!box) return false;
    const inverse = picture.camera.clone().invert();
    const corners = [[0, 0], [picture.width, 0], [0, picture.height], [picture.width, picture.height]].map(([x, y]) => inverse.apply({ x: x!, y: y! }));
    const { texel } = stack.grid;
    const [minX, maxX] = [Math.min(...corners.map((p) => p.x)), Math.max(...corners.map((p) => p.x))];
    const [minY, maxY] = [Math.min(...corners.map((p) => p.y)), Math.max(...corners.map((p) => p.y))];
    return maxX >= box.x * texel && minX <= (box.x + box.columns) * texel && maxY >= box.y * texel && minY <= (box.y + box.rows) * texel;
  }

  /**
   * PIXI draws a filter that reads the scene beneath it only through the back buffer, also into a
   * texture: without it a level below's composite would be skipped and its map show unlit.
   */
  canBlend(): boolean {
    return this.renderer.name === 'webgl' && (this.renderer as WebGLRenderer).backBuffer.useBackBuffer;
  }

  /** A picture's texture goes once nobody is shown it (the player window closed). */
  release(key: BelowPicture['key']): void {
    const target = this.targets.get(key);
    if (target) this.drop(key, target);
  }

  destroy(): void {
    for (const [key, target] of [...this.targets]) this.drop(key, target);
  }

  private drop(key: BelowPicture['key'], target: RenderTexture): void {
    this.unbind();
    target.destroy(true);
    this.targets.delete(key);
  }
}
