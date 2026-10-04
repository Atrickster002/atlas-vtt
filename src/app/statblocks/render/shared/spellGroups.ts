/**
 * Spell lists in Fantasy Statblocks' shape: a list of header lines
 * ("Innate spellcasting:") and spell lines, each spell line plain text or
 * `{ <level>: <spells> }`.
 */

export interface SpellLine {
  /** "1st level (4 slots)"; absent for a spell line written as plain text. */
  level?: string;
  spells: string;
}

export interface SpellGroup {
  header: string;
  spells: SpellLine[];
}

function ensureColon(header: string): string {
  return /[^a-zA-Z0-9]$/.test(header) ? header : `${header}:`;
}

function isHeaderLine(entry: unknown): entry is string {
  return typeof entry === 'string' && (entry.trim().endsWith(':') || !entry.includes(':'));
}

function spellLine(entry: unknown, textOf: (value: unknown) => string): SpellLine {
  if (typeof entry === 'string') return { spells: entry };
  const record = entry !== null && typeof entry === 'object' ? entry as Record<string, unknown> : {};
  const [level] = Object.keys(record);
  const spells = textOf(Object.values(record)[0]);
  return level === undefined ? { spells } : { level, spells };
}

/**
 * The entries grouped under their header lines. Spell lines before the first
 * header go under `defaultHeader` ("Wolf knows the following spells:").
 * `textOf` writes a value as text the way the renderer does.
 */
export function spellGroups(
  entries: readonly unknown[],
  defaultHeader: string,
  textOf: (value: unknown) => string,
): SpellGroup[] {
  const groups: SpellGroup[] = [];
  for (const entry of entries) {
    if (isHeaderLine(entry)) {
      groups.push({ header: ensureColon(entry), spells: [] });
      continue;
    }
    if (!groups.length) groups.push({ header: defaultHeader, spells: [] });
    groups[groups.length - 1]?.spells.push(spellLine(entry, textOf));
  }
  return groups;
}
