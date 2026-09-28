import type * as React from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { transferAssets } from '../../../../services/assetTransfer/assetTransfer';
import { linkedScenesFor } from '../../../../services/assetTransfer/linkedScenes';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { chooseAction } from '../../../../ui/confirmDialog';
import type { AnyAsset, CollectionOption } from '../types';

export interface CollectionTransferContext {
  app: ObsidianApp;
  assetService: AssetService | null;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
}

/** Toasts with more than a confirmation to read stay longer. */
const LONG_TOAST_DURATION = 6000;

/** The collections assets shown for `currentCollectionId` can go to, by name. */
export function transferTargets(collections: readonly CollectionOption[], currentCollectionId: string): CollectionOption[] {
  return collections
    .filter((collection) => collection.id !== currentCollectionId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

const scenesText = (count: number): string => (count === 1 ? '1 linked scene' : `${count} linked scenes`);

/**
 * The ids to transfer: `assets`, plus the scenes they are linked with if the
 * user takes those along (declining removes the links, since links never cross
 * collections); null when cancelled.
 */
async function idsToTransfer(app: ObsidianApp, assetService: AssetService, assets: readonly AnyAsset[], target: CollectionOption, mode: TransferMode): Promise<string[] | null> {
  const ids = assets.map((asset) => asset.id);
  const linked = await linkedScenesFor(app, assetService, ids, target.id, mode);
  if (linked.length === 0) return ids;

  const verb = mode === 'move' ? 'Move' : 'Copy';
  const subject = assets.length === 1 ? `"${assets[0]!.name}"` : 'The selection';
  const relation = mode === 'move' ? 'is linked with' : 'links to';
  const names = linked.map((scene) => `"${scene.name}"`).join(', ');
  const choice = await chooseAction({
    title: 'Linked scenes',
    message: [
      `${subject} ${relation} ${linked.length === 1 ? 'another scene' : `${linked.length} other scenes`} of this collection: ${names}.`,
      `Scenes only link to scenes of their own collection. Take the linked scenes to ${target.name} to keep the links, or remove the links.`,
    ],
    choices: [
      { label: `${verb} without links`, value: 'unlink' as const },
      { label: `${verb} with ${scenesText(linked.length)}`, value: 'along' as const, style: 'cta' },
    ],
  });
  if (choice === null) return null;
  return choice === 'along' ? [...ids, ...linked.map((scene) => scene.id)] : ids;
}

/**
 * Moves or copies `assets` into `target` and reports the outcome. Scenes they
 * are linked with are offered along. Moved assets leave the grid at once; the
 * refresh that follows the transfer shows the rest.
 */
export async function transferToCollection(
  context: CollectionTransferContext,
  assets: readonly AnyAsset[],
  target: CollectionOption,
  mode: TransferMode,
): Promise<void> {
  const { assetService } = context;
  if (!assetService || assets.length === 0) return;
  const chosen = assets.length === 1 ? `"${assets[0]!.name}"` : `${assets.length} items`;
  let what = chosen;
  try {
    const assetIds = await idsToTransfer(context.app, assetService, assets, target, mode);
    if (!assetIds) return;
    const along = assetIds.length - assets.length;
    if (along > 0) what = `${chosen} and ${scenesText(along)}`;
    const result = await transferAssets(context.app, assetService, { assetIds, targetCollectionId: target.id, mode });
    if (mode === 'move') {
      const moved = new Set(result.assets.map((record) => record.id));
      context.setAssets((prev) => prev.filter((asset) => !moved.has(asset.id)));
      context.setSelectedAssetIds((prev) => prev.filter((id) => !moved.has(id)));
    }
    const unlinked = result.unlinkedStatblocks.length;
    const note = unlinked === 0 ? '' : unlinked === 1
      ? `. "${result.unlinkedStatblocks[0]!.name}" arrived without its statblock, which stays with the original`
      : `. ${unlinked} characters arrived without their statblocks, which stay with the originals`;
    showAtlasToast(`${mode === 'move' ? 'Moved' : 'Copied'} ${what} to ${target.name}${note}`, unlinked > 0 ? LONG_TOAST_DURATION : undefined);
  } catch (error) {
    console.error(`[Atlas] Could not ${mode} assets to ${target.id}:`, error);
    showAtlasToast(`Could not ${mode} ${what}: ${error instanceof Error ? error.message : String(error)}`, LONG_TOAST_DURATION);
  }
}
