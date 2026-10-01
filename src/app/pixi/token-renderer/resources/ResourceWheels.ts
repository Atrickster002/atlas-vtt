import { Container } from 'pixi.js';
import { BAR_SLOTS, type VisibleResource } from '../../../resources/resourceTypes';
import type { ResourceSlot } from './ResourceStack';
import { NAMEPLATE_HEIGHT } from '../tokenSizing';
import { ResourceWheelView, WHEEL_SIZE } from './ResourceWheelView';

export { WHEEL_SIZE };
/** Space between the two wheels, in UI units. */
const WHEEL_GAP = 1.6;
/** Space between the anchor's left edge and the wheels, in UI units. */
const WHEEL_MARGIN = 1.5;
/** Bottom of the lower wheel above the anchor: clear of the nameplate, which lies on the token's bottom edge. */
const WHEEL_BASE = NAMEPLATE_HEIGHT + 1;
/** The +/- stepper a selected token's wheel gets on its outer side: distance from the wheel and button diameter. */
export const WHEEL_STEPPER = { gap: 2, size: 10 } as const;

/** Where the wheel of `slot` sits. A wheel keeps its own place even when the other slot is empty. */
export function wheelSlot(key: string, slot: number): ResourceSlot {
  const row = slot === BAR_SLOTS ? 1 : 0;
  return { key, kind: 'wheel', left: WHEEL_MARGIN, top: -WHEEL_BASE - WHEEL_SIZE - row * (WHEEL_GAP + WHEEL_SIZE), width: WHEEL_SIZE, height: WHEEL_SIZE };
}

/**
 * A token's wheels to its right, in the units of an anchor past the resize button on the
 * token's bottom edge (`wheelAnchor`). The stack stands on the nameplate's top line and
 * grows upward with the anchor's scale, as the bars grow downward: at no size can it meet
 * the nameplate or the bars. The first wheel slot is the upper one. They show only while
 * revealed (`setAlpha`), on hover and selection.
 */
export class ResourceWheels {
  readonly view = new Container({ eventMode: 'none', interactiveChildren: false });
  private readonly views = new Map<string, ResourceWheelView>();
  private slots: ResourceSlot[] = [];
  private resolution: number | undefined;

  constructor() {
    this.setAlpha(0);
  }

  update(resources: readonly VisibleResource[]): void {
    const keys = new Set(resources.map(({ definition }) => definition.key));
    for (const [key, view] of this.views) {
      if (keys.has(key)) continue;
      view.destroy();
      this.views.delete(key);
    }
    this.slots = resources.map((resource) => {
      const slot = wheelSlot(resource.definition.key, resource.slot);
      this.viewFor(slot.key).update(resource, slot.left + WHEEL_SIZE / 2, slot.top + WHEEL_SIZE / 2);
      return slot;
    });
  }

  /** Where each wheel sits, for the click areas and steppers; the same at every scale of the anchor. */
  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  /** How far the wheels and their steppers reach right of the anchor and above it, in UI units; 0 without wheels. */
  extent(): { right: number; up: number } {
    if (this.slots.length === 0) return { right: 0, up: 0 };
    return {
      right: WHEEL_MARGIN + WHEEL_SIZE + WHEEL_STEPPER.gap + WHEEL_STEPPER.size,
      up: Math.max(...this.slots.map((slot) => -slot.top)),
    };
  }

  setAlpha(alpha: number): void {
    this.view.alpha = alpha;
    this.view.visible = alpha > 0;
  }

  /** Rasterisation resolution of the numbers, also of wheels created later. */
  setResolution(resolution: number): void {
    this.resolution = resolution;
    for (const view of this.views.values()) view.setResolution(resolution);
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.view.destroy();
  }

  private viewFor(key: string): ResourceWheelView {
    const existing = this.views.get(key);
    if (existing) return existing;
    const view = new ResourceWheelView();
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(key, view);
    this.view.addChild(view.view);
    return view;
  }
}
