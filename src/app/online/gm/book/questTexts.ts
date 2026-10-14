import { bookText, MAX_ASSET_BYTES, MAX_QUEST_BODY, questEmbeds, TEXT_MIME_TYPE, type AssetRef, type QuestEmbed } from '../../protocol/index.ts';
import { sha256Hex } from '../assetServe.ts';
import { openingOf } from './bookTexts.ts';

/** A quest's whole text as players fetch it: its reference, and the bytes it is served as. */
export interface QuestTextAsset {
  readonly ref: AssetRef;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** What players are sent of a quest's text: its opening, the whole text where the opening is not all of it, and the embeds of what they get. */
export interface QuestTextParts {
  readonly opening: string;
  /** Null where the opening is the whole text, or where the whole text is more than an asset holds. */
  readonly whole: QuestTextAsset | null;
  readonly embeds: readonly QuestEmbed[];
}

/**
 * A quest's text (`questBody`, the GM's comments already taken out) as players are sent it: cleaned
 * as a book's text (`bookText`), its opening within `MAX_QUEST_BODY`, and, where that is not all of
 * it, the whole text as UTF-8 Markdown by hash. A text of more than `MAX_ASSET_BYTES` bytes is sent
 * as its opening alone. The embeds are those of what players get.
 */
export async function questTextParts(body: string): Promise<QuestTextParts> {
  const tooLong = body.length > MAX_ASSET_BYTES;
  const text = bookText(tooLong ? body.slice(0, MAX_ASSET_BYTES).replace(/[\ud800-\udbff]$/, '') : body, MAX_ASSET_BYTES) ?? '';
  const opening = openingOf(text, MAX_QUEST_BODY);
  if (opening === text) return { opening, whole: null, embeds: questEmbeds(opening) };
  // A copy the hash can take: `encode` names no particular buffer type.
  const bytes = new TextEncoder().encode(text).slice();
  if (tooLong || bytes.length > MAX_ASSET_BYTES) return { opening, whole: null, embeds: questEmbeds(opening) };
  const ref = { hash: await sha256Hex(bytes), size: bytes.length, mime: TEXT_MIME_TYPE };
  return { opening, whole: { ref, bytes }, embeds: questEmbeds(text) };
}
