import { Container } from 'pixi.js';
import { BAR_SLOTS, type VisibleResource } from '../../../resources/resourceTypes';
import type { ResourceSlot } from './ResourceStack';
import { ResourceWheelView, WHEEL_SIZE } from './ResourceWheelView';

export { WHEEL_SIZE };
/** Space between the two wheels, in UI units. */
const WHEEL_GAP = 1.6;
/** The +/- stepper a selected token's wheel gets on its outer side: distance from the wheel and button diameter. */
export const WHEEL_STEPPER = { gap: 2, size: 10 } as const;

/**
 * A token's wheels to its right, in the units of an anchor on the token's right edge:
 * the first wheel slot above the token's middle line, the second below it. They show
 * only while revealed (`setAlpha`), on hover and selection.
 */
export class ResourceWheels {
  readonly view = new Container({ eventMode: 'none', interactiveChildren: false });
  private readonly views = new Map<string, ResourceWheelView>();
  private shown: readonly VisibleResource[] = [];
  private slots: ResourceSlot[] = [];
  private clearance = 0;
  private resolution: number | undefined;

  constructor() {
    this.setAlpha(0);
  }

  update(resources: readonly VisibleResource[]): void {
    this.shown = resources;
    const keys = new Set(resources.map(({ definition }) => definition.key));
    for (const [key, view] of this.views) {
      if (keys.has(key)) continue;
      view.destroy();
      this.views.delete(key);
    }
    this.place();
  }

  /** Free space between the token's edge and the wheels, in UI units. */
  setClearance(clearance: number): void {
    if (clearance === this.clearance) return;
    this.clearance = clearance;
    this.place();
  }

  /** Where each wheel sits, for the click areas and steppers. */
  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  /** How far the wheels and their steppers reach right of the token's edge, in UI units; 0 without wheels. */
  extent(): number {
    return this.slots.length > 0 ? this.clearance + WHEEL_SIZE + WHEEL_STEPPER.gap + WHEEL_STEPPER.size : 0;
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

  private place(): void {
    const left = this.clearance;
    this.slots = this.shown.map((resource) => {
      // A wheel keeps its own place even when the other slot is empty
      const top = resource.slot === BAR_SLOTS ? -WHEEL_GAP / 2 - WHEEL_SIZE : WHEEL_GAP / 2;
      this.viewFor(resource.definition.key).update(resource, left + WHEEL_SIZE / 2, top + WHEEL_SIZE / 2);
      return { key: resource.definition.key, kind: 'wheel', left, top, width: WHEEL_SIZE, height: WHEEL_SIZE };
    });
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
