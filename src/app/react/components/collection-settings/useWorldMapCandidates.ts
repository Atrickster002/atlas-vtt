import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService, type Asset } from '../../../services/AssetService';
import { coverCandidates, type CoverCandidate } from '../../../services/collectionBundle/collectionCover';
import { sceneThumbnailPath } from '../../../services/collectionBundle/collectionReferences';

/**
 * The artwork of a collection's maps and scenes that can be its world map, each image once.
 * A scene without artwork offers none: its thumbnail is a small picture Atlas makes anew.
 */
export async function worldMapCandidates(app: App, assets: readonly Asset[]): Promise<CoverCandidate[]> {
  const thumbnails = new Set(assets.flatMap((asset) => (asset.type === 'scene' && asset.data?.mapPath ? [sceneThumbnailPath(asset.data.mapPath)] : [])));
  return (await coverCandidates(app, assets)).filter((candidate) => !thumbnails.has(candidate.sourcePath));
}

interface WorldMapCandidates {
  candidates: readonly CoverCandidate[];
  /** Still reading the collection's maps and scenes. */
  loading: boolean;
}

const NONE: readonly CoverCandidate[] = [];

/** The images a collection's world map can be chosen from, read once for the collection. */
export function useWorldMapCandidates(app: App, collectionId: string): WorldMapCandidates {
  const [loaded, setLoaded] = useState<{ collectionId: string; candidates: readonly CoverCandidate[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const show = (candidates: readonly CoverCandidate[]): void => {
      if (!cancelled) setLoaded({ collectionId, candidates });
    };
    AssetService.getInstance(app).getAssets(collectionId)
      .then((assets) => worldMapCandidates(app, assets))
      .then(show)
      .catch((error: unknown) => {
        console.error('[WorldMap] Failed to read the collection\'s artwork:', error);
        show(NONE);
      });
    return () => { cancelled = true; };
  }, [app, collectionId]);

  const current = loaded?.collectionId === collectionId ? loaded.candidates : null;
  return { candidates: current ?? NONE, loading: current === null };
}
