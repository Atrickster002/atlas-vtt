import React, { useId, useMemo, useRef, useState } from 'react';
import { ImageIcon, Sparkles, Unlink } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { DropdownToggleRow } from '../../../packages/components/primitives/DropdownToggleRow';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { TemplateField } from '../../model/templateTypes';
import type { PaneEditController } from '../statblock-pane/paneEditContext';
import { TokenChoiceGrid } from './TokenChoiceGrid';
import { artFile, artSrc, artToken, isTheArt, linkToken, makeToken, setArt, setRing, unlinkToken } from './tokenSocketActions';
import { useNoteTokens, type CardToken } from './useNoteTokens';
import { VaultImageModal } from './VaultImageModal';

export interface TokenLinkPanelProps {
  pane: PaneEditController;
  /** The Image block's field: the note's art. */
  field: TemplateField;
  collectionId: string | null;
  /** Closes the panel; `refocus` gives focus back to the socket. */
  onClose: (refocus: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * What the token socket opens: the tokens linked to the statblock, each
 * unlinkable and the one whose art the note shows marked; the collection's
 * tokens to link; and the note's art without a token (any vault image) or a
 * new token made of it.
 */
export function TokenLinkPanel({ pane, field, collectionId, onClose, searchRef }: TokenLinkPanelProps): React.JSX.Element {
  const { app } = pane;
  const tokens = useNoteTokens(app, pane.notePath, collectionId, true);
  const [busy, setBusy] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const linkedLabelId = useId();
  const art = artSrc(pane, field);
  const linkedIds = useMemo(() => new Set(tokens.linked.map((token) => token.id)), [tokens.linked]);
  const source = artFile(pane, field);
  const framed = artToken(pane, field);
  const canMake = tokens.loaded && tokens.linked.length === 0 && source !== null && collectionId !== null;

  /** Runs one action at a time; the panel says what it does meanwhile. */
  const run = (label: string, action: () => Promise<unknown>, after?: () => void): void => {
    if (busy) return;
    setBusy(label);
    void action()
      .catch((error: unknown) => console.error(`[Atlas] ${label} failed:`, error))
      .finally(() => {
        setBusy(null);
        after?.();
        // The control pressed may be gone ("Use its art" turns into the badge): focus stays in the panel.
        const panel = panelRef.current;
        panel?.win.requestAnimationFrame(() => {
          if (panel.isConnected && !panel.contains(panel.doc.activeElement)) panel.focus({ preventScroll: true });
        });
      });
  };

  const choose = (token: CardToken): void => run('Linking', async () => {
    if (await linkToken(pane, field, token)) pane.announce(`Linked ${token.name}.`);
  }, () => onClose(true));

  const unlink = (token: CardToken): void => run('Unlinking', async () => {
    if (await unlinkToken(app, token)) pane.announce(`Unlinked ${token.name}.`);
  });

  const showArtOf = (token: CardToken): void => run('Setting the art', async () => {
    if (token.imagePath) await setArt(pane, field, token.imagePath);
  });

  const chooseImage = (): void => {
    if (busy) return;
    onClose(false);
    new VaultImageModal(app, (file) => void setArt(pane, field, file.path)).open();
  };

  const toggleRing = (): void => {
    if (framed) run('Setting the ring', () => setRing(pane, framed, framed.showRing === false));
  };

  const create = (): void => {
    if (collectionId) run('Creating a token', () => makeToken(pane, collectionId));
  };

  return (
    <div ref={panelRef} className="atlas-sb-token-panel" role="dialog" aria-labelledby={titleId} aria-busy={busy !== null} tabIndex={-1}>
      <div className="atlas-sb-token-panel__header">
        <h3 id={titleId} className="atlas-sb-token-panel__title">Token art</h3>
        <CloseButton onClick={() => onClose(true)} />
      </div>
      <div className="atlas-sb-token-panel__body">
        {/* Kept when the art is no token's, so the panel keeps its shape. */}
        <DropdownToggleRow
          label="Ring"
          value={framed !== null && framed.showRing !== false}
          onChange={toggleRing}
          disabled={framed === null || busy !== null}
          disabledReason={framed ? undefined : art ? 'This art belongs to no token' : 'Add token art first'}
        />
        {tokens.linked.length > 0 && (
          <section className="atlas-sb-token-panel__section" aria-labelledby={linkedLabelId}>
            <h4 id={linkedLabelId} className="atlas-sb-token-panel__label">Linked</h4>
            <ul className="atlas-sb-token-panel__linked">
              {tokens.linked.map((token) => (
                <li key={token.id} className="atlas-sb-token-panel__row">
                  <TokenPortrait
                    className="atlas-sb-token-panel__portrait"
                    src={token.thumbnailUrl || token.imageUrl}
                    alt=""
                    showRing={token.showRing !== false}
                    pending={token.thumbnailPending}
                  />
                  <span className="atlas-sb-token-panel__name">{token.name}</span>
                  {isTheArt(app, token, art)
                    ? <span className="atlas-sb-token-panel__badge">Statblock image</span>
                    : <Button type="button" variant="ghost" size="sm" aria-disabled={busy !== null || undefined} onClick={() => showArtOf(token)}>Use its art</Button>}
                  <LabelTooltip label={`Unlink ${token.name}`}>
                    <Button type="button" variant="ghost" size="icon" className="atlas-sb-token-panel__unlink" aria-disabled={busy !== null || undefined} onClick={() => unlink(token)}>
                      <Unlink aria-hidden="true" />
                    </Button>
                  </LabelTooltip>
                </li>
              ))}
            </ul>
          </section>
        )}
        <TokenChoiceGrid
          tokens={tokens.choices}
          linkedIds={linkedIds}
          loaded={tokens.loaded}
          busy={busy !== null}
          onChoose={choose}
          searchRef={searchRef}
        />
      </div>
      <div className="atlas-sb-token-panel__footer">
        <Button type="button" variant="outline" size="sm" aria-disabled={busy !== null || undefined} onClick={chooseImage}>
          <ImageIcon aria-hidden="true" />
          Choose image…
        </Button>
        {canMake && (
          <Button type="button" variant="outline" size="sm" aria-disabled={busy !== null || undefined} onClick={create}>
            <Sparkles aria-hidden="true" />
            Create token from art
          </Button>
        )}
        {busy && <span className="atlas-sb-token-panel__status" role="status">{busy}…</span>}
      </div>
    </div>
  );
}
