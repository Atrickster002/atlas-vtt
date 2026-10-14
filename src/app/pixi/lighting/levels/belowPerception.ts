import { heldForSight } from '../../../lighting/sightOnDrop';
import { levelObjectsOn } from '../../../levels/levelObjects';
import type { LevelStack } from '../../../levels/levelStack';
import type { TokenEntity } from '../../../types';
import type { SightRules } from '../../../vision/sightRules';
import { belowTokenPerception, type FogCover } from '../../../vision/throughSight';
import { PerceptionMemo, type TokenPerception } from '../../../vision/tokenPerception';
import type { LightingState } from '../LightingRenderer';
import type { BelowLevel } from './BelowLevel';

/**
 * How the players perceive the tokens of the levels below a view, each level by its own rule
 * (`belowTokenPerception`), with a memo per level that keeps its answers while nothing they rest on changes.
 */
export class BelowPerception {
  private readonly memos = new Map<string, PerceptionMemo>();

  /** Every token of a ready level below that `stack` shows, as its level perceives it; any other token unseen. */
  of(state: LightingState, levels: Iterable<BelowLevel>, stack: LevelStack | null, viewedFog: FogCover, rules: SightRules | undefined): TokenPerception {
    const perceived: { tokens: Record<string, TokenEntity>; perceive: TokenPerception }[] = [];
    for (const level of levels) {
      const below = stack && level.ready() ? level.belowSight(stack) : null;
      if (!below) continue;
      const tokens = levelObjectsOn(state, level.id).tokens;
      const memo = this.memos.get(level.id) ?? new PerceptionMemo();
      this.memos.set(level.id, memo);
      perceived.push({
        tokens,
        perceive: belowTokenPerception(below, tokens, { viewed: viewedFog, below: level.fogCoverage() }, { conditions: rules?.conditions ?? [], held: heldForSight(state) }, memo),
      });
    }
    return (tokenId) => perceived.find((level) => level.tokens[tokenId])?.perceive(tokenId) ?? 'unseen';
  }

  /** A level below went: its memo goes with it. */
  forget(levelId: string): void {
    this.memos.delete(levelId);
  }
}
