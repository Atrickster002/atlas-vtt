import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TFile } from 'obsidian';
import { ImageOff } from 'lucide-react';
import { RevealImage } from '../../primitives/RevealImage';
import { Skeleton } from '../../primitives/Skeleton';
import type { VaultImageThumbnails } from './vaultImageThumbnails';
import { t } from '../../../../i18n';

/** A row's height until measured: the 48px thumbnail, its padding and the border between rows. */
const ROW_HEIGHT = 73;
const OVERSCAN_ROWS = 8;

/** A row's thumbnail, made once the row is mounted; a placeholder breathes meanwhile. */
function Thumbnail({ file, thumbnails }: { file: TFile; thumbnails: VaultImageThumbnails }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setUrl(undefined);
    void thumbnails.load(file).then((made) => { if (current) setUrl(made); });
    return () => { current = false; };
  }, [file, thumbnails]);
  if (url === undefined) return <Skeleton className="atlas-vault-images__pending" live />;
  return url ? <RevealImage src={url} alt="" className="atlas-vault-images__thumbnail" /> : <ImageOff size={20} />;
}

interface VaultImageListProps {
  files: readonly TFile[];
  thumbnails: VaultImageThumbnails;
  selected: ReadonlySet<string>;
  /** Images already added to the creator. */
  queued: ReadonlySet<string>;
  disabled: boolean;
  /** The element that scrolls the list, passed as state since an ancestor's ref is set only after this list's layout effects. */
  scrollElement: HTMLElement | null;
  onToggle: (path: string) => void;
}

/** The vault's images. Only the rows in and around the view are mounted, so only their thumbnails are made. */
export function VaultImageList({ files, thumbnails, selected, queued, disabled, scrollElement, onToggle }: VaultImageListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={listRef} className="atlas-statblock-import__list" aria-label={t('vaultImages.list')} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(({ index, start }) => {
        const file = files[index]!;
        const isQueued = queued.has(file.path);
        return (
          <label
            key={file.path}
            ref={virtualizer.measureElement}
            data-index={index}
            className="atlas-statblock-import__row"
            style={{ transform: `translateY(${start - virtualizer.options.scrollMargin}px)` }}
          >
            <input type="checkbox" aria-label={t('vaultImages.select', { name: file.basename })} checked={selected.has(file.path) || isQueued} disabled={disabled || isQueued} onChange={() => onToggle(file.path)} />
            <span className="atlas-statblock-import__portrait atlas-vault-images__frame"><Thumbnail file={file} thumbnails={thumbnails} /></span>
            <span className="atlas-statblock-import__identity"><strong>{file.basename}</strong><span>{file.path}</span></span>
            {isQueued && <span className="atlas-statblock-import__status">{t('vaultImages.added')}</span>}
          </label>
        );
      })}
    </div>
  );
}
