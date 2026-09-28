/**
 * LootTab — the bases whose views the loot roller rolls on, and the currency
 * their prices are in.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Table, Trash2 } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { isLootBaseLoaded, lootBaseItemCount, needsBases, type LootBase } from '../../../loot/LootBaseReader';
import { parentPath } from '../../../utils/pathUtils';
import { plural } from '../../../utils/plural';
import { useLootBases } from '../loot/useLootBases';
import LinkedNotePicker from '../LinkedNotePicker';
import { Tutorial } from '../../../onboarding/Tutorial';
import { LOOT_SETTINGS_STEPS, LOOT_TUTORIAL_LABEL } from '../../../onboarding/lootTutorials';

interface LootTabProps {
  app: App;
  lootBases: string[];
  onBasesChange: (lootBases: string[]) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
}

function baseSummary(base: LootBase | undefined): string {
  if (!base || !isLootBaseLoaded(base)) return 'Reading…';
  if (base.missing) return 'Base not found';
  if (base.views.length === 0) return 'No views';
  if (needsBases(base)) return 'Bases is turned off';
  return `${plural(base.views.length, 'view')} · ${plural(lootBaseItemCount(base), 'item')}`;
}

export function LootTab({ app, lootBases, onBasesChange, currency, onCurrencyChange }: LootTabProps): React.ReactElement {
  const { bases } = useLootBases(app, lootBases);
  const [picking, setPicking] = useState(false);
  const baseFiles = useMemo(() => app.vault.getFiles().filter((file) => file.extension === 'base'), [app]);

  const addBase = (path: string): void => {
    if (!lootBases.includes(path)) onBasesChange([...lootBases, path]);
    setPicking(false);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        The loot roller draws items from the views of these bases: every note a
        view lists is an item. Price, Rarity, Type and Description properties
        are picked up by name; the view’s other columns show as the item’s
        properties. Tick views in the loot roller to choose what it rolls on.
      </p>

      <Tutorial
        id="lootSettings"
        label={LOOT_TUTORIAL_LABEL}
        steps={LOOT_SETTINGS_STEPS}
        action={lootBases.length === 0 ? { label: 'Add a base', onClick: () => setPicking(true) } : undefined}
      />

      <div className="atlas-csm-loot-bases">
        {lootBases.length > 0 ? (
          <div className="atlas-csm-loot-list">
            {lootBases.map((path) => {
              const base = bases.find((entry) => entry.path === path);
              const problem = base !== undefined && (base.missing || base.views.length === 0 || needsBases(base));
              return (
                <div key={path} className={`atlas-csm-loot-base${problem ? ' atlas-csm-loot-base--problem' : ''}`}>
                  <span className="atlas-csm-loot-base-icon">{problem ? <AlertTriangle /> : <Table />}</span>
                  <span className="atlas-csm-loot-base-text">
                    <span className="atlas-csm-loot-base-name">{base?.name ?? path}</span>
                    <span className="atlas-csm-loot-base-path">{parentPath(path) || 'Vault root'}</span>
                  </span>
                  <span className="atlas-csm-loot-base-summary">
                    {baseSummary(base)}
                  </span>
                  <LabelTooltip label="Remove loot base">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="atlas-csm-condition-delete"
                      aria-label="Remove loot base"
                      onClick={() => onBasesChange(lootBases.filter((entry) => entry !== path))}
                    >
                      <Trash2 />
                    </Button>
                  </LabelTooltip>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="atlas-csm-empty">No loot bases yet</div>
        )}

        {picking ? (
          <div className="atlas-csm-loot-picker">
            <LinkedNotePicker app={app} files={baseFiles} noun="bases" icon={Table} onSelect={addBase} />
            <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPicking(true)}>
            <Plus />
            Add Loot Base
          </Button>
        )}
      </div>

      <div className="atlas-csm-field atlas-csm-loot-currency">
        <label className="atlas-csm-label" htmlFor="atlas-csm-loot-currency">Currency</label>
        <input
          id="atlas-csm-loot-currency"
          type="text"
          className="atlas-csm-input"
          placeholder="e.g. gold"
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
        />
        <p className="atlas-csm-hint">Named after prices that are plain numbers, e.g. “500 gold”.</p>
      </div>
    </>
  );
}
