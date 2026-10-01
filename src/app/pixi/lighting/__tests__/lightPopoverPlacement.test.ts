import { describe, expect, it } from 'vitest';
import { placeLightPopover } from '../lightPopoverPlacement';

const size = { width: 248, height: 360 };
const area = { width: 1200, height: 800 };
const base = { clearance: 24, size, area, side: null };

describe('placeLightPopover', () => {
  it('opens beside the marker on the side with more room, level with the light', () => {
    expect(placeLightPopover({ ...base, anchor: { x: 300, y: 400 } })).toMatchObject({ x: 324, y: 220, side: 'right' });
    expect(placeLightPopover({ ...base, anchor: { x: 900, y: 400 } })).toMatchObject({ x: 900 - 24 - 248, y: 220, side: 'left' });
  });

  it('grows out of the light: the origin is the light within its box', () => {
    expect(placeLightPopover({ ...base, anchor: { x: 300, y: 400 } }).origin).toEqual({ x: -24, y: 180 });
    expect(placeLightPopover({ ...base, anchor: { x: 900, y: 400 } }).origin).toEqual({ x: 248 + 24, y: 180 });
  });

  it('keeps its side while it fits there, so it does not flip as the map pans', () => {
    expect(placeLightPopover({ ...base, anchor: { x: 800, y: 400 }, side: 'right' }).side).toBe('right');
    expect(placeLightPopover({ ...base, anchor: { x: 400, y: 400 }, side: 'left' }).side).toBe('left');
  });

  it('changes side once its own no longer fits', () => {
    expect(placeLightPopover({ ...base, anchor: { x: 1000, y: 400 }, side: 'right' }).side).toBe('left');
    expect(placeLightPopover({ ...base, anchor: { x: 200, y: 400 }, side: 'left' }).side).toBe('right');
  });

  it('stays inside the view when the light is near an edge or panned out of it', () => {
    expect(placeLightPopover({ ...base, anchor: { x: 300, y: 20 } }).y).toBe(8);
    expect(placeLightPopover({ ...base, anchor: { x: 300, y: 790 } }).y).toBe(800 - 8 - 360);
    expect(placeLightPopover({ ...base, anchor: { x: -500, y: 400 } }).x).toBe(8);
    expect(placeLightPopover({ ...base, anchor: { x: 5000, y: 400 } }).x).toBe(1200 - 8 - 248);
  });

  it('keeps to the roomier side in a view too narrow for either', () => {
    const narrow = { width: 300, height: 800 };
    expect(placeLightPopover({ ...base, area: narrow, anchor: { x: 100, y: 400 } })).toMatchObject({ side: 'right', x: 300 - 8 - 248 });
  });

  it('lands on whole pixels', () => {
    const placed = placeLightPopover({ ...base, anchor: { x: 300.4, y: 400.7 } });
    expect(Number.isInteger(placed.x) && Number.isInteger(placed.y)).toBe(true);
  });
});
