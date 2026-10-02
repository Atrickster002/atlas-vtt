/**
 * Universal VTT maps (`.dd2vtt`, `.uvtt`, `.df2vtt`) as Dungeondraft, DungeonFog and Dungeon
 * Alchemist export them: one JSON file holding the map image and its walls, doors and lights.
 * Every position in the file is counted in grid cells.
 */

export const UVTT_EXTENSIONS = ['dd2vtt', 'uvtt', 'df2vtt'] as const;

/** What an import accepts; a file beyond any of these is refused with the reason. */
export const UVTT_LIMITS = {
  fileBytes: 50 * 1024 * 1024,
  /** Wall segments and doors together. */
  wallSegments: 20_000,
  lights: 2_000,
  /** Cells along one side of the map. */
  mapCells: 4_096,
  pixelsPerCell: 4_096,
  /** Farthest a position or a light's range may lie from the map's origin, in cells. */
  distance: 100_000,
  /** Pixels along one side of the map image. */
  imageSide: 16_384,
} as const;

export interface UvttPoint {
  x: number;
  y: number;
}

/** A door or window: `bounds` are its two ends. */
export interface UvttPortal {
  bounds: [UvttPoint, UvttPoint];
  closed: boolean;
}

export interface UvttLight {
  position: UvttPoint;
  /** How far the light reaches, in cells. */
  range: number;
  intensity: number;
  /** `#rrggbb`. */
  color: string;
}

export type UvttImageType = 'image/png' | 'image/webp' | 'image/jpeg';

export interface UvttImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** Read from the image's own header, never from what the file claims. */
  type: UvttImageType;
}

/** A file's content once every field is checked. */
export interface UvttMap {
  /** The cell at the image's top-left corner. */
  origin: UvttPoint;
  /** Cells the image spans. */
  size: UvttPoint;
  pixelsPerCell: number;
  image: UvttImage;
  /** Wall lines and the outlines of objects that block sight; each runs through its points in order. */
  polylines: UvttPoint[][];
  portals: UvttPortal[];
  lights: UvttLight[];
  /** `#rrggbb`, or null when the file names none. */
  ambientLight: string | null;
  /** The image already shows the lights' glow. */
  bakedLighting: boolean;
}

export type UvttParseResult =
  | { ok: true; map: UvttMap }
  /** `problem` says in plain words why the file is refused. */
  | { ok: false; problem: string };
