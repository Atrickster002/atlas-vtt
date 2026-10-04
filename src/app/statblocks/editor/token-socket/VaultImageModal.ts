import { FuzzySuggestModal, TFile, type App, type FuzzyMatch } from 'obsidian';

/** The image formats a statblock's art may be (the token import reads the same ones). */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']);

export function isVaultImage(file: TFile): boolean {
  return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/**
 * "Choose image…": Obsidian's own fuzzy search over the vault's images, so any
 * image can be the statblock's art without a token. Rows name the file and
 * its folder and show no preview: a list of map-sized images would decode
 * hundreds of megabytes for a glance. A prompt has no close control, so it
 * takes none of the classes of Atlas' modals and looks like Obsidian's own.
 */
export class VaultImageModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder('Find an image in the vault');
    this.emptyStateText = 'No image matches.';
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(isVaultImage);
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
    el.addClass('mod-complex');
    const content = el.createDiv({ cls: 'suggestion-content' });
    content.createDiv({ cls: 'suggestion-title', text: match.item.name });
    const folder = match.item.parent?.path;
    if (folder && folder !== '/') content.createDiv({ cls: 'suggestion-note', text: folder });
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
