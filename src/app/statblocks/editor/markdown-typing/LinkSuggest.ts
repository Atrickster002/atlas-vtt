import { AbstractInputSuggest, type App } from 'obsidian';
import { fieldSelection, replaceInField } from './textFields';
import { linkQueryBefore, linkReplacement, wikilink } from './linkQuery';
import { linkSuggestions, type LinkSuggestion } from './linkSuggestions';
import { toggleMarkIn } from './markIn';

/** The list Obsidian's suggestions keep; not in its API, so asked for before it is used. */
interface SuggestChooser {
  useSelectedItem?: (event: KeyboardEvent) => boolean;
}

/**
 * `[[` in a statblock's text field: Obsidian's own suggestion popover (its
 * keys, look and placement, in whatever window the field is in) offering the
 * vault's notes, their aliases and, after `#`, their headings. Only the text
 * before the caret is read, so a link can be typed anywhere in a value.
 *
 * While the list is open its keys are Obsidian's: Escape closes the list and
 * stops there, Enter (and here Tab) takes the highlighted note. Its key scope
 * stands on Obsidian's app scope, not the panel's, so the formatting keys and
 * Mod+Z are registered on it too: the note around the panel must not take them.
 */
export class LinkSuggest extends AbstractInputSuggest<LinkSuggestion> {
  constructor(app: App, private readonly field: HTMLElement, private readonly sourcePath: () => string) {
    // Obsidian reads only what every element has (focus, size, events); the value is read and written below.
    super(app, field as HTMLDivElement);
    this.scope.register([], 'Tab', (event) => this.chooseHighlighted(event));
    this.scope.register(['Mod'], 'b', () => (toggleMarkIn(field, '**') ? false : undefined));
    this.scope.register(['Mod'], 'i', () => (toggleMarkIn(field, '*') ? false : undefined));
    this.scope.register(['Mod'], 'z', () => true);
    this.scope.register(['Mod', 'Shift'], 'z', () => true);
  }

  /** The text before the caret: all a link being typed needs. */
  override getValue(): string {
    const now = fieldSelection(this.field);
    return now && now.start === now.end ? now.text.slice(0, now.start) : '';
  }

  override setValue(value: string): void {
    const now = fieldSelection(this.field);
    replaceInField(this.field, 0, now?.text.length ?? 0, value, [value.length, value.length]);
  }

  protected getSuggestions(before: string): LinkSuggestion[] {
    const query = linkQueryBefore(before);
    return query ? linkSuggestions(this.app, query, this.sourcePath()) : [];
  }

  renderSuggestion(suggestion: LinkSuggestion, el: HTMLElement): void {
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: suggestion.title });
    if (suggestion.note) content.createDiv({ cls: 'suggestion-note', text: suggestion.note });
  }

  override selectSuggestion(suggestion: LinkSuggestion, event: MouseEvent | KeyboardEvent): void {
    const now = fieldSelection(this.field);
    const query = now ? linkQueryBefore(now.text.slice(0, now.start)) : null;
    if (now && query) {
      const link = wikilink(suggestion.link);
      const { from, to, caret } = linkReplacement(now.text, query, now.start, link);
      replaceInField(this.field, from, to, link, [caret, caret]);
    }
    this.close();
    super.selectSuggestion(suggestion, event);
  }

  private chooseHighlighted(event: KeyboardEvent): false | undefined {
    const chooser = (this as unknown as { suggestions?: SuggestChooser }).suggestions;
    return chooser?.useSelectedItem?.(event) ? false : undefined;
  }
}
