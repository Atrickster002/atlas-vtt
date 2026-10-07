import React from 'react';
import type { Trait } from './statblockTypes';
import { runCallback } from './layoutCallbacks';
import { signed, slugify, stringify, toTitleCase, trimLabel } from './statblockUtils';
import { SectionHeading, type BlockProps } from './StatblockBlocks';
import { StatblockMarkdown } from '../../../statblocks/render/shared/StatblockMarkdown';
import { EntryLine } from '../../../statblocks/render/shared/EntryLine';
import { spellGroups } from '../../../statblocks/render/shared/spellGroups';
import { t } from '../../../i18n';

/** `saves` — a list of save/skill pairs. */
export function SavesBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const entries: unknown[] = Array.isArray(raw) ? raw : [];
  if (!entries.length) return null;

  const resolved = entries.map((save) => runCallback(item.callback, { monster, property: save }, save));

  const text = resolved
    .map((save) => {
      if (typeof save === 'string') return save;
      if (save && typeof save === 'object') {
        return Object.entries(save as Record<string, unknown>)
          .map(([key, value]) =>
            typeof value === 'number'
              ? `${toTitleCase(key)} ${signed(value)}`
              : `${toTitleCase(key)} ${stringify(value)}`,
          )
          .join(', ');
      }
      return stringify(save);
    })
    .filter(Boolean)
    .join(', ');

  if (!text.length) return null;

  return (
    <div className="atlas-sb-property" data-prop={slugify(item.properties?.[0] ?? '') || undefined}>
      <span className="atlas-sb-property-name">
        {trimLabel(item.display ?? toTitleCase(item.properties?.[0] ?? ''))}
      </span>
      <StatblockMarkdown text={text} app={app} sourcePath={sourcePath} />
    </div>
  );
}

/** A single trait/feature: bolded name followed by its description. */
function TraitLine({
  trait,
  item,
  monster,
  app,
  sourcePath,
  index,
}: BlockProps & { trait: Trait; index: number }): React.JSX.Element | null {
  const desc = runCallback(item.callback, { monster, property: trait }, trait.desc ?? '');
  if (!trait.name && !desc) return null;
  const property = item.properties?.[0] ?? '';
  const canEdit = !item.callback && property.length > 0;

  return (
    <EntryLine
      name={trait.name ?? ''}
      text={String(desc)}
      app={app}
      sourcePath={sourcePath}
      markdown={item.markdown ?? true}
      editPaths={canEdit ? { name: [property, index, 'name'], text: [property, index, 'desc'] } : undefined}
    />
  );
}

/** `traits` — a titled list of features, actions, reactions, etc. */
export function TraitsBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const traits = Array.isArray(raw) ? (raw as Trait[]) : [];
  if (!traits.length) return null;

  return (
    <div className="atlas-sb-traits">
      <SectionHeading item={item} monster={monster} app={app} />
      {item.subheadingText && <div className="atlas-sb-text">{item.subheadingText}</div>}
      {traits.map((trait, index) => (
        <TraitLine
          key={`${trait.name ?? 'trait'}-${index}`}
          trait={trait}
          index={index}
          item={item}
          monster={monster}
          app={app}
          sourcePath={sourcePath}
        />
      ))}
    </div>
  );
}

/** `spells` — spell lists, grouped under their header lines. */
export function SpellsBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const entries = Array.isArray(raw) ? raw : [];
  if (!entries.length) return null;

  const groups = spellGroups(entries, `${stringify(monster.name)} knows the following spells:`, (value) => stringify(value));

  return (
    <div className="atlas-sb-traits">
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.header}>
          {groupIndex === 0 && (
            <div className="atlas-sb-section-heading">
              {item.heading ?? t('statblock.spellcasting')}
              <div className="atlas-sb-rule" />
            </div>
          )}
          <div className="atlas-sb-trait">
            <StatblockMarkdown text={group.header} app={app} sourcePath={sourcePath} />
          </div>
          <ul className="atlas-sb-spells">
            {group.spells.map((spell, index) => (
              <li key={`${spell.level ?? ''}-${index}`}>
                {spell.level && <span className="atlas-sb-spell-level">{spell.level}: </span>}
                <StatblockMarkdown text={spell.spells} app={app} sourcePath={sourcePath} />
              </li>
            ))}
          </ul>
        </React.Fragment>
      ))}
    </div>
  );
}
