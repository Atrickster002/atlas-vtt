import { AlphaFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons, type ExploredEditMode } from '../../lighting/exploredEdits';
import type { ShapeStroke } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { destroyTree } from '../utils/destroyTree';
import { drawStrokeArea } from '../utils/strokePreview';

/** Above the lighting (90), so it is not darkened with the map; below the wall lines and every marker. */
export const EXPLORED_OVERLAY_Z_INDEX = 91;
/** Faint: the map and its light stay readable through it. */
const OVERLAY_ALPHA = 0.22;
/** The outline of a stroke that reveals, and of one that forgets, as the fog tool draws them. */
const STROKE_COLORS: Record<ExploredEditMode, number> = { reveal: 0xffffff, forget: 0xff4444 };
const OUTLINE_WIDTH = 2;

/**
 * What the scene remembers, as the GM sees it while editing: the explored memory's own texture
 * in the theme's accent, faint over the map, with the stroke under way as it will land (a
 * reveal adds to the tint, a forget cuts it away), its outline and the brush's ring. The tint
 * and the stroke are drawn into one layer that is faded as a whole, so a stroke that crosses
 * itself, or memory, is no darker there. A GM overlay (`GmOverlays`).
 */
export class ExploredOverlay {
  readonly view = new Container({ label: 'explored-memory', zIndex: EXPLORED_OVERLAY_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly layer = new Container();
  private readonly memory = new Sprite(Texture.EMPTY);
  private readonly pending = new Graphics();
  private readonly outline = new Graphics();
  private readonly cursor = new FogCursorPreview();
  private readonly fade = new AlphaFilter({ alpha: OVERLAY_ALPHA, resolution: 'inherit' });
  /** How many points of the brush stroke under way `pending` holds. */
  private brushed = 0;
  private tint = 0xffffff;

  constructor(private readonly viewport: Viewport) {
    this.layer.filters = [this.fade];
    this.layer.addChild(this.memory, this.pending);
    this.view.addChild(this.layer, this.outline, this.cursor.getDisplayObject());
    this.view.visible = false;
    viewport.addChild(this.view);
  }

  /** The memory's texture over a map of `bounds`, or none: taken before the last one is destroyed. */
  setTexture(texture: Texture | null, bounds: MapBounds | null): void {
    // The memory may let go of its texture after the overlay is gone.
    if (this.view.destroyed) return;
    this.memory.texture = texture ?? Texture.EMPTY;
    this.memory.visible = !!texture && !!bounds;
    if (bounds) this.memory.setSize(bounds.width, bounds.height);
  }

  /** The colour the memory shows in: the theme's accent. */
  setTint(color: number): void {
    this.tint = color;
    this.memory.tint = color;
  }

  /** The brush's ring at the pointer, in the stroke's colour; hidden for the other shapes and without a pointer. */
  drawCursor(at: Point | null, stroke: ShapeStroke, mode: ExploredEditMode): void {
    if (!at || stroke.mode !== 'brush') {
      this.cursor.hide();
      return;
    }
    this.cursor.setBrushRadius(stroke.brushRadius);
    this.cursor.updatePosition(at.x, at.y);
    this.cursor.show(mode === 'forget');
  }

  /** The stroke under way: what it will do to the memory, and the outline of a lasso or rectangle. */
  drawStroke(stroke: ShapeStroke, mode: ExploredEditMode): void {
    const shape = stroke.shape();
    this.pending.blendMode = mode === 'forget' ? 'erase' : 'normal';
    if (shape?.type === 'brush') {
      // Only the stretches added since the last draw: a long stroke is not built anew on every move.
      const from = Math.max(0, this.brushed - 1);
      this.fill(strokePolygons({ ...shape, points: shape.points.slice(from) }));
      this.brushed = shape.points.length;
    } else {
      this.pending.clear();
      this.brushed = 0;
      if (shape) this.fill(strokePolygons(shape));
    }
    // The layer shows the area itself, as the memory will hold it.
    drawStrokeArea(this.outline, stroke, STROKE_COLORS[mode], OUTLINE_WIDTH / this.viewport.scale.x, false);
  }

  clearStroke(): void {
    this.pending.clear();
    this.outline.clear();
    this.brushed = 0;
  }

  destroy(): void {
    this.layer.filters = null;
    this.fade.destroy();
    this.cursor.destroy();
    // The texture is the memory's own.
    this.memory.texture = Texture.EMPTY;
    destroyTree(this.view);
  }

  private fill(polygons: readonly Point[][]): void {
    for (const polygon of polygons) this.pending.poly(polygon.flatMap((point) => [point.x, point.y])).fill({ color: this.tint });
  }
}
