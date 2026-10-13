import type { App } from 'obsidian';
import { withRandomTable } from '../../../randomTables/tableSettings';
import { AssetService } from '../../../services/AssetService';
import type { RandomTableSource } from '../../../types/randomTableTypes';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

/** Saves whether several rolls of a table at once may repeat a row; the entry's other fields stay. */
export function setTableNoRepeats(app: App, collectionId: string, source: RandomTableSource, noRepeats: boolean): void {
  const assets = AssetService.getInstance(app);
  const { noRepeats: _was, ...rest } = source;
  const next: RandomTableSource = noRepeats ? { ...rest, noRepeats: true } : rest;
  const randomTables = withRandomTable(assets.getCollectionSettings(collectionId), next);
  runInBackground(assets.updateCollectionSettings(collectionId, { randomTables }), 'Saving a table setting', t('tables.saveFailed'));
}

/** Adds a table to the collection's tables and saves it; an entry for the same table is replaced. */
export async function addTableSource(app: App, collectionId: string, source: RandomTableSource): Promise<void> {
  const assets = AssetService.getInstance(app);
  await assets.updateCollectionSettings(collectionId, { randomTables: withRandomTable(assets.getCollectionSettings(collectionId), source) });
}
