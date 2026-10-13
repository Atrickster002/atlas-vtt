// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { measureLabelFontSize } from '../../../../src/app/pixi/utils/measureDrawing';
import { MIN_LABEL_PX, readableLabelFontSize } from '../../../../src/app/online/marks/labelSize.ts';

describe('a ruler label', () => {
  it('is Atlas\'s wherever Atlas\'s reads at least as large, and never smaller on screen than the minimum', () => {
    for (const zoom of [0.5, 1, 1.22, 2, 5]) expect(readableLabelFontSize(zoom), String(zoom)).toBe(measureLabelFontSize(zoom));
    for (const zoom of [0.02, 0.065, 0.1, 0.3]) {
      expect(measureLabelFontSize(zoom) * zoom, `Atlas's at ${zoom}`).toBeLessThan(MIN_LABEL_PX);
      expect(readableLabelFontSize(zoom) * zoom, String(zoom)).toBeCloseTo(MIN_LABEL_PX);
    }
  });
});
