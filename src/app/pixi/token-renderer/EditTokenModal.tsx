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
import type { SenseRules } from '../../creatures/tokenSensesResolver';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { mapSenseRules } from '../../services/mapSenseRules';
import { useStatblockSenses, type StatblockLink } from './useStatblockSenses';
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

interface EditTokenModalProps {
  initial: EditTokenValues;
  resourceDefaults: ResourceDefaults;
  lighting: TokenLightingContext;
  /** The statblock the token links, whose senses it follows while it has none of its own. */
  statblock: StatblockLink | null;
  onSave: (values: EditTokenValues) => void;
  onClose: () => void;
}

const defaultPlaceholder = (value: number | undefined): string =>
  value === undefined ? 'None' : `Statblock default: ${value}`;

function EditTokenModalInner({ initial, resourceDefaults, lighting, statblock, onSave, onClose }: EditTokenModalProps): React.ReactElement {
  const inherited = useStatblockSenses(statblock);
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
      } else if (e.key === 'Enter' && !takesEnter(e.target)) {
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
            <TokenLightingFields vision={vision} onVisionChange={setVision} light={light} onLightChange={setLight} context={{ ...lighting, inherited }} />
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

/**
 * Enter on a button presses it and on a colour cell opens the picker; anywhere else in the modal
 * it saves. A popout's elements are not `instanceof` this window's classes.
 */
function takesEnter(target: EventTarget | null): boolean {
  return (target as Element | null)?.closest?.('button, input[type="color"]') != null;
}

function lightingUpdates(vision: VisionForm, light: LightForm): Pick<TokenUpdates, 'vision' | 'light'> {
  return { vision: visionFromForm(vision), light: lightFromForm(light) };
}

/** What the token's map and its collection say about vision and light. */
function lightingContext(state: ViewAtlasState, app: App, rules: SenseRules): TokenLightingContext {
  const { unitType, unitDistance } = rules.unit;
  return {
    unit: unitLabelFor(unitType),
    unitDistance,
    maxLightRange: maxLightRange(unitScaleOf({ unitDistance }, state.grid)),
    senses: rules.definitions,
    lightPresets: mapLightPresets(app, state),
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
export function openEditTokenModal(token: TokenEntity, store: StoreApi<ViewAtlasState>, app: App): void {
  const character = token.kind === 'character' ? token : undefined;
  // The senses of the map's collection and what it measures in, as its statblocks are read with.
  const rules = mapSenseRules(app, AssetService.getInstance(app), store.getState());
  const lighting = lightingContext(store.getState(), app, rules);
  const statblock = character?.statblockPath ? { app, path: character.statblockPath, rules } : null;
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
        statblock={statblock}
        resourceDefaults={resourceDefaults}
        onSave={handleSave}
        onClose={cleanup}
      />
    </TooltipProvider>,
  );
}
