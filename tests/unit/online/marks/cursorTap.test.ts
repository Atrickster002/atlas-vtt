// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CursorTap, type CursorEvent, type CursorViewport } from '../../../../src/app/online/marks/CursorTap.ts';

type Listener = (event: CursorEvent) => void;

/** A viewport whose world is its screen at `zoom`, a clock a test sets, and a cursor tap on both. */
function tapped(zoom = 1): { readonly tap: CursorTap; readonly canvas: EventTarget; move(x: number, at: number, pointerType?: string): void; pan(dx: number, at: number): void; changes(): number } {
  const listeners = new Map<string, Listener>();
  let now = 0;
  let changes = 0;
  let offset = 0;
  const viewport: CursorViewport = {
    on: (event, listener) => void listeners.set(event, listener),
    off: (event) => void listeners.delete(event),
    toWorld: ({ x, y }) => ({ x: x / zoom + offset, y: y / zoom }),
    scale: { x: zoom },
  };
  const canvas = new EventTarget();
  const tap = new CursorTap(viewport, canvas, () => now);
  tap.subscribe(() => void (changes += 1));
  return {
    tap,
    canvas,
    move: (x, at, pointerType = 'mouse') => {
      now = at;
      listeners.get('pointermove')?.({ global: { x, y: 0 }, pointerType });
    },
    pan: (dx, at) => {
      now = at;
      offset += dx;
      listeners.get('moved')?.({ global: { x: 0, y: 0 } });
    },
    changes: () => changes,
  };
}

describe('CursorTap', () => {
  it('follows a mouse over the map in world places, with the places it passed and the time they cover', () => {
    const { tap, move } = tapped(2);
    move(100, 1000);
    expect(tap.at()).toEqual([50, 0]);
    expect(tap.take(64)).toEqual({ pts: [50, 0] });
    move(120, 1016);
    move(140, 1033);
    expect(tap.take(64)).toEqual({ pts: [60, 0, 70, 0], span: 33 });
    expect(tap.movedAt()).toBe(1033);
  });

  it('leaves out places closer than a receiver could show, and a pointer that stays where it is', () => {
    const { tap, move, changes } = tapped();
    move(100, 1000);
    move(101, 1008);
    move(101, 1016);
    expect(tap.take(64).pts).toEqual([100, 0]);
    expect(tap.at()).toEqual([101, 0]);
    expect(tap.movedAt()).toBe(1008);
    expect(changes()).toBe(2);
  });

  it('follows the map moving under a pointer at rest, and not once it left', () => {
    const { tap, canvas, move, pan } = tapped();
    move(100, 1000);
    tap.take(64);
    pan(50, 1100);
    expect(tap.at()).toEqual([150, 0]);
    expect(tap.take(64)).toEqual({ pts: [150, 0], span: 100 });
    canvas.dispatchEvent(new Event('mouseleave'));
    pan(50, 1200);
    expect(tap.at()).toBeNull();
  });

  it('has no cursor for a finger', () => {
    const { tap, move } = tapped();
    move(100, 1000, 'touch');
    expect(tap.at()).toBeNull();
    move(100, 1000, 'pen');
    expect(tap.at()).toEqual([100, 0]);
  });

  it('is away once the pointer leaves the canvas, and comes back on a path of its own', () => {
    const { tap, canvas, move } = tapped();
    move(100, 1000);
    tap.take(64);
    move(120, 1016);
    canvas.dispatchEvent(new Event('mouseleave'));
    expect(tap.at()).toBeNull();
    expect(tap.movedAt()).toBeNull();
    expect(tap.take(64)).toEqual({ pts: [120, 0], span: 16 });
    move(400, 3000);
    expect(tap.take(64)).toEqual({ pts: [400, 0] });
  });

  it('stops listening once destroyed', () => {
    const { tap, move } = tapped();
    tap.destroy();
    move(100, 1000);
    expect(tap.at()).toBeNull();
  });
});
