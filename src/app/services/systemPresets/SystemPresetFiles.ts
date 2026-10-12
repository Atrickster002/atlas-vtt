import type { App } from 'obsidian';
import type { PresetStorage } from '../SystemPresetService';
import { RecordFiles, type RecordLayout } from '../recordFiles/RecordFiles';
import {
  SYSTEM_PRESET_FOLDER,
  freePresetPath,
  isNamedAfter,
  isPresetPath,
  presetText,
  readPresetText,
  type StoredPreset,
} from './presetFiles';

/** A preset is one file named after it in the presets folder (`presetFiles.ts`). */
const PRESET_LAYOUT: RecordLayout<StoredPreset> = {
  root: SYSTEM_PRESET_FOLDER,
  kind: 'system preset',
  isRecordPath: isPresetPath,
  read: readPresetText,
  text: presetText,
  namedPath: (path) => path,
  recordPathIn: (path) => path,
  freeNamedPath: freePresetPath,
  isNamedAfter,
};

/**
 * The user's game system presets as vault files, one per preset (`RecordFiles`). One per app,
 * opened by the plugin and released when it unloads.
 */
export class SystemPresetFiles extends RecordFiles<StoredPreset> implements PresetStorage {
  private static readonly instances = new WeakMap<App, SystemPresetFiles>();

  static open(app: App): SystemPresetFiles {
    let files = SystemPresetFiles.instances.get(app);
    if (!files) {
      files = new SystemPresetFiles(app);
      SystemPresetFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's presets once the plugin opened them; undefined before (and in tests that open none). */
  static forApp(app: App | undefined): SystemPresetFiles | undefined {
    return app ? SystemPresetFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    SystemPresetFiles.instances.get(app)?.destroy();
    SystemPresetFiles.instances.delete(app);
  }

  private constructor(app: App) {
    super(app, PRESET_LAYOUT);
  }

  /**
   * Writes a new preset file. `apart` names it with a piece of its id: devices that carry their
   * presets over at once could otherwise each write a file of the same name, of which sync keeps
   * one. Its next edit gives it the plain name when that is free.
   */
  override create(entry: StoredPreset, apart = false): void {
    super.create(entry, apart ? `${typeof entry.name === 'string' ? entry.name : ''} (${entry.id.slice(-6)})` : entry.name);
  }
}
