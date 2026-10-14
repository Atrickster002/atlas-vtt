import { Container, type Matrix, type Renderer, type RenderTexture } from 'pixi.js';
import { hasPendingChanges } from '../../RenderScheduler';
import { destroyTree } from '../../utils/destroyTree';

/** Below the lighting, as on the view's own stage (`LIGHTING_Z_INDEX` is 90). */
const TOKENS_Z = 50;
const LIGHTING_Z = 90;
/** Above the lighting, as the view's own fog (1000). */
const FOG_Z = 1000;

/** What a level below shows, in world pixels: its map, its tokens, its lighting and its fog, bottom to top. */
export interface BelowParts {
  map: Container;
  tokens: Container;
  lighting: Container;
  fog: Container;
}

/**
 * A level below the view, as a stage of its own that is never part of the view's (`LevelsBelow`
 * renders it into a texture for each picture the view draws): its map image, its tokens, its
 * lighting layer, whose composite lights them as on the level itself, and its committed fog,
 * moved into the picture by the picture's camera. A render group of its own, so a change in it
 * shows as pending (`hasChanges`) though the view's stage holds nothing of it.
 */
export class BelowStage {
  readonly root = new Container({ label: 'level-below', isRenderGroup: true });
  private readonly world = new Container({ label: 'level-below-world', sortableChildren: true });

  constructor(parts: BelowParts) {
    parts.map.zIndex = 0;
    parts.tokens.zIndex = TOKENS_Z;
    parts.lighting.zIndex = LIGHTING_Z;
    parts.fog.zIndex = FOG_Z;
    this.world.addChild(parts.map, parts.tokens, parts.lighting, parts.fog);
    this.root.addChild(this.world);
  }

  /** Whether something in the stage changed since its last render. */
  hasChanges(): boolean {
    const group = this.root.renderGroup;
    return !!group && hasPendingChanges(group);
  }

  /** Renders the stage into `target` through `camera` (world to the target's points), over black. */
  render(renderer: Renderer, target: RenderTexture, camera: Matrix): void {
    this.world.setFromMatrix(camera);
    renderer.render({ container: this.root, target, clear: true, clearColor: [0, 0, 0, 1] });
  }

  /** Lets go of its parts without destroying them: their owners do. */
  release(): void {
    this.world.removeChildren();
    destroyTree(this.root);
  }
}
