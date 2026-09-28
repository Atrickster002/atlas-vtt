import { describe, expect, it, vi } from 'vitest';
import { LaserPointerRenderer } from '../../src/app/pixi/LaserPointerRenderer';

function createHarness(overrides: Record<string, unknown> = {}) {
  return {
    viewport: { toWorld: vi.fn((x: number, y: number) => ({ x: x * 2, y: y * 2 })) },
    lastPointerScreen: { x: 100, y: 50 },
    pointer: null as { x: number; y: number } | null,
    isToolActive: true,
    isPointing: false,
    isQuickMode: false,
    redraw: vi.fn(),
    addTrailPoint: vi.fn(),
    trackPointer: (LaserPointerRenderer.prototype as any).trackPointer,
    ...overrides,
  };
}

function moveViewport(harness: ReturnType<typeof createHarness>): void {
  (LaserPointerRenderer.prototype as any).handleViewportMoved.call(harness);
}

describe('LaserPointerRenderer viewport moves', () => {
  it('re-projects the stationary pointer and redraws the cursor', () => {
    const harness = createHarness();

    moveViewport(harness);

    expect(harness.viewport.toWorld).toHaveBeenCalledWith(100, 50);
    expect(harness.pointer).toEqual({ x: 200, y: 100 });
    expect(harness.redraw).toHaveBeenCalled();
    expect(harness.addTrailPoint).not.toHaveBeenCalled();
  });

  it('extends the trail while pointing', () => {
    const harness = createHarness({ isPointing: true });

    moveViewport(harness);

    expect(harness.addTrailPoint).toHaveBeenCalledWith(200, 100);
    expect(harness.redraw).toHaveBeenCalled();
  });

  it('does not draw while another tool is active', () => {
    const harness = createHarness({ isToolActive: false });

    moveViewport(harness);

    expect(harness.redraw).not.toHaveBeenCalled();
  });

  it('does nothing before the pointer has been seen on the canvas', () => {
    const harness = createHarness({ lastPointerScreen: null });

    moveViewport(harness);

    expect(harness.viewport.toWorld).not.toHaveBeenCalled();
    expect(harness.redraw).not.toHaveBeenCalled();
  });
});
