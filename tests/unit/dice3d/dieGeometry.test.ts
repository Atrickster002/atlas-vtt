import { describe, expect, it } from 'vitest';

import {
  dieGeometry,
  faceIndexForValue,
  faceQuaternion,
  restingQuaternion,
  type DieSides,
} from '../../../src/app/dice3d/dieGeometry';
import { qRotate, vDot, vLength, vSub } from '../../../src/app/dice3d/vectorMath';

const ALL: DieSides[] = [4, 6, 8, 10, 12, 20];

describe('die bodies', () => {
  it.each(ALL)('the d%i has exactly as many faces', (sides) => {
    expect(dieGeometry(sides).faces).toHaveLength(sides);
  });

  it.each(ALL)('the d%i carries every number exactly once', (sides) => {
    const { values } = dieGeometry(sides);
    expect([...values].sort((a, b) => a - b)).toEqual(
      Array.from({ length: sides }, (_, i) => i + 1),
    );
  });

  it.each(ALL)('all normals of the d%i point outwards', (sides) => {
    const { normals, centers } = dieGeometry(sides);
    for (let i = 0; i < normals.length; i++) {
      expect(vDot(normals[i]!, centers[i]!)).toBeGreaterThan(0);
    }
  });

  it.each(ALL)('all vertices of a d%i face lie in one plane', (sides) => {
    const { faces, vertices, normals, centers } = dieGeometry(sides);
    for (let i = 0; i < faces.length; i++) {
      for (const v of faces[i]!) {
        expect(Math.abs(vDot(vSub(vertices[v]!, centers[i]!), normals[i]!))).toBeLessThan(1e-6);
      }
    }
  });

  it.each(ALL)('the numeral up of the d%i is perpendicular to the normal', (sides) => {
    const { ups, normals } = dieGeometry(sides);
    for (let i = 0; i < ups.length; i++) {
      expect(Math.abs(vDot(ups[i]!, normals[i]!))).toBeLessThan(1e-9);
      expect(vLength(ups[i]!)).toBeCloseTo(1, 9);
    }
  });

  // The printed rule of every real die; only the d4 lacks it, having no
  // opposite faces.
  it.each([6, 8, 10, 12, 20] as DieSides[])(
    'opposite faces of the d%i add up to n+1',
    (sides) => {
      const { normals, values } = dieGeometry(sides);
      for (let i = 0; i < normals.length; i++) {
        const opposite = normals.findIndex((n, j) => j !== i && vDot(normals[i]!, n) < -0.999);
        expect(opposite).toBeGreaterThanOrEqual(0);
        expect(values[i]! + values[opposite]!).toBe(sides + 1);
      }
    },
  );
});

describe('target orientation', () => {
  it.each(ALL)('puts the target face of the d%i on top, numeral readable', (sides) => {
    const geometry = dieGeometry(sides);
    for (let value = 1; value <= sides; value++) {
      const face = faceIndexForValue(geometry, value);
      const q = faceQuaternion(geometry, face);
      const normal = qRotate(q, geometry.normals[face]!);
      const up = qRotate(q, geometry.ups[face]!);

      // Seen from above: the face is on top and the numeral's head points to
      // −Z, up on screen.
      expect(normal[1]).toBeCloseTo(1, 9);
      expect(up[2]).toBeCloseTo(-1, 9);
    }
  });

  // The tilt may look nice but never become ambiguous: the rolled face stays
  // the topmost, or the neighbouring number would be read.
  it.each(ALL)('the rolled face of a tilted d%i stays topmost', (sides) => {
    const geometry = dieGeometry(sides);
    for (let value = 1; value <= sides; value++) {
      const face = faceIndexForValue(geometry, value);
      const q = restingQuaternion(geometry, face);
      const tops = geometry.normals
        .map((n, i) => ({ i, y: qRotate(q, n)[1] }))
        .sort((a, b) => b.y - a.y);

      expect(tops[0]!.i).toBe(face);
      // And by a visible margin, not just a rounding digit.
      expect(tops[0]!.y - tops[1]!.y).toBeGreaterThan(0.06);
    }
  });

  // How far it tilts depends on the body: the d4 may tilt further than the
  // d20 because its neighbours are 109° away instead of 42°. So the band is
  // checked, not the number.
  it.each(ALL)('tilts the d%i visibly, but not to the edge', (sides) => {
    const geometry = dieGeometry(sides);
    for (let face = 0; face < sides; face++) {
      const q = restingQuaternion(geometry, face);
      const degrees =
        (Math.acos(Math.min(1, qRotate(q, geometry.normals[face]!)[1])) * 180) / Math.PI;
      expect(degrees).toBeGreaterThan(8);
      expect(degrees).toBeLessThan(35);
    }
  });

  it('finds the face of every number', () => {
    const geometry = dieGeometry(20);
    for (let value = 1; value <= 20; value++) {
      expect(geometry.values[faceIndexForValue(geometry, value)]).toBe(value);
    }
  });
});
