import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT } from '../../src/app/stores/history';
import { RIGHT_ROOM, forget, memoryScenes, reveal } from './exploredMemoryScene';

describe('undoing and redoing edits of the explored memory', () => {
  const { scene } = memoryScenes();

  it('undoes and redoes memory edits among the store\'s own steps, in the order they were made', async () => {
    const { lighting, store, history, redAt, travels } = await scene();
    const walls = (): number => Object.keys(store.getState().objects.walls).length;
    /** The right room's memory at the brush's spot and away from it, and the walls on the map. */
    const state = (): string => `${redAt(200, 128)} ${redAt(240, 40)} ${walls()} walls`;

    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(state()).toBe('0 255 2 walls');
    expect(history().pastStates).toHaveLength(3);

    history().undo();
    expect(state()).toBe('255 255 2 walls');
    history().undo();
    expect(state()).toBe('255 255 1 walls');
    history().undo();
    expect(state()).toBe('0 0 1 walls');
    expect(history().pastStates).toHaveLength(0);

    history().redo();
    expect(state()).toBe('255 255 1 walls');
    history().redo();
    expect(state()).toBe('255 255 2 walls');
    history().redo();
    expect(state()).toBe('0 255 2 walls');
    expect(history().futureStates).toHaveLength(0);
    // The overlay's owner heard of each memory step that went back or forth, and of none of the wall's or the edits themselves.
    expect(travels).toEqual([true, true, false, false]);
  });

  it('gives the memory back texel for texel, soft edges and what sight recorded before included', async () => {
    const { lighting, store, history, texels, textureHash: texture } = await scene({ lighting: { ambient: 1 } });
    // By day the token has seen its room up to 70 px: a round, soft-edged memory.
    expect(texels().some((value, i) => i % 4 === 0 && value > 20 && value < 235)).toBe(true);
    const seen = texture();

    lighting.editExplored(forget({ type: 'brush', brushRadius: 30, points: [{ x: 30, y: 100 }, { x: 110, y: 160 }] }));
    const forgotten = texture();
    expect(forgotten).not.toBe(seen);
    lighting.editExplored(reveal({ type: 'lasso', points: [{ x: 5, y: 5 }, { x: 250, y: 40 }, { x: 100, y: 250 }] }));
    const revealed = texture();
    expect(revealed).not.toBe(forgotten);

    history().undo();
    expect(texture()).toBe(forgotten);
    history().undo();
    expect(texture()).toBe(seen);
    history().redo();
    history().redo();
    expect(texture()).toBe(revealed);
    expect(store.getState().exploredEdits).toBe(2);
  });

  it('drops the redo of an edit when a new edit follows an undo', async () => {
    const { lighting, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    history().undo();
    lighting.editExplored(reveal({ type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }));
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(redAt(20, 20)).toBe(0);
    expect(redAt(200, 128)).toBe(0);
    history().redo();
    expect(redAt(20, 20)).toBe(255);
    expect(redAt(200, 128)).toBe(0);
  });

  it('takes back only the texels of its stroke: what the tokens see afterwards elsewhere stays remembered', async () => {
    const { lighting, store, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    // Day breaks: the token's sight is recorded in the left room.
    store.getState().setSceneLighting({ ambient: 1 });
    expect(redAt(60, 128)).toBe(255);
    history().undo();
    expect(redAt(200, 128)).toBe(0);
    expect(redAt(60, 128)).toBe(255);
  });

  it('keeps a step for every step the undo history keeps', async () => {
    const { lighting, history, redAt } = await scene();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) lighting.editExplored(reveal({ type: 'rectangle', x: 4 * i, y: 0, width: 4, height: 4 }));
    expect(history().pastStates).toHaveLength(HISTORY_LIMIT);
    while (history().pastStates.length > 0) history().undo();
    // The five oldest edits left the history; every one it still held went back.
    expect(redAt(4 * 4 + 2, 2)).toBe(255);
    expect(redAt(4 * 5 + 2, 2)).toBe(0);
    expect(redAt(4 * (HISTORY_LIMIT + 4) + 2, 2)).toBe(0);
  });
});
