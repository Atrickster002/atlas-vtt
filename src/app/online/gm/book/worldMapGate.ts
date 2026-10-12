import { gateSlot } from './gateSlot.ts';

/** Answers which image players may be shown as the world map, and says when that may have changed. */
export interface WorldMapGate {
  /** The vault path of the image players may be shown as the world map now, or null for none. */
  worldMap(): Promise<string | null>;
  /** Calls `listener` whenever the world map may be another; returns what stops it. */
  onChange(listener: () => void): () => void;
}

const slot = gateSlot<string | null>(null);

/**
 * Names who decides which image is the world map. Campaign files are data too (a sync tool or a
 * hand edit may have written them), and the image goes to other people: Atlas answers from the
 * campaign being played and its own asset index. Without a gate no image is shown.
 */
export function setWorldMapGate(next: WorldMapGate | null): void {
  slot.set(next === null ? null : { read: () => next.worldMap(), onChange: (listener) => next.onChange(listener) });
}

/** The vault path of the image players may be shown as the world map now, or null for none. */
export const gatedWorldMap = (): Promise<string | null> => slot.read();

/** Calls `listener` whenever the world map may be another, also when the gate itself changes. */
export const onWorldMapChange = (listener: () => void): (() => void) => slot.onChange(listener);
