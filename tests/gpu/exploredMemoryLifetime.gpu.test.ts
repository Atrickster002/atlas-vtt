import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIZE, createHarness, resetContext } from '../../src/app/pixi/lighting/__tests__/rendererHarness';
import { RIGHT_ROOM, WALL, forget, memoryScenes, reveal } from './exploredMemoryScene';

describe('the life of the explored memory\'s undo steps', () => {
  const { scene, unwatch } = memoryScenes();

  it('leaves the memory\'s steps behind when the scene unloads: the history keeps the map\'s own', async () => {
    const { lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(history().pastStates).toHaveLength(3);

    lighting.beforeMapUnload();
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(history().pastStates).toHaveLength(0);
  });

  it('takes no edit back when a load starts the count over', async () => {
    const { lighting, store, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    // A load that reaches the store without the scene having been unloaded first.
    store.getState().setMapLoading(true, 0);
    store.getState().setExploredEdits(0);
    expect(redAt(200, 128)).toBe(255);
  });

  it('drops its steps with the texture when the map changes size', async () => {
    let bounds = { width: SIZE, height: SIZE };
    const { lighting, store, history, overlayTextures } = await scene({ bounds: () => bounds });
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall(WALL);
    expect(history().pastStates).toHaveLength(2);
    expect(overlayTextures).toHaveLength(1);

    bounds = { width: SIZE * 2, height: SIZE };
    lighting.refreshBounds();
    // The overlay was handed the new texture before the old one went.
    expect(overlayTextures).toHaveLength(2);
    expect(overlayTextures[1]).not.toBe(overlayTextures[0]);
    expect(overlayTextures[0]!.destroyed).toBe(true);
    expect(history().pastStates).toHaveLength(1);
    // The next edit is an undo step again, on the new texture.
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(history().pastStates).toHaveLength(2);
    history().undo();
    expect(history().pastStates).toHaveLength(1);
  });

  it('hands the GM\'s overlay the memory\'s texture, and takes it back before the view goes', async () => {
    const { overlayTextures, destroyLighting } = await scene();
    expect(overlayTextures).toHaveLength(1);
    const texture = overlayTextures[0]!;
    expect(texture.destroyed).toBe(false);
    destroyLighting();
    expect(overlayTextures).toEqual([texture, null]);
    expect(texture.destroyed).toBe(true);
  });

  it('drops its steps when a restored context draws the memory anew from the saved mask', async () => {
    const { renderer, lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    unwatch();
    await resetContext(renderer, () => {
      // An undo while the context is lost has no texture to write to.
      history().undo();
    });
    // The next lighting work notices the restore.
    store.getState().setSceneLighting({ ambient: 0.05 });
    // Only the wall is left to undo: no step that would write texels of the texture that is gone.
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });

  it('edits nothing while a lost context holds the texture, and puts no step in the history', async () => {
    const { renderer, lighting, history } = await scene();
    unwatch();
    const lost = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    renderer.gl.getExtension('WEBGL_lose_context')!.loseContext();
    await lost;
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
    expect(history().pastStates).toHaveLength(0);
  });
});

describe('forgetting explored areas while the saved memory is not in yet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('drops the saved memory at once and for good, and edits nothing by hand meanwhile', async () => {
    const harness = await createHarness({ holdFirstDecode: true });
    const { lighting, state, setExploredMask, redAt, releaseFirstDecode, settle } = harness;
    try {
      expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
      lighting.resetExplored();
      expect(setExploredMask).toHaveBeenCalledWith(null);
      expect(state.exploredEdits).toBe(0);
      releaseFirstDecode();
      await settle();
      // The mask that was on its way in is not drawn after all.
      expect(redAt(200, 200)).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});
