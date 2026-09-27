import React from 'react';
import { baseName } from '../../../utils/pathUtils';

interface LootInlineTextProps {
  text: string;
  /** Opens a `[[wikilink]]` in the value; without it links show as plain text. */
  onOpenLink?: (link: string) => void;
}

const TOKEN = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function renderToken(token: string, key: number, onOpenLink?: (link: string) => void): React.ReactNode {
  if (token.startsWith('**')) return <strong key={key}>{token.slice(2, -2)}</strong>;
  if (token.startsWith('[[')) {
    const [target = '', alias] = token.slice(2, -2).split('|');
    const label = alias ?? baseName(target.split('#')[0] ?? target);
    if (!onOpenLink) return <span key={key}>{label}</span>;
    return (
      <a key={key} className="atlas-loot-inline-link" onClick={(event) => { event.preventDefault(); onOpenLink(target); }}>
        {label}
      </a>
    );
  }
  return <em key={key}>{token.slice(1, -1)}</em>;
}

/** A property value's inline Markdown: bold, italics and wikilinks. */
export function LootInlineText({ text, onOpenLink }: LootInlineTextProps): React.ReactElement {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, index) => (index % 2 === 1 ? renderToken(part, index, onOpenLink) : part))}
    </>
  );
}
