/** Whether a template carries Fantasy Statblocks code (§6.5), judged on what its file would hold. */

import { findCode } from '../model/fsCodeKeys';
import type { StatblockTemplate } from '../model/templateTypes';
import { templateToJson } from './templateFormat';

/**
 * True when the template's file would hold code: a `script` block, or a
 * code-bearing key in `fsExtras`, `importedFrom.extras`, an opaque block or
 * any unknown key the parser kept. Read from the written form, so values kept
 * for writing back count too.
 */
export function templateHasCode(template: StatblockTemplate): boolean {
  return findCode(templateToJson(template)).length > 0;
}
