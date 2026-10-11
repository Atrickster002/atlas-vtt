import type { LaserState } from '../protocol/index.ts';
import { Container, type Renderer } from 'pixi.js';
import { CanvasLaserBeam } from '../../pixi/laser/CanvasLaserBeam';
import { beamWidth, LaserBeam, type LaserBeamView } from '../../pixi/laser/LaserBeam';
import { MAX_TRAIL_SAMPLES, type BeamPoint } from '../../pixi/laser/laserBeamGeometry';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { usesCanvasRenderer } from '../../pixi/utils/rendererType';
import { LASER_FADE_TIME } from '../../tools/laserPointerSettings';

/** Where Atlas draws the laser: above the fog and every mark. */
export const LASER_Z = 2000;

/** One sender's laser as it arrives: its look, pointer and the trail added since the last. */
export type RemoteLaser = { readonly who: string } & LaserState;

interface TrailPoint {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

interface Beam {
  readonly view: LaserBeamView;
  trail: TrailPoint[];
  state: RemoteLaser | null;
}

/**
 * Other people's lasers, drawn with Atlas's own beam: one per sender, its trail stamped as it
 * arrives and fading as Atlas's does. A sender missing from an update stops pointing; its beam goes
 * once its trail has faded.
 */
export class RemoteLasers {
  readonly container = new Container({ label: 'remote-lasers', zIndex: LASER_Z, eventMode: 'none', interactiveChildren: false });
  private readonly beams = new Map<string, Beam>();
  private readonly renderer: Renderer;
  private readonly zoom: () => number;
  /** How long the trail a message carries took to draw: its points are spread over it. */
  private readonly spread: number;

  constructor(renderer: Renderer, zoom: () => number, spread: number) {
    this.renderer = renderer;
    this.zoom = zoom;
    this.spread = spread;
  }

  /** Every laser as it is now (`now` in ms, the clock `tick` runs on). */
  update(lasers: readonly RemoteLaser[], now: number): void {
    const present = new Set(lasers.map((laser) => laser.who));
    for (const [who, beam] of this.beams) if (!present.has(who)) beam.state = null;
    for (const laser of lasers) {
      const beam = this.beams.get(laser.who) ?? this.addBeam(laser.who);
      beam.state = laser;
      const count = laser.pts.length / 2;
      for (let index = 0; index < count; index += 1) {
        const x = laser.pts[index * 2] ?? 0;
        const y = laser.pts[index * 2 + 1] ?? 0;
        beam.trail.push({ x, y, at: now - ((count - 1 - index) * this.spread) / count });
      }
      if (beam.trail.length > MAX_TRAIL_SAMPLES) beam.trail.splice(0, beam.trail.length - MAX_TRAIL_SAMPLES);
    }
  }

  /** Whether anything is drawn or fading. */
  get busy(): boolean {
    return this.beams.size > 0;
  }

  /** Draws every beam as it is at `now`; a beam with nothing left to show goes. */
  tick(now: number): void {
    const zoom = this.zoom() || 1;
    for (const [who, beam] of this.beams) {
      beam.trail = beam.trail.filter((point) => now - point.at < LASER_FADE_TIME);
      const state = beam.state;
      if (state === null && beam.trail.length === 0) {
        this.removeBeam(who, beam);
        continue;
      }
      const pointer = state?.at ? { x: state.at[0], y: state.at[1] } : null;
      const trail: BeamPoint[] = beam.trail.map((point) => ({ x: point.x, y: point.y, life: 1 - (now - point.at) / LASER_FADE_TIME }));
      if (state?.on === true && pointer !== null) trail.push({ ...pointer, life: 1 });
      const dot = pointer !== null && state?.on !== true ? { ...pointer, life: 1 } : null;
      const look = state ?? { color: '#ffffff', size: 16 };
      beam.view.draw({ trail, dot, pointer, color: look.color, width: beamWidth(look.size, zoom), zoom });
    }
  }

  clear(): void {
    for (const [who, beam] of this.beams) this.removeBeam(who, beam);
  }

  destroy(): void {
    this.clear();
    destroyTree(this.container);
  }

  private addBeam(who: string): Beam {
    const view = usesCanvasRenderer(this.renderer) ? new CanvasLaserBeam() : new LaserBeam();
    this.container.addChild(view.view);
    const beam: Beam = { view, trail: [], state: null };
    this.beams.set(who, beam);
    return beam;
  }

  private removeBeam(who: string, beam: Beam): void {
    this.beams.delete(who);
    destroyTree(beam.view.view);
    beam.view.destroy();
  }
}
