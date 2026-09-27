export const ATLAS_VTT_DIR = 'atlas-vtt';
export const COLLECTIONS_DIR = `${ATLAS_VTT_DIR}/collections`;
export const GLOBAL_ASSETS_DIR = `${ATLAS_VTT_DIR}/assets`;

const COLLECTIONS_PREFIX = `${COLLECTIONS_DIR}/`;

/** The vault folder of a collection. */
export const collectionFolderPath = (id: string): string => `${COLLECTIONS_DIR}/${id}`;

/** The id of a collection folder (`atlas-vtt/collections/goblins` → `goblins`), or null for any other path. */
export function collectionIdOfFolder(path: string): string | null {
  const id = path.startsWith(COLLECTIONS_PREFIX) ? path.slice(COLLECTIONS_PREFIX.length) : '';
  return id && !id.includes('/') ? id : null;
}

/** The collection whose folder holds `path` (`atlas-vtt/collections/goblins/tokens/a.webp` → `goblins`), or null. */
export function collectionIdOfPath(path: string | null | undefined): string | null {
  if (!path?.startsWith(COLLECTIONS_PREFIX)) return null;
  const rest = path.slice(COLLECTIONS_PREFIX.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? rest.slice(0, slash) : null;
}
