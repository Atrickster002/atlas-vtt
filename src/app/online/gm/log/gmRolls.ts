import type { RollMode, RollRequestAnswer } from '../../protocol/index.ts';
import { rollableFormula, rollAudience } from '../PlayerRolls.ts';
import type { RollNotes } from '../RollShare.ts';
import type { SceneDice } from '../SceneDice.ts';
import { tokenLabel, type SceneStore } from '../atlasView.ts';
import type { TableLog } from './TableLog.ts';

/** A roll the GM makes from the log: a formula in a mode, with a flavor, as a token (its id), or answering a roll button. */
export interface GmRollDraft {
  readonly formula: string;
  readonly mode: RollMode;
  readonly flavor?: string;
  readonly speaker?: string;
  readonly request?: RollRequestAnswer;
}

/** Why a GM's roll was not made: it does not roll, the token is gone, or no map is shared. */
export type GmRollRefusal = 'roll' | 'speaker' | 'unavailable';

/**
 * A GM's roll from the log. A public roll is thrown by the shared tab's dice tool like one from the
 * tray (players see it as they see the GM's rolls); a private one is rolled quietly, so Atlas's own
 * player window does not show it, and goes into the log for its audience. A roll button is rolled as
 * it says.
 */
export async function gmRoll(draft: GmRollDraft, log: TableLog, dice: SceneDice | null, store: SceneStore | null): Promise<GmRollRefusal | null> {
  const request = draft.request === undefined ? undefined : log.requestOf('gm', draft.request);
  if (request === null) return 'roll';
  const formula = request?.formula ?? draft.formula;
  const mode = request?.mode ?? draft.mode;
  if (!rollableFormula(formula)) return 'roll';
  if (dice === null || store === null) return 'unavailable';
  const spoken = draft.speaker === undefined ? null : await dice.speaker('gm', draft.speaker);
  if (draft.speaker !== undefined && spoken === null) return 'speaker';
  const flavor = request?.label ?? draft.flavor;
  const notes: RollNotes = {
    ...(flavor !== undefined && { flavor }),
    ...(spoken !== null && { speaker: spoken }),
    ...(request !== undefined && draft.request !== undefined && { request: { id: draft.request.id, label: request.label } }),
  };
  if (mode !== 'public') {
    const roll = dice.quietRoll(formula);
    if (roll === null) return 'roll';
    log.rolled({ who: 'gm', roll, token: null, shared: true, mode, to: rollAudience(mode, 'gm'), ...notes });
    return null;
  }
  const state = store.getState();
  const tokenId = draft.speaker;
  const token = tokenId === undefined ? undefined : state.objects.tokens[tokenId];
  const { mapPath } = state;
  const rolled = dice.rollAsGm((source) => {
    if (tokenId === undefined || token === undefined || mapPath === null) return source.rollDice(formula, { type: 'toolbar' }) !== null;
    return source.rollDice(formula, { type: 'toolbar', tokenId, tokenName: tokenLabel(token) }, { viewId: source.viewId, mapPath, tokenId }) !== null;
  }, notes);
  return rolled ? null : 'roll';
}
