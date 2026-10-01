import { Container, type Ticker } from 'pixi.js';
import { barDimensions } from '../../../styles/designTokens';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { ResourceBadgeView } from './ResourceBadgeView';
import { ResourceBarView } from './ResourceBarView';

/** Where one resource sits under its token, in UI units; the click areas and +/- controls lay out from it. */
export interface ResourceSlot {
  key: string;
  kind: 'bar' | 'badge';
  top: number;
  left: number;
  width: number;
  height: number;
}

type View = { kind: 'bar'; view: ResourceBarView } | { kind: 'badge'; view: ResourceBadgeView };

const viewId = ({ definition }: VisibleResource): string => `${definition.key}:${definition.look}`;

/**
 * A token's resources below it, stacked top to bottom: bars first, then badges,
 * each centred on a row of its own. One view is kept per resource and updated
 * in place; a view is created or destroyed only when its resource appears or
 * disappears.
 */
export class ResourceStack {
  readonly view = new Container();
  private readonly views = new Map<string, View>();
  private slots: ResourceSlot[] = [];
  private textAlpha = 0;
  private resolution: number | undefined;

  constructor(private readonly ticker: Ticker | null) {}

  /** Shows `resources` starting at `top`; returns the height they take, gaps included. */
  update(resources: readonly VisibleResource[], top: number, animate: boolean): number {
    const { width: barWidth, gap } = barDimensions.token;
    const shown = new Set(resources.map(viewId));
    for (const [id, entry] of this.views) {
      if (shown.has(id)) continue;
      entry.view.destroy();
      this.views.delete(id);
    }

    this.slots = [];
    let y = top;
    for (const resource of resources) {
      if (resource.definition.look !== 'bar') continue;
      const height = this.barFor(resource).update(resource, y, animate);
      this.slots.push({ key: resource.definition.key, kind: 'bar', top: y, left: -barWidth / 2, width: barWidth, height });
      y += height + gap;
    }

    // A badge takes a row of its own, centred, so its +/- buttons fit beside it like a bar's.
    for (const resource of resources) {
      if (resource.definition.look !== 'badge') continue;
      const badge = this.badgeFor(resource);
      const { width } = badge.update(resource, 0, y);
      const size = badge.update(resource, -width / 2, y);
      this.slots.push({ key: resource.definition.key, kind: 'badge', top: y, left: -size.width / 2, width: size.width, height: size.height });
      y += size.height + gap;
    }
    return y - top;
  }

  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  /** Opacity of the bars' "x / y" numbers, which show on hover and selection. */
  getTextAlpha(): number {
    return this.textAlpha;
  }

  setTextAlpha(alpha: number): void {
    this.textAlpha = alpha;
    for (const entry of this.views.values()) {
      if (entry.kind === 'bar') entry.view.setTextAlpha(alpha);
    }
  }

  /** Rasterisation resolution of the texts, also of views created later. */
  setResolution(resolution: number): void {
    this.resolution = resolution;
    for (const entry of this.views.values()) entry.view.setResolution(resolution);
  }

  destroy(): void {
    for (const entry of this.views.values()) entry.view.destroy();
    this.views.clear();
    this.view.destroy();
  }

  private barFor(resource: VisibleResource): ResourceBarView {
    const existing = this.views.get(viewId(resource));
    if (existing?.kind === 'bar') return existing.view;
    const view = new ResourceBarView(this.ticker);
    view.setTextAlpha(this.textAlpha);
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(viewId(resource), { kind: 'bar', view });
    this.view.addChild(view.view);
    return view;
  }

  private badgeFor(resource: VisibleResource): ResourceBadgeView {
    const existing = this.views.get(viewId(resource));
    if (existing?.kind === 'badge') return existing.view;
    const view = new ResourceBadgeView();
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(viewId(resource), { kind: 'badge', view });
    this.view.addChild(view.view);
    return view;
  }
}
