/** Answers which image players may be shown as the world map, and says when that may have changed. */
export interface WorldMapGate {
  /** The vault path of the image players may be shown as the world map now, or null for none. */
  worldMap(): Promise<string | null>;
  /** Calls `listener` whenever the world map may be another; returns what stops it. */
  onChange(listener: () => void): () => void;
}

let gate: WorldMapGate | null = null;
const listeners = new Set<() => void>();
let stopGate: (() => void) | null = null;

function tell(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Names who decides which image is the world map. Campaign files are data too (a sync tool or a
 * hand edit may have written them), and the image goes to other people: Atlas answers from the
 * campaign being played and its own asset index. Without a gate no image is shown.
 */
export function setWorldMapGate(next: WorldMapGate | null): void {
  stopGate?.();
  stopGate = null;
  gate = next;
  if (gate !== null && listeners.size > 0) stopGate = gate.onChange(tell);
  tell();
}

/** The vault path of the image players may be shown as the world map now, or null for none. */
export async function gatedWorldMap(): Promise<string | null> {
  return gate === null ? null : gate.worldMap();
}

/** Calls `listener` whenever the world map may be another, also when the gate itself changes. */
export function onWorldMapChange(listener: () => void): () => void {
  listeners.add(listener);
  if (gate !== null && stopGate === null) stopGate = gate.onChange(tell);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopGate?.();
    stopGate = null;
  };
}
