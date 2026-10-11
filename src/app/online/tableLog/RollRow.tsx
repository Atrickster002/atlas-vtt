import type { RollEntry } from '../protocol/index.ts';
import { ChevronDown, EyeOff } from 'lucide-react';
import { memo, useId, useState, type ReactElement } from 'react';
import { TokenPortrait } from '../../packages/components/shared/TokenPortrait';
import { dieLabel } from '../../tools/diceLabels';
import { AuthorDisc } from './AuthorDisc.tsx';
import { classes } from './classes.ts';
import { reactionsFor, shownName } from './logAuthors.ts';
import type { ShownEntry } from './LogState.ts';
import type { RollFace, RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { RowShell } from './RowShell.tsx';

export interface RollRowProps extends Omit<RowFlags, 'editing'> {
  readonly entry: RollEntry & Pick<ShownEntry, 'hidden'>;
  /** The token the roll names, as the viewer may know it. */
  readonly face: RollFace | null;
  readonly time: string;
  readonly api: RowApi;
}

/** Who rolled, the token first where the viewer knows its name: "Kara (Mira) rolled". */
function rolledBy(roller: string, token: string | null): string {
  return token === null || token === '' ? `${roller} rolled` : `${token} (${roller}) rolled`;
}

/**
 * A roll, in the look of an entry of Atlas's dice log: the token's portrait or the roller's disc,
 * who rolled and what for, the formula and its total, and the dice on demand.
 */
export const RollRow = memo(function RollRow({ entry, face, time, api, ...flags }: RollRowProps): ReactElement {
  const { id, who, name, roll } = entry;
  const [open, setOpen] = useState(false);
  const dice = useId();
  const reactions = reactionsFor(entry, api.self);
  const roller = shownName(who, name, api.self);
  const ability = roll.source?.abilityName;
  const crit = roll.crit === 'high' ? 'atlas-online-log__roll--crit-success' : roll.crit === 'low' ? 'atlas-online-log__roll--crit-fail' : null;
  return (
    <RowShell id={id} className="atlas-online-log__row--roll" reactions={reactions} canEdit={false} canDelete={false} api={api} editing={false} {...flags}>
      <div className={classes('atlas-online-log__roll', crit)}>
        {face?.portrait ? (
          <TokenPortrait className="atlas-online-log__roll-portrait" src={face.portrait.src} alt="" showRing={face.portrait.showRing} ringColor={face.portrait.ringColor} />
        ) : (
          <AuthorDisc who={who} name={name} size="roll" />
        )}
        <div className="atlas-online-log__roll-body">
          <div className="atlas-online-log__byline">
            <span className="atlas-online-log__roll-who">{rolledBy(roller, face?.name ?? null)}</span>
            <span className="atlas-online-log__time">{time}</span>
          </div>
          {ability !== undefined && ability !== '' && <span className="atlas-online-log__roll-ability atlas-dice-toast__ability">{ability}</span>}
          <div className="atlas-online-log__roll-summary">
            <span className="atlas-online-log__roll-formula">{roll.formula}</span>
            <span className="atlas-online-log__roll-equals" aria-hidden="true">=</span>
            <span className="atlas-online-log__roll-total">{roll.total}</span>
          </div>
          <button type="button" className="atlas-online-log__roll-toggle" aria-expanded={open} aria-controls={dice} onClick={() => setOpen(!open)}>
            <ChevronDown className={classes('atlas-online-log__roll-chevron', open && 'is-open')} />
            Dice
          </button>
          {open && (
            <div id={dice} className="atlas-online-log__roll-dice">
              {roll.rolls.map((die, index) => (
                <span key={index} className={classes('atlas-online-log__die', die.value === die.max && 'atlas-online-log__die--max', die.value === 1 && 'atlas-online-log__die--min')}>
                  {dieLabel(roll.rolls, index)}
                </span>
              ))}
              {roll.modifiers !== 0 && <span className="atlas-online-log__die">{roll.modifiers > 0 ? `+${roll.modifiers}` : `−${Math.abs(roll.modifiers)}`}</span>}
            </div>
          )}
          {entry.hidden === true && <span className="atlas-online-log__roll-hidden"><EyeOff />Only you see this roll</span>}
        </div>
      </div>
      <ReactionChips id={id} reactions={reactions} api={api} />
    </RowShell>
  );
});
