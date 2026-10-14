import { newSceneFile, type NewSceneFile } from '../../services/newSceneFile';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { UvttScene } from './uvttToScene';

/** What a scene file takes of an imported map: its grid, walls, lights and lighting. */
export type UvttSceneContent = Pick<UvttScene, 'grid' | 'walls' | 'lights' | 'lighting'>;

/**
 * A new scene of a collection with `settings` on `background`, holding what an import placed. The
 * files state their grid, so there is none to detect.
 */
export function uvttSceneFile(settings: CollectionSettings, background: string, scene: UvttSceneContent): NewSceneFile {
  const content = newSceneFile(settings, background);
  const { autoDetect: _autoDetect, ...grid } = content.state.grid;
  content.state.grid = { ...grid, ...scene.grid };
  content.state.objects = { ...content.state.objects, walls: scene.walls, lights: scene.lights };
  content.state.lighting = scene.lighting;
  return content;
}
