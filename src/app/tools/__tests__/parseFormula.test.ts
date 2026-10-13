import { describe, expect, it } from 'vitest';
import { parseFormula } from '../parseFormula';

describe('parseFormula', () => {
  it.each(['d20', '+3', '-2D6 + 9999', '0d2', '100d1000', '50d6+50d8', 'd6!!i', 'd6!99', 'd6!0', ' \td20\t ', Array(10).fill('1').join('+'), `d20${' '.repeat(61)}`])('accepts bounded formula %j', (formula) => {
    expect(parseFormula(formula).ok).toBe(true);
  });

  it.each(['', ' ', 'hello d20', 'd20 hello', 'd20+garbage+d6', 'd20 d6', 'd20++2', 'd20-', 'd20\n', 'd20\r', 'd20\u00a0', '1.5d6', 'd6!!!', 'd6!100', 'd6!I', '10000', '00001', '0001d6', 'd00006', 'd20*2', '(d20)', 'Infinity'])('rejects malformed formula %j', (formula) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code: 'syntax' });
  });

  it.each([
    [`d20${' '.repeat(62)}`, 'length'],
    [Array(11).fill('1').join('+'), 'terms'],
    ['101d6', 'dice'],
    ['50d6-51d8', 'dice'],
    ['d1001', 'faces'],
    ['d1+2', 'faces'],
    ['d0', 'faces'],
  ])('rejects cap violation %j', (formula, code) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code });
  });

  it.each([
    ['2d20kh1', { count: 2, faces: 20, keep: { count: 1, highest: true } }],
    ['2d20kh', { count: 2, faces: 20, keep: { count: 1, highest: true } }],
    ['4d6kl3', { count: 4, faces: 6, keep: { count: 3, highest: false } }],
    ['3D6KH2', { count: 3, faces: 6, keep: { count: 2, highest: true } }],
    ['2d6!kh1', { count: 2, faces: 6, explosions: 1, keep: { count: 1, highest: true } }],
  ])('reads keep notation %j', (formula, term) => {
    const parsed = parseFormula(formula);
    expect(parsed.ok && parsed.terms[0]).toMatchObject({ kind: 'dice', ...term });
  });

  it.each(['2d20k1', '2d20kx1', '2d20kh1kh1', 'kh1', '2d20 kh1', '2d20kh1000'])('rejects malformed keep notation %j', (formula) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code: 'syntax' });
  });

  it.each(['2d20kh3', '2d20kh0', '0d20kl1'])('rejects keeping none or more dice than are rolled %j', (formula) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code: 'keep' });
  });

  it('counts kept and dropped dice against the dice limit', () => {
    expect(parseFormula('100d6kh1').ok).toBe(true);
    expect(parseFormula('101d6kh1')).toEqual({ ok: false, code: 'dice' });
  });
});
