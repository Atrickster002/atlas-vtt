import React from 'react';
import { Dice5, Dices, Eye, Gauge, Grid3X3, LayoutGrid, ListFilter, ScrollText, ShieldAlert } from 'lucide-react';
import type { ExperimentalFeatureId } from '../../../experimental/experimentalFeatures';
import { CoinIcon } from '../CoinIcon';

export type CollectionSettingsTab =
  'system' | 'dice' | 'grid' | 'vision' | 'widgets' | 'conditions' | 'resources' | 'statblocks' | 'creatureFilters' | 'loot';

export interface SettingsTabDef {
  id: CollectionSettingsTab;
  label: string;
  icon: React.ReactNode;
  /** The experimental feature the tab belongs to; it is offered only while the feature is on. */
  feature?: ExperimentalFeatureId;
}

const TABS: readonly SettingsTabDef[] = [
  { id: 'system', label: 'Game System', icon: <Dices size={16} /> },
  { id: 'dice', label: 'Dice', icon: <Dice5 size={16} /> },
  { id: 'grid', label: 'Grid & Measure', icon: <Grid3X3 size={16} /> },
  { id: 'vision', label: 'Vision', icon: <Eye size={16} />, feature: 'dynamicLighting' },
  { id: 'widgets', label: 'Default Widgets', icon: <LayoutGrid size={16} /> },
  { id: 'conditions', label: 'Conditions', icon: <ShieldAlert size={16} /> },
  { id: 'resources', label: 'Resources', icon: <Gauge size={16} /> },
  { id: 'statblocks', label: 'Statblocks', icon: <ScrollText size={16} />, feature: 'statblockEditor' },
  { id: 'creatureFilters', label: 'Creature Filters', icon: <ListFilter size={16} /> },
  { id: 'loot', label: 'Loot', icon: <CoinIcon size={16} /> },
];

/** Which experimental features are switched on, by id. */
export type FeatureSwitches = Readonly<Record<ExperimentalFeatureId, boolean>>;

/** The tabs on offer, in order: a tab of an experimental feature only while the feature is on. */
export function settingsTabs(features: FeatureSwitches): readonly SettingsTabDef[] {
  return TABS.filter((tab) => !tab.feature || features[tab.feature]);
}

/** Whether `tab` is on offer; the dialog shows a tab's content only then. */
export function offersTab(tab: CollectionSettingsTab, features: FeatureSwitches): boolean {
  return settingsTabs(features).some((def) => def.id === tab);
}
