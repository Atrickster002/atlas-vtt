/**
 * WorldMapField — the image that is the campaign's world map, chosen from the
 * artwork of the collection's maps and scenes.
 */

import React, { useId, useState } from 'react';
import { ImageIcon, ImageOff, X } from 'lucide-react';
import { TFile, type App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { RevealImage } from '../../../packages/components/primitives/RevealImage';
import { Skeleton, SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { CoverCard } from '../../../packages/components/asset-manager/collection-transfer/CoverCard';
import type { CoverCandidate } from '../../../services/collectionBundle/collectionCover';
import { baseName, parentPath } from '../../../utils/pathUtils';
import { useWorldMapCandidates } from './useWorldMapCandidates';
import { t } from '../../../i18n';

interface WorldMapFieldProps {
  app: App;
  collectionId: string;
  /** Vault path of the chosen image; undefined for none. */
  value: string | undefined;
  onChange: (path: string | undefined) => void;
}

/** Placeholder cards shown while the collection's artwork is read. */
const SKELETON_CARDS = 3;

interface ChosenMapProps {
  path: string;
  /** The map or scene the image is the artwork of, where the collection still has one. */
  candidate: CoverCandidate | undefined;
  missing: boolean;
  onClear: () => void;
}

function chosenThumb(candidate: CoverCandidate | undefined, missing: boolean): React.ReactElement {
  if (missing) return <ImageOff aria-hidden="true" />;
  if (candidate) return <RevealImage src={candidate.previewUrl} alt="" />;
  return <ImageIcon aria-hidden="true" />;
}

/** The chosen image as a small card: its picture, its name and where it lies, and a button that takes the choice back. */
function ChosenMap({ path, candidate, missing, onClear }: ChosenMapProps): React.ReactElement {
  return (
    <div className={`atlas-csm-world-map__chosen${missing ? ' atlas-csm-world-map__chosen--missing' : ''}`}>
      <span className="atlas-csm-world-map__thumb">{chosenThumb(candidate, missing)}</span>
      <span className="atlas-csm-world-map__text">
        <span className="atlas-csm-world-map__name">{candidate?.name ?? baseName(path)}</span>
        <span className="atlas-csm-world-map__place">
          {missing ? t('csm.worldMap.missing') : parentPath(path) || t('csm.loot.vaultRoot')}
        </span>
      </span>
      <LabelTooltip label={t('csm.worldMap.clear')}>
        <Button variant="ghost" size="icon" className="atlas-csm-world-map__clear" onClick={onClear}>
          <X />
        </Button>
      </LabelTooltip>
    </div>
  );
}

interface MapChoicesProps {
  candidates: readonly CoverCandidate[];
  loading: boolean;
  /** Vault path of the chosen image, ticked among the choices. */
  value: string | undefined;
  labelledBy: string;
  onChoose: (path: string) => void;
}

/** The picker: the collection's artwork as cards, placeholders while it is read, a sentence where there is none. */
function MapChoices({ candidates, loading, value, labelledBy, onChoose }: MapChoicesProps): React.ReactElement {
  if (loading) {
    return (
      <SkeletonGroup className="atlas-csm-world-map__choices" label={t('csm.worldMap.loading')}>
        {Array.from({ length: SKELETON_CARDS }, (_, index) => <Skeleton key={index} className="atlas-csm-world-map__placeholder" />)}
      </SkeletonGroup>
    );
  }
  if (candidates.length === 0) return <div className="atlas-csm-empty">{t('csm.worldMap.none')}</div>;
  return (
    <div className="atlas-csm-world-map__choices" role="radiogroup" aria-labelledby={labelledBy}>
      {candidates.map((candidate) => (
        <CoverCard
          key={candidate.sourcePath}
          label={candidate.name}
          tooltipSide="top"
          selected={candidate.sourcePath === value}
          onSelect={() => onChoose(candidate.sourcePath)}
        >
          <RevealImage src={candidate.previewUrl} alt="" lazy />
        </CoverCard>
      ))}
    </div>
  );
}

export function WorldMapField({ app, collectionId, value, onChange }: WorldMapFieldProps): React.ReactElement {
  const { candidates, loading } = useWorldMapCandidates(app, collectionId);
  const [picking, setPicking] = useState(false);
  const titleId = useId();

  const choose = (path: string): void => {
    onChange(path);
    setPicking(false);
  };

  return (
    <section className="atlas-csm-field atlas-csm-world-map" aria-labelledby={titleId}>
      <span id={titleId} className="atlas-csm-label">{t('csm.worldMap.title')}</span>
      <p className="atlas-csm-hint">{t('csm.worldMap.hint')}</p>

      {value !== undefined && (
        <ChosenMap
          path={value}
          candidate={candidates.find((candidate) => candidate.sourcePath === value)}
          missing={!(app.vault.getAbstractFileByPath(value) instanceof TFile)}
          onClear={() => onChange(undefined)}
        />
      )}

      {picking && (
        <MapChoices candidates={candidates} loading={loading} value={value} labelledBy={titleId} onChoose={choose} />
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPicking(!picking)}>
        {picking ? t('common.cancel') : t(value === undefined ? 'csm.worldMap.choose' : 'csm.worldMap.change')}
      </Button>
    </section>
  );
}
