import { describe, expect, it } from 'vitest';
import { placeTutorialCard } from '../../src/app/onboarding/tutorialPlacement';

const view = { width: 1200, height: 800 };
const card = { width: 360, height: 200 };
const box = (left: number, top: number, width: number, height: number): { left: number; top: number; right: number; bottom: number } =>
  ({ left, top, right: left + width, bottom: top + height });

describe('placeTutorialCard', () => {
  it('puts the card below a target with room under it', () => {
    expect(placeTutorialCard(box(100, 100, 200, 40), card, view)).toEqual({ left: 100, top: 156 });
  });

  it('goes above a target near the bottom', () => {
    expect(placeTutorialCard(box(100, 700, 200, 60), card, view)).toEqual({ left: 100, top: 484 });
  });

  it('goes beside a target too tall for either, never over it', () => {
    expect(placeTutorialCard(box(300, 100, 200, 650), card, view)).toEqual({ left: 516, top: 100 });
    expect(placeTutorialCard(box(800, 100, 380, 650), card, view)).toEqual({ left: 424, top: 100 });
  });

  it('keeps the card on screen', () => {
    expect(placeTutorialCard(box(1100, 20, 80, 30), card, view)).toEqual({ left: 824, top: 66 });
  });
});
