import { useCallback, useSyncExternalStore } from 'react';
import { WidgetSyncService } from '../../services/WidgetSyncService';
import type { WidgetRecord } from '../../utils/collectionWidgets';
import { useAtlasUI } from '../root/AtlasUIContext';

const NO_WIDGETS: WidgetRecord = {};

/** Every widget of the collection, kept current while other scenes add or edit them. */
export function useCollectionWidgetLibrary(collectionId: string | null): WidgetRecord {
  const { app } = useAtlasUI();
  const sync = WidgetSyncService.forApp(app);
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => sync?.subscribeToLibraries(onChange) ?? (() => undefined),
    [sync],
  );
  const read = useCallback(
    (): WidgetRecord => (sync && collectionId ? sync.collectionLibrary(collectionId) : NO_WIDGETS),
    [sync, collectionId],
  );
  return useSyncExternalStore(subscribe, read, read);
}
