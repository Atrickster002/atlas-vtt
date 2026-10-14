import type { MarkPoint, MeasureState, SharedMeasure } from '../protocol/index.ts';
import { Container, Graphics, type Text } from 'pixi.js';
import { pathLengthInCells, type GridGeometry } from '../../grid/gridDistance';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import { MAP_LAYER_Z } from '../../pixi/mapLayerOrder';
import { createMeasureLabelText, drawMeasureLabel, drawMeasurement, type MeasureRecord } from '../../pixi/utils/measureDrawing';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { readableLabelFontSize } from './labelSize.ts';
import { PointerTrack } from './PointerTrack.ts';

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

/** A measurement being drawn: as its sender last told it, and its end as it is drawn, a moment behind. */
interface Live {
  told: SharedMeasure;
  readonly track: PointerTrack;
  end: { readonly x: number; readonly y: number };
}

interface Drawn {
  /** The kept measurements and the one being drawn, each in a drawing of its own: only the second changes with every frame. */
  readonly keptGraphics: Graphics;
  readonly liveGraphics: Graphics;
  /** A label for every kept measurement in order, then one for the measurement being drawn. */
  readonly labels: Label[];
  kept: readonly MeasureRecord[];
  live: Live | null;
  colour: number;
}

/** A measurement as Atlas's drawing takes it. */
export const recordOf = ({ shape, a, b }: SharedMeasure): MeasureRecord => ({ shape, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } });

const colourNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);
const sameMark = (a: MarkPoint, b: MarkPoint): boolean => a[0] === b[0] && a[1] === b[1];
const samePoint = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): boolean => a.x === b.x && a.y === b.y;
const sameRecords = (a: readonly MeasureRecord[], b: readonly MeasureRecord[]): boolean =>
  a.length === b.length && a.every((record, index) => record.shape === b[index]?.shape && samePoint(record.start, b[index].start) && samePoint(record.end, b[index].end));
const liveRecord = ({ told, end }: Live): MeasureRecord => ({ shape: told.shape, start: { x: told.a[0], y: told.a[1] }, end });

/**
 * Other people's measurements, drawn as Atlas draws its own (`drawMeasurement`) in the sender's
 * colour, each with its distance on a pill, worked out here by the scene's rules. The end of a
 * measurement being drawn moves through a `PointerTrack`, timed by the span its messages tell, so it
 * glides between two messages, and its label says the distance to the end as drawn; kept
 * measurements stand as they arrive.
 */
export class RemoteMeasures {
  readonly container = new Container({ label: 'remote-measures', zIndex: MAP_LAYER_Z.measure, eventMode: 'none', interactiveChildren: false });
  private readonly drawn = new Map<string, Drawn>();
  private readonly zoom: () => number;
  private readonly rules: () => MeasureRules | null;
  /** The senders' nominal send interval, in ms. */
  private readonly interval: number;
  private moving = false;

  constructor(zoom: () => number, rules: () => MeasureRules | null, interval: number) {
    this.zoom = zoom;
    this.rules = rules;
    this.interval = interval;
  }

  /** Every sender's measurements as they are now (`now` in ms, the clock `tick` runs on); a sender missing from them has none. */
  update(measures: readonly RemoteMeasure[], now: number): void {
    const present = new Set(measures.map((entry) => entry.who));
    for (const [who, drawn] of this.drawn) if (!present.has(who)) this.remove(who, drawn);
    const rules = this.rules();
    for (const entry of measures) {
      const known = this.drawn.get(entry.who);
      if ((entry.live === null && entry.kept.length === 0) || rules === null) {
        if (known !== undefined) this.remove(entry.who, known);
        continue;
      }
      const drawn = known ?? this.add(entry.who);
      const colour = colourNumber(entry.color);
      const kept = entry.kept.map(recordOf);
      const keptChanged = colour !== drawn.colour || !sameRecords(kept, drawn.kept);
      const before = drawn.live;
      drawn.live = this.follow(before, entry, now);
      // Nothing to draw anew for a sender whose measurements stand, or whose end only moved on: `tick` draws that.
      if (!keptChanged && drawn.live === before) continue;
      if (keptChanged) this.drawKept(drawn, kept, colour, rules);
      this.fitLabels(drawn);
      kept.forEach((record, index) => this.write(drawn.labels[index], record, rules));
      this.drawLive(drawn, rules);
      this.placeLabels(drawn);
    }
    this.moving = [...this.drawn.values()].some((drawn) => drawn.live?.track.busy(now) === true);
  }

  /** Whether an end being dragged still has somewhere to go. */
  get busy(): boolean {
    return this.moving;
  }

  /** Draws every end being dragged where it is at `now`. */
  tick(now: number): void {
    const rules = this.rules();
    this.moving = false;
    for (const drawn of this.drawn.values()) {
      const live = drawn.live;
      if (live === null) continue;
      const end = live.track.at(now);
      this.moving ||= live.track.busy(now);
      if (rules === null || end === null || samePoint(end, live.end)) continue;
      live.end = { x: end.x, y: end.y };
      this.drawLive(drawn, rules);
      this.placeLabels(drawn);
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
    const drawn: Drawn = { keptGraphics: new Graphics(), liveGraphics: new Graphics(), labels: [], kept: [], live: null, colour: 0 };
    this.container.addChild(drawn.keptGraphics, drawn.liveGraphics);
    this.drawn.set(who, drawn);
    return drawn;
  }

  private remove(who: string, drawn: Drawn): void {
    this.drawn.delete(who);
    destroyTree(drawn.keptGraphics);
    destroyTree(drawn.liveGraphics);
    for (const label of drawn.labels) this.dropLabel(label);
  }

  /**
   * The measurement being drawn after a message: the same one with its end moved on, or a new one
   * (another start or shape), which stands where it begins and does not glide from the last.
   */
  private follow(live: Live | null, { live: told, span }: RemoteMeasure, now: number): Live | null {
    if (told === null) return null;
    const end = { x: told.b[0], y: told.b[1] };
    if (live === null || live.told.shape !== told.shape || !sameMark(live.told.a, told.a)) {
      const track = new PointerTrack({ interval: this.interval });
      track.push([end], undefined, now);
      return { told, track, end };
    }
    // An end that stands is no new sample, unless its message says that time passed for its sender.
    if (!sameMark(live.told.b, told.b) || (span ?? 0) > 0) live.track.push([end], span, now);
    live.told = told;
    return live;
  }

  private drawKept(drawn: Drawn, kept: readonly MeasureRecord[], colour: number, { measurement }: MeasureRules): void {
    drawn.kept = kept;
    drawn.colour = colour;
    drawn.keptGraphics.clear();
    for (const record of kept) drawMeasurement(drawn.keptGraphics, colour, record, measurement.coneAngle);
  }

  private drawLive(drawn: Drawn, rules: MeasureRules): void {
    drawn.liveGraphics.clear();
    if (drawn.live === null) return;
    const record = liveRecord(drawn.live);
    drawMeasurement(drawn.liveGraphics, drawn.colour, record, rules.measurement.coneAngle);
    this.write(drawn.labels[drawn.kept.length], record, rules);
  }

  /** As many labels as measurements. */
  private fitLabels(drawn: Drawn): void {
    const count = drawn.kept.length + (drawn.live === null ? 0 : 1);
    while (drawn.labels.length > count) {
      const label = drawn.labels.pop();
      if (label !== undefined) this.dropLabel(label);
    }
    while (drawn.labels.length < count) {
      const label = { pill: new Graphics(), text: createMeasureLabelText() };
      this.container.addChild(label.pill, label.text);
      drawn.labels.push(label);
    }
  }

  private write(label: Label | undefined, record: MeasureRecord, { grid, measurement }: MeasureRules): void {
    if (label === undefined) return;
    const distance = formatDistance(pathLengthInCells(grid, [record.start, record.end], measurement.diagonalRule), measurement);
    if (label.text.text !== distance) label.text.text = distance;
  }

  private placeLabels(drawn: Drawn): void {
    const zoom = this.zoom() || 1;
    const records = drawn.live === null ? drawn.kept : [...drawn.kept, liveRecord(drawn.live)];
    records.forEach(({ start, end }, index) => {
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
