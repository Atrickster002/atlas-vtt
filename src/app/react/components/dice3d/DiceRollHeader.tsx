import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { useDiceAvatar } from '../dice/useDiceAvatar';

interface DiceRollHeaderProps {
  result: DiceRollResult;
  label: string;
}

/** The portrait of the token that rolled, when it has one, and who rolled what. */
export function DiceRollHeader({ result, label }: DiceRollHeaderProps): React.ReactElement {
  const avatar = useDiceAvatar(result.source);
  return (
    <span className="atlas-dice-roll__who">
      {avatar && (
        <TokenPortrait
          className="atlas-dice-roll__avatar"
          src={avatar.src}
          alt=""
          showRing={avatar.showRing}
          ringColor={avatar.ringColor}
        />
      )}
      <span className="atlas-dice-roll__label">{label}</span>
    </span>
  );
}
