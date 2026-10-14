import { EMPTY_BOOK, isEmptyBook, type BookData, type StoredBook } from './bookStore.ts';

/**
 * The books the GM keeps, one per character of a collection. They outlive tables and players: a
 * book is its character's, so whoever plays that character next finds it again. `save` hears of
 * every change; the books are written with the rest of the companion's data.
 */
export class BookShelf {
  private readonly books = new Map<string, Map<string, StoredBook>>();
  private readonly save: () => void;

  constructor(data: BookData = {}, save: () => void = () => undefined) {
    this.save = save;
    for (const [collection, characters] of Object.entries(data)) this.books.set(collection, new Map(Object.entries(characters)));
  }

  /** A character's book; an empty one while nothing was written into it. */
  of(collection: string, character: string): StoredBook {
    return this.books.get(collection)?.get(character) ?? EMPTY_BOOK;
  }

  /** Keeps a character's book as it is now. */
  keep(collection: string, character: string, book: StoredBook): void {
    const characters = this.books.get(collection) ?? new Map<string, StoredBook>();
    if (isEmptyBook(book)) characters.delete(character);
    else characters.set(character, book);
    if (characters.size > 0) this.books.set(collection, characters);
    else this.books.delete(collection);
    this.save();
  }

  toData(): BookData {
    return Object.fromEntries([...this.books].map(([collection, characters]) => [collection, Object.fromEntries(characters)]));
  }
}
