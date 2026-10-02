/** How Atlas looks: as ever, or as ink on torn paper. */
export type Skin = 'classic' | 'paper';

/** The choice in Atlas' settings: what the theme asks for, or one look whatever the theme. */
export type SkinChoice = 'theme' | Skin;

export const SKIN_OPTIONS: readonly { value: SkinChoice; label: string }[] = [
  { value: 'theme', label: 'Follow the theme' },
  { value: 'classic', label: 'Classic' },
  { value: 'paper', label: 'Paper' },
];

export function isSkinChoice(value: unknown): value is SkinChoice {
  return SKIN_OPTIONS.some((option) => option.value === value);
}

/** The custom property a theme sets on `body` to ask for a skin: `--atlas-skin: paper`. */
export const THEME_SKIN_PROPERTY = '--atlas-skin';
/** On the body of every Atlas document while the paper skin is on; its stylesheet hangs from this class. */
export const PAPER_SKIN_CLASS = 'atlas-skin-paper';

/** The skin the active theme asks for. */
export function skinOfTheme(doc: Document): Skin {
  const view = doc.defaultView ?? window;
  const asked = view.getComputedStyle(doc.body).getPropertyValue(THEME_SKIN_PROPERTY).trim().replace(/['"]/g, '');
  return asked === 'paper' ? 'paper' : 'classic';
}

export function resolveSkin(choice: SkinChoice, doc: Document): Skin {
  return choice === 'theme' ? skinOfTheme(doc) : choice;
}
