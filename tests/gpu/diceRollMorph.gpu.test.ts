import '../setup/obsidianDom';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throwStyle } from '../../src/app/dice3d/diceDisplay';
import { sceneFromRolls } from '../../src/app/dice3d/diceScene';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';
import { DiceRollStack } from '../../src/app/react/components/dice3d/DiceRollStack';
import type { StackedRoll } from '../../src/app/react/components/dice3d/rollStackState';

// The header reaches into the app's services for the roller's artwork; the morph does not need it.
vi.mock('../../src/app/react/components/dice3d/DiceRollHeader', () => ({ DiceRollHeader: (): null => null }));

/** The part of dice-roll.scss the morph depends on: a tall panel that becomes a row with a small dice field. */
const LAYOUT = `
  .atlas-dice-rolls { width: 336px; display: flex; flex-direction: column; gap: 8px; }
  .atlas-dice-roll { width: 100%; display: flex; flex-direction: column; }
  .atlas-dice-roll__sheet { position: relative; display: flex; flex-direction: column; overflow: hidden; }
  .atlas-dice-roll__floor { width: 100%; aspect-ratio: 16 / 10; }
  .atlas-dice-roll__row { min-height: 54px; }
  .atlas-dice-roll__stage { position: absolute; inset: 0; }
  .atlas-dice-roll--compact .atlas-dice-roll__stage { inset: 4px auto 4px 4px; aspect-ratio: 1; }
  .atlas-dice-stage__canvas { display: block; width: 100%; height: 100%; }
`;
/** Longer than the morph's spring. */
const MORPH_FRAMES = 40;

function roll(id: string): StackedRoll {
  const result: DiceRollResult = {
    id, timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 12, max: 20 }], modifiers: 0, total: 12,
  };
  const scene = sceneFromRolls(result.rolls);
  if (!scene) throw new Error('a d20 has a body');
  return { result, scene, style: throwStyle('full') };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The largest value `measure` gives over the frames of a morph. */
async function worstOverMorph(measure: () => number | null): Promise<number> {
  let worst = 0;
  for (let i = 0; i < MORPH_FRAMES; i++) {
    await nextFrame();
    worst = Math.max(worst, measure() ?? 0);
  }
  return worst;
}

describe('the roll stack rearranging', () => {
  const style = document.createElement('style');
  style.textContent = LAYOUT;
  let host: HTMLElement;
  let root: Root;

  const show = (rolls: StackedRoll[]): void => flushSync(() => root.render(
    React.createElement(DiceRollStack, { rolls, muted: true, onClose: () => undefined, onDone: () => undefined }),
  ));

  beforeEach(() => {
    document.head.append(style);
    host = document.createElement('div');
    host.className = 'atlas-dice-rolls';
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it('never stretches the dice of a roll shrinking to a row', async () => {
    const first = roll('first');
    show([first]);
    await worstOverMorph(() => null);
    show([first, roll('second')]);

    // The stage as drawn against the stage as laid out: any difference is a transform stretching the dice.
    const stretch = await worstOverMorph(() => {
      const stage = host.querySelector<HTMLElement>('.atlas-dice-roll--compact .atlas-dice-roll__stage');
      if (!stage) return null;
      const drawn = stage.getBoundingClientRect();
      const ratio = (drawn.height / stage.offsetHeight) / (drawn.width / stage.offsetWidth);
      return Math.max(ratio, 1 / ratio);
    });
    // A measured ratio is at least 1: 0 means the row's stage was never found.
    expect(stretch).toBeGreaterThanOrEqual(1);
    expect(stretch).toBeLessThan(1.05);
  });

  it('keeps the dice on a panel that moves up', async () => {
    const second = roll('second');
    show([roll('first'), second]);
    await worstOverMorph(() => null);
    show([second]);

    const drift = await worstOverMorph(() => {
      const sheet = host.querySelector<HTMLElement>('.atlas-dice-roll__sheet');
      const stage = host.querySelector<HTMLElement>('.atlas-dice-roll__stage');
      if (!sheet || !stage) return null;
      return Math.abs(stage.getBoundingClientRect().top - sheet.getBoundingClientRect().top);
    });
    expect(drift).toBeLessThan(2);
  });
});
