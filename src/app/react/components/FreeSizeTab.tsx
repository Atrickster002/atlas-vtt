import React, { useState } from 'react';
import type { AlignmentPoint } from '../../pixi/GridAlignmentController';
import type { MeasurementPair } from '../../pixi/gridAlignmentMath';
import {
  useCrosshairCursor,
  useCanvasClick,
  useArrowNudge,
  useCursorPreview,
  useAlignmentPreview,
  alignmentPointHints,
  describeGridType,
} from '../hooks/useGridAlignmentEffects';
import { isHexGridType } from '../../grid/hexGeometry';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreeSizeTab({ controller, view, result, setResult, gridType }: AlignmentTabProps): React.ReactElement {
  const isHex = isHexGridType(gridType);
  const hints = alignmentPointHints(gridType);
  const [step, setStep] = useState(0);
  const [pointA, setPointA] = useState<AlignmentPoint | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementPair | null>(null);

  const isPreviewing = step >= 2;
  const isPlacingA = step === 0;

  // Shared hooks
  useCrosshairCursor(isPreviewing, view);
  const offsetAdjust = useArrowNudge(isPreviewing);
  useCursorPreview(isPreviewing, isPlacingA, pointA, controller, !isHex);
  useAlignmentPreview(measurement ? [measurement] : [], offsetAdjust, isPreviewing, controller, setResult, gridType);

  // -----------------------------------------------------------------------
  // Instruction text
  // -----------------------------------------------------------------------

  function getInstructionText(): string {
    if (isPreviewing) {
      return 'Preview the grid. Use arrow keys to nudge offset (Shift for sub-pixel).';
    }
    if (isPlacingA) {
      return `Click any ${hints.first} on the map.`;
    }
    return hints.second;
  }

  // -----------------------------------------------------------------------
  // Viewport clicks
  // -----------------------------------------------------------------------

  useCanvasClick(!isPreviewing && controller !== null, (e) => {
    if (!controller) return;
    const world = controller.screenToWorld(e.clientX, e.clientY);

    if (isPlacingA) {
      controller.showMeasurementCrosshair(0, world);
      setPointA(world);
      setStep(1);
      return;
    }

    if (pointA && !isHex) world.y = pointA.y;
    controller.showMeasurementCrosshair(1, world);
    if (pointA) {
      controller.showMeasurementLine(0, pointA, world);
      setMeasurement({ a: pointA, b: world });
    }
    setPointA(null);
    setStep(2);
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <p className="atlas-grid-alignment-hint">{getInstructionText()}</p>

      {result && (
        <div className="atlas-grid-alignment-result">
          <div>Cell size: {result.cellSize.toFixed(2)} px</div>
          {result.gridType && result.gridType !== 'square' && (
            <div className="atlas-grid-alignment-measurements">Detected {describeGridType(result.gridType)}</div>
          )}
        </div>
      )}
    </>
  );
}
