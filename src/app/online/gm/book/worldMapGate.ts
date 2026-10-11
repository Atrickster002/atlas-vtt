/** Says whether an image may be shown to players as a collection's world map. */
export type WorldMapGate = (collectionId: string, path: string) => Promise<boolean>;

let gate: WorldMapGate | null = null;

/**
 * Names who decides which image may be a collection's world map. A collection's settings are no
 * proof (a bundle, a sync tool or a hand edit may have written them), and the image goes to other
 * people: Atlas answers from the collection's own artwork. Without a gate no image is shown.
 */
export function setWorldMapGate(next: WorldMapGate | null): void {
  gate = next;
}

export async function mayShowWorldMap(collectionId: string, path: string): Promise<boolean> {
  return gate === null ? false : gate(collectionId, path);
}
