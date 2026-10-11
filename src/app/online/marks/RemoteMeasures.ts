import type { MeasureState, SharedMeasure } from '../protocol/index.ts';
import { Container, Graphics, type Text } from 'pixi.js';
import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import { MAP_LAYER_Z } from '../../pixi/mapLayerOrder';
import { createMeasureLabelText, drawMeasureLabel, drawMeasurement, type MeasureRecord } from '../../pixi/utils/measureDrawing';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { readableLabelFontSize } from './labelSize.ts';

/** One sender's measurements as they arrive. */
export type RemoteMeasure = { readonly who: string } & MeasureState;

/** What a measurement is measured by: the scene's grid and how its distances read. */
export interface MeasureRules {
  readonly grid: GridGeometry;
  readonly measurement: MeasurementSettings;
}

/** How far a label stands above its measurement's middle, in screen pixels (as Atlas's ruler). */
const LABEL_LIFT_PX = 30;

interface Label {
  readonly pill: Graphics;
  readonly text: Text;
}

interface Drawn {
  readonly graphics: Graphics;
  readonly labels: Label[];
  records: readonly MeasureRecord[];
}

/** A measurement as Atlas's drawing takes it. */
export const recordOf = ({ shape, a, b }: SharedMeasure): MeasureRecord => ({ shape, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } });

const colourNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/**
 * Other people's measurements, drawn as Atlas draws its own (`drawMeasurement`) in the sender's
 * colour, each with its distance on a pill, worked out here by the scene's rules.
 */
export class RemoteMeasures {
  readonly container = new Container({ label: 'remote-measures', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  private readonly drawn = new Map<string, Drawn>();
  private readonly zoom: () => number;
  private readonly rules: () => MeasureRules | null;

  constructor(zoom: () => number, rules: () => MeasureRules | null) {
    this.zoom = zoom;
    this.rules = rules;
  }

  /** Every sender's measurements as they are now; a sender missing from them has none. */
  update(measures: readonly RemoteMeasure[]): void {
    const present = new Set(measures.map((entry) => entry.who));
    for (const [who, drawn] of this.drawn) if (!present.has(who)) this.remove(who, drawn);
    const rules = this.rules();
    for (const entry of measures) {
      const records = [...entry.kept, ...(entry.live === null ? [] : [entry.live])].map(recordOf);
      if (records.length === 0 || rules === null) {
        const drawn = this.drawn.get(entry.who);
        if (drawn !== undefined) this.remove(entry.who, drawn);
        continue;
      }
      this.draw(this.drawn.get(entry.who) ?? this.add(entry.who), records, colourNumber(entry.color), rules);
    }
  }

  /** The zoom changed: labels keep their size on screen. */
  rescale(): void {
    for (const drawn of this.drawn.values()) this.placeLabels(drawn);
  }

  clear(): void {
    for (const [who, drawn] of this.drawn) this.remove(who, drawn);
  }

  destroy(): void {
    this.clear();
    destroyTree(this.container);
  }

  private add(who: string): Drawn {
    const drawn: Drawn = { graphics: new Graphics(), labels: [], records: [] };
    this.container.addChild(drawn.graphics);
    this.drawn.set(who, drawn);
    return drawn;
  }

  private remove(who: string, drawn: Drawn): void {
    this.drawn.delete(who);
    destroyTree(drawn.graphics);
    for (const label of drawn.labels) this.dropLabel(label);
  }

  private draw(drawn: Drawn, records: readonly MeasureRecord[], colour: number, { grid, measurement }: MeasureRules): void {
    drawn.records = records;
    drawn.graphics.clear();
    for (const record of records) drawMeasurement(drawn.graphics, colour, record, measurement.coneAngle);
    while (drawn.labels.length > records.length) {
      const label = drawn.labels.pop();
      if (label !== undefined) this.dropLabel(label);
    }
    while (drawn.labels.length < records.length) {
      const label = { pill: new Graphics(), text: createMeasureLabelText() };
      this.container.addChild(label.pill, label.text);
      drawn.labels.push(label);
    }
    records.forEach((record, index) => {
      const label = drawn.labels[index];
      if (label !== undefined) label.text.text = formatDistance(pathLengthInCells(grid, [record.start, record.end], measurement.diagonalRule), measurement);
    });
    this.placeLabels(drawn);
  }

  private placeLabels(drawn: Drawn): void {
    const zoom = this.zoom() || 1;
    drawn.records.forEach(({ start, end }, index) => {
      const label = drawn.labels[index];
      if (label === undefined) return;
      label.text.style.fontSize = readableLabelFontSize(zoom);
      drawMeasureLabel(label.pill, label.text, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - LABEL_LIFT_PX / zoom }, zoom);
    });
  }

  private dropLabel(label: Label): void {
    destroyTree(label.pill);
    destroyTree(label.text);
  }
}
