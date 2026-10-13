import { FuzzySuggestModal, type App, type FuzzyMatch, type TFile } from 'obsidian';

/**
 * "Start from a note…": Obsidian's own fuzzy search over the vault's notes,
 * so the text new statblocks start with can come from a note already written.
 * Rows name the note and its folder, as Obsidian's quick switcher does. A
 * prompt has no close control, so it takes none of the classes of Atlas'
 * modals and looks like Obsidian's own.
 */
export class NoteTextModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly skipPath: string | null, private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder('Find a note to start from');
    this.emptyStateText = 'No note matches.';
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((file) => file.path !== this.skipPath);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
    el.addClass('mod-complex');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: match.item.basename });
    const folder = match.item.parent?.path;
    if (folder && folder !== '/') content.createDiv({ cls: 'suggestion-note', text: folder });
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
