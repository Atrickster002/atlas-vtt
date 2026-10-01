import { Container, Graphics, Text } from 'pixi.js';
import { barDimensions } from '../../../styles/designTokens';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { destroyTree } from '../../utils/destroyTree';
import { colorNumber } from './ResourceBarView';

const PADDING = 3;
/** Text is drawn large and scaled down, like the bar numbers, so it stays crisp when zoomed in. */
const TEXT_SCALE = 0.333;

/** One resource as a compact capsule: "Ammo 4/6" on the resource's colour. */
export class ResourceBadgeView {
  readonly view = new Container();
  private readonly capsule = new Graphics();
  private readonly text = new Text({
    text: '',
    resolution: 3,
    style: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
      fontSize: 18,
      fill: 0xffffff,
      fontWeight: '600',
      stroke: { color: 0x000000, width: 2 },
    },
  });
  private drawn = '';

  constructor() {
    this.text.scale.set(TEXT_SCALE);
    this.text.anchor.set(0, 0.5);
    this.view.addChild(this.capsule, this.text);
  }

  /** Shows `resource` with the badge's top-left corner at (`left`, `top`); returns its size. */
  update({ definition, value }: VisibleResource, left: number, top: number): { width: number; height: number } {
    const height = barDimensions.token.height;
    const label = `${definition.name} ${value.current}/${value.max}`;
    if (this.text.text !== label) this.text.text = label;
    const width = this.text.width + PADDING * 2;
    const key = `${left}|${top}|${width}|${definition.color}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.capsule.clear()
        .roundRect(left, top, width, height, height / 2)
        .fill({ color: colorNumber(definition.color), alpha: 0.9 })
        .stroke({ width: 0.75, color: 0x000000, alpha: 0.35 });
    }
    this.text.position.set(left + PADDING, top + height / 2);
    return { width, height };
  }

  setResolution(resolution: number): void {
    if (this.text.resolution !== resolution) this.text.resolution = resolution;
  }

  destroy(): void {
    destroyTree(this.view);
  }
}
