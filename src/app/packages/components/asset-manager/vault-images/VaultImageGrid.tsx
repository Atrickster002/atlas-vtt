import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TFile } from 'obsidian';
import { ImageOff } from 'lucide-react';
import { RevealImage } from '../../primitives/RevealImage';
import { Skeleton } from '../../primitives/Skeleton';
import { useGridMetrics } from '../components/useGridMetrics';
import type { VaultImageThumbnails } from './vaultImageThumbnails';
import { t } from '../../../../i18n';

/** Name row, paddings and inner gap below the square artwork, until a row has been measured. */
const CARD_EXTRA_HEIGHT = 44;
const OVERSCAN_ROWS = 2;

/** A card's thumbnail, made once the card is mounted; its well breathes meanwhile. */
function Thumbnail({ file, thumbnails }: { file: TFile; thumbnails: VaultImageThumbnails }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setUrl(undefined);
    void thumbnails.load(file).then((made) => { if (current) setUrl(made); });
    return () => { current = false; };
  }, [file, thumbnails]);
  if (url === undefined) return <Skeleton className="atlas-asset-card-art-skeleton" live />;
  return url
    ? <RevealImage src={url} alt="" className="atlas-vault-images__thumbnail" />
    : <div className="atlas-asset-placeholder-icon"><ImageOff /></div>;
}

interface VaultImageGridProps {
  files: readonly TFile[];
  thumbnails: VaultImageThumbnails;
  selected: ReadonlySet<string>;
  /** Images already added to the creator. */
  queued: ReadonlySet<string>;
  disabled: boolean;
  /** The element that scrolls the grid, passed as state since an ancestor's ref is set only after this grid's layout effects. */
  scrollElement: HTMLElement | null;
  onToggle: (path: string) => void;
}

/**
 * The vault's images as cards in the asset manager's look. Only the rows in and
 * around the view are mounted, so only their thumbnails are made.
 */
export function VaultImageGrid({ files, thumbnails, selected, queued, disabled, scrollElement, onToggle }: VaultImageGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, gap, cardWidth } = useGridMetrics(containerRef);
  const virtualizer = useVirtualizer({
    count: Math.ceil(files.length / columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => cardWidth + CARD_EXTRA_HEIGHT,
    overscan: OVERSCAN_ROWS,
    gap,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  // Rows change height with the cards' width: drop the sizes measured before.
  useEffect(() => { virtualizer.measure(); }, [cardWidth, columns, virtualizer]);

  return (
    <div ref={containerRef} className="atlas-vault-images__grid" aria-label={t('vaultImages.list')} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(({ index, start }) => (
        <div
          key={index}
          ref={virtualizer.measureElement}
          data-index={index}
          className="atlas-vault-images__row"
          style={{ transform: `translateY(${start - virtualizer.options.scrollMargin}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {files.slice(index * columns, (index + 1) * columns).map((file) => {
            const isQueued = queued.has(file.path);
            const isSelected = selected.has(file.path) || isQueued;
            return (
              <label key={file.path} className={`atlas-asset-card atlas-vault-images__card ${isSelected ? 'atlas-selected' : ''}`} data-queued={isQueued || undefined}>
                <div className="atlas-asset-card-thumb">
                  <Thumbnail file={file} thumbnails={thumbnails} />
                  <div className="atlas-asset-card-checkbox">
                    <input type="checkbox" aria-label={t('vaultImages.select', { name: file.basename })} checked={isSelected} disabled={disabled || isQueued} onChange={() => onToggle(file.path)} />
                  </div>
                  {isQueued && <span className="atlas-vault-images__added">{t('vaultImages.added')}</span>}
                </div>
                <span className="atlas-asset-card-name">{file.basename}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
