import { describe, expect, it } from 'vitest';
import {
  keywordLookup, matchingKeywords, nextHighlight, parseQuery, queryContextAt, quoteValue, type QueryKeyword,
} from '../../src/app/search/querySyntax';

const KEYWORDS: QueryKeyword[] = [
  { prefix: 'type', aliases: ['t'], description: 'Type', numeric: false },
  { prefix: 'cr', aliases: ['challenge'], description: 'Challenge rating', numeric: true, accepts: (value) => /\d/.test(value) },
  { prefix: 'source', aliases: ['src'], description: 'Source', numeric: false, negatable: true },
];
const lookup = keywordLookup(KEYWORDS);

describe('parseQuery', () => {
  it('takes filter tokens out of the text and keeps the plain words', () => {
    const { tokens, leftover } = parseQuery('red t:dragon  cr>=5 adult', lookup);
    expect(tokens.map((token) => [token.keyword.prefix, token.op, token.value])).toEqual([['type', '=', 'dragon'], ['cr', '>=', '5']]);
    expect(leftover).toBe('red adult');
  });

  it('reads quoted values with spaces, also unfinished ones', () => {
    expect(parseQuery('source:"Monster Manual" goblin', lookup).tokens[0]?.value).toBe('Monster Manual');
    expect(parseQuery('src:"Tome of', lookup).tokens[0]?.value).toBe('Tome of');
  });

  it('keeps unfinished keywords apart from the plain words', () => {
    const { tokens, leftover } = parseQuery('note:x type>beast cr:abc type: T:Beast', lookup);
    expect(tokens.map((token) => token.value)).toEqual(['Beast']);
    expect(leftover).toBe('note:x');
    expect(parseQuery('note:x type>beast cr:abc type: T:Beast', lookup).incomplete).toEqual(['type>beast', 'cr:abc', 'type:']);
  });
});

describe('negation', () => {
  it('excludes with a leading minus or != where the keyword allows it', () => {
    const { tokens, incomplete } = parseQuery('-src:MM source!=VGM -type:beast cr!=5 -source!=x', lookup);
    expect(tokens.map((token) => [token.keyword.prefix, token.value, token.negated])).toEqual([['source', 'MM', true], ['source', 'VGM', true]]);
    expect(incomplete).toEqual(['-type:beast', 'cr!=5', '-source!=x']);
  });

  it('knows a negated value is being typed', () => {
    expect(queryContextAt('-src:M', 6, lookup)).toMatchObject({ kind: 'value', negated: true, fragment: 'M', valueStart: 5 });
  });
});

describe('queryContextAt', () => {
  it('knows when a keyword is being typed and when its value', () => {
    expect(queryContextAt('goblin ty', 9, lookup)).toMatchObject({ kind: 'prefix', fragment: 'ty', start: 7, end: 9 });
    expect(queryContextAt('goblin t:dra', 12, lookup)).toMatchObject({ kind: 'value', fragment: 'dra', valueStart: 9 });
    expect(queryContextAt('cr>=', 4, lookup)).toMatchObject({ kind: 'value', op: '>=', fragment: '' });
    expect(queryContextAt('src:"Mon', 8, lookup)).toMatchObject({ kind: 'value', fragment: 'Mon' });
    expect(queryContextAt('', 0, lookup)).toMatchObject({ kind: 'prefix', fragment: '' });
  });
});

describe('suggestion helpers', () => {
  it('matches keywords by prefix or alias, in their order', () => {
    expect(matchingKeywords(KEYWORDS, 'c').map((keyword) => keyword.prefix)).toEqual(['cr']);
    expect(matchingKeywords(KEYWORDS, 's').map((keyword) => keyword.prefix)).toEqual(['source']);
    expect(matchingKeywords(KEYWORDS, '')).toHaveLength(3);
  });

  it('quotes values with spaces', () => {
    expect(quoteValue('Monster Manual')).toBe('"Monster Manual"');
    expect(quoteValue('beast')).toBe('beast');
  });

  it('wraps the highlight and opens on the first row', () => {
    expect(nextHighlight(2, 3, 'ArrowDown', true)).toBe(0);
    expect(nextHighlight(0, 3, 'ArrowUp', true)).toBe(2);
    expect(nextHighlight(2, 3, 'ArrowDown', false)).toBe(0);
    expect(nextHighlight(0, 0, 'ArrowDown', true)).toBe(0);
  });
});
