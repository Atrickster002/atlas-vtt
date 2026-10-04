/**
 * What each folded group of the Settings panel says while it is closed
 * (spec §10.3): the settings in use, in plain words, so nobody has to open a
 * group to see whether a block hides, falls back or writes its value its own
 * way. Pure.
 */

import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../model/templateTypes';
import { FIELD_TYPE_LABELS, MEANING_LABELS } from '../editorGlyphs';

const TESTS: Readonly<Record<NonNullable<TemplateBlock['showWhen']>['is'], string>> = {
  present: 'has a value',
  absent: 'has no value',
  equal: 'is',
  'not-equal': 'is not',
  above: 'is above',
  below: 'is below',
};

function labelOf(template: StatblockTemplate, key: string): string {
  return template.fields.find((field) => field.key === key)?.label || key;
}

/** "Only when Legendary Actions has a value", "Hides when empty", "Shows text when empty". */
export function visibilitySummary(block: TemplateBlock, template: StatblockTemplate): string {
  const parts: string[] = [];
  const condition = block.showWhen;
  if (condition) {
    const value = 'value' in condition ? ` ${String(condition.value)}` : '';
    parts.push(`Only when ${labelOf(template, condition.field)} ${TESTS[condition.is]}${value}`);
  }
  parts.push(block.whenEmpty === 'fallback' ? 'Shows text when empty' : 'Hides when empty');
  return parts.join(' · ');
}

/** The pattern a block writes its value with, as typed; "As it is" without one. */
export function writeAsSummary(block: TemplateBlock): string {
  const pattern = 'pattern' in block && typeof block.pattern === 'string' ? block.pattern.trim() : '';
  const rolls = block.type === 'stat' && block.rollFrom ? ' · rolls dice' : '';
  return (pattern || 'As it is') + rolls;
}

/** "Number · Hit points": what the property holds, and what Atlas reads it as. */
export function propertySummary(field: TemplateField | undefined): string {
  if (!field) return 'None';
  const meaning = field.meaning ? ` · ${MEANING_LABELS[field.meaning]}` : '';
  return `${FIELD_TYPE_LABELS[field.type]}${meaning}`;
}

/** The theme class, or none. */
export function themesSummary(block: TemplateBlock): string {
  return block.className?.trim() || 'None';
}

/** Whether any setting past the basics is in use: the dot on the toolbar's Settings button (§4.2). */
export function moreOptionsInUse(block: TemplateBlock): boolean {
  return Boolean(block.showWhen || block.className || block.whenEmpty === 'fallback' || ('pattern' in block && block.pattern) || (block.type === 'stat' && block.rollFrom));
}

/** What Structure badges a block with (spec §10.7): the settings past the basics it uses, each a glyph and its words. */
export type SettingBadge = 'condition' | 'write-as' | 'fallback';

export function settingBadges(block: TemplateBlock): SettingBadge[] {
  const badges: SettingBadge[] = [];
  if (block.showWhen) badges.push('condition');
  if ('pattern' in block && typeof block.pattern === 'string' && block.pattern.trim()) badges.push('write-as');
  if (block.whenEmpty === 'fallback') badges.push('fallback');
  return badges;
}
