import { expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';

interface FogToolHarness {
  isDrawing: boolean;
  enableFogMode(): void;
  onPointerDown(event: FederatedPointerEvent): void;
  onPointerUp(): void;
}

const pointer = (button: number): FederatedPointerEvent =>
  ({ button, global: { x: 140, y: 140 } }) as unknown as FederatedPointerEvent;

function fogTool(): { tool: FogToolHarness; viewport: { pause: boolean }; addFogOperation: ReturnType<typeof vi.fn> } {
  const viewport = { pause: false, toWorld: (point: { x: number; y: number }) => point };
  const addFogOperation = vi.fn();
  const state = { activeTool: 'fog', isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation };
  const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => state },
    viewport,
    fogMode: 'rectangle',
    container: {},
    fogSprites: new Map(),
    previewSprite: {},
    renderPreviewFromStore: vi.fn(),
    rectPreviewGraphics: { clear: vi.fn() },
    lastRectBounds: { x: 140, y: 140, width: 70, height: 70 },
  }) as unknown as FogToolHarness;
  return { tool, viewport, addFogOperation };
}

it('keeps the map pannable and zoomable while the fog tool is active', () => {
  const { tool, viewport } = fogTool();

  tool.enableFogMode();

  expect(viewport.pause).toBe(false);
});

it('paints fog with the primary button only, so a right-drag pans', () => {
  const { tool, addFogOperation } = fogTool();

  tool.onPointerDown(pointer(2));
  expect(tool.isDrawing).toBeFalsy();

  tool.onPointerDown(pointer(0));
  expect(tool.isDrawing).toBe(true);

  tool.onPointerUp();
  expect(tool.isDrawing).toBe(false);
  expect(addFogOperation).toHaveBeenCalledOnce();
});
