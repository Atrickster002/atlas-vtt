import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TFile, type App } from 'obsidian';
import {
  findCreatureForNotePath,
  getFantasyStatblocksApi,
  layoutForCreature,
  resolveCreatureFromFence,
  resolveLayout,
  type FantasyStatblocksCreature,
} from '../../services/FantasyStatblocksService';
import { frontmatterOfText, statblockSourceFromText, statblockSourceOf } from '../../statblocks/notes/statblockSource';
import { frontmatterCreature } from '../../creatures/linkedCreature';
import { syncStatblockVitals, type TokenVitals } from '../../services/statblockVitalsSync';
import { StatblockRenderer } from './statblock/StatblockRenderer';
import { useStatblockDiceRolling } from '../../statblocks/render/shared/useStatblockDiceRolling';
import { useTokenPortrait } from '../../statblocks/render/shared/tokenPortrait';
import { StatblockTokenResources, type StatblockTokenActions } from './statblock/StatblockTokenResources';
import { useBestiaryRevision } from '../hooks/useBestiaryRevision';
import { StatblockSkeleton } from './statblock/StatblockSkeleton';

interface FantasyStatblockProps {
  /** Vault path of the note backing the Fantasy Statblocks creature */
  notePath: string;
  /** The note's text when it is not in the vault, e.g. inside a collection being imported; `notePath` then names it. */
  noteContent?: string | undefined;
  /** Obsidian app — used for markdown, images and click-to-roll dice */
  app: App;
  /** Tokens whose resources drive the statblock's vitals — one block per token */
  tokens?: TokenVitals[];
  className?: string;
  tokenActions?: StatblockTokenActions;
}

/** Signature of the values mirrored into the statblock, for change detection. */
function vitalsKey(tokens: TokenVitals[]): string {
  return JSON.stringify(tokens.map((t) => [t.name, t.resources]));
}

/**
 * Renders a Fantasy Statblocks creature with Atlas' own statblock components.
 */
export function FantasyStatblock({
  notePath,
  noteContent,
  app,
  tokens = [],
  className,
  tokenActions,
}: FantasyStatblockProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const tokensRef = useRef<TokenVitals[]>(tokens);
  tokensRef.current = tokens;

  const key = useMemo(() => vitalsKey(tokens), [tokens]);

  // Edits made here (and elsewhere in the vault) show up without a manual refresh.
  const revision = useBestiaryRevision(app);

  // A note outside the vault is read from its own text; the bestiary knows only vault notes.
  const bestiaryCreature = useMemo(
    () => (noteContent === undefined ? findCreatureForNotePath(notePath) : null),
    // `revision` is not read by the lookup; it re-runs it when the bestiary changes.
    [notePath, noteContent, revision],
  );

  // Notes that define their statblock in a ```statblock fence never enter the
  // bestiary, so resolve those from the fence itself.
  const [noteCreature, setNoteCreature] = useState<FantasyStatblocksCreature | null>(null);
  // The note whose own statblock has been looked for: until then "no creature" is not known yet.
  const [readNote, setReadNote] = useState<string | null>(null);

  useEffect(() => {
    if (bestiaryCreature) {
      setNoteCreature(null);
      return;
    }

    let cancelled = false;
    const readNoteCreature = async (): Promise<void> => {
      if (noteContent !== undefined) {
        const source = statblockSourceFromText(noteContent);
        const resolved = source?.kind === 'fs-fence'
          ? await resolveCreatureFromFence(app, source.params, notePath)
          : source ? frontmatterCreature(frontmatterOfText(noteContent) ?? {}, notePath) : null;
        if (!cancelled) setNoteCreature(resolved);
        return;
      }

      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;

      const source = await statblockSourceOf(app, file);
      if (cancelled || source?.kind !== 'fs-fence') return;

      const resolved = await resolveCreatureFromFence(app, source.params, notePath);
      if (!cancelled) setNoteCreature(resolved);
    };
    void readNoteCreature().finally(() => {
      if (!cancelled) setReadNote(notePath);
    });

    return () => {
      cancelled = true;
    };
  }, [app, notePath, noteContent, bestiaryCreature, revision]);

  const creature = bestiaryCreature ?? noteCreature;
  const layout = useMemo(
    () => (creature ? layoutForCreature(app, creature) : null),
    [app, creature],
  );

  const portrait = useTokenPortrait(app, tokens);

  // One block per token, matching the vitals sync. The token portrait replaces
  // the layout's own image block, so the artwork never shows twice.
  const monster = useMemo(
    () =>
      creature
        ? {
            ...creature,
            ...(tokens.length ? { qty: tokens.length } : {}),
            ...(portrait ? { image: undefined } : {}),
          }
        : null,
    [creature, tokens.length, portrait],
  );

  // Click-to-roll dice, applied to whatever the renderer produced.
  const diceRef = useStatblockDiceRolling({
    app,
    notePath,
    tokens,
    name: typeof monster?.name === 'string' ? monster.name : undefined,
  });
  const containerRef = useCallback((el: HTMLDivElement | null): (() => void) | undefined => {
    ref.current = el;
    return diceRef(el);
  }, [diceRef]);

  // Mirror the tokens' resources into any vitals track the layout renders.
  useEffect(() => {
    if (ref.current && !tokenActions) {
      syncStatblockVitals(ref.current, tokensRef.current);
    }
  }, [key, monster, tokenActions]);

  const api = getFantasyStatblocksApi();

  if (!api) {
    return (
      <div className="atlas-statblock-missing-hint">
        Install and enable the Fantasy Statblocks plugin to preview statblocks.
      </div>
    );
  }

  if (!monster || !layout) {
    // The bestiary is parsed asynchronously at startup, so an unresolved
    // bestiary means "not ready yet" rather than "no such creature"; so does
    // a note whose own statblock is still being read.
    if (!api.isResolved?.() || (!bestiaryCreature && readNote !== notePath)) {
      return <StatblockSkeleton className={className} />;
    }

    return (
      <div className="atlas-statblock-missing-hint">
        No Fantasy Statblocks creature found for this note. Note-based creatures require
        &quot;Parse Frontmatter for Creatures&quot; to be enabled in Fantasy Statblocks settings.
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`atlas-fantasy-statblock ${className ?? ''}`}>
      <StatblockRenderer
        monster={monster}
        layout={layout}
        resolveLayout={(id) => resolveLayout(app, id)}
        app={app}
        sourcePath={notePath}
        portrait={portrait}
        replaceVitals={Boolean(tokenActions)}
        footer={tokenActions && tokens.length > 0 ? (
          <StatblockTokenResources monster={monster} layout={layout} tokens={tokens} {...tokenActions} />
        ) : undefined}
      />
    </div>
  );
}

export default FantasyStatblock;
