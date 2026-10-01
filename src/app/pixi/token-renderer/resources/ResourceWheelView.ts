import { Container, Graphics, Text } from 'pixi.js';
import { resourceColor } from '../../../resources/resourceColors';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { destroyTree } from '../../utils/destroyTree';
import { colorNumber } from './ResourceBarView';
import { wheelArcs } from './wheelGeometry';

/** Diameter of the wheel's disc, in UI units: two bar heights. */
export const WHEEL_SIZE = 20.4;
const RING_RADIUS = 7.3;
const RING_WIDTH = 3.4;
const UNLIT_COLOR = 0x4a4640;
/** Text is drawn large and scaled down, like the bar numbers, so it stays crisp when zoomed in. */
const TEXT_SCALE = 0.333;
/** Characters that fit across the ring's hole at full size. */
const FULL_SIZE_CHARACTERS = 2;

/** One resource as a wheel: a ring gauge with the current value in its middle. */
export class ResourceWheelView {
  readonly view = new Container();
  private readonly ring = new Graphics();
  private readonly text = new Text({
    text: '',
    resolution: 3,
    style: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
      fontSize: 26,
      fill: 0xffffff,
      fontWeight: '700',
      stroke: { color: 0x000000, width: 3 },
    },
  });
  private drawn = '';

  constructor() {
    this.text.anchor.set(0.5);
    this.view.addChild(this.ring, this.text);
  }

  /** Shows `resource` centred on (`x`, `y`). */
  update({ definition, value }: VisibleResource, x: number, y: number): void {
    this.view.position.set(x, y);
    const label = String(value.current);
    if (this.text.text !== label) this.text.text = label;
    this.text.scale.set(TEXT_SCALE * Math.min(1, FULL_SIZE_CHARACTERS / label.length));

    const lit = resourceColor(definition, value);
    const key = `${lit}|${value.current}|${value.max}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const color = colorNumber(lit);
    this.ring.clear().circle(0, 0, WHEEL_SIZE / 2).fill({ color: 0x141414, alpha: 0.94 });
    for (const { start, end, lit } of wheelArcs(value)) {
      // A stroke ends the path, so each arc starts at its own first point
      this.ring
        .moveTo(Math.cos(start) * RING_RADIUS, Math.sin(start) * RING_RADIUS)
        .arc(0, 0, RING_RADIUS, start, end)
        .stroke({ width: RING_WIDTH, color: lit ? color : UNLIT_COLOR, cap: 'butt' });
    }
  }

  setResolution(resolution: number): void {
    if (this.text.resolution !== resolution) this.text.resolution = resolution;
  }

  destroy(): void {
    destroyTree(this.view);
  }
}
