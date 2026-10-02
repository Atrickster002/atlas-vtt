import type * as React from 'react';
import { useMemo } from 'react';
import { Notice, type App } from 'obsidian';
import { runUvttImport } from '../../../../import/uvtt/runUvttImport';
import { isUvttFileName } from '../../../../import/uvtt/uvttFileNames';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import type { AssetService } from '../../../../services/AssetService';

/**
 * Imports Universal VTT files into a collection and opens the scene of the last one that
 * arrived, as a new scene is opened. Where `stay` says so once they arrived, the scenes are
 * only added.
 */
export type ImportMaps = (files: readonly File[], collectionId: string, stay?: () => boolean) => Promise<void>;

type DropHandlers = Pick<React.DOMAttributes<HTMLElement>, 'onDragOver' | 'onDrop'>;

export interface UvttImportActions {
  importMaps: ImportMaps;
  /** Handlers for an element that takes dropped Universal VTT files; other drops pass it by. */
  dropHandlers: (collectionId: string) => DropHandlers;
}

/** The files of `files` that are Universal VTT maps by their names. */
export function uvttFilesAmong(files: readonly File[]): File[] {
  return files.filter((file) => isUvttFileName(file.name));
}

/**
 * Whether a drag carries a file that may be a map file. A drag names no files, only their types,
 * and the browser knows none for a map file's extension; images, which it does know, are left out.
 */
export function mayCarryMapFile(transfer: Pick<DataTransfer, 'items'>): boolean {
  return Array.from(transfer.items).some((item) => item.kind === 'file' && !item.type.startsWith('image/'));
}

/** `onSceneOpened` runs once an imported scene is open: the asset manager closes then, as after a new scene. */
export function useUvttImport(app: App, assetService: AssetService | null, onSceneOpened: () => void): UvttImportActions {
  const importMaps = useStableCallback(async (files: readonly File[], collectionId: string, stay?: () => boolean): Promise<void> => {
    if (!assetService || files.length === 0) return;
    const imported = await runUvttImport(app, assetService, files, collectionId);
    const last = imported[imported.length - 1];
    if (!last || stay?.()) return;
    const scene = app.vault.getFileByPath(last.scenePath);
    if (!scene) return;
    try {
      await app.workspace.getLeaf(false).openFile(scene);
    } catch (error) {
      console.error('[Atlas] An imported scene could not be opened', error);
      new Notice(`"${last.name}" could not be opened. It is in the Scenes tab.`);
      return;
    }
    onSceneOpened();
  });

  return useMemo((): UvttImportActions => ({
    importMaps,
    dropHandlers: (collectionId) => ({
      onDragOver: (event): void => {
        if (!mayCarryMapFile(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDrop: (event): void => {
        const maps = uvttFilesAmong(Array.from(event.dataTransfer.files));
        if (maps.length === 0) return;
        event.preventDefault();
        void importMaps(maps, collectionId);
      },
    }),
  }), [importMaps]);
}
