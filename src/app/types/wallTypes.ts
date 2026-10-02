export type WallType = 'solid' | 'door' | 'secret-door';

/** What a wall can stop: the sight of tokens, or light. */
export type WallChannel = 'sight' | 'light';

export interface WallSegment {
  id: string;
  kind: 'wall';
  type: WallType;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  direction?: 'left' | 'right' | undefined;   // Light pass-through side (undefined = blocks both sides)
  closed?: boolean;               // Doors/secret doors: true = blocks vision (default true)
  /** A door the GM locked: it is closed and its badge does not open it until it is unlocked. A GM aid; light and sight read only `closed`. */
  locked?: boolean;
  /**
   * The one thing the wall stops: a curtain stops sight and lets light through, glass that glows
   * stops light and lets sight through. Unset, it stops both. A door keeps its kind.
   */
  blocks?: WallChannel | undefined;
  chainId?: string;               // Groups segments from same draw action
}

/** Input for creating a wall (without auto-generated id/kind) */
export type WallInput = Omit<WallSegment, 'id' | 'kind'>;
