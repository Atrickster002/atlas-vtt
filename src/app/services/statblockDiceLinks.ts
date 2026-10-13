/**
 * Click-to-roll dice notation, routed through Atlas' own dice tool (toast, roll
 * log) or, without a map on screen, the surface the statblock is drawn on
 * (`statblockRolls.ts`).
 *
 * Two halves, deliberately separate:
 *
 * - `linkDiceIn` rewrites text nodes into clickable spans. It must ONLY be used
 *   on static DOM that Atlas produced and owns — the output of Obsidian's
 *   MarkdownRenderer and the DOM a layout's `javascript` block returns, both
 *   rebuilt wholesale on every render.
 *   Never point it at DOM owned by React or Svelte: those frameworks hold
 *   references to the text nodes it replaces, and throw on their next update.
 * - `attachDiceRolling` only listens for clicks, so it is safe on any container.
 *
 * A click rolls; Shift-click rolls with advantage and Alt-click (Option) with
 * disadvantage, both at once cancel. A right-click offers the three, the
 * advantage ones only where the dice set has a rule for them and the roll
 * holds its dice.
 */

import type { App } from 'obsidian';
import { rollStatblockDice, statblockRollingDice, type DiceRollSource, type OffMapRolls } from './statblockRolls';
import { advantageSide, advantageSidesFor } from '../tools/diceAdvantage';
import type { AdvantageSide } from '../types/diceSetTypes';
import { t } from '../i18n';

/**
 * One dice term: `2d8`, `d20`, with the exploding notation (`1d6!i`, `1d6!3`,
 * `1d6!!`) and keep marks (`4d6kh3`). A single `!` is left out: in running
 * text it ends a sentence far more often than it means a die that explodes once.
 */
const DIE = String.raw`\d*d\d+(?:!!?(?:\d+|i(?![a-z]))|!!)?(?:k[hl]\d*(?![a-z]))?`;

/** A further signed term: a die or a constant after `+`, `-`, a minus sign or an en dash, or after "+ -" (the 5e SRD's "3d6 + -1"). */
const NEXT_TERM = String.raw`\s*(?:\+\s*-|[+\-−–])\s*(?:${DIE}|\d+)`;

/**
 * Dice expressions (`2d8+3`, `2d6 - 1d4`) plus bare bonuses (`+4`, `−1`,
 * `ATK: +4`). Neither starts inside a word or a number ("x2d6" is no die);
 * brackets are punctuation, so "(2d6 + 3)" links "2d6 + 3". A bare sign must
 * sit directly on its digits and must not open a dice term, so the dash in
 * "Very Close - 1d12+2" is punctuation rather than a -1 roll.
 */
const DICE_PATTERN = new RegExp(
  String.raw`((?<!\w)${DIE}(?:${NEXT_TERM})*|(?:ATK|Attack)\s*:\s*[+-]\d+|(?<!\w)[+\-−]\d+(?!\s*d\d))`,
  'gi',
);

const LINK_CLASS = 'atlas-dice-link';

/** Set by the statblock renderer on the line that holds a creature's hit points. */
const HIT_POINTS_SELECTOR = '[data-hit-points]';

/** Elements whose text must never be rewritten. */
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'BUTTON']);

/** Receives clicks on hit dice, in place of the ordinary roll. */
export type HitPointsRollHandler = (formula: string, abilityName: string | undefined) => void;

/** One choice of a roll link's menu: a roll, with advantage, or with disadvantage (`side`). */
export interface RollChoice {
  label: string;
  side: AdvantageSide | null;
  roll: () => void;
}

/**
 * Opens a roll link's menu at a point in the link's document; `link` takes
 * focus back where the menu was opened from the keyboard.
 */
export type RollMenuOpener = (choices: readonly RollChoice[], at: { x: number; y: number }, link: HTMLElement) => void;

const SIDE_LABELS: Record<AdvantageSide, () => string> = {
  advantage: () => t('dice.rollWithAdvantage'),
  disadvantage: () => t('dice.rollWithDisadvantage'),
};

/**
 * Turns matched display text into a formula the dice tool understands. A bare
 * bonus stays bare: the dice tool adds it to the collection's default roll.
 */
export function toRollFormula(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/^(?:ATK|Attack):/i, '')
    .replace(/[−–]/g, '-')
    .replace(/\+-/g, '-');
}

/** Nearest heading-ish label above the roll, used to title the dice toast. */
function abilityNameFor(node: Node): string | undefined {
  // A table cell holds no label of its own: its column names the roll
  const column = node.parentElement?.closest<HTMLElement>('[data-roll-name]')?.dataset.rollName;
  if (column) return column;

  const el = node.parentElement?.closest<HTMLElement>(
    '.atlas-sb-trait, .atlas-sb-property, .atlas-sb-labelled, li, p, tr',
  );
  const name = el?.querySelector<HTMLElement>(
    '.atlas-sb-trait-name, .atlas-sb-property-name, .atlas-sb-label, strong, em, b, i',
  )?.textContent;
  return name?.trim().replace(/[:.]$/, '') || undefined;
}

function isSkipped(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest(`.${LINK_CLASS}`)) return true;
  return SKIPPED_TAGS.has(parent.tagName);
}

function linkTextNode(textNode: Text): void {
  const text = textNode.nodeValue ?? '';
  DICE_PATTERN.lastIndex = 0;
  if (!DICE_PATTERN.test(text)) return;

  DICE_PATTERN.lastIndex = 0;
  const fragment = createFragment();
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = DICE_PATTERN.exec(text)) !== null) {
    const [matched] = match;
    if (match.index > cursor) {
      fragment.append(text.slice(cursor, match.index));
    }

    const link = createSpan();
    link.className = LINK_CLASS;
    link.textContent = matched;
    link.dataset.formula = toRollFormula(matched);
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.setAttribute('aria-label', t('dice.rollFormula', { formula: link.dataset.formula ?? '' }));
    fragment.append(link);

    cursor = match.index + matched.length;
  }

  if (cursor < text.length) {
    fragment.append(text.slice(cursor));
  }
  textNode.replaceWith(fragment);
}

/**
 * Wraps dice notation in `root` with clickable spans.
 * Only safe on static, Atlas-owned DOM — see the note at the top of this file.
 */
export function linkDiceIn(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });

  const targets: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    targets.push(current as Text);
    current = walker.nextNode();
  }

  targets.forEach((textNode) => linkTextNode(textNode));
}

/**
 * Wires click-to-roll into a container. Listens only — the dice spans
 * themselves are produced by the renderer (or by `linkDiceIn` on static DOM),
 * so this never mutates the container. Returns a disposer.
 *
 * Dice on the hit-points line go to `onRollHitPoints` when one is given, and
 * roll without advantage. `offMap` is read at each roll: where it shows rolls
 * no map on screen shows. `openMenu` shows a roll link's right-click menu.
 */
export function attachDiceRolling(
  el: HTMLElement,
  app: App,
  getSource: () => DiceRollSource,
  onRollHitPoints?: HitPointsRollHandler,
  offMap?: () => OffMapRolls | null,
  openMenu?: RollMenuOpener,
): () => void {
  const hitDice = (link: HTMLElement, formula: string): boolean =>
    onRollHitPoints !== undefined && /d\d/i.test(formula) && link.closest(HIT_POINTS_SELECTOR) !== null;

  const roll = (link: HTMLElement, side: AdvantageSide | null): void => {
    const formula = link.dataset.formula;
    if (!formula) return;

    const abilityName = abilityNameFor(link);
    if (hitDice(link, formula)) {
      onRollHitPoints?.(formula, abilityName);
      return;
    }

    rollStatblockDice(app, formula, { ...getSource(), abilityName }, offMap?.(), side);
  };

  const linkOf = (event: Event): HTMLElement | null =>
    (event.target as HTMLElement | null)?.closest<HTMLElement>(`.${LINK_CLASS}`) ?? null;

  const onClick = (event: MouseEvent): void => {
    const link = linkOf(event);
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    roll(link, advantageSide(event.shiftKey, event.altKey));
  };

  // Enter and Space roll a focused die; the editing around it never sees the key.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const link = linkOf(event);
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    roll(link, advantageSide(event.shiftKey, event.altKey));
  };

  const onContextMenu = (event: MouseEvent): void => {
    const link = linkOf(event);
    const formula = link?.dataset.formula;
    if (!openMenu || !link || !formula || hitDice(link, formula)) return;
    event.preventDefault();
    event.stopPropagation();
    const rules = statblockRollingDice(app, getSource(), offMap?.());
    const sides = rules ? advantageSidesFor(formula, rules) : [];
    const choices: RollChoice[] = [
      { label: t('dice.roll'), side: null, roll: () => roll(link, null) },
      ...sides.map((side): RollChoice => ({ label: SIDE_LABELS[side](), side, roll: () => roll(link, side) })),
    ];
    // A menu key or Shift+F10 is no right button: the menu hangs from the link.
    const box = link.getBoundingClientRect();
    openMenu(choices, event.button === 2 ? { x: event.clientX, y: event.clientY } : { x: box.left, y: box.bottom }, link);
  };

  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('contextmenu', onContextMenu);

  return () => {
    el.removeEventListener('click', onClick);
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('contextmenu', onContextMenu);
  };
}

/** Shared attributes for a clickable dice span, used by DOM and React paths. */
export function diceLinkProps(matched: string): {
  className: string;
  'data-formula': string;
  role: string;
  tabIndex: number;
  'aria-label': string;
} {
  const formula = toRollFormula(matched);
  return {
    className: LINK_CLASS,
    'data-formula': formula,
    role: 'button',
    tabIndex: 0,
    'aria-label': t('dice.rollFormula', { formula }),
  };
}

/** Splits text into plain and dice segments, for renderers that build their own nodes. */
export function splitDiceSegments(text: string): Array<{ text: string; dice: boolean }> {
  const segments: Array<{ text: string; dice: boolean }> = [];
  DICE_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = DICE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), dice: false });
    }
    segments.push({ text: match[0], dice: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), dice: false });
  }
  return segments;
}
