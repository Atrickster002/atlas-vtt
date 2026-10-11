import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import type { CoverCandidate } from '../../../services/collectionBundle/collectionCover';
import { worldMapCandidates } from '../../../services/worldMap';

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
