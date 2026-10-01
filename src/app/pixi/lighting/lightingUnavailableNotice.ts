import { Notice } from 'obsidian';

/**
 * Tells the GM that this map is drawn without dynamic lighting; `canRetry` when the engine was
 * held back because its last start never finished, which switching lighting off and on overrides.
 */
export function showLightingUnavailableNotice(canRetry: boolean): void {
  const retry = canRetry ? ' Switch dynamic lighting off and on to try again.' : '';
  new Notice(`Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow.${retry}`, 15000);
}
