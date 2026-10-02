import { ColorMatrixFilter, Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import { destroyTree } from '../utils/destroyTree';
import { StampScratch, stampRegion, tilesOf } from './StampScratch';
import type { TexelRegion } from './StampScratch';

/** Longest side of the explored memory in texels; it is drawn dim and soft, so this is plenty. */
const MAX_TEXELS = 2048;

/** White, covered by four times what the image's coverage is above a half: none up to a half, all from three quarters. */
const SHARPEN: ColorMatrixFilter['matrix'] = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 4, -2];

/**
 * What the viewer's tokens have seen so far, in a world-space texture over the map: red is 1
 * where a token has seen. It only grows until reset. Shapes that must stay inside the line of
 * sight are drawn through a mask of it.
 *
 * The texture is a plain 8-bit target. Each stamp is drawn anti-aliased, one tile at a time,
 * into a fixed scratch target (`StampScratch`) and merged in with `max`, so edges are smooth
 * and multisampling costs the same whatever the map's size.
 */
export class ExploredTexture {
  readonly texture: RenderTexture;
  private readonly scale: number;
  private readonly scratch: StampScratch;
  private readonly merge = new Container();
  private readonly mergeSprite = new Sprite();

  constructor(private readonly renderer: Renderer, bounds: MapBounds) {
    this.scale = Math.min(1, MAX_TEXELS / Math.max(bounds.width, bounds.height, 1));
    this.texture = RenderTexture.create({
      width: Math.max(1, Math.ceil(bounds.width * this.scale)),
      height: Math.max(1, Math.ceil(bounds.height * this.scale)),
    });
    this.scratch = new StampScratch(renderer);
    this.mergeSprite.blendMode = 'max';
    this.merge.addChild(this.mergeSprite);
    this.clear();
  }

  add(shapes: ExploredShapes): void {
    const region = stampRegion(shapes, this.scale, this.texture);
    if (!region) return;
    this.scratch.begin(shapes);
    for (const tile of tilesOf(region)) {
      this.mergeSprite.texture = this.scratch.renderTile(this.scale, tile.x, tile.y);
      this.mergeSprite.position.set(tile.x, tile.y);
      this.renderer.render({ container: this.merge, target: this.texture, clear: false });
    }
  }

  clear(): void {
    this.renderer.render({ container: new Container(), target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
  }

  /** Decodes a saved image of the memory; the caller draws it with `draw`, or destroys it if it came too late. */
  async decode(dataUrl: string): Promise<Texture> {
    const image = createEl('img', { attr: { src: dataUrl } });
    await image.decode();
    return Texture.from(image);
  }

  /**
   * Replaces the memory with a decoded image of it, which it then destroys. An image saved
   * smaller than the memory (`EXPLORED_SAVE_MAX`) spreads its edges when drawn back, past the
   * walls they ended at too: of such an image only what is more than half covered is kept
   * (`SHARPEN`), which is where the edges were. An image of the memory's own size is drawn as it is.
   */
  draw(image: Texture): void {
    const sprite = new Sprite(image);
    const sharpen = image.width < this.texture.width || image.height < this.texture.height ? new ColorMatrixFilter({ resolution: 1 }) : null;
    sprite.width = this.texture.width;
    sprite.height = this.texture.height;
    if (sharpen) {
      sharpen.matrix = SHARPEN;
      sprite.filters = [sharpen];
    }
    this.renderer.render({ container: sprite, target: this.texture, clear: true, clearColor: [0, 0, 0, 0] });
    destroyTree(sprite, { textures: true });
    sharpen?.destroy();
  }

  /** Replaces the memory with a saved image of it. */
  async load(dataUrl: string): Promise<void> {
    this.draw(await this.decode(dataUrl));
  }

  /**
   * The memory as a canvas, for saving: white, with the coverage as alpha. The texture holds
   * premultiplied white, which a canvas or PNG would premultiply again on loading and so
   * halve every soft edge with each save.
   */
  toCanvas(): HTMLCanvasElement {
    const { pixels, width, height } = this.renderer.extract.pixels({ target: this.texture });
    const image = new ImageData(width, height);
    for (let i = 0; i < pixels.length; i += 4) {
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = pixels[i]!;
    }
    const canvas = createEl('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    return canvas;
  }

  /**
   * Takes the memory away where `shapes` lie, with the smooth edges `add` draws: an edit by the
   * GM's hand (`ExploredMemory.edit`). Sight itself only ever adds. A texel on the edge loses the
   * share of it the shapes cover, so erasing exactly what was added leaves a trace on the edge
   * (at most a quarter of a texel's coverage); an undo step puts the texels back instead.
   */
  erase(shapes: ExploredShapes): void {
    this.mergeSprite.blendMode = 'erase';
    try {
      this.add(shapes);
    } finally {
      this.mergeSprite.blendMode = 'max';
    }
  }

  /** The texels `add` or `erase` would touch for `shapes`, or null when they lie outside the map. */
  regionOf(shapes: ExploredShapes): TexelRegion | null {
    return stampRegion(shapes, this.scale, this.texture);
  }

  destroy(): void {
    this.scratch.destroy();
    destroyTree(this.merge);
    this.texture.destroy(true);
  }
}
