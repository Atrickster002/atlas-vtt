import { GM_MARKS, MARKS_INTERVAL_MS, MAX_MARK_LASER_NUMBERS, type GmMessage, type LaserState, type MarksMessage, type MeasureState, type PlayerLaser, type PlayerMeasure } from '../protocol/index.ts';
import type { SceneSource } from '../../host/sceneSource';
import type { Measurements } from '../../pixi/MeasureRenderer';
import { GmMeasures, type PlayersView } from './gmMeasures.ts';
import { checkLaser, checkMeasure, markRate } from './markCheck.ts';
import type { MapSize, MoveRate } from './moveCheck.ts';
import { Pacer, type LaserSource, type PacerClock } from '../marks/index.ts';

/** The GM's own marks on the shared tab: its renderer's measurements, its laser, and what players see of the tokens. */
export interface GmMarkSource extends PlayersView {
  /** The renderer's measurement records; null in an Atlas build without them, whose measurements players then do not see. */
  readonly measurements: SceneSource<Measurements> | null;
  readonly laser: LaserSource;
  /** The GM's laser colour and size (Atlas's settings). */
  laserLook(): { readonly color: string; readonly size: number };
  /** Calls `listener` whenever what the players see of the tokens may have changed; returns the function that stops it. */
  onPlayersViewChange?(listener: () => void): () => void;
}

/** Players' marks, for the GM to see over the map. */
export type PlayerMarks = Pick<MarksMessage, 'lasers' | 'measures'>;

export interface MarkSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  /** The GM's measurements and laser on the shared tab, the same object while its renderer is the same; null while it has none, and without it players see none of the GM's marks. */
  gmMarks?(): GmMarkSource | null;
  /** The GM's accent colour as `#rrggbb`, which the GM's measurements are drawn in; null while it cannot be read. */
  accent?(): string | null;
  /** Draws the players' marks for the GM. */
  showPlayerMarks?(marks: PlayerMarks): void;
}

/** A player's laser that sent nothing for this long is gone (the client sends while it shows, at least twice a second). */
export const LASER_SILENCE_MS = 1000;
const isEmpty = (marks: MarksMessage): boolean => marks.lasers.length === 0 && marks.measures.length === 0;

/** Obsidian's default accent, for when the theme's cannot be read. */
const DEFAULT_ACCENT = '#8a5cf5';

interface PlayerLaserState {
  state: LaserState;
  /** Trail points received since the last `marks` message. */
  pts: number[];
  at: number;
}

/**
 * Everyone's marks in the shared scene, sent to all as one `marks` message at most every
 * `MARKS_INTERVAL_MS`, only when something changed: the GM's measurements players may see
 * (`GmMeasures`), the GM's laser, and each player's checked laser and measurements. Each client
 * leaves out its own.
 */
export class MarkShare {
  private readonly ports: MarkSharePorts;
  private readonly map: () => MapSize | null;
  private readonly pacer: Pacer;
  private readonly gm = new GmMeasures();
  private readonly lasers = new Map<string, PlayerLaserState>();
  private readonly measures = new Map<string, MeasureState>();
  private readonly laserRate: MoveRate = markRate();
  private readonly measureRate: MoveRate = markRate();
  private scene: string | null = null;
  private source: GmMarkSource | null = null;
  private stopSource: (() => void) | null = null;
  private last: { readonly body: MarksMessage; readonly text: string } | null = null;

  /** `map` is the shared map's size, which marks must stay near; null when it is unknown. */
  constructor(ports: MarkSharePorts, map: () => MapSize | null) {
    this.ports = ports;
    this.map = map;
    this.pacer = new Pacer(ports, MARKS_INTERVAL_MS, () => this.send());
  }

  /** The shared scene; another one starts without marks. */
  setScene(scene: string | null): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.lasers.clear();
    this.measures.clear();
    this.gm.reset();
    this.pacer.cancel();
    this.last = null;
    this.ports.showPlayerMarks?.({ lasers: [], measures: [] });
    this.update();
  }

  /** A player's laser or measurements: checked, then kept until they change, go silent or the player leaves. */
  receive(from: string, message: PlayerLaser | PlayerMeasure): void {
    const now = this.ports.now();
    const context = { scene: this.scene, map: this.map() };
    if (message.t === 'laser') {
      const state = this.laserRate.take(from, now) ? checkLaser(message, context) : null;
      if (state === null) return;
      const pts = [...(this.lasers.get(from)?.pts ?? []), ...state.pts].slice(-MAX_MARK_LASER_NUMBERS);
      this.lasers.set(from, { state, pts, at: now });
    } else {
      const state = this.measureRate.take(from, now) ? checkMeasure(message, context) : null;
      if (state === null) return;
      if (state.live === null && state.kept.length === 0) this.measures.delete(from);
      else this.measures.set(from, state);
    }
    this.pacer.request();
  }

  /** A player left: their marks go. */
  playerLeft(player: string): void {
    if (this.lasers.delete(player) || this.measures.delete(player)) this.pacer.request();
  }

  /**
   * Looks again: the shared tab's renderer may be another, a player's laser may have gone silent, and
   * what the players see of the GM's measurements may have changed without a measurement changing.
   */
  update(): void {
    const source = this.scene === null ? null : (this.ports.gmMarks?.() ?? null);
    if (source !== this.source) this.follow(source);
    const now = this.ports.now();
    for (const [player, laser] of this.lasers) if (now - laser.at > LASER_SILENCE_MS) this.lasers.delete(player);
    if (this.scene !== null) this.pacer.request();
  }

  /** The last marks again, to one player or to all. */
  resend(to?: string): void {
    if (this.last !== null && !isEmpty(this.last.body)) this.ports.send(this.last.body, to);
  }

  stop(): void {
    this.follow(null);
    this.pacer.cancel();
  }

  private follow(source: GmMarkSource | null): void {
    this.stopSource?.();
    this.stopSource = null;
    this.source = source;
    this.gm.reset();
    if (source === null) return;
    // Atlas tells of a new measurement inside the press that began it, before the press reaches the
    // laser's tap: the press is read once the event is done.
    const { measurements } = source;
    const measured = (): void => queueMicrotask(() => {
      if (this.source !== source || measurements === null) return;
      this.gm.follow(measurements.get(), source.laser.lastPress(), source);
      this.pacer.request();
    });
    const request = (): void => this.pacer.request();
    const stops = [measurements?.subscribe(measured) ?? (() => undefined), source.laser.subscribe(request), source.onPlayersViewChange?.(request) ?? (() => undefined)];
    this.stopSource = () => stops.forEach((stop) => stop());
    measured();
  }

  private send(): void {
    if (this.scene === null) return;
    const playerLasers = [...this.lasers].map(([who, { state, pts }]) => ({ who, ...state, pts }));
    for (const laser of this.lasers.values()) laser.pts = [];
    const playerMeasures = [...this.measures].map(([who, state]) => ({ who, ...state }));
    const body: MarksMessage = {
      t: 'marks',
      scene: this.scene,
      lasers: [...this.gmLaser(), ...playerLasers.filter((laser) => laser.at !== null || laser.on || laser.pts.length > 0)],
      measures: [...this.gmMeasures(), ...playerMeasures],
    };
    const text = JSON.stringify(body);
    // Nothing to tell before anyone made a mark: players start without any.
    if (text === this.last?.text || (this.last === null && isEmpty(body))) return;
    this.last = { body, text };
    this.ports.send(body);
    this.ports.showPlayerMarks?.({ lasers: playerLasers, measures: playerMeasures });
  }

  private gmLaser(): MarksMessage['lasers'] {
    const source = this.source;
    if (source === null) return [];
    const { at, on } = source.laser.state();
    const pts = source.laser.takePoints(MAX_MARK_LASER_NUMBERS);
    return at === null && !on && pts.length === 0 ? [] : [{ who: GM_MARKS, ...source.laserLook(), at, pts, on }];
  }

  private gmMeasures(): MarksMessage['measures'] {
    if (this.source === null) return [];
    const { live, kept } = this.gm.shown(this.source.seen());
    return live === null && kept.length === 0 ? [] : [{ who: GM_MARKS, color: this.ports.accent?.() ?? DEFAULT_ACCENT, live, kept }];
  }
}
