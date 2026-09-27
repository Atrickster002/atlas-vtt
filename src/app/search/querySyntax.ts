/**
 * Filter syntax for search fields: `prefix:value` tokens (`type:beast`,
 * `cr>=2`, `source:"Monster Manual"`) among plain words. Keywords are supplied
 * by the caller, so any list can offer its own. Plain words stay a text search.
 */

export type QueryOperator = '=' | '<' | '<=' | '>' | '>=';

export interface QueryKeyword {
  /** What users type before the operator, lowercase. */
  prefix: string;
  aliases: readonly string[];
  /** Shown beside the keyword in suggestions. */
  description: string;
  /** Numeric keywords also take `<`, `<=`, `>` and `>=`; others only `:` or `=`. */
  numeric: boolean;
  /** Rejects values the keyword cannot use, which then stay plain words. */
  accepts?: (value: string) => boolean;
}

export interface QueryToken<K extends QueryKeyword> {
  keyword: K;
  op: QueryOperator;
  value: string;
  /** Position of the token in the text, end exclusive. */
  start: number;
  end: number;
}

export interface ParsedQuery<K extends QueryKeyword> {
  tokens: QueryToken<K>[];
  /** The plain words, joined by single spaces. */
  leftover: string;
  /** Keywords typed without a usable value yet (`cr:`, `cr:abc`), as typed. */
  incomplete: string[];
}

/** What the word at the cursor is: a keyword being typed, or the value of one. */
export type QueryContext<K extends QueryKeyword> =
  | { kind: 'prefix'; fragment: string; start: number; end: number }
  | { kind: 'value'; keyword: K; op: QueryOperator; fragment: string; start: number; end: number; valueStart: number };

const OPERATORS: Readonly<Record<string, QueryOperator>> = { ':': '=', '=': '=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const TOKEN_HEAD = /^([a-z][a-z0-9_-]*)([:=<>]+)/i;
const WHITESPACE = /\s/;

/** Every keyword by its prefix and aliases, lowercase. */
export function keywordLookup<K extends QueryKeyword>(keywords: readonly K[]): ReadonlyMap<string, K> {
  const lookup = new Map<string, K>();
  for (const keyword of keywords) {
    for (const name of [keyword.prefix, ...keyword.aliases]) {
      if (!lookup.has(name)) lookup.set(name, keyword);
    }
  }
  return lookup;
}

function operatorFor(keyword: QueryKeyword, raw: string): QueryOperator | null {
  const op = OPERATORS[raw];
  if (!op) return null;
  return keyword.numeric || op === '=' ? op : null;
}

/** The token starting at `start`, or null when the word there is a plain word. */
function tokenAt<K extends QueryKeyword>(text: string, start: number, lookup: ReadonlyMap<string, K>): QueryToken<K> | null {
  const head = TOKEN_HEAD.exec(text.slice(start));
  if (!head) return null;
  const keyword = lookup.get(head[1]!.toLowerCase());
  const op = keyword ? operatorFor(keyword, head[2]!) : null;
  if (!keyword || !op) return null;

  const valueStart = start + head[0].length;
  let value: string;
  let end: number;
  if (text[valueStart] === '"') {
    const close = text.indexOf('"', valueStart + 1);
    end = close < 0 ? text.length : close + 1;
    value = text.slice(valueStart + 1, close < 0 ? text.length : close);
  } else {
    end = valueStart;
    while (end < text.length && !WHITESPACE.test(text[end]!)) end++;
    value = text.slice(valueStart, end);
  }
  value = value.trim();
  if (!value || (keyword.accepts && !keyword.accepts(value))) return null;
  return { keyword, op, value, start, end };
}

/** Splits `text` into filter tokens and the plain words around them. */
export function parseQuery<K extends QueryKeyword>(text: string, lookup: ReadonlyMap<string, K>): ParsedQuery<K> {
  const tokens: QueryToken<K>[] = [];
  const words: string[] = [];
  const incomplete: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (WHITESPACE.test(text[i]!)) { i++; continue; }
    const token = tokenAt(text, i, lookup);
    if (token) {
      tokens.push(token);
      i = token.end;
      continue;
    }
    const start = i;
    while (i < text.length && !WHITESPACE.test(text[i]!)) i++;
    const word = text.slice(start, i);
    const head = TOKEN_HEAD.exec(word);
    (head && lookup.has(head[1]!.toLowerCase()) ? incomplete : words).push(word);
  }
  return { tokens, leftover: words.join(' '), incomplete };
}

/** What the word around `cursor` is being typed as. */
export function queryContextAt<K extends QueryKeyword>(text: string, cursor: number, lookup: ReadonlyMap<string, K>): QueryContext<K> {
  let start = cursor;
  while (start > 0 && !WHITESPACE.test(text[start - 1]!)) start--;
  let end = cursor;
  while (end < text.length && !WHITESPACE.test(text[end]!)) end++;
  const word = text.slice(start, end);

  const head = TOKEN_HEAD.exec(word);
  const keyword = head ? lookup.get(head[1]!.toLowerCase()) : undefined;
  const op = head && keyword ? operatorFor(keyword, head[2]!) : null;
  if (head && keyword && op) {
    const valueStart = start + head[0].length;
    return { kind: 'value', keyword, op, fragment: word.slice(head[0].length).replace(/^"/, ''), start, end, valueStart };
  }
  return { kind: 'prefix', fragment: word, start, end };
}

/** Keywords whose prefix or an alias starts with `fragment`, in their given order. */
export function matchingKeywords<K extends QueryKeyword>(keywords: readonly K[], fragment: string): K[] {
  const query = fragment.toLowerCase();
  if (!query) return [...keywords];
  return keywords.filter((keyword) => [keyword.prefix, ...keyword.aliases].some((name) => name.startsWith(query)));
}

/** A value as it must be typed: quoted when it holds spaces. */
export function quoteValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * The next highlighted suggestion for an arrow key, wrapping at both ends. A
 * closed list opens on its first row, so ArrowDown always shows the options.
 */
export function nextHighlight(index: number, count: number, key: 'ArrowDown' | 'ArrowUp', isOpen: boolean): number {
  if (count <= 0 || !isOpen) return 0;
  return (index + (key === 'ArrowDown' ? 1 : count - 1)) % count;
}
