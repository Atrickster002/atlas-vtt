import { useEffect, useState } from 'react';
import { PlayerLootDisplay } from '../../../services/PlayerLootDisplay';

/** Ids of the loot the players see in their loot window, kept up to date. */
export function usePlayerLootIds(): ReadonlySet<string> {
  const [shown, setShown] = useState(() => PlayerLootDisplay.get().shownIds());
  useEffect(() => PlayerLootDisplay.get().subscribe(setShown), []);
  return shown;
}
