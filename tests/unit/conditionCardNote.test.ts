import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, type Container } from 'pixi.js';
import { TokenConditionsUI } from '../../src/app/pixi/token-renderer/TokenConditionsUI';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const definitions: ConditionDefinition[] = [{ id: 'restrained', name: 'Restrained', color: '#c0392b' }];
const LAYOUT = { ringRadius: 31, badgeScale: 1, cardScale: 1 };
const NOTE = 'Darkness · Seen by Mirabel: Darkvision';

describe('the note on a token\'s hover card', () => {
  let restore: () => void;
  let ui: TokenConditionsUI;

  beforeEach(() => {
    restore = stubJsdomGraphics();
    ui = new TokenConditionsUI();
  });

  afterEach(() => {
    ui.destroy();
    restore();
  });

  const card = (): Container => ui.container.children[1] as Container;
  const texts = (): string[] => {
    const found: string[] = [];
    const walk = (node: Container): void => {
      if (node instanceof Text) found.push(node.text);
      node.children.forEach(walk);
    };
    walk(card());
    return found;
  };

  it('stands under the conditions', () => {
    ui.update({ conditions: ['restrained'] }, definitions, LAYOUT, NOTE);
    ui.setHovered(true);
    expect(card().visible).toBe(true);
    expect(texts().sort()).toEqual([NOTE, 'Restrained'].sort());
  });

  it('opens the card on a token without conditions, which has none without a note', () => {
    ui.update({}, definitions, LAYOUT);
    ui.setHovered(true);
    expect(card().visible).toBe(false);
    ui.setHovered(false);
    ui.update({}, definitions, LAYOUT, NOTE);
    ui.setHovered(true);
    expect(card().visible).toBe(true);
    expect(texts()).toEqual([NOTE]);
  });

  it('is read when the hover begins, so it is as fresh as the card', () => {
    ui.update({}, definitions, LAYOUT, 'Bright light · Seen by the players');
    ui.setHovered(true, () => NOTE);
    expect(texts()).toEqual([NOTE]);
  });

  it('follows the sight while the card is open, and closes a card it leaves empty', () => {
    ui.update({}, definitions, LAYOUT, NOTE);
    ui.setHovered(true);
    ui.setNote('Darkness · Not seen by the players');
    expect(card().visible).toBe(true);
    expect(texts()).toEqual(['Darkness · Not seen by the players']);
    ui.setNote(null);
    expect(card().visible).toBe(false);
    // Not hovered, a new note waits for the next hover.
    ui.setHovered(false);
    ui.setNote(NOTE);
    expect(card().visible).toBe(false);
  });
});
