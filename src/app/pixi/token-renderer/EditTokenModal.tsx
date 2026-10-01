import React, { useId, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TFile, type App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { TokenUpdates, ViewAtlasState } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Button } from '../../packages/components/primitives/button';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { AssetService } from '../../services/AssetService';
import { mapLightPresets, mapSenses } from '../../services/mapCollectionRules';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import type { TokenSense } from '../../types/senseTypes';
import { NumberOverrideField, parseNumberInput } from './NumberOverrideField';
import { readStatblockVitals } from './statblockFrontmatter';
import { buildResourceUpdates, statblockResourceDefaults, type ResourceDefaults } from './tokenResourceEdits';
import { TokenLightingFields, type TokenLightingContext } from './TokenLightingFields';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { unitLabelFor } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { maxLightRange } from '../../lighting/lightRanges';
import { lightForm, lightFromForm, visionForm, visionFromForm, type LightForm, type VisionForm } from '../../lighting/tokenLighting';
import { numberText } from '../../utils/numberInput';

interface EditTokenValues {
  name: string;
  showNameplate: boolean;
  maxHp: number | undefined;
  maxStress: number | undefined;
  vision: VisionForm;
  light: LightForm;
}

/** What only the caller knows about the token being edited. */
export interface EditTokenOptions {
  /**
   * The senses the token takes from its linked statblock while it has none of its own. The
   * modal shows them marked "from statblock"; editing them copies them onto the token.
   */
  inheritedSenses?: readonly TokenSense[];
}

interface EditTokenModalProps {
  initial: EditTokenValues;
  resourceDefaults: ResourceDefaults;
  lighting: TokenLightingContext;
  onSave: (values: EditTokenValues) => void;
  onClose: () => void;
}

const defaultPlaceholder = (value: number | undefined): string =>
  value === undefined ? 'None' : `Statblock default: ${value}`;

function EditTokenModalInner({ initial, resourceDefaults, lighting, onSave, onClose }: EditTokenModalProps): React.ReactElement {
  const nameplateId = useId();
  const [name, setName] = useState(initial.name);
  const [showNameplate, setShowNameplate] = useState(initial.showNameplate);
  const [maxHpInput, setMaxHpInput] = useState(numberText(initial.maxHp));
  const [maxStressInput, setMaxStressInput] = useState(numberText(initial.maxStress));
  const [vision, setVision] = useState(initial.vision);
  const [light, setLight] = useState(initial.light);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  const handleSave = (): void => {
    onSave({
      name,
      showNameplate,
      maxHp: parseNumberInput(maxHpInput),
      maxStress: parseNumberInput(maxStressInput),
      vision,
      light,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // A control that took the key itself (a switch, an open list) has prevented the default.
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && !isButton(e.target)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="atlas-modal-overlay" onClick={onClose}>
      <div className="atlas-modal atlas-edit-token-modal" onClick={(e) => e.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3>Edit Token</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-modal-body">
          <div className="atlas-edit-token__field">
            <label className="atlas-edit-token__label">Name</label>
            <input
              ref={inputRef}
              type="text"
              className="atlas-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Token name"
            />
          </div>

          <div className="atlas-edit-token__field atlas-edit-token__field--row">
            <span id={nameplateId} className="atlas-edit-token__label">Show Nameplate</span>
            <ToggleSwitch value={showNameplate} onChange={() => setShowNameplate(!showNameplate)} labelledBy={nameplateId} />
          </div>

          <div className="atlas-edit-token__section-divider" />
          <div className="atlas-edit-token__section-label">Resources</div>
          <NumberOverrideField
            label="Max HP"
            value={maxHpInput}
            onChange={setMaxHpInput}
            placeholder={defaultPlaceholder(resourceDefaults.maxHp)}
            resetLabel="Reset to statblock default"
          />
          <NumberOverrideField
            label="Max Secondary Resource"
            value={maxStressInput}
            onChange={setMaxStressInput}
            placeholder={defaultPlaceholder(resourceDefaults.maxStress)}
            resetLabel="Reset to statblock default"
          />
          {WALLS_AND_LIGHTING_ENABLED && (
            <TokenLightingFields vision={vision} onVisionChange={setVision} light={light} onLightChange={setLight} context={lighting} />
          )}
        </div>

        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

/** Enter on a button presses it; anywhere else in the modal it saves. A popout's elements are not `instanceof` this window's classes. */
function isButton(target: EventTarget | null): boolean {
  return (target as Element | null)?.closest?.('button') != null;
}

function lightingUpdates(vision: VisionForm, light: LightForm): Pick<TokenUpdates, 'vision' | 'light'> {
  return { vision: visionFromForm(vision), light: lightFromForm(light) };
}

/** What the token's map and its collection say about vision and light. */
function lightingContext(store: StoreApi<ViewAtlasState>, app: App, options: EditTokenOptions): TokenLightingContext {
  const state = store.getState();
  const { unitType, unitDistance } = mapMeasurementSettings(AssetService.getInstance(app), state);
  return {
    unit: unitLabelFor(unitType),
    unitDistance,
    maxLightRange: maxLightRange(unitScaleOf({ unitDistance }, state.grid)),
    senses: mapSenses(app, state.mapPath),
    lightPresets: mapLightPresets(app, state.mapPath),
    ...options,
  };
}

function readResourceDefaults(app: App, statblockPath: string | undefined): ResourceDefaults {
  const file = statblockPath ? app.vault.getAbstractFileByPath(statblockPath) : null;
  const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
  return frontmatter ? statblockResourceDefaults(readStatblockVitals(frontmatter)) : {};
}

/**
 * Imperatively opens an Edit Token modal by mounting a React root.
 * Call from non-React code (e.g. InteractionController).
 */
export function openEditTokenModal(token: TokenEntity, store: StoreApi<ViewAtlasState>, app: App, options: EditTokenOptions = {}): void {
  const character = token.kind === 'character' ? token : undefined;
  const lighting = lightingContext(store, app, options);
  const resourceDefaults = readResourceDefaults(app, character?.statblockPath);
  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });
  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  const handleSave = ({ name, showNameplate, maxHp, maxStress, vision, light }: EditTokenValues): void => {
    store.getState().updateToken(token.id, {
      name,
      showNameplate,
      ...(WALLS_AND_LIGHTING_ENABLED ? lightingUpdates(vision, light) : {}),
      ...buildResourceUpdates(character ?? {}, { maxHp, maxStress }, resourceDefaults),
    });
    cleanup();
  };

  // Its own React root, so no provider above it: the vision switch's tooltip needs one.
  root.render(
    <TooltipProvider delayDuration={300}>
      <EditTokenModalInner
        initial={{
          name: character?.name ?? '',
          showNameplate: token.showNameplate ?? false,
          maxHp: typeof character?.hp === 'object' ? character.hp.max : character?.hp,
          maxStress: typeof character?.stress === 'object' ? character.stress.max : character?.maxStress,
          vision: visionForm(token.vision, lighting.senses),
          light: lightForm(token.light, lighting.lightPresets),
        }}
        lighting={lighting}
        resourceDefaults={resourceDefaults}
        onSave={handleSave}
        onClose={cleanup}
      />
    </TooltipProvider>,
  );
}
