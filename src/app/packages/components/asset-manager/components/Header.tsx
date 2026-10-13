import React, { useRef } from 'react';
import {
  X, Plus, ChevronLeft, ChevronRight, FolderPlus, PanelLeft,
  Map as MapIcon, FolderOpen,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { App } from 'obsidian';
import type { Tab } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { HeaderMenu } from './HeaderMenu';
import { HeaderSearch } from './HeaderSearch';
import type { FilterSearch } from '../hooks/useFilterSearch';
import { useHeaderCompaction } from '../hooks/useHeaderCompaction';
import { SortControls } from './SortControls';
import { TabSwitcher } from './TabSwitcher';
import { TokenIcon } from '../../../../react/components/TokenIcon';
import { tabHasFolders } from '../utils/tabKinds';
import { t } from '../../../../i18n';

export interface HeaderProps {
  app: App;
  search: string;
  onSearch: (value: string) => void;
  /** Filters typed into the search and set in its filter panel. */
  query: FilterSearch;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  assetCounts: Record<Tab, number> | null;
  onCreateTokens?: () => void;
  onCreateMap?: () => void;
  onCreateCollection?: () => void;
  onCreateFolder: () => void;
  sidebarToggleLabel: string;
  onToggleSidebar: () => void;
  sel: Pick<
    SelectionState,
    'navigationHistory' | 'handleNavigateBack' | 'handleNavigateForward' |
    'selectedAssetIds' | 'selectedFolderIds' | 'handleClearSelection' |
    'sortBy' | 'sortOptions' | 'setSortBy' | 'sortOrder' | 'setSortOrder'
  >;
}

/**
 * One-row toolbar: navigation and selection on the left, asset type in the
 * centre, search / sort / create on the right. When its controls do
 * not fit, the tabs, the search and the sort fold into menus and buttons
 * (`useHeaderCompaction`), so they never overlap.
 */
export function Header({
  app,
  search,
  onSearch,
  query,
  activeTab,
  onTabChange,
  assetCounts,
  onCreateTokens,
  onCreateMap,
  onCreateCollection,
  onCreateFolder,
  sidebarToggleLabel,
  onToggleSidebar,
  sel,
}: HeaderProps): React.JSX.Element {
  const selectionCount = sel.selectedAssetIds.length + sel.selectedFolderIds.length;
  const toolbarRef = useRef<HTMLDivElement>(null);
  useHeaderCompaction(toolbarRef);

  return (
    <header className="atlas-asset-manager-header">
      <div className="atlas-am-toolbar" ref={toolbarRef}>
        <div className="atlas-am-toolbar-left">
          <LabelTooltip label={sidebarToggleLabel}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn atlas-sidebar-toggle-btn"
              onClick={onToggleSidebar}
              aria-label={sidebarToggleLabel}
            >
              <PanelLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('common.back')}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateBack}
              disabled={!sel.navigationHistory.canGoBack()}
            >
              <ChevronLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('am.header.forward')}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateForward}
              disabled={!sel.navigationHistory.canGoForward()}
            >
              <ChevronRight />
            </Button>
          </LabelTooltip>

          {selectionCount > 0 && (
            <>
              <div className="atlas-am-toolbar-divider" />
              <div className="atlas-selection-info">
                <span>{selectionCount}<span className="atlas-selection-label"> {t('am.header.selected')}</span></span>
                <LabelTooltip label={t('dice.clearSelection')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-clear-selection-btn"
                    onClick={sel.handleClearSelection}
                  >
                    <X />
                  </Button>
                </LabelTooltip>
              </div>
            </>
          )}
        </div>

        <div className="atlas-am-toolbar-center">
          <TabSwitcher activeTab={activeTab} onTabChange={onTabChange} assetCounts={assetCounts} />
        </div>

        <div className="atlas-am-toolbar-right">
          <HeaderSearch app={app} search={search} onSearch={onSearch} query={query} />
          <SortControls
            sortBy={sel.sortBy}
            sortOptions={sel.sortOptions}
            setSortBy={sel.setSortBy}
            sortOrder={sel.sortOrder}
            setSortOrder={sel.setSortOrder}
          />

          <HeaderMenu
            label={t('am.header.create')}
            triggerClassName="atlas-asset-manager-create-btn"
            triggerVariant="default"
            iconTrigger
            triggerContent={<Plus />}
            items={[
              { key: 'token', label: t('am.header.createToken'), icon: <TokenIcon />, onSelect: onCreateTokens },
              { key: 'map', label: t('am.header.addMap'), icon: <MapIcon />, onSelect: onCreateMap },
              { key: 'folder', label: t('am.header.newFolder'), icon: <FolderPlus />, disabled: !tabHasFolders(activeTab), onSelect: onCreateFolder },
              { key: 'collection', label: t('am.header.createCollection'), icon: <FolderOpen />, separated: true, onSelect: onCreateCollection },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
