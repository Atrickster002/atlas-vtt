import { Graphics } from 'pixi.js';
import { beamRadius, DOT_SCALE, smoothBeam, type BeamPoint } from './laserBeamGeometry';
import { beamSmoothingSpacing, type LaserBeamFrame, type LaserBeamView } from './LaserBeam';

/** The hot filament's share of the body, as in the shader. */
const FILAMENT_SHARE = 0.25;
const FILAMENT_COLOR = 0xffffff;

/**
 * The laser beam for PIXI's Canvas renderer, which has no meshes or shaders: the body and
 * its hot filament as round-capped strokes, without the glow. The strokes are opaque, so
 * segments overlapping at a joint look the same as one.
 */
export class CanvasLaserBeam implements LaserBeamView {
  readonly view = new Graphics({ label: 'laser-beam' });

  draw({ trail, dot, color, width, zoom }: LaserBeamFrame): void {
    const { halfWidth, bodyShare } = width;
    const points = smoothBeam(trail, beamSmoothingSpacing(halfWidth, zoom));
    const body = (point: BeamPoint): number => beamRadius(point, halfWidth) * bodyShare;

    this.view.clear();
    for (const share of [1, FILAMENT_SHARE]) {
      const strokeColor = share === 1 ? color : FILAMENT_COLOR;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const radius = ((body(a) + body(b)) / 2) * share;
        if (radius <= 0) continue;
        this.view.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: radius * 2, color: strokeColor, cap: 'round' });
      }
      if (dot) this.view.circle(dot.x, dot.y, halfWidth * DOT_SCALE * bodyShare * share).fill(strokeColor);
    }
    this.view.visible = points.length > 1 || dot !== null;
  }

  destroy(): void {}
}
